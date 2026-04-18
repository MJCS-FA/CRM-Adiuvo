export function formatApiError(error) {
  if (error?.code === 'OFFLINE_CACHE_MISS') {
    return 'Este contenido aun no esta disponible offline. Conectate a internet para sincronizarlo.';
  }

  if (error?.code === 'OFFLINE_UNAVAILABLE') {
    return 'No hay conexion disponible para completar esta operacion. Se intentara sincronizar cuando vuelva internet.';
  }

  if (error?.response?.data?.message) {
    const details = error?.response?.data?.details;

    if (details === null || details === undefined || details === '') {
      return error.response.data.message;
    }

    const normalizedDetails =
      typeof details === 'string' ? details : JSON.stringify(details);

    return `${error.response.data.message} (${normalizedDetails})`;
  }

  if (error?.message) {
    return error.message;
  }

  return 'Unexpected error.';
}
