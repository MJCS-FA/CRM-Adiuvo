const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');
const directoryService = require('./directoryService');
const inventoryRepository = require('../repositories/inventoryRepository');

const SOLICITUD_ESTADO_INICIAL = Number(
  process.env.INVENTORY_SOLICITUD_ESTADO_INICIAL || 13
);

function normalizePositiveId(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} is required.`, 400);
  }

  return parsed;
}

function normalizeCodigoProducto(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return 0;
  }

  const parsed = Number(text);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AppError('codigoProducto debe ser un número entero mayor o igual a 0.', 400);
  }

  return Math.trunc(parsed);
}

function normalizeCodigoSku(value) {
  return String(value || '').trim();
}

function normalizeTipoProductoInventario(value) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError('tipoProducto debe ser un número entero mayor a 0.', 400);
  }

  return Math.trunc(parsed);
}

function normalizeCountryCode(value, fallback = 4) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

async function resolveInventoryContext(codPersonas) {
  const codigoUsuario = normalizePositiveId(codPersonas, 'codPersonas');
  const context = await directoryService.getVisitadorBySession(codigoUsuario);

  if (!context?.hasVisitador || !context?.visitador) {
    throw new AppError('No se encontró un visitador para el usuario autenticado.', 404);
  }

  const codigoVisitador = Number(context.visitador.codigoVisitador || 0);

  if (!Number.isFinite(codigoVisitador) || codigoVisitador <= 0) {
    throw new AppError('No se pudo determinar el código de visitador en sesión.', 400);
  }

  const codigoPais = normalizeCountryCode(
    context.visitador.codigoPais,
    normalizeCountryCode(appConfig.visitExecution.countryCode, 4)
  );

  return {
    codigoUsuario,
    codigoVisitador: Math.trunc(codigoVisitador),
    codigoPais,
    visitador: context.visitador,
    assignmentCode: Number(context.assignmentCode || 0) || null,
    assignmentCandidates: Array.isArray(context.assignmentCandidates)
      ? context.assignmentCandidates
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : []
  };
}

function mapInventoryItem(item = {}) {
  return {
    codigoProducto: Number(item.codigoProducto),
    sku: String(item.sku || '').trim(),
    nombreProducto: String(item.nombreProducto || '').trim(),
    tipoProducto: Number(item.tipoProducto || 0),
    tipoProductoDescripcion: String(item.tipoProductoDescripcion || '').trim(),
    entradas: Number(item.entradas || 0),
    salidas: Number(item.salidas || 0),
    disponible: Number(item.disponible || 0)
  };
}

function mapProductOption(item = {}) {
  return {
    value: Number(item.codigoProducto),
    codigoProducto: Number(item.codigoProducto),
    sku: String(item.sku || '').trim(),
    nombreProducto: String(item.nombreProducto || '').trim(),
    label:
      String(item.sku || '').trim()
        ? `${String(item.nombreProducto || '').trim()} (${String(item.sku || '').trim()})`
        : String(item.nombreProducto || '').trim() || `Producto ${Number(item.codigoProducto)}`
  };
}

function mapTypeOption(item = {}) {
  const tipoProducto = Number(item.tipoProducto || 0);
  const descripcion = String(item.descripcion || '').trim();

  return {
    value: tipoProducto,
    tipoProducto,
    descripcion,
    label: descripcion || `Tipo ${tipoProducto}`
  };
}

function normalizeOptionalPositiveId(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} debe ser un número entero mayor a 0.`, 400);
  }

  return Math.trunc(parsed);
}

function normalizeDateInput(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const text = String(value).trim().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new AppError(`${fieldName} debe tener formato YYYY-MM-DD.`, 400);
  }

  return text;
}

