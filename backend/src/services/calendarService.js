const { appConfig } = require('../config/app');
const directoryService = require('./directoryService');
const calendarRepository = require('../repositories/calendarRepository');
const { AppError } = require('../utils/appError');

function normalizeMonthInput(monthValue) {
  const month = String(monthValue || '').trim();
  const regex = /^(\d{4})-(\d{2})$/;
  const match = regex.exec(month);

  if (!match) {
    throw new AppError('month query param must use YYYY-MM format.', 400);
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);

  if (!Number.isFinite(year) || !Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new AppError('month query param is invalid.', 400);
  }

  const startDate = `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const endDate = `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return {
    month: `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`,
    startDate,
    endDate
  };
}

function normalizeDate(value, fieldName) {
  const asText = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(asText)) {
    return asText;
  }

  const asDate = new Date(asText);

  if (Number.isNaN(asDate.getTime())) {
    throw new AppError(`${fieldName} is invalid. Use YYYY-MM-DD.`, 400);
  }

  return asDate.toISOString().slice(0, 10);
}

function normalizeTime(value, fieldName) {
  const asText = String(value || '').trim();
  const withSeconds = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(asText);

  if (!withSeconds) {
    throw new AppError(`${fieldName} is invalid. Use HH:mm or HH:mm:ss.`, 400);
  }

  const hours = withSeconds[1];
  const minutes = withSeconds[2];
  const seconds = withSeconds[3] || '00';

  return `${hours}:${minutes}:${seconds}`;
}

