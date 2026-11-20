import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// `npm run build:demo` makes a self-contained demo (sample data, no database)
// that can be shared as a single page.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build:
    mode === 'demo'
      ? { outDir: 'dist-demo', assetsInlineLimit: 100_000, rollupOptions: { output: { inlineDynamicImports: true } } }
      : {},
}));