function normalizeMovementType(query = {}) {
  const explicitCode = Number(query.codigoTipoEntrega || 0);

  if (explicitCode === 1) {
    return { tab: 'entradas', codigoTipoEntrega: 1 };
  }

  if (explicitCode === 2) {
    return { tab: 'salidas', codigoTipoEntrega: 2 };
  }

  const tabText = String(query.tab || '').trim().toLowerCase();

  if (!tabText || tabText === 'entradas' || tabText === 'entrada') {
    return { tab: 'entradas', codigoTipoEntrega: 1 };
  }

  if (tabText === 'salidas' || tabText === 'salida') {
    return { tab: 'salidas', codigoTipoEntrega: 2 };
  }

  throw new AppError('tab inválido. Use entradas o salidas.', 400);
}

function normalizeOrdersTab(query = {}) {
  const tabText = String(query.tab || '').trim().toLowerCase();

  if (!tabText || tabText === 'entradas' || tabText === 'entrada') {
    return {
      tab: 'entradas',
      codigoTipoEntrega: 1
    };
  }

  if (tabText === 'salidas' || tabText === 'salida') {
    return {
      tab: 'salidas',
      codigoTipoEntrega: 2
    };
  }

  throw new AppError('tab inválido. Use entradas o salidas.', 400);
}

function normalizeDateRange(query = {}) {
  const fechaInicio = normalizeDateInput(query.fechaInicio, 'fechaInicio');
  const fechaFinal = normalizeDateInput(query.fechaFinal, 'fechaFinal');

  // Regla funcional: si falta una fecha, no se filtra por rango.
  if (!fechaInicio || !fechaFinal) {
    return {
      fechaInicio: null,
      fechaFinal: null
    };
  }

  if (fechaInicio > fechaFinal) {
    throw new AppError('fechaInicio no puede ser mayor que fechaFinal.', 400);
  }

  return {
    fechaInicio,
    fechaFinal
  };
}

function normalizeSearchText(value) {
  return String(value || '').trim();
}

