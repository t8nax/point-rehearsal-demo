import type { DemoIdentity } from './domain';

// A fictional browser-local identity for the demo; no Telegram authentication.
export interface DemoAccount extends DemoIdentity { expiresAt: number }
export const DEMO_AUTH_KEY = 'point-of-count-demo-identity-v1';
const lifetime = 30 * 24 * 60 * 60 * 1000;
const identity: DemoIdentity = { provider: 'telegram', mode: 'demo', name: 'Демо-музыкант', username: '@demo_musician' };

function decode(raw: string | null): DemoAccount | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DemoAccount | null;
    if (!value || value.provider !== identity.provider || value.mode !== identity.mode ||
      value.name !== identity.name || value.username !== identity.username ||
      !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + lifetime) return null;
    return { ...identity, expiresAt: value.expiresAt };
  } catch { return null; }
}
function read(): DemoAccount | null {
  try { return typeof localStorage === 'undefined' ? null : decode(localStorage.getItem(DEMO_AUTH_KEY)); }
  catch { return null; }
}
let account = read();
const listeners = new Set<() => void>();
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleExpiry(): void {
  clearTimeout(expiryTimer);
  if (!account || typeof window === 'undefined') return;
  // Browser timers cannot exceed 2^31-1 ms; a 30-day account needs two waits.
  expiryTimer = setTimeout(() => {
    if (account && account.expiresAt <= Date.now()) update(null);
    else scheduleExpiry();
  }, Math.min(Math.max(0, account.expiresAt - Date.now()), 2_147_483_647));
}
function update(next: DemoAccount | null): void {
  account = next;
  scheduleExpiry();
  listeners.forEach(listener => listener());
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === DEMO_AUTH_KEY || event.key === null) update(decode(event.newValue));
  });
  scheduleExpiry();
}
export const demoAuth = {
  get: (): DemoAccount | null => account && account.expiresAt > Date.now() ? account : null,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  login(): DemoAccount {
    const next = { ...identity, expiresAt: Date.now() + lifetime };
    try { localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(next)); }
    catch { throw new Error('Не удалось сохранить демо-вход. Разрешите хранение данных в браузере.'); }
    update(next);
    return next;
  },
  logout(): void {
    try { localStorage.removeItem(DEMO_AUTH_KEY); }
    catch { throw new Error('Не удалось удалить демо-вход из браузера. Попробуйте ещё раз.'); }
    update(null);
  },
};
