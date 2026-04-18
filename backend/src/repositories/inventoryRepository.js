const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');

function quoteIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return `\`${value}\``;
}

const tableColumnsCache = new Map();
const resolvedTableSqlCache = new Map();
const executionConfig = appConfig.visitExecution;
const dbName = quoteIdentifier(executionConfig.dbName, 'INVENTORY_DB_NAME');
const catalogDbName = quoteIdentifier(
  appConfig.directory?.sucursalCatalogDbName ||
    process.env.CORP_DB_NAME ||
    executionConfig.sucursalCatalogDbName ||
    executionConfig.dbName,
  'INVENTORY_CATALOG_DB_NAME'
);

function resolveTableNameCandidates(value) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return [];
  }

  const candidates = [normalized];

  // Backward compatibility for local-sync schemas where tables use ltbl*.
  if (normalized.startsWith('tbl')) {
    candidates.push(`l${normalized}`);
  } else if (normalized.startsWith('ltbl')) {
    candidates.push(normalized.slice(1));
  }

  return [...new Set(candidates)];
}

function buildTableSql(tableName, label, databaseSql = dbName) {
  return `${databaseSql}.${quoteIdentifier(tableName, label)}`;
}

const tableNameCandidates = {
  productosXEntregaMuestras: resolveTableNameCandidates(
    executionConfig.productosXEntregaMuestrasTable
  ),
  entregaMuestras: resolveTableNameCandidates(executionConfig.entregaMuestrasTable),
  solicitudProductos: resolveTableNameCandidates(
    process.env.INVENTORY_SOLICITUD_PRODUCTOS_TABLE || 'tblSolicitudProductos'
  ),
  productosXSolicitud: resolveTableNameCandidates(
    process.env.INVENTORY_PRODUCTOS_X_SOLICITUD_TABLE || 'tblProductosXSolicitud'
  ),
  histoEstadosSolicitudProductos: resolveTableNameCandidates(
    process.env.INVENTORY_HISTO_ESTADOS_SOLICITUD_TABLE ||
      'tblHistoEstadosSolicitudProductos'
  ),
  motivoRechazoSolicitud: resolveTableNameCandidates(
    process.env.INVENTORY_MOTIVO_RECHAZO_SOLICITUD_TABLE ||
      'tblMotivoRechazoSolicitud'
  ),
  estado: resolveTableNameCandidates(
    process.env.INVENTORY_ESTADO_TABLE ||
      appConfig.calendar?.estadoTable ||
      'tblEstado'
  ),
  producto: resolveTableNameCandidates(executionConfig.productoTable),
  visitador: resolveTableNameCandidates(
    appConfig.directory?.visitadorTable || 'tblVisitador'
  ),
  medico: resolveTableNameCandidates(
    executionConfig.medicoTable || appConfig.directory?.medicoTable || 'tblMedico'
  ),
  medicosXVisitador: resolveTableNameCandidates(
    appConfig.directory?.medicosXVisitadorTable || 'tblMedicosXVisitador'
  ),
  tipoEntregaMuestra: resolveTableNameCandidates(
    process.env.INVENTORY_TIPO_ENTREGA_MUESTRA_TABLE || 'tblTipoEntregaMuestra'
  ),
  tipoVisita: resolveTableNameCandidates(
    appConfig.calendar?.tipoVisitaTable || 'tblTipoVisita'
  ),
  tipoProducto: resolveTableNameCandidates(
    process.env.INVENTORY_TIPO_PRODUCTO_TABLE || 'tblTipoProducto'
  ),
  personas: resolveTableNameCandidates(appConfig.personasAuth?.tableName || 'tblPersonas'),
  sucursales: resolveTableNameCandidates(
    appConfig.directory?.sucursalCatalogTable ||
      executionConfig.sucursalCatalogTable ||
      'tblSucursales'
  )
};

const tableDatabases = {
  productosXEntregaMuestras: dbName,
  entregaMuestras: dbName,
  solicitudProductos: dbName,
  productosXSolicitud: dbName,
  histoEstadosSolicitudProductos: dbName,
  motivoRechazoSolicitud: dbName,
  estado: dbName,
  producto: dbName,
  visitador: dbName,
  medico: dbName,
  medicosXVisitador: dbName,
  tipoEntregaMuestra: dbName,
  tipoVisita: dbName,
  tipoProducto: dbName,
  personas: catalogDbName,
  sucursales: catalogDbName
};

function resolveExecutor(executor) {
  return executor || getPool();
}

function escapeColumn(columnName) {
  return quoteIdentifier(columnName, `INVENTORY_COLUMN_${columnName}`);
}

