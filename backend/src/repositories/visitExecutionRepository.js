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

const executionConfig = appConfig.visitExecution;
const dbName = quoteIdentifier(executionConfig.dbName, 'VISIT_EXECUTION_DB_NAME');
const sucursalDbName = quoteIdentifier(
  executionConfig.sucursalCatalogDbName,
  'VISIT_EXECUTION_SUCURSAL_DB_NAME'
);

const tables = {
  visitaMedica: `${dbName}.${quoteIdentifier(
    executionConfig.visitaMedicaTable,
    'VISIT_EXECUTION_VISITA_MEDICA_TABLE'
  )}`,
  estado: `${dbName}.${quoteIdentifier(
    executionConfig.estadoTable,
    'VISIT_EXECUTION_ESTADO_TABLE'
  )}`,
  medico: `${dbName}.${quoteIdentifier(
    executionConfig.medicoTable,
    'VISIT_EXECUTION_MEDICO_TABLE'
  )}`,
  parrilla: `${dbName}.${quoteIdentifier(
    executionConfig.parrillaTable,
    'VISIT_EXECUTION_PARRILLA_TABLE'
  )}`,
  familiaProducto: `${dbName}.${quoteIdentifier(
    executionConfig.familiaProductoTable,
    'VISIT_EXECUTION_FAMILIA_PRODUCTO_TABLE'
  )}`,
  familiasXParrilla: `${dbName}.${quoteIdentifier(
    executionConfig.familiasXParrillaTable,
    'VISIT_EXECUTION_FAMILIAS_X_PARRILLA_TABLE'
  )}`,
  producto: `${dbName}.${quoteIdentifier(
    executionConfig.productoTable,
    'VISIT_EXECUTION_PRODUCTO_TABLE'
  )}`,
  productosXFamilia: `${dbName}.${quoteIdentifier(
    executionConfig.productosXFamiliaTable,
    'VISIT_EXECUTION_PRODUCTOS_X_FAMILIA_TABLE'
  )}`,
  nombresProductoXPais: `${dbName}.${quoteIdentifier(
    executionConfig.nombresProductoXPaisTable,
    'VISIT_EXECUTION_NOMBRES_PRODUCTO_X_PAIS_TABLE'
  )}`,
  favoritos: `${dbName}.${quoteIdentifier(
    executionConfig.favoritosTable,
    'VISIT_EXECUTION_FAVORITOS_TABLE'
  )}`,
  entregaMuestras: `${dbName}.${quoteIdentifier(
    executionConfig.entregaMuestrasTable,
    'VISIT_EXECUTION_ENTREGA_MUESTRAS_TABLE'
  )}`,
  productosXEntregaMuestras: `${dbName}.${quoteIdentifier(
    executionConfig.productosXEntregaMuestrasTable,
    'VISIT_EXECUTION_PRODUCTOS_X_ENTREGA_MUESTRAS_TABLE'
  )}`,
  binarioOrdenMuestraFirmas: `${dbName}.${quoteIdentifier(
    executionConfig.binarioOrdenMuestraFirmasTable,
    'VISIT_EXECUTION_BINARIO_ORDEN_MUESTRA_FIRMAS_TABLE'
  )}`,
  ordenMuestra: `${dbName}.${quoteIdentifier(
    executionConfig.ordenMuestraTable,
    'VISIT_EXECUTION_ORDEN_MUESTRA_TABLE'
  )}`,
  ordenMuestraDetalle: `${dbName}.${quoteIdentifier(
    executionConfig.ordenMuestraDetalleTable,
    'VISIT_EXECUTION_ORDEN_MUESTRA_DETALLE_TABLE'
  )}`,
  sucursal: `${sucursalDbName}.${quoteIdentifier(
    executionConfig.sucursalCatalogTable,
    'VISIT_EXECUTION_SUCURSAL_TABLE'
  )}`
};

const columns = {
  familiaProductoName: quoteIdentifier(
    executionConfig.familiaProductoNameColumn,
    'VISIT_EXECUTION_FAMILIA_PRODUCTO_NAME_COLUMN'
  ),
  sucursalId: quoteIdentifier(
    executionConfig.sucursalCatalogIdColumn,
    'VISIT_EXECUTION_SUCURSAL_ID_COLUMN'
  ),
  sucursalName: quoteIdentifier(
    executionConfig.sucursalCatalogNameColumn,
    'VISIT_EXECUTION_SUCURSAL_NAME_COLUMN'
  ),
  sucursalAddress: quoteIdentifier(
    executionConfig.sucursalCatalogAddressColumn,
    'VISIT_EXECUTION_SUCURSAL_ADDRESS_COLUMN'
  ),
  sucursalIsActive: quoteIdentifier(
    executionConfig.sucursalCatalogActiveColumn,
    'VISIT_EXECUTION_SUCURSAL_ACTIVE_COLUMN'
  )
};

function doctorNameSql(alias = 'm') {
  return `COALESCE(
    NULLIF(${alias}.NombrePersona, ''),
    TRIM(CONCAT_WS(' ', ${alias}.PrimerNombre, ${alias}.SegundoNombre, ${alias}.PrimerApellido, ${alias}.SegundoApellido))
  )`;
}

function resolveExecutor(executor) {
  return executor || getPool();
}

async function getTableColumns(tableKey, executor) {
  if (tableColumnsCache.has(tableKey)) {
    return tableColumnsCache.get(tableKey);
  }

  const tableSql = tables[tableKey];

  if (!tableSql) {
    return new Set();
  }

  let rows;

  try {
    [rows] = await resolveExecutor(executor).execute(
      `SHOW COLUMNS FROM ${tableSql}`
    );
  } catch (error) {
    const code = String(error?.code || '');

    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_DB_ERROR') {
      const emptySet = new Set();
      tableColumnsCache.set(tableKey, emptySet);
      return emptySet;
    }

    throw error;
  }

  const columns = new Set(
    (rows || [])
      .map((row) => String(row.Field || '').trim())
      .filter(Boolean)
  );

  tableColumnsCache.set(tableKey, columns);
  return columns;
}

