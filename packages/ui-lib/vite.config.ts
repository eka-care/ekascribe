import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    dts({
      entryRoot: 'src',
      tsconfigPath: './tsconfig.app.json',
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'EkaWebDesignComponents',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'React',
        },
      },
    },
    target: 'esnext',
    copyPublicDir: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/shadcn-ui'),
      '@eka-ui': path.resolve(__dirname, './src/eka-ui'),
      '@/components': path.resolve(__dirname, './src/components'),
    },
  },
});
