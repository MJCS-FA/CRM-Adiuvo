const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');
const directoryRepository = require('../repositories/directoryRepository');

function normalizeCodPersonas(codPersonas) {
  const parsed = Number(codPersonas);

  if (!Number.isFinite(parsed)) {
    throw new AppError('codPersonas is required in the authenticated session.', 400);
  }

  return parsed;
}

function resolveAssignmentCandidates(visitador) {
  const source = (appConfig.directory.assignmentSourceColumn || 'CodigoVisitador')
    .toLowerCase()
    .trim();
  const preferred =
    source === 'codigosaf' ? visitador.codigoSAF : visitador.codigoVisitador;
  const fallback =
    source === 'codigosaf' ? visitador.codigoVisitador : visitador.codigoSAF;
  const values = [preferred, fallback]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return [...new Set(values)];
}

function resolvePrimaryAssignmentCode(visitador) {
  return resolveAssignmentCandidates(visitador)[0] || null;
}

async function resolveVisitadorContext(codPersonas) {
  const normalizedCodPersonas = normalizeCodPersonas(codPersonas);
  let visitador =
    await directoryRepository.findVisitadorByCodPersonas(normalizedCodPersonas);
  let matchSource = 'CodigoSAF';

  // Backward compatibility for legacy sessions where codPersonas was stored
  // incorrectly as CodigoVisitador (e.g., value 1 instead of 460).
  if (!visitador) {
    visitador = await directoryRepository.findVisitadorByCodigoVisitador(
      normalizedCodPersonas
    );
    if (visitador) {
      matchSource = 'CodigoVisitador';
    }
  }

  if (!visitador) {
    return {
      hasVisitador: false,
      codPersonas: normalizedCodPersonas,
      visitador: null,
      assignmentCode: null,
      matchSource: null
    };
  }

  return {
    hasVisitador: true,
    codPersonas: normalizedCodPersonas,
    visitador: {
      codigoVisitador: visitador.codigoVisitador,
      codigoSAF: visitador.codigoSAF,
      codigoPais: visitador.codigoPais,
      nombreCompleto: visitador.nombreCompleto
    },
    assignmentCode: resolvePrimaryAssignmentCode(visitador),
    assignmentCandidates: resolveAssignmentCandidates(visitador),
    matchSource
  };
}

function normalizeDoctorFilters(filters = {}) {
  const normalizeId = (value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    hospital: normalizeId(filters.hospital),
    especialidad: normalizeId(filters.especialidad),
    categoria: normalizeId(filters.categoria),
    departamento: normalizeId(filters.departamento),
    municipio: normalizeId(filters.municipio),
    nombre: String(filters.nombre || '').trim()
  };
}

function normalizeBranchFilters(filters = {}) {
  const sucursalValue = filters.sucursal;

  if (sucursalValue === undefined || sucursalValue === null || sucursalValue === '') {
    return { sucursal: null };
  }

  const parsed = Number(sucursalValue);

  return {
    sucursal: Number.isFinite(parsed) ? parsed : null
  };
}

function normalizePositiveId(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(`${fieldName} is required.`, 400);
  }

  return parsed;
}

function normalizeTrimmed(value) {
  return String(value ?? '').trim();
}

function normalizeDigits(value) {
  return normalizeTrimmed(value).replace(/\D+/g, '');
}

function normalizeOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCountryCode(value, fallback = appConfig.personasAuth.countryValue || 4) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number(fallback || 4);
}