function escapeColumn(columnName) {
  return quoteIdentifier(columnName, `VISIT_EXECUTION_COLUMN_${columnName}`);
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
  candidates,
  value,
  required = false,
  requiredLabel = null,
  transform
}) {
  const column = pickAvailableColumn(availableColumns, candidates);

  if (!column) {
    if (required) {
      throw new AppError(
        `Missing required column (${requiredLabel || candidates[0]}).`,
        500
      );
    }
    return;
  }

  if (value === undefined) {
    return;
  }

  insertColumns.push(column);
  params.push(typeof transform === 'function' ? transform(value) : value);
}

async function findVisitByIdForUser(
  { codigoVisitaMedica, codigoUsuario, codigoVisitador = null },
  executor
) {
  const visitColumns = await getTableColumns('visitaMedica', executor);
  const selectCodigoPais = visitColumns.has('CodigoPais')
    ? 'vm.CodigoPais'
    : 'NULL';
  const selectCodigoSolicitud = visitColumns.has('CodigoSolicitud')
    ? 'vm.CodigoSolicitud'
    : 'NULL';
  const selectCorte = visitColumns.has('Corte') ? 'vm.Corte' : 'NULL';
  const selectTuid = visitColumns.has('TUID') ? 'vm.TUID' : 'NULL';

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      vm.CodigoVisitaMedica AS codigoVisitaMedica,
      vm.CodigoEntidad AS codigoTipoVisita,
      vm.CodigoEstado AS codigoEstado,
      e.Estado AS estadoNombre,
      vm.FechaProgramada AS fechaProgramada,
      vm.HoraProgramada AS horaProgramada,
      vm.CodigoMedico AS codigoMedico,
      vm.CodigoSucursal AS codigoSucursal,
      vm.CodigoUsuario AS codigoUsuario,
      vm.CodigoVisitador AS codigoVisitador,
      vm.CodigoPlazaMedica AS codigoPlazaMedica,
      ${selectCodigoPais} AS codigoPais,
      ${selectCodigoSolicitud} AS codigoSolicitud,
      ${selectCorte} AS corte,
      ${selectTuid} AS tuid,
      vm.ClasificacionVisita AS clasificacionVisita,
      vm.DetalleVisita AS detalleVisita,
      vm.FechaFin AS fechaFin,
      vm.HoraFin AS horaFin,
      vm.Comentarios AS comentarios,
      ${doctorNameSql('m')} AS nombreMedico,
      COALESCE(
        NULLIF(sc.${columns.sucursalName}, ''),
        CONCAT('Sucursal ', vm.CodigoSucursal)
      ) AS nombreSucursal,
      NULLIF(sc.${columns.sucursalAddress}, '') AS direccionSucursal
    FROM ${tables.visitaMedica} vm
    LEFT JOIN ${tables.estado} e
      ON e.CodigoEstado = vm.CodigoEstado
    LEFT JOIN ${tables.medico} m
      ON m.CodigoMedico = vm.CodigoMedico
    LEFT JOIN ${tables.sucursal} sc
      ON sc.${columns.sucursalId} = vm.CodigoSucursal
      AND IFNULL(sc.${columns.sucursalIsActive}, 1) = 1
    WHERE vm.CodigoVisitaMedica = ?
      AND (
        vm.CodigoUsuario = ?
        OR (? IS NOT NULL AND vm.CodigoVisitador = ?)
      )
      AND IFNULL(vm.IsActiva, 1) = 1
    LIMIT 1`,
    [codigoVisitaMedica, codigoUsuario, codigoVisitador, codigoVisitador]
  );

  return rows[0] || null;
}

async function listVisitProductsByVisit(
  { codigoVisitaMedica, codigoPais },
  executor
) {
  const availableColumns = await getTableColumns('favoritos', executor);
  const hasVisitIdColumn = availableColumns.has('CodigoVisitaMedica');
  const hasProductColumn = availableColumns.has('CodigoProducto');

  if (!hasVisitIdColumn || !hasProductColumn) {
    return {
      items: [],
      hasIsFavoritoColumn: false,
      hasIsAgregadoColumn: false
    };
  }

  const selectIsFavorito = availableColumns.has('IsFavorito')
    ? 'IFNULL(fv.IsFavorito, 0)'
    : '0';
  const selectIsAgregado = availableColumns.has('IsAgregado')
    ? 'IFNULL(fv.IsAgregado, 0)'
    : 'NULL';

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      fv.CodigoProducto AS codigoProducto,
      ${selectIsFavorito} AS isFavorito,
      ${selectIsAgregado} AS isAgregado,
      COALESCE(
        NULLIF(np.NombreProducto, ''),
        NULLIF(p.NombreProducto, ''),
        CONCAT('Producto ', fv.CodigoProducto)
      ) AS nombreProducto
    FROM ${tables.favoritos} fv
    LEFT JOIN ${tables.producto} p
      ON p.CodigoProducto = fv.CodigoProducto
    LEFT JOIN ${tables.nombresProductoXPais} np
      ON np.CodigoProducto = fv.CodigoProducto
      AND np.CodigoPais = ?
      AND IFNULL(np.IsActivo, 1) = 1
    WHERE fv.CodigoVisitaMedica = ?
    ORDER BY nombreProducto ASC`,
    [codigoPais, codigoVisitaMedica]
  );

  return {
    items: rows || [],
    hasIsFavoritoColumn: availableColumns.has('IsFavorito'),
    hasIsAgregadoColumn: availableColumns.has('IsAgregado')
  };
}

