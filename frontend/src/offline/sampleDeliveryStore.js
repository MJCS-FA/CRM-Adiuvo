import { getOfflineDb } from './db';

function padTwo(value) {
  return String(value).padStart(2, '0');
}

function currDate() {
  const now = new Date();
  return `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`;
}

function currTime() {
  const now = new Date();
  return `${padTwo(now.getHours())}:${padTwo(now.getMinutes())}:${padTwo(now.getSeconds())}`;
}

function nullIdentifier() {
  return null;
}

function integerToIdentifier(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

async function verifyEntregaMuestraPersisted({
  codigoEntrega,
  codigoVisita,
  expectedItemsCount
}) {
  const entregaId = integerToIdentifier(codigoEntrega);
  const visitaId = integerToIdentifier(codigoVisita);
  const expectedCount = integerToIdentifier(expectedItemsCount) || 0;

  if (!entregaId) {
    throw new Error('No se pudo confirmar CódigoEntrega para validar guardado local.');
  }

  const db = await getOfflineDb();
  const tx = db.transaction(
    ['tblEntregaMuestras', 'BinarioOrdenMuestraFirmas', 'tblProductosXEntregaMuestras'],
    'readonly'
  );
  const entregaStore = tx.objectStore('tblEntregaMuestras');
  const firmaStore = tx.objectStore('BinarioOrdenMuestraFirmas');
  const productosStore = tx.objectStore('tblProductosXEntregaMuestras');

  const entrega = await entregaStore.get(entregaId);
  const firmas = await firmaStore.index('byCodigoEntrega').getAll(entregaId);
  const productos = await productosStore.index('byCodigoEntrega').getAll(entregaId);
  await tx.done;

  if (!entrega) {
    throw new Error('No se confirmó guardado de cabecera en tblEntregaMuestras.');
  }

  if (visitaId && integerToIdentifier(entrega.CodigoVisitaMedica) !== visitaId) {
    throw new Error('La cabecera guardada no coincide con la visita actual.');
  }

  if (!Array.isArray(firmas) || firmas.length <= 0) {
    throw new Error('No se confirmó guardado de firma en BinarioOrdenMuestraFirmas.');
  }

  if (!Array.isArray(productos) || productos.length < expectedCount) {
    throw new Error(
      'No se confirmó guardado completo del detalle en tblProductosXEntregaMuestras.'
    );
  }
}

function normalizePositiveNumber(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeOrderItems(listOrdenMuestra = []) {
  if (!Array.isArray(listOrdenMuestra) || !listOrdenMuestra.length) {
    throw new Error('Debe seleccionar al menos un producto de muestra.');
  }

  const byProduct = new Map();

  for (const item of listOrdenMuestra) {
    const codigoProducto = normalizePositiveNumber(item?.CodigoProducto || item?.codigoProducto);
    const cantidad = Number(item?.Cantidad || item?.cantidad);

    if (!codigoProducto) {
      throw new Error('Cada producto debe tener CódigoProducto válido.');
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new Error('Cada producto debe tener Cantidad entera mayor a 0.');
    }

    const previous = byProduct.get(codigoProducto) || 0;
    byProduct.set(codigoProducto, previous + cantidad);
  }

  return [...byProduct.entries()].map(([codigoProducto, cantidad]) => ({
    codigoProducto,
    cantidad
  }));
}

function generateTuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `tuid_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

async function normalizeSignatureBinary(signatureValue) {
  if (!signatureValue) {
    throw new Error('La firma es requerida.');
  }

  if (signatureValue instanceof Uint8Array) {
    return signatureValue;
  }

  if (signatureValue instanceof ArrayBuffer) {
    return new Uint8Array(signatureValue);
  }

  if (signatureValue instanceof Blob) {
    const buffer = await signatureValue.arrayBuffer();
    return new Uint8Array(buffer);
  }

  const raw = String(signatureValue).trim();

  if (!raw) {
    throw new Error('La firma es requerida.');
  }

  const base64 = raw.startsWith('data:') ? raw.split(',')[1] || '' : raw;

  if (!base64) {
    throw new Error('La firma no tiene datos válidos.');
  }

  let binaryString;

  try {
    binaryString = atob(base64);
  } catch (error) {
    throw new Error('La firma no tiene formato base64 válido.');
  }
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  if (!bytes.length) {
    throw new Error('La firma no contiene trazos válidos.');
  }

  return bytes;
}

export async function findEntregaMuestraByVisit(codigoVisitaMedica) {
  const visitId = normalizePositiveNumber(codigoVisitaMedica);

  if (!visitId) {
    return null;
  }

  const db = await getOfflineDb();
  const tx = db.transaction('tblEntregaMuestras', 'readonly');
  const store = tx.objectStore('tblEntregaMuestras');
  const rows = await store.index('byCodigoVisitaMedica').getAll(visitId);
  await tx.done;

  return (
    (rows || []).find(
      (row) =>
        Number(row?.CodigoTipoEntrega) === 2 &&
        Number(row?.CodigoTipoVisita) === 1 &&
        Number(row?.tipoProducto) === 1 &&
        Boolean(row?.IsActivo ?? row?.IsActive ?? true)
    ) || null
  );
}

export async function saveEntregaMuestraWithFirma({
  client = {},
  listOrdenMuestra = [],
  signatureData,
  comentarios = '',
  corte = null,
  codigoSolicitud = null,
  s3KeyFirma = null,
  tuid = null
} = {}) {
  const codPais = normalizePositiveNumber(client.CodPais || client.codPais);
  const codUsuario = normalizePositiveNumber(client.CodUsuario || client.codUsuario);
  const codVisitador = normalizePositiveNumber(
    client.CodVisitador || client.codVisitador
  );
  const codigoVisita = normalizePositiveNumber(
    client.CodigoVisita || client.codigoVisita
  );
  const codMedico = normalizePositiveNumber(client.CodMedico || client.codMedico);
  const items = normalizeOrderItems(listOrdenMuestra);

  if (!codPais) {
    throw new Error('CodPais es requerido para guardar entrega de muestras.');
  }

  if (!codUsuario) {
    throw new Error('CodUsuario es requerido para guardar entrega de muestras.');
  }

  if (!codVisitador) {
    throw new Error('CodVisitador es requerido para guardar entrega de muestras.');
  }

  if (!codigoVisita) {
    throw new Error('CódigoVisita es requerido para guardar entrega de muestras.');
  }

  const existing = await findEntregaMuestraByVisit(codigoVisita);

  if (existing) {
    throw new Error('Ya existe una entrega de muestra guardada para esta visita.');
  }

  const signatureBinary = await normalizeSignatureBinary(signatureData);
  const fechaActual = currDate();
  const horaActual = currTime();
  const codigoTipoEntrega = integerToIdentifier(2);
  const codigoTipoVisita = integerToIdentifier(1);
  const tipoProducto = integerToIdentifier(1);
  const resolvedTuid = String(tuid || generateTuid());
  const db = await getOfflineDb();
  const tx = db.transaction(
    ['tblEntregaMuestras', 'BinarioOrdenMuestraFirmas', 'tblProductosXEntregaMuestras'],
    'readwrite'
  );
  const entregaStore = tx.objectStore('tblEntregaMuestras');
  const firmaStore = tx.objectStore('BinarioOrdenMuestraFirmas');
  const productosStore = tx.objectStore('tblProductosXEntregaMuestras');

  const entregaPayload = {
    FechaRegistro: fechaActual,
    HoraRegistro: horaActual,
    CodigoUsuarioRecibe: nullIdentifier(),
    CodigoTipoEntrega: codigoTipoEntrega,
    CodigoPais: integerToIdentifier(codPais),
    IsActivo: true,
    FechaEntregado: fechaActual,
    HoraEntregado: horaActual,
    CodigoUsuarioEntrega: integerToIdentifier(codUsuario),
    S3KeyFirma: s3KeyFirma || null,
    Comentarios: String(comentarios || '').trim(),
    IsEntregado: true,
    Corte: corte ?? null,
    CodigoSolicitud: codigoSolicitud ?? null,
    CodigoTipoVisita: codigoTipoVisita,
    CodigoVisitaMedica: integerToIdentifier(codigoVisita),
    CodigoMedico: codMedico ? integerToIdentifier(codMedico) : nullIdentifier(),
    CodigoSucursal: nullIdentifier(),
    TUID: resolvedTuid,
    tipoProducto: tipoProducto,
    IsActive: true,
    IsFromServer: false,
    IsModified: true
  };

  const codigoEntrega = integerToIdentifier(await entregaStore.add(entregaPayload));

  if (!codigoEntrega) {
    throw new Error('No se pudo generar CódigoEntrega para la entrega de muestra.');
  }

  await firmaStore.add({
    BinaryData: signatureBinary,
    CodigoEntrega: codigoEntrega
  });

  for (const item of items) {
    await productosStore.add({
      CodigoProducto: integerToIdentifier(item.codigoProducto),
      CodigoEntrega: codigoEntrega,
      CodigoUsuarioVisitador: integerToIdentifier(codVisitador),
      CodigoPais: integerToIdentifier(codPais),
      Cantidad: integerToIdentifier(item.cantidad),
      IsActivo: true,
      Corte: corte ?? null,
      IsFromServer: false,
      IsModified: false,
      IsActive: true
    });
  }

  await tx.done;
  await verifyEntregaMuestraPersisted({
    codigoEntrega,
    codigoVisita,
    expectedItemsCount: items.length
  });

  return {
    CodigoEntrega: codigoEntrega,
    TUID: resolvedTuid
  };
}
