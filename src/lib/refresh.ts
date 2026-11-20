/** Every screen listens for this (through useRealtime) and reloads its data. */
export const REFRESH_EVENT = 'hoh:refresh';

/** True when the live site is running a newer build than this page. */
async function newerVersionIsOut(): Promise<boolean> {
  const running = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  if (!running) return false; // development build
  try {
    const html = await (await fetch(`/index.html?t=${Date.now()}`, { cache: 'no-store' })).text();
    const live = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    return !!live && live !== running;
  } catch {
    return false;
  }
}

/** Pull to refresh: loads a newer version of the app if one is out, otherwise reloads every screen's data. */
export async function refreshApp(): Promise<'reload' | 'done'> {
  if (await newerVersionIsOut()) {
    window.location.reload();
    return 'reload';
  }
  window.dispatchEvent(new Event(REFRESH_EVENT));
  await new Promise((r) => setTimeout(r, 600));
  return 'done';
}
