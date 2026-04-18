import { httpClient } from './httpClient';

export const visitService = {
  async list() {
    const { data } = await httpClient.get('/visits');
    return data;
  },

  async create(payload) {
    const { data } = await httpClient.post('/visits', payload);
    return data;
  }
};
