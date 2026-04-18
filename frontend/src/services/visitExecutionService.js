import { httpClient } from './httpClient';

export const visitExecutionService = {
  async getBootstrap(visitId) {
    const { data } = await httpClient.get(`/visit-execution/visits/${visitId}/bootstrap`);
    return data;
  },

  async getVisitDetail(visitId) {
    const { data } = await httpClient.get(`/visit-execution/visits/${visitId}/detail`);
    return data;
  },

  async getSampleOrderProducts(visitId) {
    const { data } = await httpClient.get(
      `/visit-execution/visits/${visitId}/sample-order/products`
    );
    return data;
  },

  async getProducts(params) {
    const { data } = await httpClient.get('/visit-execution/products', {
      params
    });
    return data;
  },

  async createSampleOrder(visitId, payload) {
    const { data } = await httpClient.post(
      `/visit-execution/visits/${visitId}/sample-order`,
      payload
    );
    return data;
  },

  async finalizeVisit(visitId, payload) {
    const { data } = await httpClient.post(`/visit-execution/visits/${visitId}/finalize`, payload);
    return data;
  }
};
