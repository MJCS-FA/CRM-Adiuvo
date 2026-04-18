import { httpClient } from './httpClient';

export const multimediaService = {
  async getBootstrap() {
    const { data } = await httpClient.get('/multimedia/bootstrap');
    return data;
  },

  async getItems(params = {}) {
    const { data } = await httpClient.get('/multimedia/items', {
      params
    });
    return data;
  },

  async resolveFileUrl({ s3Key, directUrl, nombreTabla } = {}) {
    const params = {};

    if (s3Key) {
      params.s3Key = s3Key;
    }

    if (directUrl) {
      params.directUrl = directUrl;
    }

    if (nombreTabla) {
      params.nombreTabla = nombreTabla;
    }

    const { data } = await httpClient.get('/multimedia/file-url', {
      params
    });

    return data;
  }
};
