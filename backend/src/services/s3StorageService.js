const axios = require('axios');
const { appConfig } = require('../config/app');
const { AppError } = require('../utils/appError');

function sanitizeFileNamePart(value, fallback = 'firma') {
  const text = String(value || '').trim();

  if (!text) {
    return fallback;
  }

  const sanitized = text
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || fallback;
}

function normalizeFileExtension(value) {
  const extension = String(value || '').trim().toLowerCase().replace(/^\.+/, '');

  if (!extension) {
    return 'png';
  }

  const map = {
    jpeg: 'jpg',
    jpg: 'jpg',
    png: 'png',
    webp: 'webp',
    gif: 'gif',
    bmp: 'bmp'
  };

  return map[extension] || 'png';
}

function buildSignatureFileName({ codigoVisitaMedica, codPersona, extension }) {
  const visitPart = sanitizeFileNamePart(codigoVisitaMedica, 'visita');
  const personPart = sanitizeFileNamePart(codPersona, 'persona');
  const timestamp = Date.now();
  const ext = normalizeFileExtension(extension);

  return `firma_orden_muestra_${visitPart}_${personPart}_${timestamp}.${ext}`;
}

function normalizeHttpUrl(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  return '';
}

function normalizeS3Key(value) {
  let key = String(value || '').trim();

  if (!key) {
    return '';
  }

  key = key.replace(/^['"]+|['"]+$/g, '').trim();

  // Support keys that accidentally come as full URL values.
  if (/^https?:\/\//i.test(key)) {
    try {
      const parsed = new URL(key);
      key = parsed.pathname || '';
      key = key.replace(/^\/+/, '');
    } catch {
      key = key.replace(/^https?:\/\/[^/]+\/?/i, '');
    }
  }

  key = key.split('?')[0].trim();
  key = key.replace(/^\/+/, '');

  return key;
}

function findUrlCandidate(source, depth = 0) {
  if (depth > 4 || source === null || source === undefined) {
    return '';
  }

  if (typeof source === 'string') {
    return normalizeHttpUrl(source);
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const url = findUrlCandidate(item, depth + 1);
      if (url) {
        return url;
      }
    }

    return '';
  }

  if (typeof source === 'object') {
    const priorityKeys = [
      'Url',
      'URL',
      'url',
      'SignedUrl',
      'signedUrl',
      'PresignedUrl',
      'PreSignedUrl',
      'FileUrl',
      'FileURL'
    ];

    for (const key of priorityKeys) {
      const url = findUrlCandidate(source[key], depth + 1);
      if (url) {
        return url;
      }
    }

    for (const value of Object.values(source)) {
      const url = findUrlCandidate(value, depth + 1);
      if (url) {
        return url;
      }
    }
  }

  return '';
}

function extractS3ResponseErrorMessage(data) {
  if (!data || typeof data !== 'object') {
    return '';
  }

  const keys = ['MessageError', 'messageError', 'Message', 'message', 'Error', 'error'];

  for (const key of keys) {
    const value = String(data[key] || '').trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function isMissingS3KeyErrorMessage(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('specified key does not exist') ||
    text.includes('no such key') ||
    text.includes('key does not exist')
  );
}

async function uploadFileToS3({
  fileName,
  fileDataBase64,
  codPersona,
  fechaHoraSubida,
  nombreTabla
}) {
  const url = String(appConfig?.s3Storage?.setArchivoUrl || '').trim();

  if (!url) {
    throw new AppError('S3 SetArchivo URL is not configured.', 500);
  }

  const payload = {
    FileName: String(fileName || '').trim(),
    FileData: String(fileDataBase64 || '').trim(),
    CodPersona: Number(codPersona),
    FechaHoraSubida:
      String(fechaHoraSubida || '').trim() || new Date().toISOString(),
    NombreTabla:
      String(nombreTabla || '').trim() ||
      String(appConfig?.s3Storage?.defaultTableName || 'tblEntregaMuestras').trim()
  };

  if (!payload.FileName || !payload.FileData) {
    throw new AppError('S3 payload requires FileName and FileData.', 400);
  }

  if (!Number.isFinite(payload.CodPersona) || payload.CodPersona <= 0) {
    throw new AppError('S3 payload requires a valid CodPersona.', 400);
  }

  try {
    const { data } = await axios.post(url, payload, {
      timeout: Number(appConfig?.s3Storage?.timeoutMs || 20000),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!Boolean(data?.Success) || !String(data?.S3Key || '').trim()) {
      throw new AppError('S3 upload response did not return a valid S3Key.', 502, data || null);
    }

    return {
      s3Key: String(data.S3Key).trim(),
      raw: data
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const status = Number(error?.response?.status || 0);
    const details = error?.response?.data || null;
    const message = status
      ? `S3 upload failed with status ${status}.`
      : 'S3 upload service is unavailable.';

    throw new AppError(message, 502, details);
  }
}

async function uploadSignatureToS3({
  signatureBase64,
  extension,
  codPersona,
  codigoVisitaMedica,
  nombreTabla
}) {
  const fileName = buildSignatureFileName({
    codigoVisitaMedica,
    codPersona,
    extension
  });

  return uploadFileToS3({
    fileName,
    fileDataBase64: signatureBase64,
    codPersona,
    fechaHoraSubida: new Date().toISOString(),
    nombreTabla
  });
}

async function getFileUrlFromS3Key({ s3Key, codPersona, nombreTabla } = {}) {
  const endpoint = String(appConfig?.s3Storage?.getUrlEndpoint || '').trim();
  const normalizedKey = normalizeS3Key(s3Key);

  if (!normalizedKey) {
    throw new AppError('S3 key is required to resolve file URL.', 400);
  }

  if (!endpoint) {
    throw new AppError('S3 GetUrl endpoint is not configured.', 500);
  }

  const timeout = Number(appConfig?.s3Storage?.timeoutMs || 20000);
  void codPersona;
  void nombreTabla;

  try {
    const { data } = await axios.get(endpoint, {
      timeout,
      params: {
        S3Key: normalizedKey
      }
    });
    const responseErrorMessage = extractS3ResponseErrorMessage(data);

    if (responseErrorMessage) {
      const isMissingKey = isMissingS3KeyErrorMessage(responseErrorMessage);
      throw new AppError(
        isMissingKey
          ? 'S3 key not found in storage.'
          : 'S3 GetUrl returned an error response.',
        isMissingKey ? 404 : 502,
        data
      );
    }

    const resolvedUrl = findUrlCandidate(data);

    if (!resolvedUrl) {
      if (data && data.Success === false) {
        throw new AppError('S3 GetUrl returned an error response.', 502, data);
      }

      throw new AppError('S3 GetUrl response does not include a valid URL.', 502, data);
    }

    return {
      url: resolvedUrl,
      raw: data
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const status = Number(error?.response?.status || 0);
    const details = error?.response?.data || null;
    const message = status
      ? `S3 GetUrl failed with status ${status}.`
      : 'S3 GetUrl service is unavailable.';

    throw new AppError(message, 502, details);
  }
}

module.exports = {
  uploadFileToS3,
  uploadSignatureToS3,
  normalizeFileExtension,
  getFileUrlFromS3Key
};
