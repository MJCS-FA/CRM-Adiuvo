import { httpClient } from './httpClient';

async function getWithFallback(paths = [], config = {}) {
  let lastError = null;

  for (const path of paths) {
    try {
      const { data } = await httpClient.get(path, config);
      return data;
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      const message = String(error?.response?.data?.message || '').trim();
      const isRouteNotFound =
        status === 404 && message.toLowerCase().includes('route not found');

      lastError = error;

      if (!isRouteNotFound) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('No inventory endpoint path available.');
}

export const inventoryService = {
  async getBootstrap() {
    const { data } = await httpClient.get('/inventory/bootstrap');
    return data;
  },

  async getMyInventory(filters = {}) {
    const { data } = await httpClient.get('/inventory/my-inventory', {
      params: filters
    });
    return data;
  },

  async getOrdersBootstrap() {
    const { data } = await httpClient.get('/inventory/orders/bootstrap');
    return data;
  },

  async getOrders(filters = {}) {
    const { data } = await httpClient.get('/inventory/orders', {
      params: filters
    });
    return data;
  },

  async getOrderSalidaDetail(codigoEntrega) {
    const { data } = await httpClient.get(`/inventory/orders/${codigoEntrega}/detail`);
    return data;
  },

  async getRequestsBootstrap() {
    const { data } = await httpClient.get('/inventory/requests/bootstrap');
    return data;
  },

  async getRequests(filters = {}) {
    const { data } = await httpClient.get('/inventory/requests', {
      params: filters
    });
    return data;
  },

  async getRequestDetail(codigoSolicitud) {
    const { data } = await httpClient.get(
      `/inventory/requests/${codigoSolicitud}/detail`
    );
    return data;
  },

  async createRequest(payload = {}) {
    const { data } = await httpClient.post('/inventory/requests', payload);
    return data;
  },

  async getProductDetailBootstrap(codigoProducto) {
    return getWithFallback([
      `/inventory/products/${codigoProducto}/detail/bootstrap`,
      `/inventory/product/${codigoProducto}/detail/bootstrap`,
      `/inventory/products/${codigoProducto}/bootstrap`,
      `/inventory/product/${codigoProducto}/bootstrap`
    ]);
  },

  async getProductMovements(codigoProducto, filters = {}) {
    return getWithFallback(
      [
        `/inventory/products/${codigoProducto}/movements`,
        `/inventory/product/${codigoProducto}/movements`,
        `/inventory/movements`,
        `/inventory/product-movements`
      ],
      { params: { ...filters, codigoProducto } }
    );
  }
};
