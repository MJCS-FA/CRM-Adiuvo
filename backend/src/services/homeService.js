const directoryService = require('./directoryService');
const homeRepository = require('../repositories/homeRepository');

function currentMonthNumber() {
  return new Date().getMonth() + 1;
}

function formatMonthNumber(value) {
  return String(value).padStart(2, '0');
}

function monthLabelEs(value) {
  const month = Number(value);
  const date = new Date(2026, month - 1, 15, 12, 0, 0);
  return new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(date);
}

function calculateCumplimiento(agendados, completados) {
  if (!agendados) {
    return 0;
  }

  return Math.round((completados / agendados) * 100);
}

async function resolveContext(codPersonas) {
  const base = await directoryService.getVisitadorBySession(codPersonas);

  if (!base.hasVisitador || !base.visitador) {
    return {
      ...base,
      cycle: null
    };
  }

  const effectiveCodPersonas = Number(
    base.visitador.codigoSAF || base.codPersonas || codPersonas
  );

  const cycle = await homeRepository.findActiveCycle({
    codPersonas: effectiveCodPersonas
  });

  return {
    ...base,
    codPersonasUsedForCycle: effectiveCodPersonas,
    cycle
  };
}

function buildCyclePayload(cycle) {
  if (!cycle) {
    return null;
  }

  return {
    codigoCicloVisita: cycle.codigoCicloVisita,
    nombreCicloVisita: cycle.nombreCicloVisita,
    fechaInicio: cycle.fechaInicio,
    fechaFin: cycle.fechaFin
  };
}

async function getActiveCycle(codPersonas) {
  const context = await resolveContext(codPersonas);

  return {
    hasVisitador: context.hasVisitador,
    visitador: context.visitador || null,
    codPersonasUsedForCycle: context.codPersonasUsedForCycle || null,
    cycle: buildCyclePayload(context.cycle)
  };
}

async function getMedicalSummary(codPersonas) {
  const context = await resolveContext(codPersonas);

  if (!context.hasVisitador || !context.visitador) {
    return {
      hasVisitador: Boolean(context.hasVisitador),
      cycle: null,
      agendados: 0,
      completados: 0,
      cumplimiento: 0
    };
  }

  const totals = await homeRepository.countVisitSummary({
    codPersonas: Number(context.codPersonasUsedForCycle || context.codPersonas || codPersonas),
    codigoEntidad: 1
  });

  return {
    hasVisitador: true,
    cycle: buildCyclePayload(context.cycle),
    agendados: totals.agendados,
    completados: totals.completados,
    cumplimiento: calculateCumplimiento(totals.agendados, totals.completados)
  };
}

async function getBranchSummary(codPersonas) {
  const context = await resolveContext(codPersonas);

  if (!context.hasVisitador || !context.visitador) {
    return {
      hasVisitador: Boolean(context.hasVisitador),
      cycle: null,
      agendados: 0,
      completados: 0,
      cumplimiento: 0
    };
  }

  const totals = await homeRepository.countVisitSummary({
    codPersonas: Number(context.codPersonasUsedForCycle || context.codPersonas || codPersonas),
    codigoEntidad: 2
  });

  return {
    hasVisitador: true,
    cycle: buildCyclePayload(context.cycle),
    agendados: totals.agendados,
    completados: totals.completados,
    cumplimiento: calculateCumplimiento(totals.agendados, totals.completados)
  };
}

async function getMonthBirthdays(codPersonas, monthInput) {
  const requestedMonth = Number(monthInput || currentMonthNumber());
  const normalizedMonth =
    Number.isFinite(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
      ? requestedMonth
      : currentMonthNumber();

  const context = await resolveContext(codPersonas);

  if (!context.hasVisitador || !context.visitador) {
    return {
      hasVisitador: false,
      month: {
        number: normalizedMonth,
        label: monthLabelEs(normalizedMonth)
      },
      items: []
    };
  }

  const candidates = [
    ...(context.assignmentCandidates || []),
    context.assignmentCode || null
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const uniqueCandidates = [...new Set(candidates)];

  let items = [];

  for (const candidate of uniqueCandidates) {
    items = await homeRepository.listMonthBirthdays({
      assignmentCode: candidate,
      monthNumber: formatMonthNumber(normalizedMonth)
    });

    if (items.length > 0) {
      break;
    }
  }

  return {
    hasVisitador: true,
    month: {
      number: normalizedMonth,
      label: monthLabelEs(normalizedMonth)
    },
    items
  };
}

module.exports = {
  getActiveCycle,
  getMedicalSummary,
  getBranchSummary,
  getMonthBirthdays
};