async function listParrillaFamilies(executor) {
  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      fxp.CodigoFamiliaProducto AS codigoFamiliaProducto,
      fp.${columns.familiaProductoName} AS nombreFamiliaProducto,
      fxp.CodigoParrilla AS codigoParrilla,
      p.NombreParrilla AS nombreParrilla,
      IFNULL(fxp.IsPrioritario, 0) AS isPrioritario,
      IFNULL(fxp.Orden, 0) AS orden
    FROM ${tables.familiasXParrilla} fxp
    INNER JOIN ${tables.familiaProducto} fp
      ON fp.CodigoFamiliaProducto = fxp.CodigoFamiliaProducto
      AND IFNULL(fp.IsActivo, 1) = 1
    INNER JOIN ${tables.parrilla} p
      ON p.CodigoParrilla = fxp.CodigoParrilla
      AND IFNULL(p.IsActivo, 1) = 1
    WHERE IFNULL(fxp.IsActivo, 1) = 1
    ORDER BY p.NombreParrilla ASC, COALESCE(fxp.Orden, 999999) ASC, fp.${columns.familiaProductoName} ASC`
  );

  return rows;
}

async function listProductsByParrillaFamilia({
  codigoParrilla,
  codigoFamiliaProducto,
  codigoPais
}, executor) {
  const [rows] = await resolveExecutor(executor).execute(
    `SELECT DISTINCT
      p.CodigoProducto AS codigoProducto,
      COALESCE(
        NULLIF(np.NombreProducto, ''),
        NULLIF(p.NombreProducto, ''),
        CONCAT('Producto ', p.CodigoProducto)
      ) AS nombreProducto
    FROM ${tables.familiasXParrilla} fxp
    INNER JOIN ${tables.productosXFamilia} pxf
      ON pxf.CodigoFamiliaProducto = fxp.CodigoFamiliaProducto
      AND IFNULL(pxf.IsActivo, 1) = 1
    INNER JOIN ${tables.producto} p
      ON p.CodigoProducto = pxf.CodigoProducto
      AND IFNULL(p.IsActivo, 1) = 1
    LEFT JOIN ${tables.nombresProductoXPais} np
      ON np.CodigoProducto = p.CodigoProducto
      AND IFNULL(np.IsActivo, 1) = 1
      AND np.CodigoPais = ?
    WHERE fxp.CodigoParrilla = ?
      AND fxp.CodigoFamiliaProducto = ?
      AND IFNULL(fxp.IsActivo, 1) = 1

    UNION

    SELECT DISTINCT
      p.CodigoProducto AS codigoProducto,
      COALESCE(
        NULLIF(np.NombreProducto, ''),
        NULLIF(p.NombreProducto, ''),
        CONCAT('Producto ', p.CodigoProducto)
      ) AS nombreProducto
    FROM ${tables.familiasXParrilla} fxp
    INNER JOIN ${tables.producto} p
      ON p.CodigoFamiliaProducto = fxp.CodigoFamiliaProducto
      AND IFNULL(p.IsActivo, 1) = 1
    LEFT JOIN ${tables.nombresProductoXPais} np
      ON np.CodigoProducto = p.CodigoProducto
      AND IFNULL(np.IsActivo, 1) = 1
      AND np.CodigoPais = ?
    WHERE fxp.CodigoParrilla = ?
      AND fxp.CodigoFamiliaProducto = ?
      AND IFNULL(fxp.IsActivo, 1) = 1
    ORDER BY nombreProducto ASC`,
    [
      codigoPais,
      codigoParrilla,
      codigoFamiliaProducto,
      codigoPais,
      codigoParrilla,
      codigoFamiliaProducto
    ]
  );

  return rows;
}

async function listAvailableSampleProductsByVisitador(
  {
    codigoUsuarioVisitador,
    codigoPais,
    tipoProducto = 1,
    includeZero = false,
    forUpdate = false
  },
  executor
) {
  const [sampleColumns, deliveryColumns, productColumns, familyColumns] =
    await Promise.all([
      getTableColumns('productosXEntregaMuestras', executor),
      getTableColumns('entregaMuestras', executor),
      getTableColumns('producto', executor),
      getTableColumns('familiaProducto', executor)
    ]);

  const sampleEntregaColumn = pickAvailableColumn(sampleColumns, ['CodigoEntrega']);
  const sampleProductColumn = pickAvailableColumn(sampleColumns, ['CodigoProducto']);
  const sampleQuantityColumn = pickAvailableColumn(sampleColumns, ['Cantidad']);
  const sampleVisitadorColumn = pickAvailableColumn(sampleColumns, [
    'CodigoUsuarioVisitador',
    'CodigoVisitador'
  ]);
  const sampleCountryColumn = pickAvailableColumn(sampleColumns, ['CodigoPais']);

  const deliveryEntregaColumn = pickAvailableColumn(deliveryColumns, ['CodigoEntrega']);
  const deliveryTypeColumn = pickAvailableColumn(deliveryColumns, ['CodigoTipoEntrega']);
  const deliveryProductTypeColumn = pickAvailableColumn(deliveryColumns, [
    'tipoProducto',
    'TipoProducto'
  ]);

  const productIdColumn = pickAvailableColumn(productColumns, ['CodigoProducto']);
  const productNameColumn = pickAvailableColumn(productColumns, ['NombreProducto']);
  const productSkuColumn = pickAvailableColumn(productColumns, ['SKU', 'Sku']);
  const productFamilyColumn = pickAvailableColumn(productColumns, ['CodigoFamiliaProducto']);

  const familyIdColumn = pickAvailableColumn(familyColumns, ['CodigoFamiliaProducto']);
  const familyNameColumn = pickAvailableColumn(familyColumns, [
    executionConfig.familiaProductoNameColumn,
    'NombreFamiliaProdructo',
    'NombreFamiliaProducto'
  ]);

  if (
    !sampleEntregaColumn ||
    !sampleProductColumn ||
    !sampleQuantityColumn ||
    !sampleVisitadorColumn ||
    !sampleCountryColumn ||
    !deliveryEntregaColumn ||
    !deliveryTypeColumn ||
    !deliveryProductTypeColumn ||
    !productIdColumn ||
    !productFamilyColumn ||
    !familyIdColumn
  ) {
    throw new AppError(
      'Sample inventory tables are missing required columns.',
      500
    );
  }

  const availableExpr = `(
    SUM(
      CASE
        WHEN em.${escapeColumn(deliveryTypeColumn)} = 1
        THEN IFNULL(pxem.${escapeColumn(sampleQuantityColumn)}, 0)
        ELSE 0
      END
    ) -
    SUM(
      CASE
        WHEN em.${escapeColumn(deliveryTypeColumn)} = 2
        THEN IFNULL(pxem.${escapeColumn(sampleQuantityColumn)}, 0)
        ELSE 0
      END
    )
  )`;
  const productNameExpr = productNameColumn
    ? `COALESCE(
      NULLIF(p.${escapeColumn(productNameColumn)}, ''),
      CONCAT('Producto ', pxem.${escapeColumn(sampleProductColumn)})
    )`
    : `CONCAT('Producto ', pxem.${escapeColumn(sampleProductColumn)})`;
  const familyNameExpr = familyNameColumn
    ? `COALESCE(
      NULLIF(fp.${escapeColumn(familyNameColumn)}, ''),
      CONCAT('Familia ', p.${escapeColumn(productFamilyColumn)})
    )`
    : `CONCAT('Familia ', p.${escapeColumn(productFamilyColumn)})`;
  const skuExpr = productSkuColumn
    ? `p.${escapeColumn(productSkuColumn)}`
    : 'NULL';

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      pxem.${escapeColumn(sampleProductColumn)} AS codigoProducto,
      ${familyNameExpr} AS nombreFamiliaProducto,
      ${productNameExpr} AS nombreProducto,
      ${skuExpr} AS sku,
      SUM(
        CASE
          WHEN em.${escapeColumn(deliveryTypeColumn)} = 1
          THEN IFNULL(pxem.${escapeColumn(sampleQuantityColumn)}, 0)
          ELSE 0
        END
      ) AS entradasSum,
      SUM(
        CASE
          WHEN em.${escapeColumn(deliveryTypeColumn)} = 2
          THEN IFNULL(pxem.${escapeColumn(sampleQuantityColumn)}, 0)
          ELSE 0
        END
      ) AS salidasSum,
      ${availableExpr} AS disponible
    FROM ${tables.productosXEntregaMuestras} pxem
    INNER JOIN ${tables.entregaMuestras} em
      ON em.${escapeColumn(deliveryEntregaColumn)} = pxem.${escapeColumn(sampleEntregaColumn)}
    INNER JOIN ${tables.producto} p
      ON p.${escapeColumn(productIdColumn)} = pxem.${escapeColumn(sampleProductColumn)}
    INNER JOIN ${tables.familiaProducto} fp
      ON fp.${escapeColumn(familyIdColumn)} = p.${escapeColumn(productFamilyColumn)}
    WHERE pxem.${escapeColumn(sampleVisitadorColumn)} = ?
      AND pxem.${escapeColumn(sampleVisitadorColumn)} IS NOT NULL
      AND pxem.${escapeColumn(sampleCountryColumn)} = ?
      AND em.${escapeColumn(deliveryProductTypeColumn)} = ?
    GROUP BY
      pxem.${escapeColumn(sampleProductColumn)},
      ${productSkuColumn ? `p.${escapeColumn(productSkuColumn)},` : ''}
      ${productNameColumn ? `p.${escapeColumn(productNameColumn)},` : ''}
      ${familyNameColumn
    ? `fp.${escapeColumn(familyNameColumn)}`
    : `p.${escapeColumn(productFamilyColumn)}`
}
    ${includeZero ? '' : `HAVING ${availableExpr} > 0`}
    ORDER BY nombreProducto ASC
    ${forUpdate ? 'FOR UPDATE' : ''}`,
    [codigoUsuarioVisitador, codigoPais, tipoProducto]
  );

  return rows || [];
}

