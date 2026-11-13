import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run build:demo` makes a self-contained demo (sample data, no database)
// that can be shared as a single page.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build:
    mode === 'demo'
      ? { outDir: 'dist-demo', assetsInlineLimit: 100_000, rollupOptions: { output: { inlineDynamicImports: true } } }
      : {},
}));
