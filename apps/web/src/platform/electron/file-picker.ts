import type { IFilePicker, FilePickerOptions } from '../contracts';
import { filePickerWeb } from '../web/file-picker';

function acceptToType(accept?: string): 'document' | 'audio' {
  if (!accept) return 'document';
  const lower = accept.toLowerCase();
  if (lower.includes('audio') || lower.includes('.mp3') || lower.includes('.wav') || lower.includes('.m4a')) {
    return 'audio';
  }
  return 'document';
}

export const filePickerElectron: IFilePicker = {
  async pickFiles(options?: FilePickerOptions) {
    if (typeof window.fileApi?.openFile !== 'function') {
      return filePickerWeb.pickFiles(options);
    }
    const result = await window.fileApi.openFile({
      type: acceptToType(options?.accept),
      accept: options?.accept,
      multiple: options?.multiple,
    });
    if (!result || result.length === 0) return [];
    return result.map((r) => new File([new Uint8Array(r.data)], r.name, { type: r.type }));
  },
};
