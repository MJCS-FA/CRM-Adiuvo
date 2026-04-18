const { appConfig } = require('../config/app');
const { getPool } = require('../config/database');
const { AppError } = require('../utils/appError');

function quoteIdentifier(value, label) {
  if (!/^[A-Za-z0-9_]+$/.test(value || '')) {
    throw new AppError(`Invalid identifier for ${label}.`, 500);
  }

  return `\`${value}\``;
}

const homeConfig = appConfig.home;
const dbName = quoteIdentifier(homeConfig.dbName, 'HOME_DB_NAME');

const tables = {
  cycle: `${dbName}.${quoteIdentifier(homeConfig.cycleTable, 'HOME_CYCLE_TABLE')}`,
  visitaMedica: `${dbName}.${quoteIdentifier(
    homeConfig.visitaMedicaTable,
    'HOME_VISITA_MEDICA_TABLE'
  )}`,
  medico: `${dbName}.${quoteIdentifier(homeConfig.medicoTable, 'HOME_MEDICO_TABLE')}`,
  medicosXVisitador: `${dbName}.${quoteIdentifier(
    homeConfig.medicosXVisitadorTable,
    'HOME_MEDICOS_X_VISITADOR_TABLE'
  )}`
};

function doctorNameSql(alias = 'm') {
  return `COALESCE(
    NULLIF(${alias}.NombrePersona, ''),
    TRIM(CONCAT_WS(' ', ${alias}.PrimerNombre, ${alias}.SegundoNombre, ${alias}.PrimerApellido, ${alias}.SegundoApellido))
  )`;
}

async function findActiveCycle({ codPersonas }) {
  const [rows] = await getPool().execute(
    `SELECT
      CodigoCicloVisita AS codigoCicloVisita,
      NombreCicloVisita AS nombreCicloVisita,
      FechaInicio AS fechaInicio,
      FechaFin AS fechaFin,
      CodigoUsuarioV AS codigoUsuarioV
    FROM ${tables.cycle}
    WHERE IFNULL(IsActivo, 1) = 1
      AND CodigoUsuarioV = ?
    ORDER BY
      CodigoCicloVisita DESC
    LIMIT 1`,
    [codPersonas]
  );

  return rows[0] || null;
}

async function countVisitSummary({ codPersonas, codigoEntidad }) {
  const [rows] = await getPool().execute(
    `SELECT
      SUM(
        CASE
          WHEN vm.CodigoEstado <> 4 AND vm.CodigoEstado <> 3 THEN 1
          ELSE 0
        END
      ) AS agendados,
      SUM(
        CASE
          WHEN vm.CodigoEstado = 5 THEN 1
          ELSE 0
        END
      ) AS completados
    FROM ${tables.visitaMedica} vm
    INNER JOIN ${tables.cycle} cv
      ON cv.CodigoCicloVisita = vm.CodigoCicloVisita
    WHERE vm.CodigoUsuario = ?
      AND IFNULL(vm.IsActiva, 1) = 1
      AND vm.CodigoEntidad = ?`,
    [codPersonas, codigoEntidad]
  );

  return {
    agendados: Number(rows[0]?.agendados || 0),
    completados: Number(rows[0]?.completados || 0)
  };
}

async function listMonthBirthdays({ assignmentCode, monthNumber }) {
  const [rows] = await getPool().execute(
    `SELECT DISTINCT
      m.CodigoMedico AS codigoMedico,
      ${doctorNameSql('m')} AS nombreMedico,
      m.FechaNacimiento AS fechaNacimiento,
      DAY(m.FechaNacimiento) AS diaCumple
    FROM ${tables.medicosXVisitador} mxv
    INNER JOIN ${tables.medico} m
      ON m.CodigoMedico = mxv.CodigoMedico
      AND IFNULL(m.isActivo, 1) = 1
    WHERE mxv.CodigoUsuario = ?
      AND IFNULL(mxv.IsActivo, 1) = 1
      AND m.FechaNacimiento IS NOT NULL
      AND m.FechaNacimiento <> '1900-01-01'
      AND DATE_FORMAT(m.FechaNacimiento, '%m') = ?
    ORDER BY DAY(m.FechaNacimiento) ASC, nombreMedico ASC`,
    [assignmentCode, monthNumber]
  );

  return rows;
}

module.exports = {
  findActiveCycle,
  countVisitSummary,
  listMonthBirthdays
};
