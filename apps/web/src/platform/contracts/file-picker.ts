export interface FilePickerOptions {
  /** Accepted types, e.g. `.pdf,image/png` — same syntax as `<input accept>`. */
  accept?: string;
  multiple?: boolean;
}

/**
 * File picker. Web → `<input type=file>` + drag-drop; electron →
 * `window.fileApi.openFile()` (the native OS dialog).
 */
export interface IFilePicker {
  pickFiles(options?: FilePickerOptions): Promise<File[]>;
}
