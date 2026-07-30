import type { IFilePicker, FilePickerOptions } from '../contracts';

export const filePickerWeb: IFilePicker = {
  pickFiles(options?: FilePickerOptions): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (options?.accept) input.accept = options.accept;
      if (options?.multiple) input.multiple = true;
      input.onchange = () => {
        resolve(input.files ? Array.from(input.files) : []);
      };
      input.click();
    });
  },
};
