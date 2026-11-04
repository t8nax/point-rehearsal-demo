import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { base } from './domain';
import { decodeCatalog, defaultCatalog, equipmentCatalog, EQUIPMENT_STORAGE_KEY } from './equipment-catalog';

let values: Map<string, string>;
beforeEach(() => {
  values = new Map([[EQUIPMENT_STORAGE_KEY, JSON.stringify(defaultCatalog())]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());
it('retains source tariffs and microphone billing metadata', () => {
  const initial = defaultCatalog();
  expect(initial.map(x => [x.id, x.price])).toEqual(base.rentals.map(x => [x.id, x.price]));
  expect(initial.find(x => x.id === 'mic')).toMatchObject({ freeQty: 2, perUnit: true, quantity: null });
});
it('rejects malformed persisted entries and duplicate identifiers', () => {
  const item = defaultCatalog()[0];
  expect(decodeCatalog('{')).toBeNull();
  expect(decodeCatalog(JSON.stringify([{ ...item, price: -1 }]))).toBeNull();
  expect(decodeCatalog(JSON.stringify([{ ...item, quantity: 1.2 }]))).toBeNull();
  expect(decodeCatalog(JSON.stringify([item, item]))).toBeNull();
});
it('saves edits independently from source tariffs and preserves unrelated latest records', () => {
  const initial = defaultCatalog(); const latest = initial.map(x => x.id === 'bass' ? { ...x, quantity: 12 } : x);
  values.set(EQUIPMENT_STORAGE_KEY, JSON.stringify(latest));
  equipmentCatalog.save({ ...initial[0], name: '  Новое название  ', price: 123, visible: false });
  const saved = decodeCatalog(values.get(EQUIPMENT_STORAGE_KEY)!);
  expect(saved?.[0]).toMatchObject({ name: 'Новое название', price: 123, visible: false });
  expect(saved?.find(x => x.id === 'bass')?.quantity).toBe(12);
  expect(base.rentals[0].price).toBe(0);
});
it('does not report success or emit updates when persistence fails', () => {
  const before = equipmentCatalog.get(); const listener = vi.fn(); const unsubscribe = equipmentCatalog.subscribe(listener);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
  expect(() => equipmentCatalog.save({ ...defaultCatalog()[0], price: 500 })).toThrow('сохранить');
  expect(equipmentCatalog.get()).toBe(before); expect(listener).not.toHaveBeenCalled(); unsubscribe();
});

it('supports free allowances for any equipment and consistent tariff text', async () => {
  const { equipmentTariff } = await import('./equipment-catalog');
  const { bookingRentalTotal } = await import('./domain');
  const guitar = { ...defaultCatalog().find(x => x.id === 'guitar')!, freeQty: 3 };
  equipmentCatalog.save(guitar);
  expect(equipmentCatalog.get().find(x => x.id === 'guitar')).toMatchObject({ freeQty: 3, perUnit: true });
  expect(equipmentTariff(guitar)).toBe('3 шт. бесплатно, далее 100 ₽/шт.');
  expect(equipmentTariff({ price: 50, freeQty: 0 })).toBe('50 ₽/шт.');
  expect(equipmentTariff({ price: 0, freeQty: 3 })).toBe('Без доплаты');
  expect(bookingRentalTotal({ rentals: { guitar: 4 }, rentalSnapshot: { guitar } })).toBe(100);
  expect(bookingRentalTotal({ rentals: { guitar: 2 }, rentalSnapshot: { guitar } })).toBe(0);
  expect(bookingRentalTotal({ rentals: { guitar: 4 }, rentalSnapshot: { guitar: { ...guitar, freeQty: 0 } } })).toBe(400);
});

it('migrates the old microphone category without losing edited equipment', () => {
  const items = defaultCatalog().map(item => item.id === 'mic' ? { ...item, category: 'Микрофоны', price: 75, freeQty: 3, visible: false } : item);
  const decoded = decodeCatalog(JSON.stringify(items));
  expect(decoded).toHaveLength(items.length);
  expect(decoded?.find(item => item.id === 'mic')).toMatchObject({ category: 'Другое', price: 75, freeQty: 3, visible: false });
});
