import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// `npm run build:demo` makes a self-contained demo (sample data, no database)
// that can be shared as a single page.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build:
    mode === 'demo'
      ? { outDir: 'dist-demo', assetsInlineLimit: 100_000, rollupOptions: { output: { inlineDynamicImports: true } } }
      : {},
}));