function formatDateOutput(value) {
  if (!value) {
    return '';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  if (!text) {
    return '';
  }

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text.slice(0, 10);
}

function formatTimeOutput(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  return text.length >= 8 ? text.slice(0, 8) : text;
}

function mapDoctorOption(item = {}) {
  const codigoMedico = Number(item.codigoMedico || 0);
  const nombreMedico = String(item.nombreMedico || '').trim();

  return {
    value: codigoMedico,
    codigoMedico,
    nombreMedico,
    label: nombreMedico || `Médico ${codigoMedico}`
  };
}

function mapMovementItem(item = {}) {
  return {
    codigoEntrega: Number(item.codigoEntrega || 0),
    codigoProducto: Number(item.codigoProducto || 0),
    cantidad: Number(item.cantidad || 0),
    fechaEntregado: formatDateOutput(item.fechaEntregado),
    horaEntregado: formatTimeOutput(item.horaEntregado),
    codigoTipoEntrega: Number(item.codigoTipoEntrega || 0),
    tipoEntrega: String(item.tipoEntrega || '').trim(),
    codigoMedico: Number(item.codigoMedico || 0),
    nombreMedico: String(item.nombreMedico || '').trim(),
    codigoUsuarioEntrega: String(item.codigoUsuarioEntrega || '').trim(),
    personaEntrega: String(item.personaEntrega || '').trim(),
    codigoUsuarioRecibe: String(item.codigoUsuarioRecibe || '').trim(),
    personaRecibe: String(item.personaRecibe || '').trim(),
    codigoSucursal: Number(item.codigoSucursal || 0),
    nombreSucursal: String(item.nombreSucursal || '').trim(),
    codigoTipoVisita: Number(item.codigoTipoVisita || 0),
    tipoVisita: String(item.tipoVisita || '').trim(),
    sku: String(item.sku || '').trim(),
    nombreProducto: String(item.nombreProducto || '').trim(),
    comentarios: String(item.comentarios || '').trim()
  };
}

function mapProductDetail(item = {}, fallbackCodigoProducto = 0) {
  const codigoProducto = Number(item.codigoProducto || fallbackCodigoProducto || 0);
  const sku = String(item.sku || '').trim();
  const nombreProducto = String(item.nombreProducto || '').trim();

  return {
    codigoProducto,
    sku,
    nombreProducto,
    disponible: Number(item.disponible || 0),
    label: sku ? `${nombreProducto} (${sku})` : nombreProducto || `Producto ${codigoProducto}`
  };
}

function mapOrderSummaryItem(item = {}, tab = 'entradas') {
  const base = {
    codigoEntrega: Number(item.codigoEntrega || 0),
    fechaEntrega: formatDateOutput(item.fechaEntrega),
    tipoProducto: String(item.tipoProducto || '').trim(),
    cantidadEntregada: Number(item.cantidadEntregada || 0)
  };

  if (tab === 'entradas') {
    return {
      ...base,
      nombreVisitador: String(item.nombreVisitador || '').trim(),
      codigoSolicitud:
        item.codigoSolicitud === null || item.codigoSolicitud === undefined
          ? null
          : Number(item.codigoSolicitud)
    };
  }

  return {
    ...base,
    nombrePersona: String(item.nombrePersona || '').trim()
  };
}

function mapOrderDetailItem(item = {}) {
  return {
    codigoProducto: Number(item.codigoProducto || 0),
    producto: String(item.nombreProducto || '').trim(),
    cantidadEntregada: Number(item.cantidadEntregada || 0)
  };
}

function getTimestampParts(timezone = appConfig.visitExecution.timezone) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    fecha: `${parts.year}-${parts.month}-${parts.day}`,
    hora: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

function getCurrentMonthDateRange(timezone = appConfig.visitExecution.timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  const year = Number(parts.year || 0);
  const month = Number(parts.month || 1);
  const first = `${parts.year}-${parts.month}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${parts.year}-${parts.month}-${String(lastDay).padStart(2, '0')}`;

  return {
    fechaInicio: first,
    fechaFinal: last
  };
}

function normalizeRequestComment(value) {
  const text = String(value || '').trim();

  if (!text) {
    throw new AppError('El comentario de observación es obligatorio.', 400);
  }

  return text;
}

function normalizeRequestTarget(payload = {}) {
  const codigoMedico = normalizeOptionalPositiveId(payload.codigoMedico, 'codigoMedico');
  const codigoSucursal = normalizeOptionalPositiveId(payload.codigoSucursal, 'codigoSucursal');

  if (!codigoMedico && !codigoSucursal) {
    throw new AppError('Debe seleccionar un médico o una sucursal.', 400);
  }

  if (codigoMedico && codigoSucursal) {
    throw new AppError('Seleccione solo un destino: médico o sucursal.', 400);
  }

  return {
    codigoMedico,
    codigoSucursal
  };
}

function normalizeRequestItems(items = []) {
  if (!Array.isArray(items)) {
    throw new AppError('items debe ser una lista de productos.', 400);
  }

  const errors = [];
  const itemsByProduct = new Map();

  items.forEach((rawItem, index) => {
    const codigoProducto = Number(rawItem?.codigoProducto || 0);
    const cantidadSolicitada = Number(
      rawItem?.cantidadSolicitada ?? rawItem?.cantidad ?? 0
    );

    if (!Number.isInteger(codigoProducto) || codigoProducto <= 0) {
      errors.push(`items[${index}].codigoProducto debe ser mayor a 0.`);
      return;
    }

    if (!Number.isInteger(cantidadSolicitada) || cantidadSolicitada <= 0) {
      errors.push(`items[${index}].cantidadSolicitada debe ser mayor a 0.`);
      return;
    }

    const current = itemsByProduct.get(codigoProducto) || 0;
    itemsByProduct.set(codigoProducto, current + cantidadSolicitada);
  });

  if (errors.length) {
    throw new AppError(`Advertencia de campos: ${errors.join(' | ')}`, 400);
  }

  const normalizedItems = [...itemsByProduct.entries()].map(
    ([codigoProducto, cantidadSolicitada]) => ({
      codigoProducto,
      cantidadSolicitada
    })
  );

  if (!normalizedItems.length) {
    throw new AppError('Debe agregar al menos un producto en la solicitud.', 400);
  }

  return normalizedItems;
}

function mapSolicitudSummaryItem(item = {}) {
  return {
    codigoSolicitud: Number(item.codigoSolicitud || 0),
    fechaSolicitud: formatDateOutput(item.fechaSolicitud),
    horaSolicitud: formatTimeOutput(item.horaSolicitud),
    codigoUsuarioVisitador: Number(item.codigoUsuarioVisitador || 0),
    nombreVisitador: String(item.nombreVisitador || '').trim(),
    codigoSucursal: Number(item.codigoSucursal || 0) || null,
    nombreSucursal: String(item.nombreSucursal || '').trim(),
    codigoMedico: Number(item.codigoMedico || 0) || null,
    nombreMedico: String(item.nombreMedico || '').trim(),
    codigoEstado: item.codigoEstado === null || item.codigoEstado === undefined
      ? null
      : Number(item.codigoEstado),
    estado: String(item.estado || '').trim() || 'Sin estado'
  };
}

function mapSolicitudDetailItem(item = {}) {
  return {
    codigoSolicitudXProducto:
      item.codigoSolicitudXProducto === null || item.codigoSolicitudXProducto === undefined
        ? null
        : Number(item.codigoSolicitudXProducto),
    codigoSolicitud: Number(item.codigoSolicitud || 0),
    codigoProducto: Number(item.codigoProducto || 0),
    nombreProducto: String(item.nombreProducto || '').trim(),
    cantidadSolicitada: Number(item.cantidadSolicitada || 0),
    cantidadEntregada: Number(item.cantidadEntregada || 0),
    cantidadAprobadaGVM:
      item.cantidadAprobadaGVM === null || item.cantidadAprobadaGVM === undefined
        ? null
        : Number(item.cantidadAprobadaGVM),
    cantidadAprobadaGO:
      item.cantidadAprobadaGO === null || item.cantidadAprobadaGO === undefined
        ? null
        : Number(item.cantidadAprobadaGO),
    codigoMotivoRechazo:
      item.codigoMotivoRechazo === null || item.codigoMotivoRechazo === undefined
        ? null
        : Number(item.codigoMotivoRechazo),
    motivoRechazo: String(item.motivoRechazo || '').trim(),
    observacion: String(item.observacion || '').trim()
  };
}

function mapRequestBranchOption(item = {}) {
  const codigoSucursal = Number(item.codigoSucursal || 0);
  const codigoInterno = String(
    item.codigoInternoSucursal || item.numeroSucursal || ''
  ).trim();
  const nombreSucursal = String(item.nombreSucursal || '').trim();

  return {
    value: codigoSucursal,
    codigoSucursal,
    codigoInternoSucursal: codigoInterno,
    nombreSucursal,
    label:
      codigoInterno && nombreSucursal
        ? `${codigoInterno} - ${nombreSucursal}`
        : nombreSucursal || `Sucursal ${codigoSucursal}`
  };
}

async function validateRequestTargetAssignment(codigoUsuario, target = {}) {
  if (target.codigoMedico) {
    const doctorsResult = await directoryService.getAssignedDoctors(codigoUsuario, {});
    const isAssigned = (doctorsResult?.medicos || []).some(
      (item) => Number(item?.codigoMedico || 0) === Number(target.codigoMedico)
    );

    if (!isAssigned) {
      throw new AppError('El médico seleccionado no está asignado al visitador.', 400);
    }
  }

  if (target.codigoSucursal) {
    const branchesResult = await directoryService.getAssignedBranches(codigoUsuario, {});
    const isAssigned = (branchesResult?.sucursales || []).some(
      (item) => Number(item?.codigoSucursal || 0) === Number(target.codigoSucursal)
    );

    if (!isAssigned) {
      throw new AppError('La sucursal seleccionada no está asignada al visitador.', 400);
    }
  }
}

function buildContextPayload(context) {
  return {
    codigoVisitador: context.codigoVisitador,
    codigoPais: context.codigoPais,
    nombreVisitador: context.visitador?.nombreCompleto || ''
  };
}

async function getInventoryBootstrap(codPersonas) {
  const context = await resolveInventoryContext(codPersonas);
  const [productos, tiposProducto] = await Promise.all([
    inventoryRepository.listProductCatalog({
      codigoUsuarioVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais
    }),
    inventoryRepository.listProductTypeCatalog({
      codigoUsuarioVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais
    })
  ]);

  return {
    context: {
      codigoVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais,
      nombreVisitador: context.visitador?.nombreCompleto || ''
    },
    filtros: {
      productos: (productos || []).map(mapProductOption),
      tiposProducto: (tiposProducto || []).map(mapTypeOption)
    }
  };
}

async function getMyInventory(codPersonas, query = {}) {
  const context = await resolveInventoryContext(codPersonas);
  const filters = {
    codigoProducto: normalizeCodigoProducto(query.codigoProducto),
    codigoSku: normalizeCodigoSku(query.codigoSku),
    tipoProductoInventario: normalizeTipoProductoInventario(query.tipoProducto),
    codigoTipoEntregaEntrada: normalizeCountryCode(
      process.env.INVENTORY_CODIGO_TIPO_ENTRADA || 1,
      1
    ),
    codigoTipoEntregaSalida: normalizeCountryCode(
      appConfig.visitExecution.sampleOutputTypeCode,
      2
    )
  };
  const rows = await inventoryRepository.listMyInventory({
    codigoUsuarioVisitador: context.codigoVisitador,
    codigoPais: context.codigoPais,
    ...filters
  });

  return {
    context: {
      codigoVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais
    },
    filtros: {
      codigoProducto: filters.codigoProducto,
      codigoSku: filters.codigoSku,
      tipoProducto: filters.tipoProductoInventario
    },
    items: (rows || []).map(mapInventoryItem)
  };
}

async function getProductDetailBootstrap(codPersonas, codigoProducto) {
  const context = await resolveInventoryContext(codPersonas);
  const normalizedCodigoProducto = normalizePositiveId(
    codigoProducto,
    'codigoProducto'
  );
  const [product, doctors] = await Promise.all([
    inventoryRepository.findProductDescriptorByCode({
      codigoProducto: normalizedCodigoProducto,
      codigoUsuarioVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais
    }),
    inventoryRepository.listMovementDoctorsByVisitador({
      assignmentCandidates: context.assignmentCandidates,
      codigoVisitador: context.codigoVisitador
    })
  ]);

  return {
    context: buildContextPayload(context),
    producto: mapProductDetail(product, normalizedCodigoProducto),
    filtros: {
      medicos: (doctors || []).map(mapDoctorOption)
    }
  };
}

async function getProductMovements(codPersonas, codigoProducto, query = {}) {
  const context = await resolveInventoryContext(codPersonas);
  const normalizedCodigoProducto = normalizePositiveId(
    codigoProducto,
    'codigoProducto'
  );
  const movementType = normalizeMovementType(query);
  const dateRange = normalizeDateRange(query);
  const codigoMedico = normalizeOptionalPositiveId(
    query.codigoMedico,
    'codigoMedico'
  );
  const rows = await inventoryRepository.listProductMovements({
    codigoUsuarioVisitador: context.codigoVisitador,
    codigoPais: context.codigoPais,
    codigoProducto: normalizedCodigoProducto,
    codigoTipoEntrega: movementType.codigoTipoEntrega,
    fechaInicio: dateRange.fechaInicio,
    fechaFinal: dateRange.fechaFinal,
    codigoMedico:
      movementType.codigoTipoEntrega === 2 ? codigoMedico : null
  });

  return {
    context: buildContextPayload(context),
    filtros: {
      codigoProducto: normalizedCodigoProducto,
      tab: movementType.tab,
      codigoTipoEntrega: movementType.codigoTipoEntrega,
      fechaInicio: dateRange.fechaInicio,
      fechaFinal: dateRange.fechaFinal,
      codigoMedico:
        movementType.codigoTipoEntrega === 2 ? codigoMedico : null
    },
    items: (rows || []).map(mapMovementItem)
  };
}

async function getOrdersBootstrap(codPersonas) {
  const context = await resolveInventoryContext(codPersonas);
  const [productos, tiposProducto] = await Promise.all([
    inventoryRepository.listProductCatalog({
      codigoUsuarioVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais
    }),
    inventoryRepository.listProductTypeCatalog({
      codigoUsuarioVisitador: context.codigoVisitador,
      codigoPais: context.codigoPais
    })
  ]);

  return {
    context: buildContextPayload(context),
    filtros: {
      productos: (productos || []).map(mapProductOption),
      tiposProducto: (tiposProducto || []).map(mapTypeOption)
    }
  };
}

async function getOrders(codPersonas, query = {}) {
  const context = await resolveInventoryContext(codPersonas);
  const tab = normalizeOrdersTab(query);
  const dateRange = normalizeDateRange(query);
  const tipoProducto = normalizeTipoProductoInventario(query.tipoProducto);
  const codigoProducto = normalizeOptionalPositiveId(
    query.codigoProducto,
    'codigoProducto'
  );
  const buscar = normalizeSearchText(query.buscar);
  const rows = await inventoryRepository.listOrderSummaries({
    codigoUsuarioVisitador: context.codigoVisitador,
    codigoPais: context.codigoPais,
    codigoTipoEntrega: tab.codigoTipoEntrega,
    fechaInicio: dateRange.fechaInicio,
    fechaFinal: dateRange.fechaFinal,
    tipoProducto,
    codigoProducto,
    buscar
  });

  return {
    context: buildContextPayload(context),
    filtros: {
      tab: tab.tab,
      codigoTipoEntrega: tab.codigoTipoEntrega,
      fechaInicio: dateRange.fechaInicio,
      fechaFinal: dateRange.fechaFinal,
      tipoProducto,
      codigoProducto,
      buscar
    },
    items: (rows || []).map((item) => mapOrderSummaryItem(item, tab.tab))
  };
}

async function getOrderSalidaDetail(codPersonas, codigoEntrega) {
  const context = await resolveInventoryContext(codPersonas);
  const normalizedCodigoEntrega = normalizePositiveId(
    codigoEntrega,
    'codigoEntrega'
  );
  const rows = await inventoryRepository.listOrderSalidaDetails({
    codigoEntrega: normalizedCodigoEntrega,
    codigoUsuarioVisitador: context.codigoVisitador,
    codigoPais: context.codigoPais,
    codigoTipoEntrega: 2
  });

  return {
    context: buildContextPayload(context),
    codigoEntrega: normalizedCodigoEntrega,
    items: (rows || []).map(mapOrderDetailItem)
  };
}

async function getRequestsBootstrap(codPersonas) {
  const context = await resolveInventoryContext(codPersonas);
  const [productCatalog, doctorsResult, branchesResult] = await Promise.all([
    inventoryRepository.listRequestProductCatalog(),
    directoryService.getAssignedDoctors(context.codigoUsuario, {}),
    directoryService.getAssignedBranches(context.codigoUsuario, {})
  ]);

  return {
    context: buildContextPayload(context),
    filtros: {
      ...getCurrentMonthDateRange(),
      productos: (productCatalog || []).map(mapProductOption),
      medicos: (doctorsResult?.medicos || []).map(mapDoctorOption),
      sucursales: (branchesResult?.sucursales || []).map(mapRequestBranchOption)
    }
  };
}

async function getRequests(codPersonas, query = {}) {
  const context = await resolveInventoryContext(codPersonas);
  const dateRange = normalizeDateRange(query);
  const buscar = normalizeSearchText(query.buscar);
  const rows = await inventoryRepository.listSolicitudesByVisitador({
    codigoUsuarioVisitador: context.codigoVisitador,
    fechaInicio: dateRange.fechaInicio,
    fechaFinal: dateRange.fechaFinal,
    buscar
  });

  return {
    context: buildContextPayload(context),
    filtros: {
      fechaInicio: dateRange.fechaInicio,
      fechaFinal: dateRange.fechaFinal,
      buscar
    },
    items: (rows || []).map(mapSolicitudSummaryItem)
  };
}

async function getRequestDetails(codPersonas, codigoSolicitud) {
  const context = await resolveInventoryContext(codPersonas);
  const normalizedCodigoSolicitud = normalizePositiveId(
    codigoSolicitud,
    'codigoSolicitud'
  );
  const exists = await inventoryRepository.findSolicitudByCode({
    codigoSolicitud: normalizedCodigoSolicitud,
    codigoUsuarioVisitador: context.codigoVisitador
  });

  if (!exists) {
    throw new AppError('No se encontró la solicitud para este visitador.', 404);
  }

  const rows = await inventoryRepository.listSolicitudDetails({
    codigoSolicitud: normalizedCodigoSolicitud
  });

  return {
    context: buildContextPayload(context),
    codigoSolicitud: normalizedCodigoSolicitud,
    items: (rows || []).map(mapSolicitudDetailItem)
  };
}

async function createRequest(codPersonas, payload = {}) {
  const context = await resolveInventoryContext(codPersonas);
  const comment = normalizeRequestComment(payload.comentario);
  const target = normalizeRequestTarget(payload);
  const items = normalizeRequestItems(payload.items);
  await validateRequestTargetAssignment(context.codigoUsuario, target);

  const productCatalog = await inventoryRepository.listRequestProductCatalog();
  const activeProducts = new Set(
    (productCatalog || [])
      .map((item) => Number(item.codigoProducto || 0))
      .filter((value) => Number.isFinite(value) && value > 0)
  );
  const unavailableProducts = items.filter(
    (item) => !activeProducts.has(Number(item.codigoProducto))
  );

  if (unavailableProducts.length) {
    throw new AppError(
      `Advertencia de campos: producto(s) inactivos o inexistentes (${unavailableProducts
        .map((item) => item.codigoProducto)
        .join(', ')}).`,
      400
    );
  }

  const timestamp = getTimestampParts();
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const codigoSolicitud = await inventoryRepository.createSolicitudHeader(
      {
        codigoUsuarioVisitador: context.codigoVisitador,
        codigoMedico: target.codigoMedico,
        codigoSucursal: target.codigoSucursal,
        codigoEstado: SOLICITUD_ESTADO_INICIAL,
        fecha: timestamp.fecha,
        hora: timestamp.hora,
        codigoUsuario: context.codigoUsuario,
        comentario: comment,
        codigoPais: context.codigoPais
      },
      connection
    );

    await inventoryRepository.insertSolicitudProducts(
      {
        codigoSolicitud,
        items,
        observacion: comment
      },
      connection
    );

    await inventoryRepository.insertSolicitudHistory(
      {
        codigoSolicitud,
        codigoEstado: SOLICITUD_ESTADO_INICIAL,
        fecha: timestamp.fecha,
        hora: timestamp.hora,
        codigoUsuario: context.codigoUsuario,
        comentario: comment
      },
      connection
    );

    await connection.commit();

    return {
      context: buildContextPayload(context),
      solicitud: {
        codigoSolicitud,
        codigoEstado: SOLICITUD_ESTADO_INICIAL,
        fechaSolicitud: timestamp.fecha,
        horaSolicitud: timestamp.hora,
        totalProductos: items.length
      }
    };
  } catch (error) {
    await connection.rollback();

    if (String(error?.code || '') === 'ER_DUP_ENTRY') {
      throw new AppError('Ya existe una solicitud con esos datos.', 409);
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getInventoryBootstrap,
  getMyInventory,
  getProductDetailBootstrap,
  getProductMovements,
  getOrdersBootstrap,
  getOrders,
  getOrderSalidaDetail,
  getRequestsBootstrap,
  getRequests,
  getRequestDetails,
  createRequest
};
