const { AppError } = require('../utils/appError');
const multimediaRepository = require('../repositories/multimediaRepository');
const s3StorageService = require('./s3StorageService');

function normalizeTipoMultimediaFilter(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function normalizeSearchText(value) {
  return String(value || '').trim().slice(0, 160);
}

function normalizeListLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(Math.trunc(parsed), 500);
}

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapTypeOption(item = {}) {
  const codigoTipoMultimedia = asNumber(item.codigoTipoMultimedia, 0);
  const tipoMultimedia = asText(item.tipoMultimedia);

  return {
    value: codigoTipoMultimedia,
    codigoTipoMultimedia,
    tipoMultimedia,
    label: tipoMultimedia || `Tipo ${codigoTipoMultimedia}`
  };
}

function mapMultimediaItem(item = {}) {
  return {
    codigoMultimedia: asNumber(item.codigoMultimedia, 0),
    codigoTipoMultimedia: asNumber(item.codigoTipoMultimedia, 0),
    tipoMultimedia: asText(item.tipoMultimedia),
    nombreMultimedia: asText(item.nombreMultimedia),
    descripcion: asText(item.descripcion),
    nombreArchivo: asText(item.nombreArchivo),
    s3KeyPortada: asText(item.s3KeyPortada),
    s3KeyArchivo: asText(item.s3KeyArchivo),
    mimeType: asText(item.mimeType),
    urlArchivo: asText(item.urlArchivo)
  };
}

async function getMultimediaBootstrap(codPersonas) {
  const codPersona = Number(codPersonas);
  if (!Number.isFinite(codPersona) || codPersona <= 0) {
    throw new AppError('codPersonas is required.', 400);
  }

  const types = await multimediaRepository.listMultimediaTypes();
  const mappedTypes = [
    {
      value: 0,
      codigoTipoMultimedia: 0,
      tipoMultimedia: 'Todos',
      label: 'Todos'
    },
    ...types.map(mapTypeOption)
  ];

  return {
    filtros: {
      tiposMultimedia: mappedTypes,
      codigoTipoMultimedia: 0,
      buscar: ''
    }
  };
}

async function getMultimediaItems(codPersonas, query = {}) {
  const codPersona = Number(codPersonas);
  if (!Number.isFinite(codPersona) || codPersona <= 0) {
    throw new AppError('codPersonas is required.', 400);
  }

  const filters = {
    codigoTipoMultimedia: normalizeTipoMultimediaFilter(query.codigoTipoMultimedia),
    buscar: normalizeSearchText(query.buscar),
    limit: normalizeListLimit(query.limit)
  };

  const items = await multimediaRepository.listMultimediaItems(filters);

  return {
    filtros: {
      codigoTipoMultimedia: filters.codigoTipoMultimedia,
      buscar: filters.buscar
    },
    total: items.length,
    items: items.map(mapMultimediaItem)
  };
}

function normalizeOptionalUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function isMissingS3KeyError(error) {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode === 404) {
    return true;
  }

  const message = String(error?.message || '').toLowerCase();
  const detailsText = (() => {
    const details = error?.details;
    if (!details) {
      return '';
    }

    if (typeof details === 'string') {
      return details.toLowerCase();
    }

    try {
      return JSON.stringify(details).toLowerCase();
    } catch {
      return '';
    }
  })();

  return (
    message.includes('key not found in storage') ||
    message.includes('specified key does not exist') ||
    detailsText.includes('specified key does not exist') ||
    detailsText.includes('no such key')
  );
}

async function resolveMultimediaFileUrl(codPersonas, query = {}) {
  const codPersona = Number(codPersonas);
  if (!Number.isFinite(codPersona) || codPersona <= 0) {
    throw new AppError('codPersonas is required.', 400);
  }

  const s3Key = asText(query.s3Key);
  const directUrl = normalizeOptionalUrl(query.directUrl);
  const nombreTabla = asText(query.nombreTabla);

  if (!s3Key && !directUrl) {
    throw new AppError('s3Key or directUrl is required.', 400);
  }

  if (directUrl && !s3Key) {
    return {
      s3Key: '',
      url: directUrl
    };
  }

  let resolved;

  try {
    resolved = await s3StorageService.getFileUrlFromS3Key({
      s3Key,
      codPersona,
      nombreTabla
    });
  } catch (error) {
    if (isMissingS3KeyError(error)) {
      return {
        s3Key,
        url: '',
        unavailable: true,
        reason: 'missing_s3_key'
      };
    }

    throw error;
  }

  return {
    s3Key,
    url: String(resolved?.url || '').trim(),
    unavailable: false,
    raw: resolved?.raw || null
  };
}

module.exports = {
  getMultimediaBootstrap,
  getMultimediaItems,
  resolveMultimediaFileUrl
};
