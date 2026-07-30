import type { IBlobStore } from '../contracts';
import { blobStoreWeb } from '../web/blob-store';

export const blobStoreElectron: IBlobStore = {
  async put(txnId, fileName, data) {
    if (typeof window.blobApi?.put === 'function') {
      const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
      await window.blobApi.put(txnId, fileName, buffer as ArrayBuffer);
      return;
    }
    return blobStoreWeb.put(txnId, fileName, data);
  },

  async get(txnId, fileName) {
    if (typeof window.blobApi?.get === 'function') {
      const buf = await window.blobApi.get(txnId, fileName);
      return buf ? new Blob([buf]) : null;
    }
    return blobStoreWeb.get(txnId, fileName);
  },

  async list(txnId) {
    if (typeof window.blobApi?.list === 'function') {
      return window.blobApi.list(txnId);
    }
    return blobStoreWeb.list(txnId);
  },

  async delete(txnId, fileName?) {
    if (typeof window.blobApi?.delete === 'function') {
      await window.blobApi.delete(txnId, fileName);
      return;
    }
    return blobStoreWeb.delete(txnId, fileName);
  },

  async has(txnId) {
    if (typeof window.blobApi?.list === 'function') {
      const files = await window.blobApi.list(txnId);
      return files.length > 0;
    }
    return blobStoreWeb.has(txnId);
  },
};
