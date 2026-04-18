const STATUS_THEME = {
  pending: {
    tagColor: 'green',
    className: 'visit-status-dot-pending',
    label: 'Pendiente'
  },
  in_progress: {
    tagColor: 'orange',
    className: 'visit-status-dot-in-progress',
    label: 'En proceso'
  },
  completed: {
    tagColor: 'blue',
    className: 'visit-status-dot-completed',
    label: 'Completada'
  },
  cancelled: {
    tagColor: 'red',
    className: 'visit-status-dot-cancelled',
    label: 'Cancelada'
  }
};

export function resolveVisitStatusKey(codigoEstado, estado) {
  const code = Number(codigoEstado || 0);
  const text = String(estado || '').toLowerCase();

  if (code === 2 || text.includes('en curso') || text.includes('proceso')) {
    return 'in_progress';
  }

  if (code === 5 || code === 18 || text.includes('complet')) {
    return 'completed';
  }

  if (code === 3 || text.includes('cancel')) {
    return 'cancelled';
  }

  if (code === 1 || text.includes('program') || text.includes('pend') || text.includes('no inici')) {
    return 'pending';
  }

  return 'pending';
}

export function resolveVisitStatusTheme(codigoEstado, estado) {
  const statusKey = resolveVisitStatusKey(codigoEstado, estado);
  return {
    key: statusKey,
    ...(STATUS_THEME[statusKey] || STATUS_THEME.pending)
  };
}