function normalizeDate(value) {
  const text = normalizeTrimmed(value);

  if (!text) {
    return null;
  }

  const normalized = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function resolveDoctorDisplayName(doctor = {}, fallbackCode = null) {
  const fullName = normalizeTrimmed(
    doctor.nombrePersona || doctor.nombreMedico || doctor.NombrePersona
  );

  if (fullName) {
    return fullName;
  }

  const composedName = [
    doctor.primerNombre || doctor.PrimerNombre,
    doctor.segundoNombre || doctor.SegundoNombre,
    doctor.primerApellido || doctor.PrimerApellido,
    doctor.segundoApellido || doctor.SegundoApellido
  ]
    .map((value) => normalizeTrimmed(value))
    .filter(Boolean)
    .join(' ')
    .trim();

  if (composedName) {
    return composedName;
  }

  return fallbackCode ? `Médico ${fallbackCode}` : 'Médico';
}

function resolveBranchDisplayName(branch = {}, fallbackCode = null) {
  const internalCode = normalizeTrimmed(branch.codigoInternoSucursal || branch.numeroSucursal);
  const name = normalizeTrimmed(branch.nombreSucursal);

  if (internalCode && name) {
    return `${internalCode} - ${name}`;
  }

  if (name) {
    return name;
  }

  if (internalCode) {
    return internalCode;
  }

  return fallbackCode ? `Sucursal ${fallbackCode}` : 'Sucursal';
}

function buildValidationError(errors) {
  if (!errors.length) {
    return null;
  }

  return new AppError(`Advertencia de campos: ${errors.join(' | ')}`, 400);
}

function normalizeDoctorPayload(payload = {}) {
  const primerNombre = normalizeTrimmed(payload.primerNombre);
  const segundoNombre = normalizeTrimmed(payload.segundoNombre);
  const primerApellido = normalizeTrimmed(payload.primerApellido);
  const segundoApellido = normalizeTrimmed(payload.segundoApellido);
  const nombrePersona = [primerNombre, segundoNombre, primerApellido, segundoApellido]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    primerNombre,
    segundoNombre,
    primerApellido,
    segundoApellido,
    nombrePersona,
    fechaNacimiento: normalizeDate(payload.fechaNacimiento),
    identificacion: normalizeDigits(payload.identificacion),
    numeroColegiacion: normalizeTrimmed(payload.numeroColegiacion),
    correoPersonal: normalizeTrimmed(payload.correoPersonal),
    telefonoMovil: normalizeDigits(payload.telefonoMovil),
    codigoCategoria: normalizeOptionalNumber(payload.codigoCategoria),
    codigoDepartamento: normalizeOptionalNumber(payload.codigoDepartamento),
    codigoMunicipio: normalizeOptionalNumber(payload.codigoMunicipio),
    direccion: normalizeTrimmed(payload.direccion),
    pacientesSemana: normalizeOptionalNumber(payload.pacientesSemana),
    codigoRangoPrecioConsulta: normalizeOptionalNumber(payload.codigoRangoPrecioConsulta)
  };
}

function normalizeSpecialtiesPayload(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  const unique = new Map();

  for (const rawItem of items) {
    const codigoEspecialidad = normalizeOptionalNumber(rawItem?.codigoEspecialidad);

    if (!codigoEspecialidad) {
      continue;
    }

    const existing = unique.get(codigoEspecialidad);
    const nextValue = {
      codigoEspecialidad,
      isPrincipal: Boolean(rawItem?.isPrincipal)
    };

    if (!existing || nextValue.isPrincipal) {
      unique.set(codigoEspecialidad, nextValue);
    }
  }

  return [...unique.values()];
}

function normalizeLinesPayload(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  const unique = new Map();

  for (const rawItem of items) {
    const codigoLineaProducto = normalizeOptionalNumber(rawItem?.codigoLineaProducto);

    if (!codigoLineaProducto) {
      continue;
    }

    unique.set(codigoLineaProducto, {
      codigoLineaProducto
    });
  }

  return [...unique.values()];
}

function normalizePlazasPayload(items = []) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      codigoHospitalClinica: normalizeOptionalNumber(item?.codigoHospitalClinica),
      nombrePlaza: normalizeTrimmed(item?.nombrePlaza),
      direccion: normalizeTrimmed(item?.direccion),
      telefonoClinica: normalizeDigits(item?.telefonoClinica),
      nombreContacto: normalizeTrimmed(item?.nombreContacto),
      puestoContacto: normalizeTrimmed(item?.puestoContacto),
      fechaNacimientoContacto: normalizeDate(item?.fechaNacimientoContacto),
      telefonoMovilContacto: normalizeDigits(item?.telefonoMovilContacto),
      isPrincipal: Boolean(item?.isPrincipal)
    }))
    .filter((item) => {
      return (
        item.codigoHospitalClinica ||
        item.nombrePlaza ||
        item.direccion ||
        item.telefonoClinica ||
        item.nombreContacto ||
        item.puestoContacto ||
        item.fechaNacimientoContacto ||
        item.telefonoMovilContacto
      );
    });
}

