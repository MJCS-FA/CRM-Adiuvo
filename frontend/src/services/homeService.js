import { httpClient } from './httpClient';

export const homeService = {
  async getActiveCycle() {
    const { data } = await httpClient.get('/home/active-cycle');
    return data;
  },

  async getMedicalSummary() {
    const { data } = await httpClient.get('/home/summary/medical');
    return data;
  },

  async getBranchSummary() {
    const { data } = await httpClient.get('/home/summary/branch');
    return data;
  },

  async getBirthdays(month) {
    const { data } = await httpClient.get('/home/birthdays', {
      params: month ? { month } : undefined
    });
    return data;
  },

  async getOverview(month) {
    const { data } = await httpClient.get('/home/overview', {
      params: month ? { month } : undefined
    });
    return data;
  }
};
