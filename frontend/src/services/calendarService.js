import { httpClient } from './httpClient';

export const calendarService = {
  async getVisitador() {
    const { data } = await httpClient.get('/calendar/visitador');
    return data;
  },

  async getVisitTypes() {
    const { data } = await httpClient.get('/calendar/catalogs/tipos-visita');
    return data;
  },

  async getVisitChannels() {
    const { data } = await httpClient.get('/calendar/catalogs/canales-visita');
    return data;
  },

  async getCancellationReasons() {
    const endpoints = [
      '/calendar/catalogs/motivos-cancelacion',
      '/calendar/catalogs/motivo-cancelacion',
      '/calendar/catalogos/motivos-cancelacion'
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const { data } = await httpClient.get(endpoint);
        return data;
      } catch (error) {
        const statusCode = Number(error?.response?.status || 0);
        if (statusCode !== 404) {
          throw error;
        }

        lastError = error;
      }
    }

    throw lastError;
  },

  async getAssignedDoctors() {
    const { data } = await httpClient.get('/calendar/catalogs/medicos');
    return data;
  },

  async getAssignedBranches() {
    const { data } = await httpClient.get('/calendar/catalogs/sucursales');
    return data;
  },

  async getMonthVisits(month) {
    const { data } = await httpClient.get('/calendar/visits', {
      params: { month }
    });
    return data;
  },

  async createVisit(payload) {
    const { data } = await httpClient.post('/calendar/visits', payload);
    return data;
  },

  async updateVisit(visitId, payload) {
    const { data } = await httpClient.patch(`/calendar/visits/${visitId}`, payload);
    return data;
  }
};