async function executeWithAssignmentFallback(context, operation, isEmpty) {
  const candidates = context.assignmentCandidates || [];

  if (!candidates.length) {
    return {
      value: null,
      assignmentCodeUsed: null
    };
  }

  let lastValue = null;
  let assignmentCodeUsed = candidates[0];

  for (const candidate of candidates) {
    const value = await operation(candidate);

    assignmentCodeUsed = candidate;
    lastValue = value;

    if (!isEmpty(value)) {
      break;
    }
  }

  return {
    value: lastValue,
    assignmentCodeUsed
  };
}

async function getVisitadorBySession(codPersonas) {
  return resolveVisitadorContext(codPersonas);
}

async function getAssignedDoctorsCount(codPersonas) {
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    return { ...context, total: 0 };
  }

  const { value: total, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) => directoryRepository.countAssignedDoctors(assignmentCode),
    (value) => Number(value || 0) === 0
  );

  return { ...context, total: Number(total || 0), assignmentCodeUsed };
}

async function getAssignedBranchesCount(codPersonas) {
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    return { ...context, total: 0 };
  }

  const { value: total, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) => directoryRepository.countAssignedBranches(assignmentCode),
    (value) => Number(value || 0) === 0
  );

  return { ...context, total: Number(total || 0), assignmentCodeUsed };
}

async function getHospitalCatalog() {
  return directoryRepository.listHospitals();
}

async function getSpecialtyCatalog() {
  return directoryRepository.listSpecialties();
}

async function getCategoryCatalog() {
  return directoryRepository.listCategories();
}

async function getDepartmentCatalog() {
  return directoryRepository.listDepartments();
}

async function getMunicipalityCatalog() {
  return directoryRepository.listMunicipalities();
}

async function getBranchCatalog(codPersonas) {
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    return {
      ...context,
      items: []
    };
  }

  const { value: items, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) => directoryRepository.listAssignedBranchCatalog(assignmentCode),
    (value) => !Array.isArray(value) || value.length === 0
  );

  return {
    ...context,
    items: items || [],
    assignmentCodeUsed
  };
}

async function getAssignedDoctors(codPersonas, filters = {}) {
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    return { ...context, medicos: [] };
  }

  const normalizedFilters = normalizeDoctorFilters(filters);

  const { value: medicos, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) =>
      directoryRepository.listAssignedDoctors(assignmentCode, normalizedFilters),
    (value) => !Array.isArray(value) || value.length === 0
  );

  return { ...context, medicos: medicos || [], assignmentCodeUsed };
}

async function getAssignedBranches(codPersonas, filters = {}) {
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    return { ...context, sucursales: [] };
  }

  const normalizedFilters = normalizeBranchFilters(filters);

  const { value: sucursales, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) =>
      directoryRepository.listAssignedBranches(assignmentCode, normalizedFilters),
    (value) => !Array.isArray(value) || value.length === 0
  );

  return {
    ...context,
    sucursales: sucursales || [],
    assignmentCodeUsed
  };
}