async function findSampleOrderByVisit({ codigoVisitaMedica }, executor) {
  const availableColumns = await getTableColumns('ordenMuestra', executor);

  if (!availableColumns.size) {
    return null;
  }

  const visitColumn = pickAvailableColumn(availableColumns, [
    'CodigoVisitaMedica',
    'CodigoVisita'
  ]);

  if (!visitColumn) {
    return null;
  }

  const orderColumn = pickAvailableColumn(availableColumns, [
    'CodigoOrdenMuestra',
    'CodigoOrden'
  ]);
  const stateColumn = pickAvailableColumn(availableColumns, [
    'IsActivo',
    'IsActiva',
    'isActivo'
  ]);

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      ${orderColumn ? escapeColumn(orderColumn) : 'NULL'} AS codigoOrdenMuestra
    FROM ${tables.ordenMuestra}
    WHERE ${escapeColumn(visitColumn)} = ?
      ${stateColumn ? `AND IFNULL(${escapeColumn(stateColumn)}, 1) = 1` : ''}
    ORDER BY
      ${orderColumn ? `${escapeColumn(orderColumn)} DESC` : '1 DESC'}
    LIMIT 1`,
    [codigoVisitaMedica]
  );

  return rows[0] || null;
}

async function findSampleDeliveryByVisit(
  {
    codigoVisitaMedica,
    codigoTipoEntrega = null,
    codigoTipoVisita = null,
    tipoProducto = null
  },
  executor
) {
  const availableColumns = await getTableColumns('entregaMuestras', executor);

  if (!availableColumns.size) {
    return null;
  }

  const visitColumn = pickAvailableColumn(availableColumns, [
    'CodigoVisitaMedica',
    'CodigoVisita'
  ]);
  const entregaColumn = pickAvailableColumn(availableColumns, ['CodigoEntrega']);

  if (!visitColumn || !entregaColumn) {
    return null;
  }

  const typeColumn = pickAvailableColumn(availableColumns, ['CodigoTipoEntrega']);
  const visitTypeColumn = pickAvailableColumn(availableColumns, [
    'CodigoTipoVisita'
  ]);
  const productTypeColumn = pickAvailableColumn(availableColumns, [
    'tipoProducto',
    'TipoProducto'
  ]);
  const stateColumn = pickAvailableColumn(availableColumns, [
    'IsActivo',
    'IsActiva',
    'IsActive',
    'isActivo'
  ]);

  const whereParts = [`${escapeColumn(visitColumn)} = ?`];
  const params = [codigoVisitaMedica];

  if (typeColumn && codigoTipoEntrega !== null && codigoTipoEntrega !== undefined) {
    whereParts.push(`${escapeColumn(typeColumn)} = ?`);
    params.push(codigoTipoEntrega);
  }

  if (
    visitTypeColumn &&
    codigoTipoVisita !== null &&
    codigoTipoVisita !== undefined
  ) {
    whereParts.push(`${escapeColumn(visitTypeColumn)} = ?`);
    params.push(codigoTipoVisita);
  }

  if (productTypeColumn && tipoProducto !== null && tipoProducto !== undefined) {
    whereParts.push(`${escapeColumn(productTypeColumn)} = ?`);
    params.push(tipoProducto);
  }

  if (stateColumn) {
    whereParts.push(`IFNULL(${escapeColumn(stateColumn)}, 1) = 1`);
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT
      ${escapeColumn(entregaColumn)} AS codigoEntrega
    FROM ${tables.entregaMuestras}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY ${escapeColumn(entregaColumn)} DESC
    LIMIT 1`,
    params
  );

  return rows[0] || null;
}

