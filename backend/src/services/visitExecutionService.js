const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const directoryService = require('./directoryService');
const visitExecutionRepository = require('../repositories/visitExecutionRepository');
const s3StorageService = require('./s3StorageService');
const { AppError } = require('../utils/appError');

function normalizePositiveId(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} is required.`, 400);
  }

  return parsed;
}

function normalizeOptionalNumber(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError(`${fieldName} is invalid.`, 400);
  }

  return parsed;
}

function normalizeRating(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
    throw new AppError('clasificacionVisita must be between 1 and 5.', 400);
  }

  return Math.round(parsed);
}

function normalizeDetail(value) {
  return String(value || '').trim();
}

function normalizeCountryCode(value, fallback = 4) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function parsePositiveNumber(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return { value: null, valid: true };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return { value: null, valid: false };
  }

  return { value: parsed, valid: true };
}

function getTimestampParts(timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'America/Tegucigalpa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter
    .formatToParts(new Date())
    .reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }

      return accumulator;
    }, {});

  return {
    fecha: `${parts.year}-${parts.month}-${parts.day}`,
    hora: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

function buildParrillaCatalog(rows = []) {
  const seen = new Map();

  for (const row of rows) {
    const codigoParrilla = Number(row.codigoParrilla);

    if (!seen.has(codigoParrilla)) {
      seen.set(codigoParrilla, {
        value: codigoParrilla,
        label: row.nombreParrilla || `Parrilla ${codigoParrilla}`
      });
    }
  }

  return [...seen.values()];
}

function buildFamiliesByParrilla(rows = []) {
  const grouped = {};

  for (const row of rows) {
    const parrillaKey = String(row.codigoParrilla);
    const current = grouped[parrillaKey] || [];

    current.push({
      value: Number(row.codigoFamiliaProducto),
      label:
        row.nombreFamiliaProducto ||
        `Familia ${Number(row.codigoFamiliaProducto)}`,
      isPrioritario: Boolean(Number(row.isPrioritario || 0)),
      orden: Number(row.orden || 0),
      codigoParrilla: Number(row.codigoParrilla),
      nombreParrilla: row.nombreParrilla || '',
      codigoFamiliaProducto: Number(row.codigoFamiliaProducto),
      nombreFamiliaProducto: row.nombreFamiliaProducto || ''
    });

    grouped[parrillaKey] = current;
  }

  return grouped;
}

function normalizeProductStates(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  const byProductId = new Map();

  for (const item of items) {
    const codigoProducto = Number(item?.codigoProducto);

    if (!Number.isFinite(codigoProducto) || codigoProducto <= 0) {
      continue;
    }

    byProductId.set(codigoProducto, {
      codigoProducto,
      isAgregado: Boolean(item?.isAgregado),
      isFavorito: Boolean(item?.isFavorito)
    });
  }

  return [...byProductId.values()];
}

function getVisitadorCodeFromContext(context) {
  const value = Number(context?.visitador?.codigoVisitador || 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function resolveVisitadorCode(codigoUsuario) {
  try {
    const context = await directoryService.getVisitadorBySession(codigoUsuario);
    return getVisitadorCodeFromContext(context);
  } catch (error) {
    return null;
  }
}

async function resolveVisitadorContext(codigoUsuario) {
  try {
    return await directoryService.getVisitadorBySession(codigoUsuario);
  } catch (error) {
    return null;
  }
}

function getVisitadorCandidates(context, fallbackVisitador = null) {
  const values = [
    Number(context?.visitador?.codigoVisitador || 0),
    Number(context?.assignmentCode || 0),
    ...(Array.isArray(context?.assignmentCandidates)
      ? context.assignmentCandidates
      : []),
    Number(fallbackVisitador || 0)
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  return [...new Set(values)];
}

function normalizeSampleOrderItems(items = []) {
  if (!Array.isArray(items)) {
    return {
      items: [],
      errors: ['products debe ser un arreglo.']
    };
  }

  const byProduct = new Map();
  const errors = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const codigoProducto = Number(item.codigoProducto);
    const cantidad = Number(item.cantidad);

    if (!Number.isFinite(codigoProducto) || codigoProducto <= 0) {
      errors.push(
        `products[${index}].codigoProducto debe ser un número mayor a 0.`
      );
      continue;
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      errors.push(
        `products[${index}].cantidad debe ser un número entero mayor a 0.`
      );
      continue;
    }

    const previous = byProduct.get(codigoProducto) || 0;
    byProduct.set(codigoProducto, previous + cantidad);
  }

  return {
    items: [...byProduct.entries()].map(([codigoProducto, cantidad]) => ({
      codigoProducto,
      cantidad
    })),
    errors
  };
}

function normalizeSampleSignature(value) {
  const text = String(value || '').trim();

  if (!text) {
    throw new AppError('La firma del visitador es requerida.', 400);
  }

  const dataUrlMatch = text.match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/i);
  const mimeType = dataUrlMatch ? String(dataUrlMatch[1] || '').toLowerCase() : '';
  const extensionFromMime = mimeType.includes('/')
    ? mimeType.split('/').pop()
    : 'png';
  const base64Body = String(dataUrlMatch ? dataUrlMatch[2] : text).replace(/\s+/g, '');

  if (!base64Body) {
    throw new AppError('La firma es inválida.', 400);
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Body) || base64Body.length % 4 !== 0) {
    throw new AppError('La firma no tiene un formato base64 válido.', 400);
  }

  let buffer;

  try {
    buffer = Buffer.from(base64Body, 'base64');
  } catch (error) {
    throw new AppError('La firma no tiene un formato base64 válido.', 400);
  }

  if (!buffer || !buffer.length) {
    throw new AppError('La firma no contiene trazos válidos.', 400);
  }

  return {
    buffer,
    base64Body: buffer.toString('base64'),
    extension: s3StorageService.normalizeFileExtension(extensionFromMime)
  };
}

function mapSampleProducts(rows = []) {
  return rows.map((item) => ({
    codigoProducto: Number(item.codigoProducto),
    nombreProducto: String(item.nombreProducto || '').trim(),
    nombreFamiliaProducto: String(item.nombreFamiliaProducto || '').trim(),
    sku: String(item.sku || '').trim(),
    entradas: Number(item.entradasSum || 0),
    salidas: Number(item.salidasSum || 0),
    disponible: Number(item.disponible || 0)
  }));
}

async function resolveSampleProductsByVisitadorCandidates(
  {
    visitadorCandidates = [],
    codigoPais,
    tipoProducto,
    includeZero = false,
    forUpdate = false
  },
  executor
) {
  if (!visitadorCandidates.length) {
    return {
      codigoUsuarioVisitador: null,
      items: []
    };
  }

  let fallbackCandidate = visitadorCandidates[0];
  let fallbackItems = [];
  let hasFallback = false;

  for (const candidate of visitadorCandidates) {
    const rows = await visitExecutionRepository.listAvailableSampleProductsByVisitador(
      {
        codigoUsuarioVisitador: candidate,
        codigoPais,
        tipoProducto,
        includeZero,
        forUpdate
      },
      executor
    );

    if (!hasFallback) {
      fallbackCandidate = candidate;
      fallbackItems = rows;
      hasFallback = true;
    }

    if (rows.length) {
      return {
        codigoUsuarioVisitador: candidate,
        items: rows
      };
    }
  }

  return {
    codigoUsuarioVisitador: fallbackCandidate,
    items: fallbackItems
  };
}

async function getBootstrap(codPersonas, visitId) {
  const codigoUsuario = normalizePositiveId(codPersonas, 'codPersonas');
  const codigoVisitaMedica = normalizePositiveId(visitId, 'visitId');
  const codigoVisitador = await resolveVisitadorCode(codigoUsuario);

  const [visit, familiasParrillaRows] = await Promise.all([
    visitExecutionRepository.findVisitByIdForUser({
      codigoVisitaMedica,
      codigoUsuario,
      codigoVisitador
    }),
    visitExecutionRepository.listParrillaFamilies()
  ]);

  if (!visit) {
    throw new AppError('Visit was not found for the authenticated user.', 404);
  }

  return {
    visit,
    familiasParrilla: familiasParrillaRows.map((row) => ({
      codigoFamiliaProducto: Number(row.codigoFamiliaProducto),
      nombreFamiliaProducto: row.nombreFamiliaProducto || '',
      codigoParrilla: Number(row.codigoParrilla),
      nombreParrilla: row.nombreParrilla || '',
      isPrioritario: Boolean(Number(row.isPrioritario || 0)),
      orden: Number(row.orden || 0)
    })),
    parrillas: buildParrillaCatalog(familiasParrillaRows),
    familiasByParrilla: buildFamiliesByParrilla(familiasParrillaRows)
  };
}

async function getProductsBySelection(codPersonas, query = {}) {
  normalizePositiveId(codPersonas, 'codPersonas');

  const codigoParrilla = normalizePositiveId(
    query.codigoParrilla,
    'codigoParrilla'
  );
  const codigoFamiliaProducto = normalizePositiveId(
    query.codigoFamiliaProducto,
    'codigoFamiliaProducto'
  );

  const items = await visitExecutionRepository.listProductsByParrillaFamilia({
    codigoParrilla,
    codigoFamiliaProducto,
    codigoPais: appConfig.visitExecution.countryCode
  });

  return {
    codigoParrilla,
    codigoFamiliaProducto,
    items: (items || []).map((item) => ({
      codigoProducto: Number(item.codigoProducto),
      nombreProducto: item.nombreProducto || ''
    }))
  };
}

function buildVisitDetailPayload(visit, productsPayload) {
  const items = productsPayload?.items || [];
  const hasIsAgregadoColumn = Boolean(productsPayload?.hasIsAgregadoColumn);

  const products = items.map((item) => ({
    codigoProducto: Number(item.codigoProducto),
    nombreProducto: item.nombreProducto || `Producto ${Number(item.codigoProducto)}`,
    isFavorito: Boolean(Number(item.isFavorito || 0)),
    isAgregado: hasIsAgregadoColumn
      ? Boolean(Number(item.isAgregado || 0))
      : true
  }));

  return {
    visit: {
      codigoVisitaMedica: Number(visit.codigoVisitaMedica),
      codigoTipoVisita: Number(visit.codigoTipoVisita || 0),
      nombreMedico: visit.nombreMedico || '',
      nombreSucursal: visit.nombreSucursal || '',
      fechaVisita: visit.fechaProgramada || null,
      clasificacionVisita: Number(visit.clasificacionVisita || 0),
      comentario: String(visit.detalleVisita || visit.comentarios || '').trim()
    },
    productosInteres: products.filter((item) => item.isFavorito),
    productosAbordados: products.filter((item) => item.isAgregado)
  };
}

async function getVisitDetail(codPersonas, visitId) {
  const codigoUsuario = normalizePositiveId(codPersonas, 'codPersonas');
  const codigoVisitaMedica = normalizePositiveId(visitId, 'visitId');
  const codigoVisitador = await resolveVisitadorCode(codigoUsuario);

  const visit = await visitExecutionRepository.findVisitByIdForUser({
    codigoVisitaMedica,
    codigoUsuario,
    codigoVisitador
  });

  if (!visit) {
    throw new AppError('Visit was not found for the authenticated user.', 404);
  }

  const productsPayload = await visitExecutionRepository.listVisitProductsByVisit({
    codigoVisitaMedica,
    codigoPais: appConfig.visitExecution.countryCode
  });

  return buildVisitDetailPayload(visit, productsPayload);
}

async function getSampleOrderProducts(codPersonas, visitId) {
  const codigoUsuario = normalizePositiveId(codPersonas, 'codPersonas');
  const codigoVisitaMedica = normalizePositiveId(visitId, 'visitId');
  const codigoPais = normalizeCountryCode(
    appConfig.visitExecution.countryCode,
    4
  );
  const tipoProducto = normalizeCountryCode(
    appConfig.visitExecution.sampleProductTypeCode,
    1
  );
  const [codigoVisitador, visitadorContext] = await Promise.all([
    resolveVisitadorCode(codigoUsuario),
    resolveVisitadorContext(codigoUsuario)
  ]);

  const visit = await visitExecutionRepository.findVisitByIdForUser({
    codigoVisitaMedica,
    codigoUsuario,
    codigoVisitador
  });

  if (!visit) {
    throw new AppError('Visit was not found for the authenticated user.', 404);
  }

  const visitadorCandidates = getVisitadorCandidates(
    visitadorContext,
    visit.codigoVisitador
  );
  const sampleProductsPayload = await resolveSampleProductsByVisitadorCandidates({
    visitadorCandidates,
    codigoPais,
    tipoProducto,
    includeZero: false,
    forUpdate: false
  });

  return {
    visit: {
      codigoVisitaMedica,
      codigoMedico: normalizeOptionalNumber(visit.codigoMedico, 'codigoMedico'),
      codigoVisitador:
        normalizeOptionalNumber(visit.codigoVisitador, 'codigoVisitador') ||
        sampleProductsPayload.codigoUsuarioVisitador ||
        null,
      codigoPais:
        normalizeOptionalNumber(visit.codigoPais, 'codigoPais') || codigoPais,
      codigoSolicitud: normalizeOptionalNumber(
        visit.codigoSolicitud,
        'codigoSolicitud'
      ),
      corte: normalizeOptionalNumber(visit.corte, 'corte'),
      tuid: visit.tuid || null,
      nombreMedico: visit.nombreMedico || '',
      nombreSucursal: visit.nombreSucursal || ''
    },
    codigoUsuarioVisitador: sampleProductsPayload.codigoUsuarioVisitador,
    items: mapSampleProducts(sampleProductsPayload.items)
  };
}

async function createSampleOrder(codPersonas, visitId, payload = {}) {
  const codigoUsuario = normalizePositiveId(codPersonas, 'codPersonas');
  const codigoVisitaMedica = normalizePositiveId(visitId, 'visitId');
  const { items: selectedProducts, errors: productErrors } =
    normalizeSampleOrderItems(payload.products || []);

  if (!selectedProducts.length) {
    productErrors.push('Debe seleccionar al menos un producto para la orden.');
  }

  if (productErrors.length) {
    throw new AppError(`Advertencia de campos: ${productErrors.join(' | ')}`, 400);
  }

  const [codigoVisitador, visitadorContext] = await Promise.all([
    resolveVisitadorCode(codigoUsuario),
    resolveVisitadorContext(codigoUsuario)
  ]);
  const tipoProducto = normalizeCountryCode(
    appConfig.visitExecution.sampleProductTypeCode,
    1
  );
  const codigoTipoEntregaSalida = normalizeCountryCode(
    appConfig.visitExecution.sampleOutputTypeCode,
    2
  );
  const codigoTipoVisita = 1;
  const timestamp = getTimestampParts(appConfig.visitExecution.timezone);
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const visit = await visitExecutionRepository.findVisitByIdForUser(
      {
        codigoVisitaMedica,
        codigoUsuario,
        codigoVisitador
      },
      connection
    );

    if (!visit) {
      throw new AppError('Visit was not found for the authenticated user.', 404);
    }

    const codigoPais = normalizeCountryCode(
      visit.codigoPais ?? appConfig.visitExecution.countryCode,
      4
    );
    const existingDelivery = await visitExecutionRepository.findSampleDeliveryByVisit(
      {
        codigoVisitaMedica,
        codigoTipoEntrega: codigoTipoEntregaSalida,
        codigoTipoVisita,
        tipoProducto
      },
      connection
    );

    if (existingDelivery?.codigoEntrega) {
      throw new AppError(
        'Ya existe una entrega de muestra registrada para esta visita.',
        409
      );
    }

    const visitadorCandidates = getVisitadorCandidates(
      visitadorContext,
      visit.codigoVisitador
    );
    const sampleProductsPayload =
      await resolveSampleProductsByVisitadorCandidates(
        {
          visitadorCandidates,
          codigoPais,
          tipoProducto,
          includeZero: true,
          forUpdate: true
        },
        connection
      );
    const availabilityByProduct = new Map(
      mapSampleProducts(sampleProductsPayload.items).map((item) => [
        item.codigoProducto,
        item
      ])
    );
    const availabilityErrors = [];

    for (const item of selectedProducts) {
      const current = availabilityByProduct.get(item.codigoProducto);

      if (!current) {
        availabilityErrors.push(
          `El producto ${item.codigoProducto} no tiene disponibilidad activa para este visitador.`
        );
        continue;
      }

      if (item.cantidad > current.disponible) {
        availabilityErrors.push(
          `La cantidad solicitada para ${current.nombreProducto || `producto ${item.codigoProducto}`} (${item.cantidad}) supera el disponible (${current.disponible}).`
        );
      }
    }

    if (availabilityErrors.length) {
      throw new AppError(
        `Advertencia de campos: ${availabilityErrors.join(' | ')}`,
        400
      );
    }

    const codigoVisitadorSalida =
      sampleProductsPayload.codigoUsuarioVisitador ||
      normalizeOptionalNumber(visit.codigoVisitador, 'codigoVisitador') ||
      codigoVisitador;

    if (!codigoVisitadorSalida) {
      throw new AppError(
        'No se pudo determinar el código de visitador para registrar la salida de muestras.',
        400
      );
    }

    const codigoMedico = normalizeOptionalNumber(visit.codigoMedico, 'codigoMedico');
    const corteParse = parseOptionalNumber(payload.corte ?? visit.corte);
    const codigoSolicitudParse = parseOptionalNumber(
      payload.codigoSolicitud ?? visit.codigoSolicitud
    );

    if (!corteParse.valid) {
      throw new AppError('corte debe ser un valor numérico.', 400);
    }

    if (!codigoSolicitudParse.valid) {
      throw new AppError('codigoSolicitud debe ser un valor numérico.', 400);
    }

    const resolvedComentarios = normalizeDetail(payload.comentarios || '');
    const providedS3KeyFirma = String(payload.s3KeyFirma || '').trim();
    let resolvedS3KeyFirma = providedS3KeyFirma || null;

    if (!resolvedS3KeyFirma) {
      const signature = normalizeSampleSignature(payload.signature);
      const nombreTablaFirma =
        String(payload.nombreTablaFirma || '').trim() ||
        appConfig?.s3Storage?.defaultTableName ||
        'tblEntregaMuestras';
      const uploadResult = await s3StorageService.uploadSignatureToS3({
        signatureBase64: signature.base64Body,
        extension: signature.extension,
        codPersona: codigoUsuario,
        codigoVisitaMedica,
        nombreTabla: nombreTablaFirma
      });

      resolvedS3KeyFirma = String(uploadResult?.s3Key || '').trim() || null;
    }

    if (!resolvedS3KeyFirma) {
      throw new AppError('No se pudo generar la referencia S3 de la firma.', 502);
    }

    const providedTuid = String(payload.tuid || visit.tuid || '').trim();
    const resolvedTuid =
      providedTuid || `EM-${codigoVisitaMedica}-${Date.now()}`;

    const codigoEntrega = await visitExecutionRepository.createSampleInventorySalida(
      {
        codigoTipoEntrega: codigoTipoEntregaSalida,
        tipoProducto,
        codigoPais,
        codigoUsuario,
        codigoVisitador: codigoVisitadorSalida,
        codigoVisitaMedica,
        codigoOrdenMuestra: undefined,
        codigoMedico,
        codigoSucursal: 0,
        codigoSolicitud: codigoSolicitudParse.value,
        corte: corteParse.value,
        codigoTipoVisita,
        codigoUsuarioRecibe: 0,
        fechaRegistro: timestamp.fecha,
        horaRegistro: timestamp.hora,
        fechaEntregado: timestamp.fecha,
        horaEntregado: timestamp.hora,
        codigoUsuarioEntrega: codigoUsuario,
        s3KeyFirma: resolvedS3KeyFirma,
        comentarios: resolvedComentarios,
        isEntregado: true,
        tuid: resolvedTuid,
        isActivo: true,
        isActive: true,
        isFromServer: false,
        isModified: true
      },
      connection
    );

    if (!codigoEntrega) {
      throw new AppError(
        'No se pudo registrar la cabecera de salida de inventario.',
        500
      );
    }

    await visitExecutionRepository.insertSampleInventoryProducts(
      {
        codigoEntrega,
        items: selectedProducts,
        codigoVisitador: codigoVisitadorSalida,
        codigoPais,
        codigoUsuario,
        corte: corteParse.value,
        fecha: timestamp.fecha,
        hora: timestamp.hora
      },
      connection
    );

    await connection.commit();

    return {
      inventory: {
        codigoEntrega,
        codigoVisitaMedica,
        codigoTipoEntrega: codigoTipoEntregaSalida,
        tipoProducto,
        totalProductos: selectedProducts.length,
        s3KeyFirma: resolvedS3KeyFirma
      }
    };
  } catch (error) {
    await connection.rollback();

    if (String(error?.code || '') === 'ER_DUP_ENTRY') {
      throw new AppError(
        'Ya existe una entrega de muestra para esta visita.',
        409
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

async function finalizeVisit(codPersonas, visitId, payload = {}) {
  const validationErrors = [];

  const codigoUsuario = parsePositiveNumber(codPersonas);
  const codigoVisitaMedica = parsePositiveNumber(visitId);
  const allowWithoutLocation = Boolean(payload.allowWithoutLocation);
  const latitudFinParse = parseOptionalNumber(payload.latitudFin);
  const longitudFinParse = parseOptionalNumber(payload.longitudFin);
  const latitudFin = latitudFinParse.value;
  const longitudFin = longitudFinParse.value;
  const parsedRating = Number(payload.clasificacionVisita);
  const detalleVisita = normalizeDetail(payload.detalleVisita);
  const providedS3KeyFirma = String(payload.s3KeyFirma || '').trim();
  const providedSignatureText = String(payload.signature || '').trim();
  const normalizedProducts = Array.isArray(payload.products)
    ? payload.products
    : [];

  if (!codigoUsuario) {
    validationErrors.push('codPersonas debe ser un número mayor a 0.');
  }

  if (!codigoVisitaMedica) {
    validationErrors.push('visitId debe ser un número mayor a 0.');
  }

  if (
    !Number.isFinite(parsedRating) ||
    parsedRating < 1 ||
    parsedRating > 5
  ) {
    validationErrors.push('clasificacionVisita debe estar entre 1 y 5.');
  }

  if (!allowWithoutLocation) {
    if (!latitudFinParse.valid) {
      validationErrors.push('latitudFin debe ser un valor numérico.');
    }

    if (!longitudFinParse.valid) {
      validationErrors.push('longitudFin debe ser un valor numérico.');
    }

    if (latitudFin === null) {
      validationErrors.push('latitudFin es requerida para finalizar con geolocalización.');
    }

    if (longitudFin === null) {
      validationErrors.push('longitudFin es requerida para finalizar con geolocalización.');
    }
  } else {
    if (!latitudFinParse.valid) {
      validationErrors.push('latitudFin debe ser numérica o null cuando finaliza sin geolocalización.');
    }

    if (!longitudFinParse.valid) {
      validationErrors.push('longitudFin debe ser numérica o null cuando finaliza sin geolocalización.');
    }
  }

  const products = [];

  for (let index = 0; index < normalizedProducts.length; index += 1) {
    const rawItem = normalizedProducts[index] || {};
    const codigoProducto = parsePositiveNumber(rawItem.codigoProducto);

    if (!codigoProducto) {
      validationErrors.push(
        `products[${index}].codigoProducto debe ser un número mayor a 0.`
      );
      continue;
    }

    products.push({
      codigoProducto,
      isAgregado: Boolean(rawItem.isAgregado),
      isFavorito: Boolean(rawItem.isFavorito)
    });
  }

  if (validationErrors.length) {
    throw new AppError(
      `Advertencia de campos: ${validationErrors.join(' | ')}`,
      400
    );
  }

  const clasificacionVisita = Math.round(parsedRating);

  const hasLocation = latitudFin !== null && longitudFin !== null;

  if (!hasLocation && !allowWithoutLocation) {
    throw new AppError('latitudFin and longitudFin are required.', 400);
  }

  const timestamp = getTimestampParts(appConfig.visitExecution.timezone);
  const pool = getPool();
  const connection = await pool.getConnection();
  const codigoPaisFavoritos = normalizeCountryCode(
    appConfig.visitExecution.favoriteCountryCode,
    normalizeCountryCode(appConfig.visitExecution.countryCode, 4)
  );
  const codigoVisitador = await resolveVisitadorCode(codigoUsuario);

  try {
    await connection.beginTransaction();

    const visit = await visitExecutionRepository.findVisitByIdForUser(
      {
        codigoVisitaMedica,
        codigoUsuario,
        codigoVisitador
      },
      connection
    );

    if (!visit) {
      throw new AppError('Visit was not found for the authenticated user.', 404);
    }

    let signatureForFinalize = null;
    let resolvedS3KeyFirma = providedS3KeyFirma || null;

    if (providedSignatureText) {
      signatureForFinalize = normalizeSampleSignature(providedSignatureText);

      if (!resolvedS3KeyFirma) {
        const nombreTablaFirma =
          String(payload.nombreTablaFirma || '').trim() ||
          appConfig?.s3Storage?.defaultTableName ||
          'tblEntregaMuestras';
        const uploadResult = await s3StorageService.uploadSignatureToS3({
          signatureBase64: signatureForFinalize.base64Body,
          extension: signatureForFinalize.extension,
          codPersona: codigoUsuario,
          codigoVisitaMedica,
          nombreTabla: nombreTablaFirma
        });

        resolvedS3KeyFirma = String(uploadResult?.s3Key || '').trim() || null;

        if (!resolvedS3KeyFirma) {
          throw new AppError('No se pudo generar la referencia S3 de la firma.', 502);
        }
      }
    }

    const isMedicalVisit = Number(visit.codigoTipoVisita || 0) !== 2;
    const updated = await visitExecutionRepository.updateVisitCompletion(
      {
        codigoVisitaMedica,
        codigoUsuario,
        latitudFin,
        longitudFin,
        fechaFin: timestamp.fecha,
        horaFin: timestamp.hora,
        clasificacionVisita,
        detalleVisita,
        codigoEstado: appConfig.visitExecution.completedStatusCode,
        isModified: true,
        codigoVisitador,
        firmaBinaryMedico: signatureForFinalize?.buffer || null,
        codigoPlazaMedica: isMedicalVisit
          ? normalizeOptionalNumber(
              payload.codigoPlazaMedica ?? visit.codigoPlazaMedica,
              'codigoPlazaMedica'
            )
          : null,
        includeCodigoPlazaMedica: isMedicalVisit
      },
      connection
    );

    if (!updated) {
      throw new AppError('The visit could not be finalized.', 409);
    }

    if (resolvedS3KeyFirma) {
      const signaturePersisted = await visitExecutionRepository.updateSampleDeliveryS3KeyByVisit(
        {
          codigoVisitaMedica,
          s3KeyFirma: resolvedS3KeyFirma,
          comentarios: detalleVisita || null
        },
        connection
      );

      if (!signaturePersisted) {
        throw new AppError(
          'No se encontró una salida de muestra activa para asociar la firma en S3.',
          409
        );
      }
    }

    const favoritesPayload = products.map((product) => ({
      codigoProducto: product.codigoProducto,
      codigoVisitaMedica,
      codigoMedico: normalizeOptionalNumber(visit.codigoMedico, 'codigoMedico'),
      codigoPais: codigoPaisFavoritos,
      fecha: timestamp.fecha,
      hora: timestamp.hora,
      codigoUsuario,
      isAgregado: product.isAgregado,
      isFavorito: product.isFavorito
    }));

    await visitExecutionRepository.deleteFavoritesByVisit(
      { codigoVisitaMedica },
      connection
    );
    await visitExecutionRepository.insertFavorites(favoritesPayload, connection);

    await connection.commit();

    return {
      visit: {
        codigoVisitaMedica,
        codigoEstado: appConfig.visitExecution.completedStatusCode,
        clasificacionVisita,
        fechaFin: timestamp.fecha,
        horaFin: timestamp.hora,
        latitudFin,
        longitudFin,
        detalleVisita,
        codigoPlazaMedica: isMedicalVisit
          ? normalizeOptionalNumber(
              payload.codigoPlazaMedica ?? visit.codigoPlazaMedica,
              'codigoPlazaMedica'
            )
          : null
      },
      signature: {
        s3KeyFirma: resolvedS3KeyFirma || null
      },
      favorites: {
        total: favoritesPayload.length,
        favorited: favoritesPayload.filter((item) => item.isFavorito).length
      }
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getBootstrap,
  getProductsBySelection,
  getVisitDetail,
  getSampleOrderProducts,
  createSampleOrder,
  finalizeVisit
};
