// Screenshots the local production build against the REAL database, at phone and tablet size.
// The build is served under the live address (https://hoh-operations-hub.vercel.app) so passkeys and
// links behave exactly as in production; nothing is deployed.
//
//   npm run build
//   HOH_EMAIL=... HOH_PASSWORD=... node scripts/check-screens.cjs <output-folder> [/route ...]
//
// Signs in with an email + password account (test accounts only; never commit passwords).
// Prints the menu, any page errors and any sideways scrolling (overflow) per screen.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ORIGIN = 'https://hoh-operations-hub.vercel.app';
const OUT = process.argv[2];
const ROUTES = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/checklists', '/handoff', '/schedule', '/kitchen', '/scores', '/more'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const { HOH_EMAIL, HOH_PASSWORD } = process.env;

if (!OUT || !HOH_EMAIL || !HOH_PASSWORD) {
  console.error('Usage: HOH_EMAIL=... HOH_PASSWORD=... node scripts/check-screens.cjs <output-folder> [/route ...]');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  // This sandbox reaches the internet through a proxy; the browser has to use it too.
  const proxy = process.env.HTTPS_PROXY ? new URL(process.env.HTTPS_PROXY) : null;
  const browser = await chromium.launch(
    proxy ? { proxy: { server: `http://${proxy.host}`, username: decodeURIComponent(proxy.username), password: decodeURIComponent(proxy.password) } } : {},
  );
  const problems = [];

  for (const [label, opts] of [['tablet', { viewport: { width: 1280, height: 900 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await browser.newContext({ ...opts, timezoneId: 'America/New_York' });
    await ctx.route(`${ORIGIN}/**`, (route) => {
      const u = new URL(route.request().url());
      let file = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname);
      if (!fs.existsSync(file)) file = path.join(DIST, 'index.html');
      route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' } });
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${label}: ${e.message}`));

    await page.goto(ORIGIN + '/');
    await page.waitForSelector('.auth-card');
    await page.getByRole('button', { name: 'Sign in with email instead' }).click();
    await page.locator('input[type=email]').fill(HOH_EMAIL);
    await page.locator('input[type=password]').fill(HOH_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForSelector('.topbar', { timeout: 20000 });

    const menu = label === 'tablet' ? 'nav.sidenav' : 'nav.tabbar';
    console.log(`${label} menu:`, (await page.locator(menu).innerText()).replace(/\n+/g, ' | '));

    for (const r of ROUTES) {
      await page.goto(`${ORIGIN}/#${r}`);
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (overflow > 0) problems.push(`${label} ${r}: scrolls sideways by ${overflow}px`);
      const name = `${label}${r.replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '') || '-home'}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: true });
    }
    await ctx.close();
  }

  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'No page errors or sideways scrolling.');
  await browser.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  process.exit(1);
});