async function createSampleOrderHeader(
  {
    codigoVisitaMedica,
    codigoMedico,
    codigoVisitador,
    codigoPais,
    codigoUsuario,
    fecha,
    hora,
    firma,
    estado
  },
  executor
) {
  const availableColumns = await getTableColumns('ordenMuestra', executor);

  if (!availableColumns.size) {
    throw new AppError(
      `Sample order table ${executionConfig.ordenMuestraTable} is not available.`,
      500
    );
  }

  const hasVisitadorColumn = Boolean(
    pickAvailableColumn(availableColumns, [
      'CodigoVisitador',
      'CodigoUsuarioVisitador'
    ])
  );
  const hasUserColumn = Boolean(
    pickAvailableColumn(availableColumns, [
      'CodigoUsuario',
      'CodigoUsuarioCreacion'
    ])
  );
  const hasSignatureColumn = Boolean(
    pickAvailableColumn(availableColumns, ['Firma', 'FirmaBinaria', 'FirmaVisitador'])
  );
  const hasStateColumn = Boolean(
    pickAvailableColumn(availableColumns, ['Estado', 'CodigoEstado'])
  );

  if (!hasVisitadorColumn || !hasUserColumn || !hasSignatureColumn || !hasStateColumn) {
    throw new AppError(
      'Sample order header table is missing required business columns.',
      500
    );
  }

  const insertColumns = [];
  const params = [];

  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoVisitaMedica', 'CodigoVisita'],
    value: codigoVisitaMedica,
    required: true,
    requiredLabel: 'CodigoVisitaMedica'
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoMedico'],
    value: codigoMedico
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoVisitador'],
    value: codigoVisitador
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuarioVisitador'],
    value: codigoVisitador
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoPais'],
    value: codigoPais
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['FechaCreacion', 'Fecha'],
    value: fecha
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['HoraCreacion', 'Hora'],
    value: hora
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuarioCreacion', 'CodigoUsuario'],
    value: codigoUsuario
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['Firma', 'FirmaBinaria', 'FirmaVisitador'],
    value: firma
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['Estado', 'CodigoEstado'],
    value: estado
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsActivo'],
    value: 1
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsActiva'],
    value: 1
  });

  if (!insertColumns.length) {
    throw new AppError('Sample order header payload is empty.', 500);
  }

  const [result] = await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.ordenMuestra}
      (${insertColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES (${insertColumns.map(() => '?').join(', ')})`,
    params
  );

  const insertedId = Number(result?.insertId || 0);

  if (insertedId > 0) {
    return insertedId;
  }

  const latestOrder = await findSampleOrderByVisit({ codigoVisitaMedica }, executor);
  const fallbackId = Number(latestOrder?.codigoOrdenMuestra || 0);

  if (fallbackId > 0) {
    return fallbackId;
  }

  throw new AppError('Could not resolve sample order identifier after insert.', 500);
}

async function insertSampleOrderDetails(
  {
    codigoOrdenMuestra,
    items = [],
    codigoPais,
    codigoUsuario,
    fecha,
    hora
  },
  executor
) {
  if (!items.length) {
    return;
  }

  const availableColumns = await getTableColumns('ordenMuestraDetalle', executor);

  if (!availableColumns.size) {
    throw new AppError(
      `Sample order detail table ${executionConfig.ordenMuestraDetalleTable} is not available.`,
      500
    );
  }

  const orderColumn = pickAvailableColumn(availableColumns, [
    'CodigoOrdenMuestra',
    'CodigoOrden'
  ]);
  const productColumn = pickAvailableColumn(availableColumns, ['CodigoProducto']);
  const quantityColumn = pickAvailableColumn(availableColumns, [
    'CantidadEntregada',
    'Cantidad'
  ]);

  if (!orderColumn || !productColumn || !quantityColumn) {
    throw new AppError(
      'Sample order detail table is missing required columns.',
      500
    );
  }

  const detailColumns = [orderColumn, productColumn, quantityColumn];
  const countryColumn = pickAvailableColumn(availableColumns, ['CodigoPais']);
  const userColumn = pickAvailableColumn(availableColumns, [
    'CodigoUsuarioCreacion',
    'CodigoUsuario'
  ]);
  const fechaColumn = pickAvailableColumn(availableColumns, ['FechaCreacion', 'Fecha']);
  const horaColumn = pickAvailableColumn(availableColumns, ['HoraCreacion', 'Hora']);
  const isActivoColumn = pickAvailableColumn(availableColumns, ['IsActivo']);
  const isActivaColumn = pickAvailableColumn(availableColumns, ['IsActiva']);

  if (countryColumn) {
    detailColumns.push(countryColumn);
  }

  if (userColumn) {
    detailColumns.push(userColumn);
  }

  if (fechaColumn) {
    detailColumns.push(fechaColumn);
  }

  if (horaColumn) {
    detailColumns.push(horaColumn);
  }

  if (isActivoColumn) {
    detailColumns.push(isActivoColumn);
  }

  if (isActivaColumn) {
    detailColumns.push(isActivaColumn);
  }

  const rowSql = `(${detailColumns.map(() => '?').join(', ')})`;
  const placeholders = items.map(() => rowSql).join(', ');
  const params = [];

  for (const item of items) {
    for (const column of detailColumns) {
      if (column === orderColumn) {
        params.push(codigoOrdenMuestra);
      } else if (column === productColumn) {
        params.push(item.codigoProducto);
      } else if (column === quantityColumn) {
        params.push(item.cantidad);
      } else if (column === countryColumn) {
        params.push(codigoPais);
      } else if (column === userColumn) {
        params.push(codigoUsuario);
      } else if (column === fechaColumn) {
        params.push(fecha);
      } else if (column === horaColumn) {
        params.push(hora);
      } else if (column === isActivoColumn || column === isActivaColumn) {
        params.push(1);
      } else {
        params.push(null);
      }
    }
  }

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.ordenMuestraDetalle}
      (${detailColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES ${placeholders}`,
    params
  );
}

