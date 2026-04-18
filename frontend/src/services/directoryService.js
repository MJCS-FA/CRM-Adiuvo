import { httpClient } from './httpClient';

export const directoryService = {
  async getVisitador() {
    const { data } = await httpClient.get('/directory/visitador');
    return data;
  },

  async getDoctorsCount() {
    const { data } = await httpClient.get('/directory/medicos/count');
    return data;
  },

  async getBranchesCount() {
    const { data } = await httpClient.get('/directory/sucursales/count');
    return data;
  },

  async getHospitals() {
    const { data } = await httpClient.get('/directory/catalogs/hospitals');
    return data;
  },

  async getSpecialties() {
    const { data } = await httpClient.get('/directory/catalogs/specialties');
    return data;
  },

  async getCategories() {
    const { data } = await httpClient.get('/directory/catalogs/categories');
    return data;
  },

  async getDepartments() {
    const { data } = await httpClient.get('/directory/catalogs/departments');
    return data;
  },

  async getMunicipalities() {
    const { data } = await httpClient.get('/directory/catalogs/municipalities');
    return data;
  },

  async getBranchCatalog() {
    const { data } = await httpClient.get('/directory/catalogs/sucursales');
    return data;
  },

  async getDoctors(filters = {}) {
    const { data } = await httpClient.get('/directory/medicos', { params: filters });
    return data;
  },

  async getBranches(filters = {}) {
    const { data } = await httpClient.get('/directory/sucursales', { params: filters });
    return data;
  },

  async getBranchFicha(codigoSucursal, params = {}) {
    const { data } = await httpClient.get(
      `/directory/sucursales/${codigoSucursal}/ficha`,
      { params }
    );
    return data;
  },

  async getBranchHistory(codigoSucursal) {
    const { data } = await httpClient.get(
      `/directory/sucursales/${codigoSucursal}/historial`
    );
    return data;
  },

  async getDoctorFicha(codigoMedico) {
    const { data } = await httpClient.get(`/directory/medicos/${codigoMedico}/ficha`);
    return data;
  },

  async getDoctorHistory(codigoMedico) {
    const { data } = await httpClient.get(`/directory/medicos/${codigoMedico}/historial`);
    return data;
  },

  async updateDoctorFicha(codigoMedico, payload) {
    const { data } = await httpClient.put(`/directory/medicos/${codigoMedico}/ficha`, payload);
    return data;
  }
};
