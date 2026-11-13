// Bundles the demo build (dist-demo/) into one self-contained page: dist-demo/hoh-demo.html
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = 'dist-demo/assets';
const files = readdirSync(dir);
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith('.css'))}`, 'utf8');
const js = readFileSync(`${dir}/${files.find((f) => f.endsWith('.js'))}`, 'utf8').replaceAll('</script', '<\\/script');

const page = `<title>HOH Operations Hub</title>
<meta name="theme-color" content="#e63946">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=JetBrains+Mono:wght@500&display=swap">
<style>
${css}
/* Hosted preview: keep the sticky top bar clear of phone system bars. */
.topbar { top: env(safe-area-inset-top, 0px); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 30; background: var(--surface); }
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`;
writeFileSync('dist-demo/hoh-demo.html', page);
writeFileSync(
  'dist-demo/preview.html',
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${page}</body></html>`,
);
console.log(`dist-demo/hoh-demo.html (${Math.round(page.length / 1024)} KB)`);