function normalizeId(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} is required.`, 400);
  }

  return parsed;
}

function normalizeCreatePayload(payload = {}) {
  const codigoTipoVisita = normalizeId(payload.tipoVisitaId, 'tipoVisitaId');
  const isSucursalVisit = codigoTipoVisita === 2;
  const targetId = normalizeId(
    payload.targetId ?? (isSucursalVisit ? payload.sucursalId : payload.medicoId),
    isSucursalVisit ? 'sucursalId' : 'medicoId'
  );

  return {
    codigoTipoVisita,
    codigoTipoCanal: normalizeId(payload.canalVisitaId, 'canalVisitaId'),
    codigoMedico: isSucursalVisit ? 1 : targetId,
    codigoSucursal: isSucursalVisit ? targetId : 0,
    isSucursalVisit,
    fechaProgramada: normalizeDate(payload.fechaProgramada, 'fechaProgramada'),
    horaProgramada: normalizeTime(payload.horaProgramada, 'horaProgramada'),
    comentarios: String(payload.comentarios || '').trim()
  };
}

function normalizeBoolean(value, fieldName) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1' || String(value || '').toLowerCase() === 'true') {
    return true;
  }

  if (value === 0 || value === '0' || String(value || '').toLowerCase() === 'false') {
    return false;
  }

  throw new AppError(`${fieldName} is required.`, 400);
}

function getTimestampParts(timeZone = 'America/Tegucigalpa') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
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
    .reduce((acc, item) => {
      if (item.type !== 'literal') {
        acc[item.type] = item.value;
      }
      return acc;
    }, {});

  return {
    fecha: `${parts.year}-${parts.month}-${parts.day}`,
    hora: `${parts.hour}:${parts.minute}:${parts.second}`
  };
}

function isVisitStarted(codigoEstado, estado) {
  const code = Number(codigoEstado || 0);
  const text = String(estado || '').toLowerCase();

  if (code === 2 || code === 5 || code === 3) {
    return true;
  }

  return (
    text.includes('en curso') ||
    text.includes('proceso') ||
    text.includes('complet') ||
    text.includes('cancel')
  );
}

function normalizeUpdatePayload(payload = {}) {
  const isReagendar = normalizeBoolean(payload.reprogramar, 'reprogramar');
  const codigoMotivoCancelacion = normalizeId(
    payload.codigoMotivoCancelacion,
    'codigoMotivoCancelacion'
  );
  const observaciones = String(payload.observaciones || '').trim();

  if (!observaciones) {
    throw new AppError('observaciones is required.', 400);
  }

  if (!isReagendar) {
    return {
      isReagendar,
      codigoMotivoCancelacion,
      observaciones,
      fechaProgramada: null,
      horaProgramada: null,
      codigoEstado: 3
    };
  }

  return {
    isReagendar,
    codigoMotivoCancelacion,
    observaciones,
    fechaProgramada: normalizeDate(payload.fechaProgramada, 'fechaProgramada'),
    horaProgramada: normalizeTime(payload.horaProgramada, 'horaProgramada'),
    codigoEstado: 4
  };
}

function buildDoctorOption(doctor) {
  const label =
    doctor.nombreMedico || doctor.correoElectronico || `Médico ${doctor.codigoMedico}`;

  return {
    value: doctor.codigoMedico,
    label
  };
}

function buildBranchOption(branch) {
  const internalCode = String(
    branch.codigoInternoSucursal || branch.numeroSucursal || ''
  ).trim();
  const name = String(branch.nombreSucursal || '').trim();
  const label = internalCode && name ? `${internalCode} - ${name}` : name || `Sucursal ${branch.codigoSucursal}`;

  return {
    value: branch.codigoSucursal,
    label
  };
}

async function resolveVisitadorRequired(codPersonas) {
  const context = await directoryService.getVisitadorBySession(codPersonas);

  if (!context.hasVisitador || !context.visitador) {
    throw new AppError('No visitador was found for the current codPersonas session.', 404);
  }

  return context;
}

async function getAssignedDoctors(codPersonas) {
  const result = await directoryService.getAssignedDoctors(codPersonas, {});
  const medicos = result.medicos || [];
  const options = medicos.map(buildDoctorOption);

  return {
    context: result,
    medicos,
    options
  };
}

async function getAssignedBranches(codPersonas) {
  const result = await directoryService.getAssignedBranches(codPersonas, {});
  const sucursales = result.sucursales || [];
  const options = sucursales.map(buildBranchOption);

  return {
    context: result,
    sucursales,
    options
  };
}

async function getVisitadorBySession(codPersonas) {
  return directoryService.getVisitadorBySession(codPersonas);
}

async function getVisitTypeCatalog() {
  return calendarRepository.listVisitTypes();
}

async function getVisitChannelCatalog() {
  return calendarRepository.listVisitChannels();
}

async function getCancellationReasonCatalog() {
  const items = await calendarRepository.listCancellationReasons();
  return items || [];
}

async function getAssignedDoctorsCatalog(codPersonas) {
  const result = await getAssignedDoctors(codPersonas);
  return {
    hasVisitador: result.context.hasVisitador,
    visitador: result.context.visitador,
    items: result.options
  };
}

async function getAssignedBranchesCatalog(codPersonas) {
  const result = await getAssignedBranches(codPersonas);
  return {
    hasVisitador: result.context.hasVisitador,
    visitador: result.context.visitador,
    items: result.options
  };
}

async function getMonthVisits(codPersonas, month) {
  const normalizedMonth = normalizeMonthInput(month);
  const context = await directoryService.getVisitadorBySession(codPersonas);

  if (!context.hasVisitador || !context.visitador) {
    return {
      ...normalizedMonth,
      hasVisitador: false,
      visitador: null,
      visits: []
    };
  }

  const visits = await calendarRepository.listVisitsByMonth({
    codigoVisitador: context.visitador.codigoVisitador,
    startDate: normalizedMonth.startDate,
    endDate: normalizedMonth.endDate
  });

  return {
    ...normalizedMonth,
    hasVisitador: true,
    visitador: context.visitador,
    visits
  };
}

async function createVisit(codPersonas, rawPayload = {}) {
  const context = await resolveVisitadorRequired(codPersonas);
  const payload = normalizeCreatePayload(rawPayload);
  const [tiposVisita, canalesVisita] = await Promise.all([
    calendarRepository.listVisitTypes(),
    calendarRepository.listVisitChannels()
  ]);

  const tipoEsValido = tiposVisita.some(
    (item) => Number(item.value) === payload.codigoTipoVisita
  );
  const canalEsValido = canalesVisita.some(
    (item) => Number(item.value) === payload.codigoTipoCanal
  );

  if (!tipoEsValido) {
    throw new AppError('Selected tipoVisitaId is invalid.', 400);
  }

  if (!canalEsValido) {
    throw new AppError('Selected canalVisitaId is invalid.', 400);
  }

  if (payload.isSucursalVisit) {
    const branches = await getAssignedBranches(codPersonas);
    const isAssignedBranch = branches.sucursales.some(
      (branch) => Number(branch.codigoSucursal) === payload.codigoSucursal
    );

    if (!isAssignedBranch) {
      throw new AppError('Selected branch is not assigned to the current visitador.', 400);
    }
  } else {
    const doctors = await getAssignedDoctors(codPersonas);
    const isAssigned = doctors.medicos.some(
      (doctor) => Number(doctor.codigoMedico) === payload.codigoMedico
    );

    if (!isAssigned) {
      throw new AppError('Selected doctor is not assigned to the current visitador.', 400);
    }
  }

  const hasConflict = await calendarRepository.hasVisitConflict({
    codigoVisitador: context.visitador.codigoVisitador,
    fechaProgramada: payload.fechaProgramada,
    horaProgramada: payload.horaProgramada
  });

  if (hasConflict) {
    throw new AppError('Ya existe una visita programada para esa fecha y hora.', 409);
  }

  const codigoEstado = await calendarRepository.resolveProgrammedStatusCode(
    appConfig.calendar.defaultProgrammedStatusCode
  );
  const now = new Date();
  const fechaActual = now.toISOString().slice(0, 10);
  const horaActual = now.toISOString().slice(11, 19);
  const codigoPais =
    Number(context.visitador.codigoPais || 0) > 0
      ? Number(context.visitador.codigoPais)
      : appConfig.calendar.defaultCountryCode;

  const insertedId = await calendarRepository.createVisit({
    codigoPais,
    codigoEntidad: payload.codigoTipoVisita,
    isMedico: payload.isSucursalVisit ? 0 : 1,
    codigoMedico: payload.codigoMedico,
    codigoSucursal: payload.codigoSucursal,
    codigoLocal: 0,
    codigoCicloVisita: null,
    fecha: fechaActual,
    hora: horaActual,
    codigoUsuario: Number(codPersonas),
    fechaProgramada: payload.fechaProgramada,
    horaProgramada: payload.horaProgramada,
    codigoEstado,
    codigoVisitador: context.visitador.codigoVisitador,
    codigoTipoCanal: payload.codigoTipoCanal,
    nombreVisita: '',
    comentarios: payload.comentarios || '',
    isActiva: 1,
    isProgramada: 1
  });

  const visit = await calendarRepository.findVisitById(insertedId);

  return {
    visit
  };
}

async function updateVisit(codPersonas, visitId, rawPayload = {}) {
  const context = await resolveVisitadorRequired(codPersonas);
  const codigoVisitaMedica = normalizeId(visitId, 'visitId');
  const payload = normalizeUpdatePayload(rawPayload);
  const existingVisit = await calendarRepository.findVisitByIdForVisitador({
    codigoVisitaMedica,
    codigoVisitador: context.visitador.codigoVisitador
  });

  if (!existingVisit) {
    throw new AppError('Visit was not found for the authenticated visitador.', 404);
  }

  if (isVisitStarted(existingVisit.codigoEstado, existingVisit.estado)) {
    throw new AppError('No se puede modificar una visita que ya inició.', 409);
  }

  if (payload.isReagendar) {
    const hasConflict = await calendarRepository.hasVisitConflict({
      codigoVisitador: context.visitador.codigoVisitador,
      fechaProgramada: payload.fechaProgramada,
      horaProgramada: payload.horaProgramada,
      excludeCodigoVisitaMedica: codigoVisitaMedica
    });

    if (hasConflict) {
      throw new AppError('Ya existe una visita programada para esa fecha y hora.', 409);
    }
  }

  const timestamp = getTimestampParts(
    appConfig.visitExecution?.timezone || 'America/Tegucigalpa'
  );
  const affectedRows = await calendarRepository.updateVisitByDecision({
    codigoVisitaMedica,
    codigoVisitador: context.visitador.codigoVisitador,
    codigoMotivoCancelacion: payload.codigoMotivoCancelacion,
    observaciones: payload.observaciones,
    fechaCancelacion: timestamp.fecha,
    horaCancelacion: timestamp.hora,
    codigoEstado: payload.codigoEstado,
    fechaProgramada: payload.fechaProgramada,
    horaProgramada: payload.horaProgramada,
    isReagendar: payload.isReagendar
  });

  if (!affectedRows) {
    throw new AppError('Visit update was not applied.', 409);
  }

  const visit = await calendarRepository.findVisitById(codigoVisitaMedica);

  return {
    message: payload.isReagendar ? 'Visita reagendada' : 'Visita cancelada',
    visit
  };
}

module.exports = {
  getVisitadorBySession,
  getVisitTypeCatalog,
  getVisitChannelCatalog,
  getCancellationReasonCatalog,
  getAssignedDoctorsCatalog,
  getAssignedBranchesCatalog,
  getMonthVisits,
  createVisit,
  updateVisit
};