async function getBranchFicha(codPersonas, codigoSucursal, filters = {}) {
  const branchId = normalizePositiveId(codigoSucursal, 'codigoSucursal');
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    throw new AppError('No visitador relationship found for this user.', 404);
  }

  const { value: assignedBranches, assignmentCodeUsed } =
    await executeWithAssignmentFallback(
      context,
      (assignmentCode) =>
        directoryRepository.listAssignedBranches(assignmentCode, {
          sucursal: branchId
        }),
      (value) => !Array.isArray(value) || value.length === 0
    );

  if (!Array.isArray(assignedBranches) || !assignedBranches.length) {
    throw new AppError('Branch was not found for this visitador.', 404);
  }

  const codigoPais = normalizeCountryCode(
    filters.codigoPais,
    context?.visitador?.codigoPais || appConfig.personasAuth.countryValue || 4
  );

  const sucursalInfo = await directoryRepository.findSucursalInfoByCountryAndCode({
    codigoPais,
    codigoSucursal: branchId
  });

  if (!sucursalInfo) {
    throw new AppError(
      `No branch detail was found for country ${codigoPais} and sucursal ${branchId}.`,
      404
    );
  }

  const findPersonaForRole = async (roleTableKey, codigoPersona) => {
    if (!codigoPersona) {
      return null;
    }

    const fromRoleTable = await directoryRepository.findPersonaByCodeFromTable(
      roleTableKey,
      codigoPersona
    );

    if (fromRoleTable) {
      return fromRoleTable;
    }

    return directoryRepository.findPersonaByCodeFromTable(
      'personasFallback',
      codigoPersona
    );
  };

  const [ga, gf, go] = await Promise.all([
    findPersonaForRole('personasGA', sucursalInfo.codGA),
    findPersonaForRole('personasGF', sucursalInfo.codGF),
    findPersonaForRole('personasGO', sucursalInfo.codGO)
  ]);

  const buildResponsable = (
    codigoPersona,
    nombreFallback,
    correoFallback,
    telefonoFallback,
    personaData
  ) => ({
    codigoPersona: codigoPersona || null,
    nombre: personaData?.nombrePersona || nombreFallback || null,
    correo: personaData?.correo || correoFallback || null,
    telefono: personaData?.telefono || telefonoFallback || null
  });

  const gerenteArea = buildResponsable(
    sucursalInfo.codGA,
    sucursalInfo.nombreGA,
    sucursalInfo.correoGA,
    sucursalInfo.telefonoGA,
    ga
  );
  const gerenteFarmacia = buildResponsable(
    sucursalInfo.codGF,
    sucursalInfo.nombreGF,
    sucursalInfo.correoGF,
    sucursalInfo.telefonoGF,
    gf
  );
  const gerenteOperativo = buildResponsable(
    sucursalInfo.codGO,
    sucursalInfo.nombreGO,
    sucursalInfo.correoGO,
    sucursalInfo.telefonoGO,
    go
  );

  return {
    ...context,
    assignmentCodeUsed,
    filter: {
      codigoPais,
      codigoSucursal: branchId
    },
    sucursal: {
      codigoSucursal: sucursalInfo.codigoSucursal,
      empresa: sucursalInfo.empresa,
      nombreSucursal: sucursalInfo.nombreSucursal,
      codigoInternoSucursal: sucursalInfo.codigoInternoSucursal,
      codigoPais: sucursalInfo.codigoPais,
      correoSucursal: sucursalInfo.correoSucursal,
      direccion: sucursalInfo.direccion,
      telefono: sucursalInfo.telefono
    },
    responsables: {
      gerenteFarmacia,
      gerenteArea,
      gerenteOperativo,
      gf: gerenteFarmacia,
      ga: gerenteArea,
      go: gerenteOperativo
    },
    raw: sucursalInfo.raw
  };
}

async function getDoctorFicha(codPersonas, codigoMedico) {
  const doctorId = normalizePositiveId(codigoMedico, 'codigoMedico');
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    throw new AppError('No visitador relationship found for this user.', 404);
  }

  const { value: doctor, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) =>
      directoryRepository.findDoctorByAssignment(assignmentCode, doctorId),
    (value) => !value
  );

  if (!doctor) {
    throw new AppError('Doctor was not found for this visitador.', 404);
  }

  const [
    especialidades,
    lineas,
    plazas,
    categorias,
    departamentos,
    municipios,
    costosConsulta,
    catalogoEspecialidades,
    catalogoLineas,
    hospitales
  ] = await Promise.all([
    directoryRepository.listDoctorSpecialties(doctorId),
    directoryRepository.listDoctorLines(doctorId),
    directoryRepository.listDoctorPlazas(doctorId),
    directoryRepository.listCategories(),
    directoryRepository.listDepartments(),
    directoryRepository.listMunicipalities(),
    directoryRepository.listConsultaCostRanges(),
    directoryRepository.listSpecialties(),
    directoryRepository.listLineCatalog(),
    directoryRepository.listHospitals()
  ]);

  return {
    ...context,
    assignmentCodeUsed,
    doctor,
    especialidades,
    lineas,
    plazas,
    catalogs: {
      categorias,
      departamentos,
      municipios,
      costosConsulta,
      especialidades: catalogoEspecialidades,
      lineas: catalogoLineas,
      hospitales
    }
  };
}

