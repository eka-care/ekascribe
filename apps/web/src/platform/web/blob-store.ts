import type { IBlobStore } from '../contracts';
import {
  openIndexedDB,
  saveChunkToIndexedDB,
  getChunksFromIndexedDB,
  checkAudioChunksExist,
  deleteChunksFromIDB,
} from '@/features/session/utils/audio-chunk-idb-util-methods';

let dbHandle: IDBDatabase | null = null;

async function getDb(): Promise<IDBDatabase> {
  if (!dbHandle) dbHandle = await openIndexedDB();
  return dbHandle;
}

export const blobStoreWeb: IBlobStore = {
  async put(txnId, fileName, data) {
    const db = await getDb();
    const chunkData =
      data instanceof Blob
        ? [new Uint8Array(await data.arrayBuffer())]
        : [new Uint8Array(data)];
    await saveChunkToIndexedDB({ txnID: txnId, fileName, chunkData, indexedDB: db });
  },

  async get(txnId, _fileName) {
    const db = await getDb();
    const { chunks } = await getChunksFromIndexedDB(txnId, db);
    if (!chunks.length) return null;
    return new Blob(chunks as unknown as BlobPart[], { type: 'application/octet-stream' });
  },

  async list(txnId) {
    const db = await getDb();
    const { chunks } = await getChunksFromIndexedDB(txnId, db);
    return chunks.map((_, i) => String(i));
  },

  async delete(_txnId, _fileName?) {
    const db = await getDb();
    await deleteChunksFromIDB(db);
  },

  async has(txnId) {
    const db = await getDb();
    const { exists } = await checkAudioChunksExist(txnId, db);
    return exists;
  },
};