async function createSampleInventorySalida(
  {
    codigoTipoEntrega,
    tipoProducto,
    codigoPais,
    codigoUsuario,
    codigoVisitador,
    codigoVisitaMedica,
    codigoOrdenMuestra,
    codigoMedico,
    codigoSucursal = null,
    codigoSolicitud = null,
    corte = null,
    codigoTipoVisita = null,
    codigoUsuarioRecibe = null,
    fechaRegistro = null,
    horaRegistro = null,
    fechaEntregado = null,
    horaEntregado = null,
    codigoUsuarioEntrega = null,
    s3KeyFirma = null,
    comentarios = null,
    isEntregado = true,
    tuid = null,
    isActivo = true,
    isActive = true,
    isFromServer = false,
    isModified = true
  },
  executor
) {
  const availableColumns = await getTableColumns('entregaMuestras', executor);

  if (!availableColumns.size) {
    throw new AppError(
      `Sample inventory table ${executionConfig.entregaMuestrasTable} is not available.`,
      500
    );
  }

  const insertColumns = [];
  const params = [];

  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoTipoEntrega'],
    value: codigoTipoEntrega,
    required: true,
    requiredLabel: 'CodigoTipoEntrega'
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['tipoProducto', 'TipoProducto'],
    value: tipoProducto,
    required: true,
    requiredLabel: 'tipoProducto'
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoPais'],
    value: codigoPais
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['FechaRegistro', 'FechaCreacion', 'Fecha'],
    value: fechaRegistro
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['HoraRegistro', 'HoraCreacion', 'Hora'],
    value: horaRegistro
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuarioRecibe'],
    value: codigoUsuarioRecibe ?? 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoVisitador'],
    value: codigoVisitador
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuarioVisitador'],
    value: codigoVisitador
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoVisitaMedica', 'CodigoVisita'],
    value: codigoVisitaMedica
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoOrdenMuestra', 'CodigoOrden'],
    value: codigoOrdenMuestra
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoTipoVisita'],
    value: codigoTipoVisita
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['FechaEntregado'],
    value: fechaEntregado
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['HoraEntregado'],
    value: horaEntregado
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoUsuarioEntrega', 'CodigoUsuario'],
    value: codigoUsuarioEntrega ?? codigoUsuario
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['S3KeyFirma'],
    value: s3KeyFirma
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['Comentarios'],
    value: comentarios
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsEntregado'],
    value: isEntregado ? 1 : 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['Corte'],
    value: corte
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoSolicitud'],
    value: codigoSolicitud
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoMedico'],
    value: codigoMedico
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['CodigoSucursal'],
    value: codigoSucursal ?? 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['TUID'],
    value: tuid
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsActivo'],
    value: isActivo ? 1 : 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsActiva'],
    value: isActivo ? 1 : 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsActive'],
    value: isActive ? 1 : 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsFromServer'],
    value: isFromServer ? 1 : 0
  });
  appendInsertValue({
    availableColumns,
    insertColumns,
    params,
    candidates: ['IsModified'],
    value: isModified ? 1 : 0
  });

  const [result] = await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.entregaMuestras}
      (${insertColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES (${insertColumns.map(() => '?').join(', ')})`,
    params
  );

  return Number(result?.insertId || 0);
}

async function insertSampleInventoryProducts(
  {
    codigoEntrega,
    items = [],
    codigoVisitador,
    codigoPais,
    codigoUsuario,
    corte = null,
    fecha,
    hora
  },
  executor
) {
  if (!items.length) {
    return;
  }

  const availableColumns = await getTableColumns('productosXEntregaMuestras', executor);

  if (!availableColumns.size) {
    throw new AppError(
      `Sample inventory products table ${executionConfig.productosXEntregaMuestrasTable} is not available.`,
      500
    );
  }

  const entregaColumn = pickAvailableColumn(availableColumns, ['CodigoEntrega']);
  const productColumn = pickAvailableColumn(availableColumns, ['CodigoProducto']);
  const quantityColumn = pickAvailableColumn(availableColumns, ['Cantidad']);

  if (!entregaColumn || !productColumn || !quantityColumn) {
    throw new AppError(
      'Sample inventory products table is missing required columns.',
      500
    );
  }

  const detailColumns = [entregaColumn, productColumn, quantityColumn];
  const visitadorColumn = pickAvailableColumn(availableColumns, [
    'CodigoUsuarioVisitador',
    'CodigoVisitador'
  ]);
  const countryColumn = pickAvailableColumn(availableColumns, ['CodigoPais']);
  const userColumn = pickAvailableColumn(availableColumns, ['CodigoUsuario']);
  const fechaColumn = pickAvailableColumn(availableColumns, ['Fecha']);
  const horaColumn = pickAvailableColumn(availableColumns, ['Hora']);
  const isActivoColumn = pickAvailableColumn(availableColumns, ['IsActivo']);
  const isActivaColumn = pickAvailableColumn(availableColumns, ['IsActiva']);
  const isActiveColumn = pickAvailableColumn(availableColumns, ['IsActive']);
  const isFromServerColumn = pickAvailableColumn(availableColumns, ['IsFromServer']);
  const isModifiedColumn = pickAvailableColumn(availableColumns, ['IsModified']);
  const corteColumn = pickAvailableColumn(availableColumns, ['Corte']);

  if (visitadorColumn) {
    detailColumns.push(visitadorColumn);
  }

  if (countryColumn) {
    detailColumns.push(countryColumn);
  }

  if (userColumn) {
    detailColumns.push(userColumn);
  }

  if (fechaColumn) {
    detailColumns.push(fechaColumn);
  }

  if (horaColumn) {
    detailColumns.push(horaColumn);
  }

  if (isActivoColumn) {
    detailColumns.push(isActivoColumn);
  }

  if (isActivaColumn) {
    detailColumns.push(isActivaColumn);
  }

  if (isActiveColumn) {
    detailColumns.push(isActiveColumn);
  }

  if (isFromServerColumn) {
    detailColumns.push(isFromServerColumn);
  }

  if (isModifiedColumn) {
    detailColumns.push(isModifiedColumn);
  }

  if (corteColumn) {
    detailColumns.push(corteColumn);
  }

  const rowSql = `(${detailColumns.map(() => '?').join(', ')})`;
  const placeholders = items.map(() => rowSql).join(', ');
  const params = [];

  for (const item of items) {
    for (const column of detailColumns) {
      if (column === entregaColumn) {
        params.push(codigoEntrega);
      } else if (column === productColumn) {
        params.push(item.codigoProducto);
      } else if (column === quantityColumn) {
        params.push(item.cantidad);
      } else if (column === visitadorColumn) {
        params.push(codigoVisitador);
      } else if (column === countryColumn) {
        params.push(codigoPais);
      } else if (column === userColumn) {
        params.push(codigoUsuario);
      } else if (column === fechaColumn) {
        params.push(fecha);
      } else if (column === horaColumn) {
        params.push(hora);
      } else if (column === isActivoColumn || column === isActivaColumn) {
        params.push(1);
      } else if (column === isActiveColumn) {
        params.push(1);
      } else if (column === isFromServerColumn) {
        params.push(0);
      } else if (column === isModifiedColumn) {
        params.push(0);
      } else if (column === corteColumn) {
        params.push(corte);
      } else {
        params.push(null);
      }
    }
  }

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.productosXEntregaMuestras}
      (${detailColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES ${placeholders}`,
    params
  );
}

