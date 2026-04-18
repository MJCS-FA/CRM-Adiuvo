import { httpClient } from './httpClient';

export const authService = {
  async login(payload) {
    const { data } = await httpClient.post('/auth/login', payload);
    return data;
  },

  async me() {
    const { data } = await httpClient.get('/auth/me');
    return data;
  }
};