async function getDoctorHistory(codPersonas, codigoMedico) {
  const doctorId = normalizePositiveId(codigoMedico, 'codigoMedico');
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    throw new AppError('No visitador relationship found for this user.', 404);
  }

  const { value: doctor, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) =>
      directoryRepository.findDoctorByAssignment(assignmentCode, doctorId),
    (value) => !value
  );

  if (!doctor) {
    throw new AppError('Doctor was not found for this visitador.', 404);
  }

  const visits = await directoryRepository.listDoctorVisitHistory({
    codigoMedico: doctorId,
    codigoUsuario: normalizeOptionalNumber(codPersonas),
    codigoVisitador: normalizeOptionalNumber(context?.visitador?.codigoVisitador)
  });

  return {
    ...context,
    assignmentCodeUsed,
    doctor: {
      codigoMedico: doctorId,
      nombreMedico: resolveDoctorDisplayName(doctor, doctorId),
      correoElectronico: normalizeTrimmed(
        doctor.correoElectronico || doctor.correoPersonal
      ),
      codigoCategoria: normalizeOptionalNumber(doctor.codigoCategoria),
      codigoHospitalClinica: normalizeOptionalNumber(doctor.codigoHospitalClinica)
    },
    visits: visits || []
  };
}

async function getBranchHistory(codPersonas, codigoSucursal) {
  const branchId = normalizePositiveId(codigoSucursal, 'codigoSucursal');
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    throw new AppError('No visitador relationship found for this user.', 404);
  }

  const { value: assignedBranches, assignmentCodeUsed } =
    await executeWithAssignmentFallback(
      context,
      (assignmentCode) =>
        directoryRepository.listAssignedBranches(assignmentCode, {
          sucursal: branchId
        }),
      (value) => !Array.isArray(value) || value.length === 0
    );

  if (!Array.isArray(assignedBranches) || !assignedBranches.length) {
    throw new AppError('Branch was not found for this visitador.', 404);
  }

  const selectedBranch = assignedBranches[0] || {};

  const visits = await directoryRepository.listBranchVisitHistory({
    codigoSucursal: branchId,
    codigoUsuario: normalizeOptionalNumber(codPersonas),
    codigoVisitador: normalizeOptionalNumber(context?.visitador?.codigoVisitador)
  });

  return {
    ...context,
    assignmentCodeUsed,
    branch: {
      codigoSucursal: branchId,
      nombreSucursal: normalizeTrimmed(selectedBranch.nombreSucursal),
      codigoInternoSucursal: normalizeTrimmed(
        selectedBranch.codigoInternoSucursal || selectedBranch.numeroSucursal
      ),
      direccionSucursal: normalizeTrimmed(selectedBranch.direccionSucursal),
      correoSucursal: normalizeTrimmed(selectedBranch.correoSucursal),
      displayName: resolveBranchDisplayName(selectedBranch, branchId)
    },
    visits: visits || []
  };
}