async function insertSampleSignatureBinary(
  { codigoEntrega, binaryData },
  executor
) {
  const availableColumns = await getTableColumns('binarioOrdenMuestraFirmas', executor);

  if (!availableColumns.size) {
    throw new AppError(
      `Sample signature table ${executionConfig.binarioOrdenMuestraFirmasTable} is not available.`,
      500
    );
  }

  const entregaColumn = pickAvailableColumn(availableColumns, ['CodigoEntrega']);
  const dataColumn = pickAvailableColumn(availableColumns, [
    'BinaryData',
    'Firma',
    'FirmaBinaria',
    'Data'
  ]);

  if (!entregaColumn || !dataColumn) {
    throw new AppError(
      'Sample signature table is missing required columns.',
      500
    );
  }

  const insertColumns = [entregaColumn, dataColumn];
  const params = [codigoEntrega, binaryData];
  const isActivoColumn = pickAvailableColumn(availableColumns, ['IsActivo']);
  const isActivaColumn = pickAvailableColumn(availableColumns, ['IsActiva']);
  const isActiveColumn = pickAvailableColumn(availableColumns, ['IsActive']);

  if (isActivoColumn) {
    insertColumns.push(isActivoColumn);
    params.push(1);
  }

  if (isActivaColumn) {
    insertColumns.push(isActivaColumn);
    params.push(1);
  }

  if (isActiveColumn) {
    insertColumns.push(isActiveColumn);
    params.push(1);
  }

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.binarioOrdenMuestraFirmas}
      (${insertColumns.map((column) => escapeColumn(column)).join(', ')})
    VALUES (${insertColumns.map(() => '?').join(', ')})`,
    params
  );
}

async function updateVisitCompletion(
  {
    codigoVisitaMedica,
    codigoUsuario,
    latitudFin,
    longitudFin,
    fechaFin,
    horaFin,
    clasificacionVisita,
    detalleVisita,
    codigoEstado,
    isModified = true,
    codigoVisitador = null,
    codigoPlazaMedica,
    includeCodigoPlazaMedica,
    firmaBinaryMedico = null
  },
  executor
) {
  const availableColumns = await getTableColumns('visitaMedica', executor);
  const requestedUpdates = [
    { column: 'LatitudFin', value: latitudFin },
    { column: 'LongitudFin', value: longitudFin },
    { column: 'FechaFin', value: fechaFin },
    { column: 'HoraFin', value: horaFin },
    { column: 'ClasificacionVisita', value: clasificacionVisita },
    { column: 'CodigoEstado', value: codigoEstado },
    { column: 'IsModified', value: isModified ? 1 : 0 },
    { column: 'DetalleVisita', value: detalleVisita || null }
  ];

  if (firmaBinaryMedico !== null && firmaBinaryMedico !== undefined) {
    requestedUpdates.push({
      column: 'FirmaBinary_Medico',
      value: firmaBinaryMedico
    });
  }

  if (includeCodigoPlazaMedica && availableColumns.has('CodigoPlazaMedica')) {
    requestedUpdates.push({
      column: 'CodigoPlazaMedica',
      value: codigoPlazaMedica || null
    });
  }

  const updates = requestedUpdates.filter((item) =>
    availableColumns.has(item.column)
  );

  if (!updates.length) {
    return false;
  }

  const setSql = updates
    .map((item) => `${escapeColumn(item.column)} = ?`)
    .join(', ');
  const params = updates.map((item) => item.value);
  params.push(codigoVisitaMedica, codigoUsuario);
  params.push(codigoVisitador, codigoVisitador);

  const [result] = await resolveExecutor(executor).execute(
    `UPDATE ${tables.visitaMedica}
    SET ${setSql}
    WHERE CodigoVisitaMedica = ?
      AND (
        CodigoUsuario = ?
        OR (? IS NOT NULL AND CodigoVisitador = ?)
      )
      AND IFNULL(IsActiva, 1) = 1
    LIMIT 1`,
    params
  );

  return result.affectedRows > 0;
}

async function updateSampleDeliveryS3KeyByVisit(
  {
    codigoVisitaMedica,
    s3KeyFirma,
    comentarios = null,
    codigoTipoEntrega = null,
    codigoTipoVisita = null,
    tipoProducto = null,
    onlyWhenEmpty = false
  },
  executor
) {
  const visitId = Number(codigoVisitaMedica || 0);
  const s3Key = String(s3KeyFirma || '').trim();

  if (!Number.isFinite(visitId) || visitId <= 0 || !s3Key) {
    return false;
  }

  const availableColumns = await getTableColumns('entregaMuestras', executor);

  if (!availableColumns.size) {
    return false;
  }

  const s3Column = pickAvailableColumn(availableColumns, ['S3KeyFirma']);
  const visitColumn = pickAvailableColumn(availableColumns, [
    'CodigoVisitaMedica',
    'CodigoVisita'
  ]);
  const idColumn = pickAvailableColumn(availableColumns, ['CodigoEntrega']);

  if (!s3Column || !visitColumn || !idColumn) {
    return false;
  }

  const assignments = [`${escapeColumn(s3Column)} = ?`];
  const assignmentParams = [s3Key];
  const commentsColumn = pickAvailableColumn(availableColumns, ['Comentarios']);

  if (commentsColumn && comentarios !== null && comentarios !== undefined) {
    assignments.push(`${escapeColumn(commentsColumn)} = ?`);
    assignmentParams.push(comentarios);
  }

  const whereParts = [`${escapeColumn(visitColumn)} = ?`];
  const whereParams = [visitId];

  const deliveryTypeColumn = pickAvailableColumn(availableColumns, ['CodigoTipoEntrega']);
  const visitTypeColumn = pickAvailableColumn(availableColumns, ['CodigoTipoVisita']);
  const productTypeColumn = pickAvailableColumn(availableColumns, ['tipoProducto', 'TipoProducto']);

  if (deliveryTypeColumn && codigoTipoEntrega !== null && codigoTipoEntrega !== undefined) {
    whereParts.push(`${escapeColumn(deliveryTypeColumn)} = ?`);
    whereParams.push(codigoTipoEntrega);
  }

  if (visitTypeColumn && codigoTipoVisita !== null && codigoTipoVisita !== undefined) {
    whereParts.push(`${escapeColumn(visitTypeColumn)} = ?`);
    whereParams.push(codigoTipoVisita);
  }

  if (productTypeColumn && tipoProducto !== null && tipoProducto !== undefined) {
    whereParts.push(`${escapeColumn(productTypeColumn)} = ?`);
    whereParams.push(tipoProducto);
  }

  if (onlyWhenEmpty) {
    whereParts.push(
      `(${escapeColumn(s3Column)} IS NULL OR ${escapeColumn(s3Column)} = '')`
    );
  }

  const [rows] = await resolveExecutor(executor).execute(
    `SELECT ${escapeColumn(idColumn)} AS codigoEntrega
    FROM ${tables.entregaMuestras}
    WHERE ${whereParts.join(' AND ')}
    ORDER BY ${escapeColumn(idColumn)} DESC
    LIMIT 1`,
    whereParams
  );

  const codigoEntrega = Number(rows?.[0]?.codigoEntrega || 0);

  if (!Number.isFinite(codigoEntrega) || codigoEntrega <= 0) {
    return false;
  }

  const updateParams = [...assignmentParams, codigoEntrega];

  await resolveExecutor(executor).execute(
    `UPDATE ${tables.entregaMuestras}
    SET ${assignments.join(', ')}
    WHERE ${escapeColumn(idColumn)} = ?
    LIMIT 1`,
    updateParams
  );

  return true;
}

async function deleteFavoritesByVisit({ codigoVisitaMedica }, executor) {
  const availableColumns = await getTableColumns('favoritos', executor);

  if (!availableColumns.has('CodigoVisitaMedica')) {
    return;
  }

  await resolveExecutor(executor).execute(
    `DELETE FROM ${tables.favoritos}
    WHERE CodigoVisitaMedica = ?`,
    [codigoVisitaMedica]
  );
}

async function insertFavorites(items = [], executor) {
  if (!items.length) {
    return;
  }

  const availableColumns = await getTableColumns('favoritos', executor);
  const requestedColumns = [
    { column: 'CodigoProducto', key: 'codigoProducto' },
    { column: 'CodigoVisitaMedica', key: 'codigoVisitaMedica' },
    { column: 'CodigoMedico', key: 'codigoMedico' },
    { column: 'CodigoPais', key: 'codigoPais' },
    { column: 'Fecha', key: 'fecha' },
    { column: 'Hora', key: 'hora' },
    { column: 'CodigoUsuario', key: 'codigoUsuario' },
    { column: 'IsAgregado', key: 'isAgregado' },
    { column: 'IsFavorito', key: 'isFavorito' }
  ];
  const columns = requestedColumns.filter((item) =>
    availableColumns.has(item.column)
  );

  if (!columns.length) {
    return;
  }

  const rowSql = `(${columns.map(() => '?').join(', ')})`;
  const placeholders = items.map(() => rowSql).join(', ');
  const params = [];

  for (const item of items) {
    for (const column of columns) {
      if (column.key === 'isFavorito') {
        params.push(item.isFavorito ? 1 : 0);
      } else if (column.key === 'isAgregado') {
        params.push(item.isAgregado ? 1 : 0);
      } else {
        params.push(item[column.key] ?? null);
      }
    }
  }

  const columnSql = columns.map((item) => escapeColumn(item.column)).join(', ');

  await resolveExecutor(executor).execute(
    `INSERT INTO ${tables.favoritos}
      (${columnSql})
    VALUES ${placeholders}`,
    params
  );
}

module.exports = {
  findVisitByIdForUser,
  listVisitProductsByVisit,
  listParrillaFamilies,
  listProductsByParrillaFamilia,
  listAvailableSampleProductsByVisitador,
  findSampleOrderByVisit,
  findSampleDeliveryByVisit,
  createSampleOrderHeader,
  insertSampleOrderDetails,
  createSampleInventorySalida,
  insertSampleInventoryProducts,
  insertSampleSignatureBinary,
  updateVisitCompletion,
  updateSampleDeliveryS3KeyByVisit,
  deleteFavoritesByVisit,
  insertFavorites
};
