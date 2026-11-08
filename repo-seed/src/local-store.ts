export interface StorageWrite { key: string; raw: string; publish: () => void }
// Roll back earlier writes if browser storage rejects a later member of the batch.
// React subscribers see the new snapshots only after all writes have succeeded.
export function persistTogether(writes: StorageWrite[]) {
  const previous: { key: string; raw: string | null }[] = [];
  try {
    for (const write of writes) {
      const raw = localStorage.getItem(write.key);
      localStorage.setItem(write.key, write.raw);
      previous.push({ key: write.key, raw });
    }
  } catch {
    for (const old of previous.reverse()) {
      if (old.raw === null) localStorage.removeItem(old.key); else localStorage.setItem(old.key, old.raw);
    }
    throw new Error('Не удалось сохранить изменения в браузере.');
  }
  writes.forEach(write => write.publish());
}
// Publish only after persistence succeeds; storage events also cover browser resets.
export function localStore<T>(key: string, defaults: () => T, decode: (raw: string | null) => T | null) {
  const read = () => { try { return decode(localStorage.getItem(key)); } catch { return null; } };
  let snapshot = read() ?? defaults();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    snapshot = read() ?? defaults(); notify();
  });
  function stage(value: T): StorageWrite {
    const normalized = decode(JSON.stringify(value));
    if (normalized === null) throw new Error('Проверьте заполненные поля.');
    return { key, raw: JSON.stringify(normalized), publish: () => { snapshot = normalized; notify(); } };
  }
  return {
    get: () => snapshot,
    latest: () => read() ?? snapshot,
    stage,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    save(value: T) {
      persistTogether([stage(value)]);
    },
  };
}