function pickAvailableColumn(availableColumns, candidates = []) {
  for (const candidate of candidates) {
    if (availableColumns.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function appendInsertValue({
  availableColumns,
  insertColumns,
  params,
  candidates = [],
  value
}) {
  if (!availableColumns || !insertColumns || !params) {
    return;
  }

  const column = pickAvailableColumn(availableColumns, candidates);

  if (!column) {
    return;
  }

  insertColumns.push(column);
  params.push(value);
}

async function getTableColumns(tableKey, executor) {
  if (tableColumnsCache.has(tableKey)) {
    return tableColumnsCache.get(tableKey);
  }

  const tableCandidates = tableNameCandidates[tableKey] || [];

  if (!tableCandidates.length) {
    return new Set();
  }

  for (const [index, tableName] of tableCandidates.entries()) {
    const databaseSql = tableDatabases[tableKey] || dbName;
    const tableSql = buildTableSql(
      tableName,
      `INVENTORY_${tableKey}_TABLE`,
      databaseSql
    );
    let rows;

    try {
      [rows] = await resolveExecutor(executor).execute(`SHOW COLUMNS FROM ${tableSql}`);
    } catch (error) {
      const code = String(error?.code || '');

      if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR') {
        if (index === tableCandidates.length - 1) {
          const emptySet = new Set();
          tableColumnsCache.set(tableKey, emptySet);
          resolvedTableSqlCache.set(tableKey, tableSql);
          return emptySet;
        }
        continue;
      }

      throw error;
    }

    const columns = new Set(
      (rows || [])
        .map((row) => String(row.Field || '').trim())
        .filter(Boolean)
    );

    tableColumnsCache.set(tableKey, columns);
    resolvedTableSqlCache.set(tableKey, tableSql);
    return columns;
  }

  const emptySet = new Set();
  tableColumnsCache.set(tableKey, emptySet);
  return emptySet;
}

function getResolvedTableSql(tableKey) {
  return resolvedTableSqlCache.get(tableKey) || null;
}

function selectColumnOrNull(alias, column, outputAlias) {
  if (!column) {
    return `NULL AS ${outputAlias}`;
  }

  return `${alias}.${escapeColumn(column)} AS ${outputAlias}`;
}

function buildPersonNameExpr(alias, availableColumns) {
  const fullNameColumn = pickAvailableColumn(availableColumns, [
    'Nombre_Personas',
    'NombrePersona',
    'NombreCompleto',
    'Nombre'
  ]);
  const firstNameColumn = pickAvailableColumn(availableColumns, [
    'Primer_Nombre',
    'PrimerNombre'
  ]);
  const secondNameColumn = pickAvailableColumn(availableColumns, [
    'Segundo_Nombre',
    'SegundoNombre'
  ]);
  const firstLastNameColumn = pickAvailableColumn(availableColumns, [
    'Primer_Apellido',
    'PrimerApellido'
  ]);
  const secondLastNameColumn = pickAvailableColumn(availableColumns, [
    'Segundo_Apellido',
    'SegundoApellido'
  ]);

  const expressions = [];

  if (fullNameColumn) {
    expressions.push(`NULLIF(${alias}.${escapeColumn(fullNameColumn)}, '')`);
  }

  const nameParts = [
    firstNameColumn,
    secondNameColumn,
    firstLastNameColumn,
    secondLastNameColumn
  ]
    .filter(Boolean)
    .map((column) => `${alias}.${escapeColumn(column)}`);

  if (nameParts.length) {
    expressions.push(`NULLIF(TRIM(CONCAT_WS(' ', ${nameParts.join(', ')})), '')`);
  }

  if (!expressions.length) {
    return 'NULL';
  }

  return `COALESCE(${expressions.join(', ')})`;
}

function buildMedicoNameExpr(alias, availableColumns, codigoColumnExpr = 'NULL') {
  const fullNameColumn = pickAvailableColumn(availableColumns, [
    'NombrePersona',
    'Nombre_Personas',
    'NombreCompleto',
    'Nombre'
  ]);
  const firstNameColumn = pickAvailableColumn(availableColumns, [
    'PrimerNombre',
    'Primer_Nombre'
  ]);
  const secondNameColumn = pickAvailableColumn(availableColumns, [
    'SegundoNombre',
    'Segundo_Nombre'
  ]);
  const firstLastNameColumn = pickAvailableColumn(availableColumns, [
    'PrimerApellido',
    'Primer_Apellido'
  ]);
  const secondLastNameColumn = pickAvailableColumn(availableColumns, [
    'SegundoApellido',
    'Segundo_Apellido'
  ]);

  const expressions = [];

  if (fullNameColumn) {
    expressions.push(`NULLIF(${alias}.${escapeColumn(fullNameColumn)}, '')`);
  }

  const nameParts = [
    firstNameColumn,
    secondNameColumn,
    firstLastNameColumn,
    secondLastNameColumn
  ]
    .filter(Boolean)
    .map((column) => `${alias}.${escapeColumn(column)}`);

  if (nameParts.length) {
    expressions.push(`NULLIF(TRIM(CONCAT_WS(' ', ${nameParts.join(', ')})), '')`);
  }

  expressions.push(buildFallbackFromIdentifier('Médico', codigoColumnExpr));

  return `COALESCE(${expressions.join(', ')})`;
}

function buildVisitadorNameExpr(alias, availableColumns, codigoColumnExpr = 'NULL') {
  const fullNameColumn = pickAvailableColumn(availableColumns, [
    'NombreCompleto',
    'NombrePersona',
    'Nombre_Personas',
    'Nombre'
  ]);
  const firstNameColumn = pickAvailableColumn(availableColumns, [
    'PrimerNombre',
    'Primer_Nombre'
  ]);
  const secondNameColumn = pickAvailableColumn(availableColumns, [
    'SegundoNombre',
    'Segundo_Nombre'
  ]);
  const firstLastNameColumn = pickAvailableColumn(availableColumns, [
    'PrimerApellido',
    'Primer_Apellido'
  ]);
  const secondLastNameColumn = pickAvailableColumn(availableColumns, [
    'SegundoApellido',
    'Segundo_Apellido'
  ]);

  const expressions = [];

  if (fullNameColumn) {
    expressions.push(`NULLIF(${alias}.${escapeColumn(fullNameColumn)}, '')`);
  }

  const nameParts = [
    firstNameColumn,
    secondNameColumn,
    firstLastNameColumn,
    secondLastNameColumn
  ]
    .filter(Boolean)
    .map((column) => `${alias}.${escapeColumn(column)}`);

  if (nameParts.length) {
    expressions.push(`NULLIF(TRIM(CONCAT_WS(' ', ${nameParts.join(', ')})), '')`);
  }

  expressions.push(buildFallbackFromIdentifier('Visitador', codigoColumnExpr));

  return `COALESCE(${expressions.join(', ')})`;
}

function buildSucursalNameExpr(alias, availableColumns, codigoColumnExpr = 'NULL') {
  const nameColumn = pickAvailableColumn(availableColumns, [
    appConfig.directory?.sucursalCatalogNameColumn || 'Nombre_Sucursal',
    'Nombre_Sucursal',
    'NombreSucursal',
    'Nombre'
  ]);

  if (nameColumn) {
    return `COALESCE(
      NULLIF(${alias}.${escapeColumn(nameColumn)}, ''),
      ${buildFallbackFromIdentifier('Sucursal', codigoColumnExpr)}
    )`;
  }

  return buildFallbackFromIdentifier('Sucursal', codigoColumnExpr);
}

function buildFallbackFromIdentifier(prefix, columnExpr) {
  return `CASE
    WHEN ${columnExpr} IS NULL OR ${columnExpr} = '' OR ${columnExpr} = 0
    THEN NULL
    ELSE CONCAT('${prefix} ', ${columnExpr})
  END`;
}

async function resolveInventorySchema(executor) {
  const [sampleColumns, deliveryColumns, productColumns, typeColumns] =
    await Promise.all([
      getTableColumns('productosXEntregaMuestras', executor),
      getTableColumns('entregaMuestras', executor),
      getTableColumns('producto', executor),
      getTableColumns('tipoProducto', executor)
    ]);

  const sampleEntregaColumn = pickAvailableColumn(sampleColumns, ['CodigoEntrega']);
  const sampleProductColumn = pickAvailableColumn(sampleColumns, ['CodigoProducto']);
  const sampleQuantityColumn = pickAvailableColumn(sampleColumns, ['Cantidad']);
  const sampleDetailIdColumn = pickAvailableColumn(sampleColumns, [
    'CodigoProductoXEntrega',
    'CodigoProductoEntrega',
    'CodigoDetalle'
  ]);
  const sampleVisitadorColumn = pickAvailableColumn(sampleColumns, [
    'CodigoUsuarioVisitador',
    'CodigoVisitador'
  ]);
  const sampleCountryColumn = pickAvailableColumn(sampleColumns, ['CodigoPais']);
  const sampleIsActiveColumn = pickAvailableColumn(sampleColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const deliveryEntregaColumn = pickAvailableColumn(deliveryColumns, ['CodigoEntrega']);
  const deliveryTypeColumn = pickAvailableColumn(deliveryColumns, ['CodigoTipoEntrega']);
  const deliveryProductTypeColumn = pickAvailableColumn(deliveryColumns, [
    'tipoProducto',
    'TipoProducto'
  ]);

  const productIdColumn = pickAvailableColumn(productColumns, ['CodigoProducto']);
  const productSkuColumn = pickAvailableColumn(productColumns, ['SKU', 'Sku']);
  const productNameColumn = pickAvailableColumn(productColumns, ['NombreProducto']);

  const typeIdColumn = pickAvailableColumn(typeColumns, [
    'codigoProducto',
    'CodigoProducto',
    'CodigoTipoProducto',
    'tipoProducto',
    'TipoProducto'
  ]);
  const typeDescriptionColumn = pickAvailableColumn(typeColumns, [
    'Descripcion',
    'NombreTipoProducto',
    'TipoProducto'
  ]);
  const canJoinTypeTable = Boolean(typeColumns.size && typeIdColumn);

  if (
    !sampleEntregaColumn ||
    !sampleProductColumn ||
    !sampleQuantityColumn ||
    !sampleVisitadorColumn ||
    !sampleCountryColumn ||
    !deliveryEntregaColumn ||
    !deliveryTypeColumn ||
    !deliveryProductTypeColumn ||
    !productIdColumn
  ) {
    throw new AppError(
      'Inventory tables are missing required columns.',
      500
    );
  }

  return {
    sampleEntregaColumn,
    sampleProductColumn,
    sampleQuantityColumn,
    sampleVisitadorColumn,
    sampleCountryColumn,
    sampleIsActiveColumn,
    deliveryEntregaColumn,
    deliveryTypeColumn,
    deliveryProductTypeColumn,
    productIdColumn,
    productSkuColumn,
    productNameColumn,
    typeIdColumn,
    typeDescriptionColumn,
    canJoinTypeTable,
    sampleTableSql: getResolvedTableSql('productosXEntregaMuestras'),
    deliveryTableSql: getResolvedTableSql('entregaMuestras'),
    productTableSql: getResolvedTableSql('producto'),
    typeTableSql: getResolvedTableSql('tipoProducto')
  };
}

function buildProductNameExpr({ productNameColumn, sampleProductColumn }) {
  if (!productNameColumn) {
    return `CONCAT('Producto ', pxem.${escapeColumn(sampleProductColumn)})`;
  }

  return `COALESCE(
    NULLIF(p.${escapeColumn(productNameColumn)}, ''),
    CONCAT('Producto ', pxem.${escapeColumn(sampleProductColumn)})
  )`;
}

function buildTypeDescriptionExpr({
  canJoinTypeTable,
  typeDescriptionColumn,
  deliveryProductTypeColumn
}) {
  if (!canJoinTypeTable || !typeDescriptionColumn) {
    return `CONCAT('Tipo ', em.${escapeColumn(deliveryProductTypeColumn)})`;
  }

  return `COALESCE(
    NULLIF(tp.${escapeColumn(typeDescriptionColumn)}, ''),
    CONCAT('Tipo ', em.${escapeColumn(deliveryProductTypeColumn)})
  )`;
}

async function listMyInventory(
  {
    codigoUsuarioVisitador,
    codigoPais,
    codigoProducto = 0,
    codigoSku = '',
    tipoProductoInventario = null,
    codigoTipoEntregaEntrada = 1,
    codigoTipoEntregaSalida = 2
  },
  executor
) {
  const schema = await resolveInventorySchema(executor);
  const productNameExpr = buildProductNameExpr(schema);
  const typeDescriptionExpr = buildTypeDescriptionExpr(schema);
  const skuSelectExpr = schema.productSkuColumn
    ? `p.${escapeColumn(schema.productSkuColumn)}`
    : 'NULL';
  const typeJoinSql = schema.canJoinTypeTable
    ? `LEFT JOIN ${schema.typeTableSql} tp
      ON tp.${escapeColumn(schema.typeIdColumn)} = em.${escapeColumn(schema.deliveryProductTypeColumn)}`
    : '';
  const whereParts = [
    `pxem.${escapeColumn(schema.sampleVisitadorColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleCountryColumn)} = ?`
  ];
  const params = [codigoUsuarioVisitador, codigoPais];

  if (schema.sampleIsActiveColumn) {
    whereParts.push(
      `IFNULL(pxem.${escapeColumn(schema.sampleIsActiveColumn)}, 1) = 1`
    );
  }

  if (Number(codigoProducto) > 0) {
    whereParts.push(
      `pxem.${escapeColumn(schema.sampleProductColumn)} = ?`
    );
    params.push(Number(codigoProducto));
  }

  const skuText = String(codigoSku || '').trim();

  if (skuText && schema.productSkuColumn) {
    whereParts.push(`p.${escapeColumn(schema.productSkuColumn)} LIKE ?`);
    params.push(`%${skuText}%`);
  }

  if (tipoProductoInventario !== null && tipoProductoInventario !== undefined) {
    whereParts.push(
      `em.${escapeColumn(schema.deliveryProductTypeColumn)} = ?`
    );
    params.push(Number(tipoProductoInventario));
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      pxem.${escapeColumn(schema.sampleProductColumn)} AS codigoProducto,
      ${skuSelectExpr} AS sku,
      ${productNameExpr} AS nombreProducto,
      ${typeDescriptionExpr} AS tipoProductoDescripcion,
      em.${escapeColumn(schema.deliveryProductTypeColumn)} AS tipoProducto,
      SUM(
        CASE
          WHEN em.${escapeColumn(schema.deliveryTypeColumn)} = ?
          THEN IFNULL(pxem.${escapeColumn(schema.sampleQuantityColumn)}, 0)
          ELSE 0
        END
      ) AS entradas,
      SUM(
        CASE
          WHEN em.${escapeColumn(schema.deliveryTypeColumn)} = ?
          THEN IFNULL(pxem.${escapeColumn(schema.sampleQuantityColumn)}, 0)
          ELSE 0
        END
      ) AS salidas,
      (
        SUM(
          CASE
            WHEN em.${escapeColumn(schema.deliveryTypeColumn)} = ?
            THEN IFNULL(pxem.${escapeColumn(schema.sampleQuantityColumn)}, 0)
            ELSE 0
          END
        ) -
        SUM(
          CASE
            WHEN em.${escapeColumn(schema.deliveryTypeColumn)} = ?
            THEN IFNULL(pxem.${escapeColumn(schema.sampleQuantityColumn)}, 0)
            ELSE 0
          END
        )
      ) AS disponible
    FROM ${schema.sampleTableSql} pxem
    INNER JOIN ${schema.deliveryTableSql} em
      ON em.${escapeColumn(schema.deliveryEntregaColumn)} = pxem.${escapeColumn(schema.sampleEntregaColumn)}
    INNER JOIN ${schema.productTableSql} p
      ON p.${escapeColumn(schema.productIdColumn)} = pxem.${escapeColumn(schema.sampleProductColumn)}
    ${typeJoinSql}
    WHERE ${whereParts.join(' AND ')}
    GROUP BY
      pxem.${escapeColumn(schema.sampleProductColumn)},
      ${schema.productSkuColumn ? `p.${escapeColumn(schema.productSkuColumn)},` : ''}
      ${schema.productNameColumn
    ? `p.${escapeColumn(schema.productNameColumn)},`
    : ''}
      em.${escapeColumn(schema.deliveryProductTypeColumn)},
      ${schema.canJoinTypeTable && schema.typeDescriptionColumn
    ? `tp.${escapeColumn(schema.typeDescriptionColumn)}`
    : `em.${escapeColumn(schema.deliveryProductTypeColumn)}`}
    HAVING disponible > 0
    ORDER BY nombreProducto ASC`,
    [
      codigoTipoEntregaEntrada,
      codigoTipoEntregaSalida,
      codigoTipoEntregaEntrada,
      codigoTipoEntregaSalida,
      ...params
    ]
  );

  return rows || [];
}

async function listProductCatalog(
  {
    codigoUsuarioVisitador,
    codigoPais
  },
  executor
) {
  const schema = await resolveInventorySchema(executor);
  const productNameExpr = buildProductNameExpr(schema);
  const skuSelectExpr = schema.productSkuColumn
    ? `p.${escapeColumn(schema.productSkuColumn)}`
    : 'NULL';
  const whereParts = [
    `pxem.${escapeColumn(schema.sampleVisitadorColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleCountryColumn)} = ?`
  ];
  const params = [codigoUsuarioVisitador, codigoPais];

  if (schema.sampleIsActiveColumn) {
    whereParts.push(
      `IFNULL(pxem.${escapeColumn(schema.sampleIsActiveColumn)}, 1) = 1`
    );
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT DISTINCT
      pxem.${escapeColumn(schema.sampleProductColumn)} AS codigoProducto,
      ${skuSelectExpr} AS sku,
      ${productNameExpr} AS nombreProducto
    FROM ${schema.sampleTableSql} pxem
    INNER JOIN ${schema.deliveryTableSql} em
      ON em.${escapeColumn(schema.deliveryEntregaColumn)} = pxem.${escapeColumn(schema.sampleEntregaColumn)}
    INNER JOIN ${schema.productTableSql} p
      ON p.${escapeColumn(schema.productIdColumn)} = pxem.${escapeColumn(schema.sampleProductColumn)}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY nombreProducto ASC`,
    params
  );

  return rows || [];
}

async function listProductTypeCatalog(
  {
    codigoUsuarioVisitador,
    codigoPais
  },
  executor
) {
  const schema = await resolveInventorySchema(executor);
  const typeDescriptionExpr = buildTypeDescriptionExpr(schema);
  const typeJoinSql = schema.canJoinTypeTable
    ? `LEFT JOIN ${schema.typeTableSql} tp
      ON tp.${escapeColumn(schema.typeIdColumn)} = em.${escapeColumn(schema.deliveryProductTypeColumn)}`
    : '';
  const whereParts = [
    `pxem.${escapeColumn(schema.sampleVisitadorColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleCountryColumn)} = ?`
  ];
  const params = [codigoUsuarioVisitador, codigoPais];

  if (schema.sampleIsActiveColumn) {
    whereParts.push(
      `IFNULL(pxem.${escapeColumn(schema.sampleIsActiveColumn)}, 1) = 1`
    );
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT DISTINCT
      em.${escapeColumn(schema.deliveryProductTypeColumn)} AS tipoProducto,
      ${typeDescriptionExpr} AS descripcion
    FROM ${schema.sampleTableSql} pxem
    INNER JOIN ${schema.deliveryTableSql} em
      ON em.${escapeColumn(schema.deliveryEntregaColumn)} = pxem.${escapeColumn(schema.sampleEntregaColumn)}
    ${typeJoinSql}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY descripcion ASC`,
    params
  );

  return rows || [];
}

async function resolveMovementSchema(executor) {
  const [
    sampleColumns,
    deliveryColumns,
    productColumns,
    visitadorColumns,
    medicoColumns,
    tipoEntregaMuestraColumns,
    tipoVisitaColumns,
    personaColumns,
    sucursalColumns,
    medicosXVisitadorColumns
  ] = await Promise.all([
    getTableColumns('productosXEntregaMuestras', executor),
    getTableColumns('entregaMuestras', executor),
    getTableColumns('producto', executor),
    getTableColumns('visitador', executor),
    getTableColumns('medico', executor),
    getTableColumns('tipoEntregaMuestra', executor),
    getTableColumns('tipoVisita', executor),
    getTableColumns('personas', executor),
    getTableColumns('sucursales', executor),
    getTableColumns('medicosXVisitador', executor)
  ]);

  const sampleEntregaColumn = pickAvailableColumn(sampleColumns, ['CodigoEntrega']);
  const sampleProductColumn = pickAvailableColumn(sampleColumns, ['CodigoProducto']);
  const sampleQuantityColumn = pickAvailableColumn(sampleColumns, ['Cantidad']);
  const sampleDetailIdColumn = pickAvailableColumn(sampleColumns, [
    'CodigoProductoXEntrega',
    'CodigoProductoEntrega',
    'CodigoDetalle'
  ]);
  const sampleVisitadorColumn = pickAvailableColumn(sampleColumns, [
    'CodigoUsuarioVisitador',
    'CodigoVisitador'
  ]);
  const sampleCountryColumn = pickAvailableColumn(sampleColumns, ['CodigoPais']);
  const sampleIsActiveColumn = pickAvailableColumn(sampleColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const deliveryEntregaColumn = pickAvailableColumn(deliveryColumns, ['CodigoEntrega']);
  const deliveryTypeColumn = pickAvailableColumn(deliveryColumns, ['CodigoTipoEntrega']);
  const deliveryProductTypeColumn = pickAvailableColumn(deliveryColumns, [
    'tipoProducto',
    'TipoProducto'
  ]);
  const deliveryIsActiveColumn = pickAvailableColumn(deliveryColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);
  const deliveryDateColumn = pickAvailableColumn(deliveryColumns, [
    'FechaEntregado',
    'FechaRegistro'
  ]);
  const deliveryTimeColumn = pickAvailableColumn(deliveryColumns, [
    'HoraEntregado',
    'HoraRegistro'
  ]);
  const deliveryUsuarioEntregaColumn = pickAvailableColumn(deliveryColumns, [
    'CodigoUsuarioEntrega'
  ]);
  const deliveryUsuarioRecibeColumn = pickAvailableColumn(deliveryColumns, [
    'CodigoUsuarioRecibe'
  ]);
  const deliverySucursalColumn = pickAvailableColumn(deliveryColumns, [
    'CodigoSucursal'
  ]);
  const deliveryTipoVisitaColumn = pickAvailableColumn(deliveryColumns, [
    'CodigoTipoVisita'
  ]);
  const deliveryMedicoColumn = pickAvailableColumn(deliveryColumns, ['CodigoMedico']);
  const deliverySolicitudColumn = pickAvailableColumn(deliveryColumns, [
    'CodigoSolicitud'
  ]);
  const deliveryComentariosColumn = pickAvailableColumn(deliveryColumns, [
    'Comentarios'
  ]);

  const productIdColumn = pickAvailableColumn(productColumns, ['CodigoProducto']);
  const productSkuColumn = pickAvailableColumn(productColumns, ['SKU', 'Sku']);
  const productNameColumn = pickAvailableColumn(productColumns, ['NombreProducto']);
  const productIsActiveColumn = pickAvailableColumn(productColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const visitadorIdColumn = pickAvailableColumn(visitadorColumns, [
    'CodigoVisitador',
    'CodigoUsuario',
    'CodigoUsuarioVisitador'
  ]);
  const visitadorIsActiveColumn = pickAvailableColumn(visitadorColumns, [
    'IsActivo',
    'IsActiva',
    'IsActive'
  ]);

  const medicoIdColumn = pickAvailableColumn(medicoColumns, ['CodigoMedico']);
  const medicoIsActiveColumn = pickAvailableColumn(medicoColumns, [
    'isActivo',
    'IsActivo',
    'IsActive',
    'IsActiva'
  ]);

  const tipoEntregaMuestraIdColumn = pickAvailableColumn(tipoEntregaMuestraColumns, [
    'CodigoTipoEntrega'
  ]);
  const tipoEntregaMuestraDescriptionColumn = pickAvailableColumn(
    tipoEntregaMuestraColumns,
    ['Descripcion', 'TipoEntrega', 'NombreTipoEntrega']
  );

  const tipoVisitaIdColumn = pickAvailableColumn(tipoVisitaColumns, ['CodigoEntidad']);
  const tipoVisitaDescriptionColumn = pickAvailableColumn(tipoVisitaColumns, [
    'NombreEntidad',
    'Descripcion',
    'NombreTipoVisita'
  ]);

  const personaIdColumn = pickAvailableColumn(personaColumns, [
    appConfig.personasAuth?.idColumn || 'Codigo_Personas',
    'Codigo_Personas',
    'CodigoPersona',
    'CodigoPersonas'
  ]);
  const personaIsActiveColumn = pickAvailableColumn(personaColumns, [
    'isActivo',
    'IsActivo',
    'IsActive',
    'IsActiva'
  ]);

  const sucursalIdColumn = pickAvailableColumn(sucursalColumns, [
    appConfig.directory?.sucursalCatalogIdColumn || 'Codigo_Sucursal',
    'Codigo_Sucursal',
    'CodigoSucursal'
  ]);
  const sucursalIsActiveColumn = pickAvailableColumn(sucursalColumns, [
    appConfig.directory?.sucursalCatalogActiveColumn || 'isActivo',
    'isActivo',
    'IsActivo',
    'IsActive',
    'IsActiva'
  ]);

  const medicosXVisitadorDoctorColumn = pickAvailableColumn(
    medicosXVisitadorColumns,
    ['CodigoMedico']
  );
  const medicosXVisitadorUserColumn = pickAvailableColumn(medicosXVisitadorColumns, [
    'CodigoUsuario',
    'CodigoUsuarioVisitador',
    'CodigoVisitador'
  ]);
  const medicosXVisitadorIsActiveColumn = pickAvailableColumn(
    medicosXVisitadorColumns,
    ['IsActivo', 'IsActive', 'IsActiva']
  );

  if (
    !sampleEntregaColumn ||
    !sampleProductColumn ||
    !sampleQuantityColumn ||
    !sampleVisitadorColumn ||
    !sampleCountryColumn ||
    !deliveryEntregaColumn ||
    !deliveryTypeColumn ||
    !productIdColumn
  ) {
    throw new AppError('Inventory movement tables are missing required columns.', 500);
  }

  return {
    sampleColumns,
    deliveryColumns,
    productColumns,
    visitadorColumns,
    medicoColumns,
    tipoEntregaMuestraColumns,
    tipoVisitaColumns,
    personaColumns,
    sucursalColumns,
    medicosXVisitadorColumns,
    sampleEntregaColumn,
    sampleProductColumn,
    sampleQuantityColumn,
    sampleDetailIdColumn:
      typeof sampleDetailIdColumn === 'string' && sampleDetailIdColumn
        ? sampleDetailIdColumn
        : pickAvailableColumn(sampleColumns, [
          'CodigoProductoXEntrega',
          'CodigoProductoEntrega',
          'CodigoDetalle'
        ]),
    sampleVisitadorColumn,
    sampleCountryColumn,
    sampleIsActiveColumn,
    deliveryEntregaColumn,
    deliveryTypeColumn,
    deliveryProductTypeColumn,
    deliveryIsActiveColumn,
    deliveryDateColumn,
    deliveryTimeColumn,
    deliveryUsuarioEntregaColumn,
    deliveryUsuarioRecibeColumn,
    deliverySucursalColumn,
    deliveryTipoVisitaColumn,
    deliveryMedicoColumn,
    deliverySolicitudColumn,
    deliveryComentariosColumn,
    productIdColumn,
    productSkuColumn,
    productNameColumn,
    productIsActiveColumn,
    visitadorIdColumn,
    visitadorIsActiveColumn,
    medicoIdColumn,
    medicoIsActiveColumn,
    tipoEntregaMuestraIdColumn,
    tipoEntregaMuestraDescriptionColumn,
    tipoVisitaIdColumn,
    tipoVisitaDescriptionColumn,
    personaIdColumn,
    personaIsActiveColumn,
    sucursalIdColumn,
    sucursalIsActiveColumn,
    medicosXVisitadorDoctorColumn,
    medicosXVisitadorUserColumn,
    medicosXVisitadorIsActiveColumn,
    sampleTableSql: getResolvedTableSql('productosXEntregaMuestras'),
    deliveryTableSql: getResolvedTableSql('entregaMuestras'),
    productTableSql: getResolvedTableSql('producto'),
    visitadorTableSql: getResolvedTableSql('visitador'),
    medicoTableSql: getResolvedTableSql('medico'),
    tipoEntregaMuestraTableSql: getResolvedTableSql('tipoEntregaMuestra'),
    tipoVisitaTableSql: getResolvedTableSql('tipoVisita'),
    personasTableSql: getResolvedTableSql('personas'),
    sucursalesTableSql: getResolvedTableSql('sucursales'),
    medicosXVisitadorTableSql: getResolvedTableSql('medicosXVisitador')
  };
}

async function findProductDescriptorByCode(
  {
    codigoProducto,
    codigoUsuarioVisitador,
    codigoPais
  },
  executor
) {
  const schema = await resolveInventorySchema(executor);
  const productNameExpr = buildProductNameExpr(schema);
  const skuSelectExpr = schema.productSkuColumn
    ? `p.${escapeColumn(schema.productSkuColumn)}`
    : 'NULL';

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      pxem.${escapeColumn(schema.sampleProductColumn)} AS codigoProducto,
      ${skuSelectExpr} AS sku,
      ${productNameExpr} AS nombreProducto,
      (
        SUM(
          CASE
            WHEN em.${escapeColumn(schema.deliveryTypeColumn)} = 1
            THEN IFNULL(pxem.${escapeColumn(schema.sampleQuantityColumn)}, 0)
            ELSE 0
          END
        ) -
        SUM(
          CASE
            WHEN em.${escapeColumn(schema.deliveryTypeColumn)} = 2
            THEN IFNULL(pxem.${escapeColumn(schema.sampleQuantityColumn)}, 0)
            ELSE 0
          END
        )
      ) AS disponible
    FROM ${schema.sampleTableSql} pxem
    INNER JOIN ${schema.deliveryTableSql} em
      ON em.${escapeColumn(schema.deliveryEntregaColumn)} = pxem.${escapeColumn(schema.sampleEntregaColumn)}
    INNER JOIN ${schema.productTableSql} p
      ON p.${escapeColumn(schema.productIdColumn)} = pxem.${escapeColumn(schema.sampleProductColumn)}
    WHERE pxem.${escapeColumn(schema.sampleVisitadorColumn)} = ?
      AND pxem.${escapeColumn(schema.sampleCountryColumn)} = ?
      AND pxem.${escapeColumn(schema.sampleProductColumn)} = ?
      ${schema.sampleIsActiveColumn
    ? `AND IFNULL(pxem.${escapeColumn(schema.sampleIsActiveColumn)}, 1) = 1`
    : ''}
    GROUP BY
      pxem.${escapeColumn(schema.sampleProductColumn)},
      ${schema.productSkuColumn ? `p.${escapeColumn(schema.productSkuColumn)},` : ''}
      ${schema.productNameColumn
    ? `p.${escapeColumn(schema.productNameColumn)}`
    : `pxem.${escapeColumn(schema.sampleProductColumn)}`}
    LIMIT 1`,
    [codigoUsuarioVisitador, codigoPais, codigoProducto]
  );

  return rows[0] || null;
}

async function listMovementDoctorsByVisitador(
  {
    assignmentCandidates = [],
    codigoVisitador = null
  },
  executor
) {
  const schema = await resolveMovementSchema(executor);

  if (
    !schema.medicosXVisitadorDoctorColumn ||
    !schema.medicosXVisitadorUserColumn ||
    !schema.medicoIdColumn
  ) {
    return [];
  }

  const candidates = [...new Set(
    [...(assignmentCandidates || []), codigoVisitador]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
  )];

  if (!candidates.length) {
    return [];
  }

  const doctorNameExpr = buildMedicoNameExpr(
    'm',
    schema.medicoColumns,
    `m.${escapeColumn(schema.medicoIdColumn)}`
  );
  const activeDoctorSql = schema.medicoIsActiveColumn
    ? `AND IFNULL(m.${escapeColumn(schema.medicoIsActiveColumn)}, 1) = 1`
    : '';
  const activeAssignmentSql = schema.medicosXVisitadorIsActiveColumn
    ? `AND IFNULL(mxv.${escapeColumn(schema.medicosXVisitadorIsActiveColumn)}, 1) = 1`
    : '';

  for (const assignmentCode of candidates) {
    const [rows] = await resolveExecutor(executor).execute(
      `SELECT DISTINCT
        m.${escapeColumn(schema.medicoIdColumn)} AS codigoMedico,
        ${doctorNameExpr} AS nombreMedico
      FROM ${schema.medicosXVisitadorTableSql} mxv
      INNER JOIN ${schema.medicoTableSql} m
        ON m.${escapeColumn(schema.medicoIdColumn)} = mxv.${escapeColumn(schema.medicosXVisitadorDoctorColumn)}
      WHERE mxv.${escapeColumn(schema.medicosXVisitadorUserColumn)} = ?
      ${activeAssignmentSql}
      ${activeDoctorSql}
      ORDER BY nombreMedico ASC`,
      [assignmentCode]
    );

    if (rows?.length) {
      return rows;
    }
  }

  return [];
}

async function listProductMovements(
  {
    codigoUsuarioVisitador,
    codigoPais,
    codigoProducto,
    codigoTipoEntrega,
    fechaInicio = null,
    fechaFinal = null,
    codigoMedico = null
  },
  executor
) {
  const schema = await resolveMovementSchema(executor);
  const whereParts = [
    `pxem.${escapeColumn(schema.sampleVisitadorColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleCountryColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleProductColumn)} = ?`,
    `em.${escapeColumn(schema.deliveryTypeColumn)} = ?`
  ];
  const params = [
    codigoUsuarioVisitador,
    codigoPais,
    codigoProducto,
    codigoTipoEntrega
  ];

  if (schema.sampleIsActiveColumn) {
    whereParts.push(`IFNULL(pxem.${escapeColumn(schema.sampleIsActiveColumn)}, 1) = 1`);
  }

  if (fechaInicio && fechaFinal && schema.deliveryDateColumn) {
    whereParts.push(
      `em.${escapeColumn(schema.deliveryDateColumn)} >= ? AND em.${escapeColumn(schema.deliveryDateColumn)} <= ?`
    );
    params.push(fechaInicio, fechaFinal);
  }

  if (
    codigoMedico !== null &&
    codigoMedico !== undefined &&
    Number(codigoMedico) > 0 &&
    schema.deliveryMedicoColumn
  ) {
    whereParts.push(`em.${escapeColumn(schema.deliveryMedicoColumn)} = ?`);
    params.push(Number(codigoMedico));
  }

  const productNameExpr = buildProductNameExpr({
    productNameColumn: schema.productNameColumn,
    sampleProductColumn: schema.sampleProductColumn
  });
  const skuSelectExpr = schema.productSkuColumn
    ? `p.${escapeColumn(schema.productSkuColumn)}`
    : 'NULL';

  const tipoEntregaJoinSql =
    schema.tipoEntregaMuestraTableSql &&
    schema.tipoEntregaMuestraIdColumn &&
    schema.deliveryTypeColumn
      ? `LEFT JOIN ${schema.tipoEntregaMuestraTableSql} tem
      ON tem.${escapeColumn(schema.tipoEntregaMuestraIdColumn)} = em.${escapeColumn(schema.deliveryTypeColumn)}`
      : '';
  const tipoEntregaExpr =
    tipoEntregaJoinSql && schema.tipoEntregaMuestraDescriptionColumn
      ? `COALESCE(
        NULLIF(tem.${escapeColumn(schema.tipoEntregaMuestraDescriptionColumn)}, ''),
        CONCAT('Tipo ', em.${escapeColumn(schema.deliveryTypeColumn)})
      )`
      : `CONCAT('Tipo ', em.${escapeColumn(schema.deliveryTypeColumn)})`;

  const medicoJoinSql =
    schema.medicoTableSql && schema.medicoIdColumn && schema.deliveryMedicoColumn
      ? `LEFT JOIN ${schema.medicoTableSql} m
      ON m.${escapeColumn(schema.medicoIdColumn)} = em.${escapeColumn(schema.deliveryMedicoColumn)}`
      : '';
  const medicoNameExpr = medicoJoinSql
    ? buildMedicoNameExpr(
      'm',
      schema.medicoColumns,
      `em.${escapeColumn(schema.deliveryMedicoColumn)}`
    )
    : (schema.deliveryMedicoColumn
      ? buildFallbackFromIdentifier(
        'Médico',
        `em.${escapeColumn(schema.deliveryMedicoColumn)}`
      )
      : 'NULL');

  const personaEntregaJoinSql =
    schema.personasTableSql &&
    schema.personaIdColumn &&
    schema.deliveryUsuarioEntregaColumn
      ? `LEFT JOIN ${schema.personasTableSql} pe
      ON pe.${escapeColumn(schema.personaIdColumn)} = em.${escapeColumn(schema.deliveryUsuarioEntregaColumn)}
      ${schema.personaIsActiveColumn
    ? `AND IFNULL(pe.${escapeColumn(schema.personaIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const personaEntregaExpr = personaEntregaJoinSql
    ? `COALESCE(
      ${buildPersonNameExpr('pe', schema.personaColumns)},
      ${buildFallbackFromIdentifier(
    'Usuario',
    `em.${escapeColumn(schema.deliveryUsuarioEntregaColumn)}`
  )}
    )`
    : (schema.deliveryUsuarioEntregaColumn
      ? buildFallbackFromIdentifier(
        'Usuario',
        `em.${escapeColumn(schema.deliveryUsuarioEntregaColumn)}`
      )
      : 'NULL');

  const personaRecibeJoinSql =
    schema.personasTableSql &&
    schema.personaIdColumn &&
    schema.deliveryUsuarioRecibeColumn
      ? `LEFT JOIN ${schema.personasTableSql} pr
      ON pr.${escapeColumn(schema.personaIdColumn)} = em.${escapeColumn(schema.deliveryUsuarioRecibeColumn)}
      ${schema.personaIsActiveColumn
    ? `AND IFNULL(pr.${escapeColumn(schema.personaIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const personaRecibeExpr = personaRecibeJoinSql
    ? `COALESCE(
      ${buildPersonNameExpr('pr', schema.personaColumns)},
      ${buildFallbackFromIdentifier(
    'Usuario',
    `em.${escapeColumn(schema.deliveryUsuarioRecibeColumn)}`
  )}
    )`
    : (schema.deliveryUsuarioRecibeColumn
      ? buildFallbackFromIdentifier(
        'Usuario',
        `em.${escapeColumn(schema.deliveryUsuarioRecibeColumn)}`
      )
      : 'NULL');

  const sucursalJoinSql =
    schema.sucursalesTableSql &&
    schema.sucursalIdColumn &&
    schema.deliverySucursalColumn
      ? `LEFT JOIN ${schema.sucursalesTableSql} s
      ON s.${escapeColumn(schema.sucursalIdColumn)} = em.${escapeColumn(schema.deliverySucursalColumn)}
      ${schema.sucursalIsActiveColumn
    ? `AND IFNULL(s.${escapeColumn(schema.sucursalIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const sucursalExpr = sucursalJoinSql
    ? buildSucursalNameExpr(
      's',
      schema.sucursalColumns,
      `em.${escapeColumn(schema.deliverySucursalColumn)}`
    )
    : (schema.deliverySucursalColumn
      ? buildFallbackFromIdentifier(
        'Sucursal',
        `em.${escapeColumn(schema.deliverySucursalColumn)}`
      )
      : 'NULL');

  const tipoVisitaJoinSql =
    schema.tipoVisitaTableSql &&
    schema.tipoVisitaIdColumn &&
    schema.deliveryTipoVisitaColumn
      ? `LEFT JOIN ${schema.tipoVisitaTableSql} tv
      ON tv.${escapeColumn(schema.tipoVisitaIdColumn)} = em.${escapeColumn(schema.deliveryTipoVisitaColumn)}`
      : '';
  const tipoVisitaExpr =
    tipoVisitaJoinSql && schema.tipoVisitaDescriptionColumn
      ? `COALESCE(
        NULLIF(tv.${escapeColumn(schema.tipoVisitaDescriptionColumn)}, ''),
        NULLIF(CONCAT('Tipo Visita ', em.${escapeColumn(schema.deliveryTipoVisitaColumn)}), 'Tipo Visita ')
      )`
      : (schema.deliveryTipoVisitaColumn
        ? `NULLIF(CONCAT('Tipo Visita ', em.${escapeColumn(schema.deliveryTipoVisitaColumn)}), 'Tipo Visita ')`
        : 'NULL');

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      em.${escapeColumn(schema.deliveryEntregaColumn)} AS codigoEntrega,
      pxem.${escapeColumn(schema.sampleProductColumn)} AS codigoProducto,
      pxem.${escapeColumn(schema.sampleQuantityColumn)} AS cantidad,
      ${selectColumnOrNull('em', schema.deliveryDateColumn, 'fechaEntregado')},
      ${selectColumnOrNull('em', schema.deliveryTimeColumn, 'horaEntregado')},
      em.${escapeColumn(schema.deliveryTypeColumn)} AS codigoTipoEntrega,
      ${tipoEntregaExpr} AS tipoEntrega,
      ${selectColumnOrNull('em', schema.deliveryMedicoColumn, 'codigoMedico')},
      ${medicoNameExpr} AS nombreMedico,
      ${selectColumnOrNull('em', schema.deliveryUsuarioEntregaColumn, 'codigoUsuarioEntrega')},
      ${personaEntregaExpr} AS personaEntrega,
      ${selectColumnOrNull('em', schema.deliveryUsuarioRecibeColumn, 'codigoUsuarioRecibe')},
      ${personaRecibeExpr} AS personaRecibe,
      ${selectColumnOrNull('em', schema.deliverySucursalColumn, 'codigoSucursal')},
      ${sucursalExpr} AS nombreSucursal,
      ${selectColumnOrNull('em', schema.deliveryTipoVisitaColumn, 'codigoTipoVisita')},
      ${tipoVisitaExpr} AS tipoVisita,
      ${skuSelectExpr} AS sku,
      ${productNameExpr} AS nombreProducto,
      ${selectColumnOrNull('em', schema.deliveryComentariosColumn, 'comentarios')}
    FROM ${schema.sampleTableSql} pxem
    INNER JOIN ${schema.deliveryTableSql} em
      ON em.${escapeColumn(schema.deliveryEntregaColumn)} = pxem.${escapeColumn(schema.sampleEntregaColumn)}
    INNER JOIN ${schema.productTableSql} p
      ON p.${escapeColumn(schema.productIdColumn)} = pxem.${escapeColumn(schema.sampleProductColumn)}
    ${tipoEntregaJoinSql}
    ${medicoJoinSql}
    ${personaEntregaJoinSql}
    ${personaRecibeJoinSql}
    ${sucursalJoinSql}
    ${tipoVisitaJoinSql}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY
      ${schema.deliveryDateColumn ? `em.${escapeColumn(schema.deliveryDateColumn)} DESC,` : ''}
      ${schema.deliveryTimeColumn ? `em.${escapeColumn(schema.deliveryTimeColumn)} DESC,` : ''}
      em.${escapeColumn(schema.deliveryEntregaColumn)} DESC`,
    params
  );

  return rows || [];
}

async function listOrderSummaries(
  {
    codigoUsuarioVisitador,
    codigoPais,
    codigoTipoEntrega,
    fechaInicio = null,
    fechaFinal = null,
    tipoProducto = null,
    codigoProducto = null,
    buscar = ''
  },
  executor
) {
  const movementSchema = await resolveMovementSchema(executor);
  const inventorySchema = await resolveInventorySchema(executor);
  const whereParts = [
    `pxem.${escapeColumn(movementSchema.sampleVisitadorColumn)} = ?`,
    `pxem.${escapeColumn(movementSchema.sampleCountryColumn)} = ?`,
    `em.${escapeColumn(movementSchema.deliveryTypeColumn)} = ?`
  ];
  const params = [codigoUsuarioVisitador, codigoPais, codigoTipoEntrega];

  if (movementSchema.sampleIsActiveColumn) {
    whereParts.push(
      `IFNULL(pxem.${escapeColumn(movementSchema.sampleIsActiveColumn)}, 1) = 1`
    );
  }

  if (codigoTipoEntrega === 2 && movementSchema.deliveryIsActiveColumn) {
    whereParts.push(
      `IFNULL(em.${escapeColumn(movementSchema.deliveryIsActiveColumn)}, 1) = 1`
    );
  }

  if (fechaInicio && fechaFinal && movementSchema.deliveryDateColumn) {
    whereParts.push(
      `em.${escapeColumn(movementSchema.deliveryDateColumn)} >= ? AND em.${escapeColumn(movementSchema.deliveryDateColumn)} <= ?`
    );
    params.push(fechaInicio, fechaFinal);
  }

  if (
    tipoProducto !== null &&
    tipoProducto !== undefined &&
    Number(tipoProducto) > 0 &&
    movementSchema.deliveryProductTypeColumn
  ) {
    whereParts.push(
      `em.${escapeColumn(movementSchema.deliveryProductTypeColumn)} = ?`
    );
    params.push(Number(tipoProducto));
  }

  if (
    codigoProducto !== null &&
    codigoProducto !== undefined &&
    Number(codigoProducto) > 0
  ) {
    whereParts.push(
      `pxem.${escapeColumn(movementSchema.sampleProductColumn)} = ?`
    );
    params.push(Number(codigoProducto));
  }

  const productNameExpr = buildProductNameExpr({
    productNameColumn: movementSchema.productNameColumn,
    sampleProductColumn: movementSchema.sampleProductColumn
  });
  const canJoinTypeTable = Boolean(
    movementSchema.deliveryProductTypeColumn &&
      inventorySchema.canJoinTypeTable &&
      inventorySchema.typeTableSql &&
      inventorySchema.typeIdColumn
  );
  const typeJoinSql = canJoinTypeTable
    ? `LEFT JOIN ${inventorySchema.typeTableSql} tp
      ON tp.${escapeColumn(inventorySchema.typeIdColumn)} = em.${escapeColumn(movementSchema.deliveryProductTypeColumn)}`
    : '';
  const tipoProductoDescriptionExpr =
    canJoinTypeTable && inventorySchema.typeDescriptionColumn
      ? `COALESCE(
        NULLIF(tp.${escapeColumn(inventorySchema.typeDescriptionColumn)}, ''),
        CONCAT('Tipo ', em.${escapeColumn(movementSchema.deliveryProductTypeColumn)})
      )`
      : (movementSchema.deliveryProductTypeColumn
        ? `CONCAT('Tipo ', em.${escapeColumn(movementSchema.deliveryProductTypeColumn)})`
        : `'Tipo N/A'`);

  const visitadorJoinSql =
    movementSchema.visitadorTableSql && movementSchema.visitadorIdColumn
      ? `LEFT JOIN ${movementSchema.visitadorTableSql} v
      ON v.${escapeColumn(movementSchema.visitadorIdColumn)} = pxem.${escapeColumn(movementSchema.sampleVisitadorColumn)}
      ${movementSchema.visitadorIsActiveColumn
    ? `AND IFNULL(v.${escapeColumn(movementSchema.visitadorIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const visitadorNameExpr = visitadorJoinSql
    ? buildVisitadorNameExpr(
      'v',
      movementSchema.visitadorColumns,
      `pxem.${escapeColumn(movementSchema.sampleVisitadorColumn)}`
    )
    : buildFallbackFromIdentifier(
      'Visitador',
      `pxem.${escapeColumn(movementSchema.sampleVisitadorColumn)}`
    );

  const medicoJoinSql =
    movementSchema.medicoTableSql && movementSchema.medicoIdColumn
      ? `LEFT JOIN ${movementSchema.medicoTableSql} m
      ON m.${escapeColumn(movementSchema.medicoIdColumn)} = COALESCE(
        ${movementSchema.deliveryMedicoColumn
    ? `em.${escapeColumn(movementSchema.deliveryMedicoColumn)}`
    : 'NULL'},
        ${movementSchema.deliveryUsuarioRecibeColumn
    ? `em.${escapeColumn(movementSchema.deliveryUsuarioRecibeColumn)}`
    : 'NULL'}
      )
      ${movementSchema.medicoIsActiveColumn
    ? `AND IFNULL(m.${escapeColumn(movementSchema.medicoIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const medicoNameExpr = medicoJoinSql
    ? buildMedicoNameExpr(
      'm',
      movementSchema.medicoColumns,
      movementSchema.deliveryMedicoColumn
        ? `em.${escapeColumn(movementSchema.deliveryMedicoColumn)}`
        : (movementSchema.deliveryUsuarioRecibeColumn
          ? `em.${escapeColumn(movementSchema.deliveryUsuarioRecibeColumn)}`
          : 'NULL')
    )
    : buildFallbackFromIdentifier(
      'Médico',
      movementSchema.deliveryMedicoColumn
        ? `em.${escapeColumn(movementSchema.deliveryMedicoColumn)}`
        : (movementSchema.deliveryUsuarioRecibeColumn
          ? `em.${escapeColumn(movementSchema.deliveryUsuarioRecibeColumn)}`
          : 'NULL')
    );

  const searchText = String(buscar || '').trim();

  if (searchText) {
    if (codigoTipoEntrega === 1) {
      whereParts.push(
        `(
          ${visitadorNameExpr} LIKE ?
          OR CAST(IFNULL(pxem.${escapeColumn(movementSchema.sampleQuantityColumn)}, 0) AS CHAR) LIKE ?
        )`
      );
    } else {
      whereParts.push(
        `(
          ${medicoNameExpr} LIKE ?
          OR CAST(IFNULL(pxem.${escapeColumn(movementSchema.sampleQuantityColumn)}, 0) AS CHAR) LIKE ?
        )`
      );
    }

    params.push(`%${searchText}%`, `%${searchText}%`);
  }

  const cantidadEntregadaExpr = movementSchema.sampleDetailIdColumn
    ? `COUNT(pxem.${escapeColumn(movementSchema.sampleDetailIdColumn)})`
    : 'COUNT(*)';
  const fechaEntregaExpr = movementSchema.deliveryDateColumn
    ? `em.${escapeColumn(movementSchema.deliveryDateColumn)}`
    : 'NULL';
  const solicitudExpr = movementSchema.deliverySolicitudColumn
    ? `em.${escapeColumn(movementSchema.deliverySolicitudColumn)}`
    : 'NULL';

  const baseFromSql = `FROM ${movementSchema.sampleTableSql} pxem
    INNER JOIN ${movementSchema.deliveryTableSql} em
      ON em.${escapeColumn(movementSchema.deliveryEntregaColumn)} = pxem.${escapeColumn(movementSchema.sampleEntregaColumn)}
    INNER JOIN ${movementSchema.productTableSql} p
      ON p.${escapeColumn(movementSchema.productIdColumn)} = pxem.${escapeColumn(movementSchema.sampleProductColumn)}
    ${typeJoinSql}
    ${visitadorJoinSql}
    ${medicoJoinSql}
    WHERE ${whereParts.join(' AND ')}`;

  if (codigoTipoEntrega === 1) {
    const [rows] = await resolveExecutor(executor).execute(
      `SELECT
        em.${escapeColumn(movementSchema.deliveryEntregaColumn)} AS codigoEntrega,
        MAX(${fechaEntregaExpr}) AS fechaEntrega,
        MAX(${tipoProductoDescriptionExpr}) AS tipoProducto,
        MAX(${visitadorNameExpr}) AS nombreVisitador,
        ${cantidadEntregadaExpr} AS cantidadEntregada,
        MAX(${solicitudExpr}) AS codigoSolicitud
      ${baseFromSql}
      GROUP BY
        codigoEntrega
      ORDER BY
        ${movementSchema.deliveryDateColumn ? 'fechaEntrega DESC,' : ''}
        codigoEntrega DESC`
      ,
      params
    );

    return rows || [];
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      em.${escapeColumn(movementSchema.deliveryEntregaColumn)} AS codigoEntrega,
      MAX(${fechaEntregaExpr}) AS fechaEntrega,
      MAX(${tipoProductoDescriptionExpr}) AS tipoProducto,
      MAX(${medicoNameExpr}) AS nombrePersona,
      ${cantidadEntregadaExpr} AS cantidadEntregada
    ${baseFromSql}
    GROUP BY
      codigoEntrega
    ORDER BY
      ${movementSchema.deliveryDateColumn ? 'fechaEntrega DESC,' : ''}
      codigoEntrega DESC`,
    params
  );

  return rows || [];
}

async function listOrderSalidaDetails(
  {
    codigoEntrega,
    codigoUsuarioVisitador,
    codigoPais,
    codigoTipoEntrega = 2
  },
  executor
) {
  const schema = await resolveMovementSchema(executor);
  const productNameExpr = buildProductNameExpr({
    productNameColumn: schema.productNameColumn,
    sampleProductColumn: schema.sampleProductColumn
  });
  const whereParts = [
    `pxem.${escapeColumn(schema.sampleEntregaColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleVisitadorColumn)} = ?`,
    `pxem.${escapeColumn(schema.sampleCountryColumn)} = ?`,
    `em.${escapeColumn(schema.deliveryTypeColumn)} = ?`
  ];
  const params = [
    codigoEntrega,
    codigoUsuarioVisitador,
    codigoPais,
    codigoTipoEntrega
  ];

  if (schema.sampleIsActiveColumn) {
    whereParts.push(`IFNULL(pxem.${escapeColumn(schema.sampleIsActiveColumn)}, 1) = 1`);
  }

  if (schema.productIsActiveColumn) {
    whereParts.push(`IFNULL(p.${escapeColumn(schema.productIsActiveColumn)}, 1) = 1`);
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      pxem.${escapeColumn(schema.sampleProductColumn)} AS codigoProducto,
      ${productNameExpr} AS nombreProducto,
      pxem.${escapeColumn(schema.sampleQuantityColumn)} AS cantidadEntregada
    FROM ${schema.sampleTableSql} pxem
    INNER JOIN ${schema.deliveryTableSql} em
      ON em.${escapeColumn(schema.deliveryEntregaColumn)} = pxem.${escapeColumn(schema.sampleEntregaColumn)}
    INNER JOIN ${schema.productTableSql} p
      ON p.${escapeColumn(schema.productIdColumn)} = pxem.${escapeColumn(schema.sampleProductColumn)}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY nombreProducto ASC`,
    params
  );

  return rows || [];
}

async function resolveRequestSchema(executor) {
  const [
    solicitudColumns,
    productosXSolicitudColumns,
    histoSolicitudColumns,
    motivoRechazoColumns,
    estadoColumns,
    visitadorColumns,
    medicoColumns,
    sucursalColumns,
    productColumns
  ] = await Promise.all([
    getTableColumns('solicitudProductos', executor),
    getTableColumns('productosXSolicitud', executor),
    getTableColumns('histoEstadosSolicitudProductos', executor),
    getTableColumns('motivoRechazoSolicitud', executor),
    getTableColumns('estado', executor),
    getTableColumns('visitador', executor),
    getTableColumns('medico', executor),
    getTableColumns('sucursales', executor),
    getTableColumns('producto', executor)
  ]);

  const solicitudIdColumn = pickAvailableColumn(solicitudColumns, [
    'CodigoSolicitud',
    'CodigoSolicitudProducto',
    'Id'
  ]);
  const solicitudVisitadorColumn = pickAvailableColumn(solicitudColumns, [
    'CodigoUsuarioVisitador',
    'CodigoVisitador',
    'CodigoUsuario'
  ]);
  const solicitudSucursalColumn = pickAvailableColumn(solicitudColumns, ['CodigoSucursal']);
  const solicitudMedicoColumn = pickAvailableColumn(solicitudColumns, ['CodigoMedico']);
  const solicitudEstadoColumn = pickAvailableColumn(solicitudColumns, ['CodigoEstado']);
  const solicitudFechaColumn = pickAvailableColumn(solicitudColumns, [
    'FechaCreacion',
    'Fecha',
    'FechaRegistro'
  ]);
  const solicitudHoraColumn = pickAvailableColumn(solicitudColumns, [
    'HoraCreacion',
    'Hora',
    'HoraRegistro'
  ]);
  const solicitudComentarioColumn = pickAvailableColumn(solicitudColumns, [
    'Comentario',
    'Comentarios',
    'Observacion'
  ]);
  const solicitudCodigoUsuarioColumn = pickAvailableColumn(solicitudColumns, [
    'CodigoUsuario',
    'CodigoPersona'
  ]);
  const solicitudCodigoPaisColumn = pickAvailableColumn(solicitudColumns, ['CodigoPais']);
  const solicitudIsActiveColumn = pickAvailableColumn(solicitudColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);
  const solicitudIsFromServerColumn = pickAvailableColumn(solicitudColumns, [
    'IsFromServer'
  ]);
  const solicitudIsModifiedColumn = pickAvailableColumn(solicitudColumns, [
    'IsModified'
  ]);

  const detailIdColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'CodigoSolicitudXProducto',
    'CodigoSolicitudProducto',
    'CodigoDetalle',
    'Id'
  ]);
  const detailSolicitudColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'CodigoSolicitud'
  ]);
  const detailProductColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'CodigoProducto'
  ]);
  const detailCantidadSolicitadaColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['CantidadSolicitada', 'Cantidad']
  );
  const detailCantidadEntregadaColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['CantidadEntregada']
  );
  const detailCantidadAprobadaGVMColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['CantidadAprobadaGVM']
  );
  const detailCantidadAprobadaGOColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['CantidadAprobadaGO']
  );
  const detailCodigoMotivoRechazoColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['CodigoMotivoRechazo']
  );
  const detailObservacionColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'Observacion',
    'Comentario',
    'Comentarios'
  ]);
  const detailCostoColumn = pickAvailableColumn(productosXSolicitudColumns, ['Costo']);
  const detailIsAprobadoGVMColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['IsAprobadoGVM']
  );
  const detailIsAprobadoGOColumn = pickAvailableColumn(
    productosXSolicitudColumns,
    ['IsAprobadoGO']
  );
  const detailIsFromServerColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'IsFromServer'
  ]);
  const detailIsModifiedColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'IsModified'
  ]);
  const detailIsActiveColumn = pickAvailableColumn(productosXSolicitudColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const historySolicitudColumn = pickAvailableColumn(histoSolicitudColumns, [
    'CodigoSolicitud'
  ]);
  const historyEstadoColumn = pickAvailableColumn(histoSolicitudColumns, ['CodigoEstado']);
  const historyFechaColumn = pickAvailableColumn(histoSolicitudColumns, [
    'Fecha',
    'FechaRegistro',
    'FechaCreacion'
  ]);
  const historyHoraColumn = pickAvailableColumn(histoSolicitudColumns, [
    'Hora',
    'HoraRegistro',
    'HoraCreacion'
  ]);
  const historyCodigoUsuarioColumn = pickAvailableColumn(histoSolicitudColumns, [
    'CodigoUsuario',
    'CodigoPersona'
  ]);
  const historyComentarioColumn = pickAvailableColumn(histoSolicitudColumns, [
    'Comentario',
    'Comentarios',
    'Observacion'
  ]);
  const historyIsActiveColumn = pickAvailableColumn(histoSolicitudColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);
  const historyIsFromServerColumn = pickAvailableColumn(histoSolicitudColumns, [
    'IsFromServer'
  ]);
  const historyIsModifiedColumn = pickAvailableColumn(histoSolicitudColumns, [
    'IsModified'
  ]);

  const motivoRechazoIdColumn = pickAvailableColumn(motivoRechazoColumns, [
    'CodigoMotivoRechazo'
  ]);
  const motivoRechazoDescripcionColumn = pickAvailableColumn(
    motivoRechazoColumns,
    ['MotivoRechazo', 'Descripcion', 'NombreMotivoRechazo', 'Nombre']
  );
  const motivoRechazoIsActiveColumn = pickAvailableColumn(motivoRechazoColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const estadoIdColumn = pickAvailableColumn(estadoColumns, ['CodigoEstado']);
  const estadoDescripcionColumn = pickAvailableColumn(estadoColumns, [
    'Estado',
    'Descripcion',
    'NombreEstado',
    'NombreEntidad'
  ]);
  const estadoIsActiveColumn = pickAvailableColumn(estadoColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const visitadorIdColumn = pickAvailableColumn(visitadorColumns, [
    'CodigoVisitador',
    'CodigoUsuario',
    'CodigoUsuarioVisitador'
  ]);
  const visitadorIsActiveColumn = pickAvailableColumn(visitadorColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  const medicoIdColumn = pickAvailableColumn(medicoColumns, ['CodigoMedico']);
  const medicoIsActiveColumn = pickAvailableColumn(medicoColumns, [
    'IsActive',
    'IsActivo',
    'isActivo',
    'IsActiva'
  ]);

  const sucursalIdColumn = pickAvailableColumn(sucursalColumns, [
    appConfig.directory?.sucursalCatalogIdColumn || 'Codigo_Sucursal',
    'Codigo_Sucursal',
    'CodigoSucursal'
  ]);
  const sucursalIsActiveColumn = pickAvailableColumn(sucursalColumns, [
    appConfig.directory?.sucursalCatalogActiveColumn || 'isActivo',
    'isActivo',
    'IsActivo',
    'IsActive',
    'IsActiva'
  ]);

  const productIdColumn = pickAvailableColumn(productColumns, ['CodigoProducto']);
  const productSkuColumn = pickAvailableColumn(productColumns, ['SKU', 'Sku']);
  const productNameColumn = pickAvailableColumn(productColumns, ['NombreProducto']);
  const productIsActiveColumn = pickAvailableColumn(productColumns, [
    'IsActive',
    'IsActivo',
    'IsActiva'
  ]);

  if (
    !solicitudIdColumn ||
    !solicitudVisitadorColumn ||
    !detailSolicitudColumn ||
    !detailProductColumn ||
    !detailCantidadSolicitadaColumn
  ) {
    throw new AppError('Request tables are missing required columns.', 500);
  }

  return {
    solicitudColumns,
    productosXSolicitudColumns,
    histoSolicitudColumns,
    motivoRechazoColumns,
    estadoColumns,
    visitadorColumns,
    medicoColumns,
    sucursalColumns,
    productColumns,
    solicitudIdColumn,
    solicitudVisitadorColumn,
    solicitudSucursalColumn,
    solicitudMedicoColumn,
    solicitudEstadoColumn,
    solicitudFechaColumn,
    solicitudHoraColumn,
    solicitudComentarioColumn,
    solicitudCodigoUsuarioColumn,
    solicitudCodigoPaisColumn,
    solicitudIsActiveColumn,
    solicitudIsFromServerColumn,
    solicitudIsModifiedColumn,
    detailIdColumn,
    detailSolicitudColumn,
    detailProductColumn,
    detailCantidadSolicitadaColumn,
    detailCantidadEntregadaColumn,
    detailCantidadAprobadaGVMColumn,
    detailCantidadAprobadaGOColumn,
    detailCodigoMotivoRechazoColumn,
    detailObservacionColumn,
    detailCostoColumn,
    detailIsAprobadoGVMColumn,
    detailIsAprobadoGOColumn,
    detailIsFromServerColumn,
    detailIsModifiedColumn,
    detailIsActiveColumn,
    historySolicitudColumn,
    historyEstadoColumn,
    historyFechaColumn,
    historyHoraColumn,
    historyCodigoUsuarioColumn,
    historyComentarioColumn,
    historyIsActiveColumn,
    historyIsFromServerColumn,
    historyIsModifiedColumn,
    motivoRechazoIdColumn,
    motivoRechazoDescripcionColumn,
    motivoRechazoIsActiveColumn,
    estadoIdColumn,
    estadoDescripcionColumn,
    estadoIsActiveColumn,
    visitadorIdColumn,
    visitadorIsActiveColumn,
    medicoIdColumn,
    medicoIsActiveColumn,
    sucursalIdColumn,
    sucursalIsActiveColumn,
    productIdColumn,
    productSkuColumn,
    productNameColumn,
    productIsActiveColumn,
    solicitudTableSql: getResolvedTableSql('solicitudProductos'),
    productosXSolicitudTableSql: getResolvedTableSql('productosXSolicitud'),
    histoSolicitudTableSql: getResolvedTableSql('histoEstadosSolicitudProductos'),
    motivoRechazoTableSql: getResolvedTableSql('motivoRechazoSolicitud'),
    estadoTableSql: getResolvedTableSql('estado'),
    visitadorTableSql: getResolvedTableSql('visitador'),
    medicoTableSql: getResolvedTableSql('medico'),
    sucursalesTableSql: getResolvedTableSql('sucursales'),
    productTableSql: getResolvedTableSql('producto')
  };
}

async function listSolicitudesByVisitador(
  {
    codigoUsuarioVisitador,
    fechaInicio = null,
    fechaFinal = null,
    buscar = ''
  },
  executor
) {
  const schema = await resolveRequestSchema(executor);
  const whereParts = [
    `sp.${escapeColumn(schema.solicitudVisitadorColumn)} = ?`
  ];
  const params = [codigoUsuarioVisitador];

  if (schema.solicitudIsActiveColumn) {
    whereParts.push(
      `IFNULL(sp.${escapeColumn(schema.solicitudIsActiveColumn)}, 1) = 1`
    );
  }

  if (fechaInicio && fechaFinal && schema.solicitudFechaColumn) {
    whereParts.push(
      `sp.${escapeColumn(schema.solicitudFechaColumn)} >= ? AND sp.${escapeColumn(schema.solicitudFechaColumn)} <= ?`
    );
    params.push(fechaInicio, fechaFinal);
  }

  const visitadorJoinSql =
    schema.visitadorTableSql && schema.visitadorIdColumn
      ? `LEFT JOIN ${schema.visitadorTableSql} v
      ON v.${escapeColumn(schema.visitadorIdColumn)} = sp.${escapeColumn(schema.solicitudVisitadorColumn)}
      ${schema.visitadorIsActiveColumn
    ? `AND IFNULL(v.${escapeColumn(schema.visitadorIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const visitadorNameExpr = visitadorJoinSql
    ? buildVisitadorNameExpr(
      'v',
      schema.visitadorColumns,
      `sp.${escapeColumn(schema.solicitudVisitadorColumn)}`
    )
    : buildFallbackFromIdentifier(
      'Visitador',
      `sp.${escapeColumn(schema.solicitudVisitadorColumn)}`
    );

  const medicoJoinSql =
    schema.medicoTableSql && schema.medicoIdColumn && schema.solicitudMedicoColumn
      ? `LEFT JOIN ${schema.medicoTableSql} m
      ON m.${escapeColumn(schema.medicoIdColumn)} = sp.${escapeColumn(schema.solicitudMedicoColumn)}
      ${schema.medicoIsActiveColumn
    ? `AND IFNULL(m.${escapeColumn(schema.medicoIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const medicoNameExpr = medicoJoinSql
    ? buildMedicoNameExpr(
      'm',
      schema.medicoColumns,
      schema.solicitudMedicoColumn
        ? `sp.${escapeColumn(schema.solicitudMedicoColumn)}`
        : 'NULL'
    )
    : (schema.solicitudMedicoColumn
      ? buildFallbackFromIdentifier(
        'Médico',
        `sp.${escapeColumn(schema.solicitudMedicoColumn)}`
      )
      : 'NULL');

  const sucursalJoinSql =
    schema.sucursalesTableSql &&
    schema.sucursalIdColumn &&
    schema.solicitudSucursalColumn
      ? `LEFT JOIN ${schema.sucursalesTableSql} s
      ON s.${escapeColumn(schema.sucursalIdColumn)} = sp.${escapeColumn(schema.solicitudSucursalColumn)}
      ${schema.sucursalIsActiveColumn
    ? `AND IFNULL(s.${escapeColumn(schema.sucursalIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const sucursalNameExpr = sucursalJoinSql
    ? buildSucursalNameExpr(
      's',
      schema.sucursalColumns,
      schema.solicitudSucursalColumn
        ? `sp.${escapeColumn(schema.solicitudSucursalColumn)}`
        : 'NULL'
    )
    : (schema.solicitudSucursalColumn
      ? buildFallbackFromIdentifier(
        'Sucursal',
        `sp.${escapeColumn(schema.solicitudSucursalColumn)}`
      )
      : 'NULL');

  const estadoJoinSql =
    schema.estadoTableSql && schema.estadoIdColumn && schema.solicitudEstadoColumn
      ? `LEFT JOIN ${schema.estadoTableSql} e
      ON e.${escapeColumn(schema.estadoIdColumn)} = sp.${escapeColumn(schema.solicitudEstadoColumn)}
      ${schema.estadoIsActiveColumn
    ? `AND IFNULL(e.${escapeColumn(schema.estadoIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const estadoNombreExpr =
    estadoJoinSql && schema.estadoDescripcionColumn
      ? `COALESCE(
        NULLIF(e.${escapeColumn(schema.estadoDescripcionColumn)}, ''),
        ${buildFallbackFromIdentifier(
    'Estado',
    schema.solicitudEstadoColumn
      ? `sp.${escapeColumn(schema.solicitudEstadoColumn)}`
      : 'NULL'
  )}
      )`
      : (schema.solicitudEstadoColumn
        ? buildFallbackFromIdentifier(
          'Estado',
          `sp.${escapeColumn(schema.solicitudEstadoColumn)}`
        )
        : `'Estado N/A'`);

  const searchText = String(buscar || '').trim();

  if (searchText) {
    whereParts.push(
      `(
        CAST(sp.${escapeColumn(schema.solicitudIdColumn)} AS CHAR) LIKE ?
        OR ${medicoNameExpr} LIKE ?
        OR ${estadoNombreExpr} LIKE ?
      )`
    );
    params.push(`%${searchText}%`, `%${searchText}%`, `%${searchText}%`);
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      sp.${escapeColumn(schema.solicitudIdColumn)} AS codigoSolicitud,
      ${selectColumnOrNull('sp', schema.solicitudFechaColumn, 'fechaSolicitud')},
      ${selectColumnOrNull('sp', schema.solicitudHoraColumn, 'horaSolicitud')},
      sp.${escapeColumn(schema.solicitudVisitadorColumn)} AS codigoUsuarioVisitador,
      ${visitadorNameExpr} AS nombreVisitador,
      ${selectColumnOrNull('sp', schema.solicitudSucursalColumn, 'codigoSucursal')},
      ${sucursalNameExpr} AS nombreSucursal,
      ${selectColumnOrNull('sp', schema.solicitudMedicoColumn, 'codigoMedico')},
      ${medicoNameExpr} AS nombreMedico,
      ${selectColumnOrNull('sp', schema.solicitudEstadoColumn, 'codigoEstado')},
      ${estadoNombreExpr} AS estado
    FROM ${schema.solicitudTableSql} sp
    ${visitadorJoinSql}
    ${sucursalJoinSql}
    ${medicoJoinSql}
    ${estadoJoinSql}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY
      ${schema.solicitudFechaColumn ? `sp.${escapeColumn(schema.solicitudFechaColumn)} DESC,` : ''}
      ${schema.solicitudHoraColumn ? `sp.${escapeColumn(schema.solicitudHoraColumn)} DESC,` : ''}
      sp.${escapeColumn(schema.solicitudIdColumn)} DESC`,
    params
  );

  return rows || [];
}

async function findSolicitudByCode(
  {
    codigoSolicitud,
    codigoUsuarioVisitador
  },
  executor
) {
  const schema = await resolveRequestSchema(executor);
  const whereParts = [
    `sp.${escapeColumn(schema.solicitudIdColumn)} = ?`,
    `sp.${escapeColumn(schema.solicitudVisitadorColumn)} = ?`
  ];
  const params = [codigoSolicitud, codigoUsuarioVisitador];

  if (schema.solicitudIsActiveColumn) {
    whereParts.push(
      `IFNULL(sp.${escapeColumn(schema.solicitudIsActiveColumn)}, 1) = 1`
    );
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      sp.${escapeColumn(schema.solicitudIdColumn)} AS codigoSolicitud
    FROM ${schema.solicitudTableSql} sp
    WHERE ${whereParts.join(' AND ')}
    LIMIT 1`,
    params
  );

  return rows?.[0] || null;
}

async function listSolicitudDetails(
  {
    codigoSolicitud
  },
  executor
) {
  const schema = await resolveRequestSchema(executor);
  const whereParts = [
    `d.${escapeColumn(schema.detailSolicitudColumn)} = ?`
  ];
  const params = [codigoSolicitud];

  if (schema.detailIsActiveColumn) {
    whereParts.push(
      `IFNULL(d.${escapeColumn(schema.detailIsActiveColumn)}, 1) = 1`
    );
  }

  const productJoinSql =
    schema.productTableSql && schema.productIdColumn
      ? `LEFT JOIN ${schema.productTableSql} p
      ON p.${escapeColumn(schema.productIdColumn)} = d.${escapeColumn(schema.detailProductColumn)}
      ${schema.productIsActiveColumn
    ? `AND IFNULL(p.${escapeColumn(schema.productIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const productNameExpr =
    productJoinSql && schema.productNameColumn
      ? `COALESCE(
        NULLIF(p.${escapeColumn(schema.productNameColumn)}, ''),
        CONCAT('Producto ', d.${escapeColumn(schema.detailProductColumn)})
      )`
      : `CONCAT('Producto ', d.${escapeColumn(schema.detailProductColumn)})`;

  const motivoJoinSql =
    schema.motivoRechazoTableSql &&
    schema.motivoRechazoIdColumn &&
    schema.detailCodigoMotivoRechazoColumn
      ? `LEFT JOIN ${schema.motivoRechazoTableSql} mr
      ON mr.${escapeColumn(schema.motivoRechazoIdColumn)} = d.${escapeColumn(schema.detailCodigoMotivoRechazoColumn)}
      ${schema.motivoRechazoIsActiveColumn
    ? `AND IFNULL(mr.${escapeColumn(schema.motivoRechazoIsActiveColumn)}, 1) = 1`
    : ''}`
      : '';
  const motivoExpr =
    motivoJoinSql && schema.motivoRechazoDescripcionColumn
      ? `NULLIF(mr.${escapeColumn(schema.motivoRechazoDescripcionColumn)}, '')`
      : 'NULL';

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      ${selectColumnOrNull('d', schema.detailIdColumn, 'codigoSolicitudXProducto')},
      d.${escapeColumn(schema.detailSolicitudColumn)} AS codigoSolicitud,
      d.${escapeColumn(schema.detailProductColumn)} AS codigoProducto,
      ${productNameExpr} AS nombreProducto,
      d.${escapeColumn(schema.detailCantidadSolicitadaColumn)} AS cantidadSolicitada,
      ${selectColumnOrNull('d', schema.detailCantidadEntregadaColumn, 'cantidadEntregada')},
      ${selectColumnOrNull('d', schema.detailCantidadAprobadaGVMColumn, 'cantidadAprobadaGVM')},
      ${selectColumnOrNull('d', schema.detailCantidadAprobadaGOColumn, 'cantidadAprobadaGO')},
      ${selectColumnOrNull('d', schema.detailCodigoMotivoRechazoColumn, 'codigoMotivoRechazo')},
      ${motivoExpr} AS motivoRechazo,
      ${selectColumnOrNull('d', schema.detailObservacionColumn, 'observacion')}
    FROM ${schema.productosXSolicitudTableSql} d
    ${productJoinSql}
    ${motivoJoinSql}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY nombreProducto ASC`,
    params
  );

  return rows || [];
}

async function listRequestProductCatalog(executor) {
  const schema = await resolveRequestSchema(executor);

  if (!schema.productTableSql || !schema.productIdColumn) {
    return [];
  }

  const skuExpr = schema.productSkuColumn
    ? `p.${escapeColumn(schema.productSkuColumn)}`
    : 'NULL';
  const nameExpr = schema.productNameColumn
    ? `NULLIF(p.${escapeColumn(schema.productNameColumn)}, '')`
    : `NULL`;
  const whereParts = [];

  if (schema.productIsActiveColumn) {
    whereParts.push(`IFNULL(p.${escapeColumn(schema.productIsActiveColumn)}, 1) = 1`);
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      p.${escapeColumn(schema.productIdColumn)} AS codigoProducto,
      ${skuExpr} AS sku,
      COALESCE(${nameExpr}, CONCAT('Producto ', p.${escapeColumn(schema.productIdColumn)})) AS nombreProducto
    FROM ${schema.productTableSql} p
    ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
    ORDER BY nombreProducto ASC`
  );

  return rows || [];
}

async function createSolicitudHeader(
  {
    codigoUsuarioVisitador,
    codigoMedico = null,
    codigoSucursal = null,
    codigoEstado = null,
    fecha = null,
    hora = null,
    codigoUsuario = null,
    comentario = '',
    codigoPais = null
  },
  executor
) {
  const schema = await resolveRequestSchema(executor);

  if (!schema.solicitudTableSql || !schema.solicitudIdColumn) {
    throw new AppError('Solicitud header table is not available.', 500);
  }

  const insertColumns = [];
  const params = [];

  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: [schema.solicitudVisitadorColumn],
    value: codigoUsuarioVisitador
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoMedico'],
    value: codigoMedico
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoSucursal'],
    value: codigoSucursal
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoEstado'],
    value: codigoEstado
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['FechaCreacion', 'Fecha', 'FechaRegistro'],
    value: fecha
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['HoraCreacion', 'Hora', 'HoraRegistro'],
    value: hora
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuario', 'CodigoPersona'],
    value: codigoUsuario
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['Comentario', 'Comentarios', 'Observacion'],
    value: comentario
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoPais'],
    value: codigoPais
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['IsFromServer'],
    value: false
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['IsModified'],
    value: false
  });
  appendInsertValue({
    availableColumns: schema.solicitudColumns,
    insertColumns,
    params,
    candidates: ['IsActive', 'IsActivo', 'IsActiva'],
    value: true
  });

  if (!insertColumns.length) {
    throw new AppError('Solicitud header does not expose writable columns.', 500);
  }

  const [result] = await resolveExecutor(executor).execute(
    `INSERT INTO ${schema.solicitudTableSql}
      (${insertColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES (${insertColumns.map(() => '?').join(', ')})`,
    params
  );

  const insertedId = Number(result?.insertId || 0);

  if (insertedId > 0) {
    return insertedId;
  }

  const [latestRows] = await resolveExecutor(executor).execute(
    `SELECT sp.${escapeColumn(schema.solicitudIdColumn)} AS codigoSolicitud
    FROM ${schema.solicitudTableSql} sp
    WHERE sp.${escapeColumn(schema.solicitudVisitadorColumn)} = ?
    ORDER BY sp.${escapeColumn(schema.solicitudIdColumn)} DESC
    LIMIT 1`,
    [codigoUsuarioVisitador]
  );
  const fallbackId = Number(latestRows?.[0]?.codigoSolicitud || 0);

  if (fallbackId > 0) {
    return fallbackId;
  }

  throw new AppError('Could not resolve solicitud identifier after insert.', 500);
}

async function insertSolicitudProducts(
  {
    codigoSolicitud,
    items = [],
    observacion = ''
  },
  executor
) {
  const schema = await resolveRequestSchema(executor);

  if (
    !schema.productosXSolicitudTableSql ||
    !schema.detailSolicitudColumn ||
    !schema.detailProductColumn ||
    !schema.detailCantidadSolicitadaColumn
  ) {
    throw new AppError('Solicitud detail table is not available.', 500);
  }

  if (!Array.isArray(items) || !items.length) {
    return;
  }

  for (const item of items) {
    const insertColumns = [];
    const params = [];

    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CodigoSolicitud'],
      value: codigoSolicitud
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CodigoProducto'],
      value: item.codigoProducto
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CantidadSolicitada', 'Cantidad'],
      value: item.cantidadSolicitada
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CantidadAprobadaGVM'],
      value: null
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CantidadAprobadaGO'],
      value: null
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CantidadEntregada'],
      value: 0
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['CodigoMotivoRechazo'],
      value: null
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['Observacion', 'Comentario', 'Comentarios'],
      value: observacion
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['Costo'],
      value: 0
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['IsAprobadoGVM'],
      value: -1
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['IsAprobadoGO'],
      value: -1
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['IsFromServer'],
      value: false
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['IsModified'],
      value: false
    });
    appendInsertValue({
      availableColumns: schema.productosXSolicitudColumns,
      insertColumns,
      params,
      candidates: ['IsActive', 'IsActivo', 'IsActiva'],
      value: true
    });

    if (!insertColumns.length) {
      continue;
    }

    await resolveExecutor(executor).execute(
      `INSERT INTO ${schema.productosXSolicitudTableSql}
        (${insertColumns.map((column) => escapeColumn(column)).join(', ')})
      VALUES (${insertColumns.map(() => '?').join(', ')})`,
      params
    );
  }
}

async function insertSolicitudHistory(
  {
    codigoSolicitud,
    codigoEstado,
    fecha = null,
    hora = null,
    codigoUsuario = null,
    comentario = ''
  },
  executor
) {
  const schema = await resolveRequestSchema(executor);

  if (
    !schema.histoSolicitudTableSql ||
    !schema.historySolicitudColumn ||
    !schema.historyEstadoColumn
  ) {
    return;
  }

  const insertColumns = [];
  const params = [];

  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoSolicitud'],
    value: codigoSolicitud
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoEstado'],
    value: codigoEstado
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['Fecha', 'FechaRegistro', 'FechaCreacion'],
    value: fecha
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['Hora', 'HoraRegistro', 'HoraCreacion'],
    value: hora
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuario', 'CodigoPersona'],
    value: codigoUsuario
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['Comentario', 'Comentarios', 'Observacion'],
    value: comentario
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['IsFromServer'],
    value: false
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['IsModified'],
    value: false
  });
  appendInsertValue({
    availableColumns: schema.histoSolicitudColumns,
    insertColumns,
    params,
    candidates: ['IsActive', 'IsActivo', 'IsActiva'],
    value: true
  });

  if (!insertColumns.length) {
    return;
  }

  await resolveExecutor(executor).execute(
    `INSERT INTO ${schema.histoSolicitudTableSql}
      (${insertColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES (${insertColumns.map(() => '?').join(', ')})`,
    params
  );
}

module.exports = {
  listMyInventory,
  listProductCatalog,
  listProductTypeCatalog,
  findProductDescriptorByCode,
  listMovementDoctorsByVisitador,
  listProductMovements,
  listOrderSummaries,
  listOrderSalidaDetails,
  listSolicitudesByVisitador,
  findSolicitudByCode,
  listSolicitudDetails,
  listRequestProductCatalog,
  createSolicitudHeader,
  insertSolicitudProducts,
  insertSolicitudHistory
};
