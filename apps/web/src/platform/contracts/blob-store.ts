/**
 * Large-object store keyed by `(txnId, fileName)`. Web → IndexedDB; electron →
 * filesystem under `userData` (much larger than the browser IndexedDB quota — this is
 * the main reason KV and blob storage are split into two capabilities, see §12).
 */
export interface IBlobStore {
  put(txnId: string, fileName: string, data: Blob | ArrayBuffer): Promise<void>;
  get(txnId: string, fileName: string): Promise<Blob | null>;
  list(txnId: string): Promise<string[]>;
  delete(txnId: string, fileName?: string): Promise<void>;
  has(txnId: string): Promise<boolean>;
}
