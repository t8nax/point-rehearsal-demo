import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const key = 'point-of-count-demo-identity-v1';
const lifetime = 30 * 24 * 60 * 60 * 1000;
let values: Map<string, string>;
let onStorage: ((event: { key: string | null; newValue: string | null }) => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-02T10:00:00Z'));
  vi.resetModules();
  values = new Map();
  onStorage = undefined;
  vi.stubGlobal('localStorage', {
    getItem: (id: string) => values.get(id) ?? null,
    setItem: (id: string, value: string) => { values.set(id, value); },
    removeItem: (id: string) => { values.delete(id); },
  });
  vi.stubGlobal('window', { addEventListener: (name: string, handler: typeof onStorage) => { if (name === 'storage') onStorage = handler; } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('persists a clearly fictional identity and restores it with stable snapshots', async () => {
  const { demoAuth } = await import('./demo-auth');
  expect(demoAuth.get()).toBeNull();
  const account = demoAuth.login();
  expect(account).toEqual({ provider: 'telegram', mode: 'demo', name: 'Демо-музыкант', username: '@demo_musician', expiresAt: Date.now() + lifetime });
  expect(demoAuth.get()).toBe(account);
  expect(demoAuth.get()).toBe(demoAuth.get());
  expect(JSON.parse(values.get(key)!)).toEqual(account);
  vi.resetModules();
  const restored = (await import('./demo-auth')).demoAuth;
  expect(restored.get()).toEqual(account);
  expect(restored.get()).toBe(restored.get());
});
it('logout removes only demo identity and not booking storage', async () => {
  const { demoAuth } = await import('./demo-auth');
  const notify = vi.fn();
  const unsubscribe = demoAuth.subscribe(notify);
  values.set('point-of-count-demo-v1', 'bookings');
  demoAuth.login();
  demoAuth.logout();
  expect(demoAuth.get()).toBeNull();
  expect(values.has(key)).toBe(false);
  expect(values.get('point-of-count-demo-v1')).toBe('bookings');
  expect(notify).toHaveBeenCalledTimes(2);
  unsubscribe();
  demoAuth.login();
  expect(notify).toHaveBeenCalledTimes(2);
});
it.each(['broken-json', 'null', '{}', '{"provider":"telegram"}'])('ignores malformed persisted identity: %s', async raw => {
  values.set(key, raw);
  expect((await import('./demo-auth')).demoAuth.get()).toBeNull();
});
it('ignores expired and non-demo stored identities', async () => {
  const { demoAuth } = await import('./demo-auth');
  const account = demoAuth.login();
  values.set(key, JSON.stringify({ ...account, expiresAt: Date.now() - 1 }));
  vi.resetModules();
  expect((await import('./demo-auth')).demoAuth.get()).toBeNull();
  values.set(key, JSON.stringify({ ...account, mode: 'real' }));
  vi.resetModules();
  expect((await import('./demo-auth')).demoAuth.get()).toBeNull();
});
it('syncs login, logout and storage clear from another tab', async () => {
  const { demoAuth } = await import('./demo-auth');
  const account = demoAuth.login();
  demoAuth.logout();
  const notify = vi.fn();
  demoAuth.subscribe(notify);
  onStorage!({ key, newValue: JSON.stringify(account) });
  expect(demoAuth.get()).toEqual(account);
  onStorage!({ key: 'unrelated', newValue: null });
  expect(demoAuth.get()).toEqual(account);
  onStorage!({ key, newValue: null });
  expect(demoAuth.get()).toBeNull();
  onStorage!({ key, newValue: JSON.stringify(account) });
  onStorage!({ key: null, newValue: null });
  expect(demoAuth.get()).toBeNull();
  expect(notify).toHaveBeenCalledTimes(4);
});
it('expires after 30 days while the page stays open and notifies subscribers', async () => {
  const { demoAuth } = await import('./demo-auth');
  demoAuth.login();
  const notify = vi.fn();
  demoAuth.subscribe(notify);
  vi.advanceTimersByTime(lifetime - 1);
  expect(demoAuth.get()).not.toBeNull();
  expect(notify).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(demoAuth.get()).toBeNull();
  expect(notify).toHaveBeenCalledTimes(1);
});
it('does not claim a successful login or logout if persistence fails', async () => {
  const { demoAuth } = await import('./demo-auth');
  const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => demoAuth.login()).toThrow('сохранить');
  expect(demoAuth.get()).toBeNull();
  setItem.mockRestore();
  const account = demoAuth.login();
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => demoAuth.logout()).toThrow('удалить');
  expect(demoAuth.get()).toBe(account);
});