async function updateDoctorFicha(codPersonas, codigoMedico, payload = {}) {
  const doctorId = normalizePositiveId(codigoMedico, 'codigoMedico');
  const context = await resolveVisitadorContext(codPersonas);

  if (!context.hasVisitador) {
    throw new AppError('No visitador relationship found for this user.', 404);
  }

  const { value: doctor, assignmentCodeUsed } = await executeWithAssignmentFallback(
    context,
    (assignmentCode) =>
      directoryRepository.findDoctorByAssignment(assignmentCode, doctorId),
    (value) => !value
  );

  if (!doctor) {
    throw new AppError('Doctor was not found for this visitador.', 404);
  }

  const doctorData = normalizeDoctorPayload(payload.doctor || {});
  const especialidades = normalizeSpecialtiesPayload(payload.especialidades || []);
  const lineas = normalizeLinesPayload(payload.lineas || []);
  const hasPlazasPayload = Object.prototype.hasOwnProperty.call(payload, 'plazas');
  const plazas = hasPlazasPayload ? normalizePlazasPayload(payload.plazas || []) : [];

  const validationErrors = [];

  if (!doctorData.primerNombre) {
    validationErrors.push('Primer Nombre es requerido.');
  }

  if (!doctorData.primerApellido) {
    validationErrors.push('Primer Apellido es requerido.');
  }

  if (!doctorData.fechaNacimiento) {
    validationErrors.push('Fecha Nacimiento es requerida.');
  }

  if (!doctorData.codigoCategoria) {
    validationErrors.push('Categoría es requerida.');
  }

  if (!doctorData.codigoDepartamento) {
    validationErrors.push('Departamento es requerido.');
  }

  if (!doctorData.codigoMunicipio) {
    validationErrors.push('Municipio es requerido.');
  }

  if (normalizeTrimmed(payload?.doctor?.identificacion) && !doctorData.identificacion) {
    validationErrors.push('Identificación solo acepta números.');
  }

  if (normalizeTrimmed(payload?.doctor?.telefonoMovil) && !doctorData.telefonoMovil) {
    validationErrors.push('Teléfono Móvil solo acepta números.');
  }

  const principalSpecialties = especialidades.filter((item) => item.isPrincipal);

  if (principalSpecialties.length > 1) {
    validationErrors.push('Solo puede existir una especialidad principal.');
  }

  if (hasPlazasPayload) {
    const principalPlazas = plazas.filter((item) => item.isPrincipal);

    if (principalPlazas.length > 1) {
      validationErrors.push('Solo puede existir una plaza principal.');
    }

    for (let index = 0; index < plazas.length; index += 1) {
      const plaza = plazas[index];
      const row = index + 1;

      if (
        normalizeTrimmed(payload?.plazas?.[index]?.telefonoClinica) &&
        !plaza.telefonoClinica
      ) {
        validationErrors.push(`Plaza ${row}: Teléfono Clínica solo acepta números.`);
      }

      if (
        normalizeTrimmed(payload?.plazas?.[index]?.telefonoMovilContacto) &&
        !plaza.telefonoMovilContacto
      ) {
        validationErrors.push(`Plaza ${row}: Teléfono Móvil Contacto solo acepta números.`);
      }
    }
  }

  const validationError = buildValidationError(validationErrors);

  if (validationError) {
    throw validationError;
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await directoryRepository.updateDoctorProfile(
      {
        codigoMedico: doctorId,
        doctor: doctorData
      },
      connection
    );

    const codigoPais = normalizeOptionalNumber(
      context?.visitador?.codigoPais || appConfig.personasAuth.countryValue || 4
    );

    await directoryRepository.replaceDoctorSpecialties(
      {
        codigoMedico: doctorId,
        especialidades,
        codigoUsuario: normalizeOptionalNumber(codPersonas),
        codigoPais
      },
      connection
    );

    await directoryRepository.replaceDoctorLines(
      {
        codigoMedico: doctorId,
        lineas,
        codigoUsuario: normalizeOptionalNumber(codPersonas),
        codigoPais
      },
      connection
    );

    if (hasPlazasPayload) {
      await directoryRepository.replaceDoctorPlazas(
        {
          codigoMedico: doctorId,
          plazas,
          codigoUsuario: normalizeOptionalNumber(codPersonas),
          codigoPais
        },
        connection
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();

    const mysqlCode = String(error?.code || '');
    const mysqlField = String(error?.sqlMessage || error?.message || '').trim();

    if (
      [
        'ER_BAD_NULL_ERROR',
        'ER_NO_DEFAULT_FOR_FIELD',
        'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD',
        'ER_TRUNCATED_WRONG_VALUE',
        'ER_DATA_TOO_LONG',
        'ER_WARN_DATA_OUT_OF_RANGE'
      ].includes(mysqlCode)
    ) {
      throw new AppError(`Advertencia de campos: ${mysqlField}`, 400);
    }

    throw error;
  } finally {
    connection.release();
  }

  return {
    ...context,
    assignmentCodeUsed,
    updated: {
      codigoMedico: doctorId,
      especialidades: especialidades.length,
      lineas: lineas.length,
      plazas: hasPlazasPayload ? plazas.length : undefined
    }
  };
}

module.exports = {
  getVisitadorBySession,
  getAssignedDoctorsCount,
  getAssignedBranchesCount,
  getHospitalCatalog,
  getSpecialtyCatalog,
  getCategoryCatalog,
  getDepartmentCatalog,
  getMunicipalityCatalog,
  getBranchCatalog,
  getAssignedDoctors,
  getAssignedBranches,
  getBranchFicha,
  getDoctorFicha,
  getDoctorHistory,
  getBranchHistory,
  updateDoctorFicha
};
