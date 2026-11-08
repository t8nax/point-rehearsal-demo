import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let values: Map<string, string>;
let events: EventTarget;
beforeEach(() => {
  vi.resetModules();
  values = new Map(); events = new EventTarget();
  vi.stubGlobal('window', events);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());
function storageEvent(key: string | null) { events.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: key === null ? null : values.get(key) ?? null })); }

it('migrates all real halls without inventing missing information', async () => {
  const { defaultHalls, decodeHalls } = await import('./halls');
  const rooms = defaultHalls();
  expect(rooms).toHaveLength(7);
  expect(rooms[0].prices).toEqual({ day: 1100, peak: 1400 });
  expect(rooms[0].equipment.map(e => e.category)).toEqual(['Барабаны', 'Усилители и кабинеты', 'Усилители и кабинеты', 'Усилители и кабинеты']);
  expect(rooms[5]).toMatchObject({ area: null, equipment: [], photos: [], visible: true });
  expect(decodeHalls(JSON.stringify(rooms))).toEqual(rooms);
});
it('validates hall IDs, equipment, prices and safe image sources', async () => {
  const { defaultHalls, decodeHalls } = await import('./halls');
  const h = defaultHalls()[0];
  for (const bad of [{ ...h, name: '' }, { ...h, id: -1 }, { ...h, area: -2 }, { ...h, prices: { day: -1 } }, { ...h, photos: ['javascript:alert(1)'] }, { ...h, equipment: [{ id: 'e', name: '', category: 'Другое' }] }]) expect(decodeHalls(JSON.stringify([bad]))).toBeNull();
  expect(decodeHalls(JSON.stringify([h, h]))).toBeNull();
  expect(decodeHalls('[')).toBeNull();
  expect(decodeHalls('[]')).toEqual([]);
});
it('saves and removes halls, notifying subscribers only after storage succeeds', async () => {
  const { halls, HALLS_STORAGE_KEY } = await import('./halls');
  const listener = vi.fn(); const unsubscribe = halls.subscribe(listener);
  const edited = { ...halls.get()[0], name: 'Изменённый зал' };
  halls.save(edited);
  expect(JSON.parse(values.get(HALLS_STORAGE_KEY)!)[0].name).toBe(edited.name);
  expect(listener).toHaveBeenCalledTimes(1);
  halls.remove(edited.id);
  expect(halls.get().some(h => h.id === edited.id)).toBe(false);
  const snapshot = halls.get();
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => halls.remove(2)).toThrow('Не удалось сохранить');
  expect(halls.get()).toBe(snapshot);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});
it('syncs hall, tariff and equipment snapshots on other-tab writes and storage resets', async () => {
  const { halls, HALLS_STORAGE_KEY } = await import('./halls');
  const { pricing, PRICING_STORAGE_KEY, defaultPricing } = await import('./pricing');
  const { equipmentCatalog, EQUIPMENT_STORAGE_KEY } = await import('./equipment-catalog');
  const listener = vi.fn(); halls.subscribe(listener);
  values.set(HALLS_STORAGE_KEY, '[]'); storageEvent(HALLS_STORAGE_KEY);
  expect(halls.get()).toEqual([]); expect(listener).toHaveBeenCalledOnce();
  const config = defaultPricing(); config.tariffs[0].name = 'Обновлённый';
  values.set(PRICING_STORAGE_KEY, JSON.stringify(config)); storageEvent(PRICING_STORAGE_KEY);
  expect(pricing.get().tariffs[0].name).toBe('Обновлённый');
  values.set(EQUIPMENT_STORAGE_KEY, '[]'); storageEvent(EQUIPMENT_STORAGE_KEY);
  expect(equipmentCatalog.get()).toEqual([]);
  values.clear(); storageEvent(null);
  expect(halls.get()).toHaveLength(7); expect(pricing.get()).toEqual(defaultPricing()); expect(equipmentCatalog.get().length).toBeGreaterThan(0);
});
it('rejects incomplete assignments, missing tariffs, duplicate IDs and empty names', async () => {
  const { defaultPricing, decodePricing } = await import('./pricing');
  const config = defaultPricing();
  expect(decodePricing(JSON.stringify(config))).toEqual(config);
  for (const invalid of [null, { ...config, tariffs: [] }, { ...config, tariffs: [config.tariffs[0], config.tariffs[0]] }, { ...config, assignment: {} }, { ...config, assignment: { ...config.assignment, 's1:0': 'absent' } }, { ...config, tariffs: [{ ...config.tariffs[0], name: ' ' }] }]) expect(decodePricing(JSON.stringify(invalid))).toBeNull();
});
it('deleting a tariff reassigns its cells and removes hall prices only on save', async () => {
  const { pricing, removeTariff } = await import('./pricing');
  const { halls } = await import('./halls');
  const { savePricing } = await import('./settings');
  const draft = removeTariff(pricing.get(), 'peak');
  expect(pricing.get().tariffs).toHaveLength(2);
  expect(halls.get()[0].prices.peak).toBe(1400);
  expect(new Set(Object.values(draft.assignment))).toEqual(new Set(['day']));
  savePricing(draft);
  expect(pricing.get().tariffs).toHaveLength(1);
  expect(halls.get()[0].prices).toEqual({ day: 1100 });
  expect(removeTariff(pricing.get(), 'day')).toBe(pricing.get());
});
it('rolls back hall prices and leaves both snapshots unchanged when tariff persistence fails', async () => {
  const { pricing, removeTariff, PRICING_STORAGE_KEY } = await import('./pricing');
  const { halls, HALLS_STORAGE_KEY } = await import('./halls');
  const { savePricing } = await import('./settings');
  const oldHalls = halls.get(), oldPricing = pricing.get();
  const listener = vi.fn(); halls.subscribe(listener); pricing.subscribe(listener);
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { if (key === PRICING_STORAGE_KEY) throw new Error('quota'); values.set(key, value); });
  expect(() => savePricing(removeTariff(oldPricing, 'peak'))).toThrow('Не удалось сохранить');
  expect(halls.get()).toBe(oldHalls); expect(pricing.get()).toBe(oldPricing);
  expect(values.has(HALLS_STORAGE_KEY)).toBe(false); expect(listener).not.toHaveBeenCalled();
});
it('keeps deleted halls and issued equipment in booking history after another-tab reload', async () => {
  const { halls, HALLS_STORAGE_KEY } = await import('./halls');
  const { equipmentCatalog, EQUIPMENT_STORAGE_KEY } = await import('./equipment-catalog');
  const { store, STORAGE_KEY } = await import('./store');
  const { addDays, today } = await import('./domain');
  store.reset();
  const hall = { ...halls.get()[0], id: 900, name: 'Новый зал' }; halls.save(hall);
  const booking = store.addBooking({ roomId: 900, date: addDays(today(), 2), slotId: 's1', band: 'Тест', channel: 'Telegram', contact: '@test', rentals: { mic: 3 }, source: 'admin' });
  equipmentCatalog.remove('mic'); halls.remove(900);
  storageEvent(HALLS_STORAGE_KEY); storageEvent(EQUIPMENT_STORAGE_KEY); storageEvent(STORAGE_KEY);
  const retained = store.get().bookings.find(b => b.id === booking.id)!;
  expect(retained.roomName).toBe('Новый зал'); expect(retained.rentalSnapshot?.mic.name).toBe('Микрофон');
  store.updateRentals(booking.id, { ...retained.rentals, cymbals: 1 });
  expect(store.get().bookings.find(b => b.id === booking.id)?.rentals.mic).toBe(3);
});
it('prevents client booking of hidden halls and booking with missing prices', async () => {
  const { halls } = await import('./halls');
  const { store } = await import('./store');
  const { addDays, today } = await import('./domain');
  store.reset();
  const hall = { ...halls.get()[0], id: 901, visible: false }; halls.save(hall);
  const input = { roomId: 901, date: addDays(today(), 2), slotId: 's1', band: 'Тест', channel: 'Telegram', contact: '@test', rentals: {}, source: 'site' as const };
  expect(() => store.addBooking(input)).toThrow('Выберите зал');
  halls.save({ ...hall, visible: true, prices: {} });
  expect(() => store.addBooking(input)).toThrow('Цена не указана');
});
it('describes the default and custom tariff assignments from the actual grid', async () => {
  const { defaultPricing, tariffSchedule } = await import('./pricing');
  const config = defaultPricing();
  expect(tariffSchedule(config, 'day')).toBe('Пн–пт · 11:00–20:00');
  expect(tariffSchedule(config, 'peak')).toBe('Пн–пт · 20:00–23:00, сб и вс весь день');
  config.assignment['s2:2'] = 'custom';
  expect(tariffSchedule(config, 'custom')).toBe('Ср · 14:00–17:00');
  expect(tariffSchedule(config, 'unused')).toBe('Пока не назначен ни одному слоту');
});

it('migrates existing covers and amplifier categories without losing hall edits', async () => {
  const { defaultHalls, decodeHalls } = await import('./halls');
  const legacy = { ...defaultHalls()[0], name: 'Название пользователя', coverPhoto: undefined };
  const equipment = legacy.equipment.map(e => ({ ...e, category: e.category === 'Усилители и кабинеты' ? 'Гитары' : e.category }));
  const decoded = decodeHalls(JSON.stringify([{ ...legacy, equipment }]))![0];
  expect(decoded.name).toBe('Название пользователя');
  expect(decoded.coverPhoto).toBe(legacy.photos[0]);
  expect(decoded.equipment[1].category).toBe('Усилители и кабинеты');
});
it('keeps cover selection independent from photo order through save and reload', async () => {
  const { halls, hallCover, moveHallPhoto, HALLS_STORAGE_KEY } = await import('./halls');
  const original = halls.get()[0];
  const selected = { ...original, coverPhoto: original.photos[1] };
  expect(selected.photos).toEqual(original.photos);
  const reordered = { ...selected, photos: moveHallPhoto(selected.photos, selected.photos[0], selected.photos[2]) };
  expect(reordered.photos).toEqual([original.photos[1], original.photos[2], original.photos[0]]);
  expect(hallCover(reordered)).toBe(original.photos[1]);
  halls.save(reordered); storageEvent(HALLS_STORAGE_KEY);
  expect(halls.get()[0].photos).toEqual(reordered.photos);
  expect(hallCover(halls.get()[0])).toBe(original.photos[1]);
});
it('marks photos and equipment only in a draft and restores the exact saved state', async () => {
  const { defaultHalls, applyHallDraft, hallCover } = await import('./halls');
  const hall = defaultHalls()[0];
  const removed = applyHallDraft(hall, [hall.photos[0]], [hall.equipment[0].id]);
  expect(hall.photos).toHaveLength(3); expect(hall.equipment).toHaveLength(4);
  expect(removed.photos).toHaveLength(2); expect(removed.equipment).toHaveLength(3);
  expect(hallCover(removed)).toBe(hall.photos[1]);
  expect(applyHallDraft(hall, [], [])).toEqual(hall);
  const newItem = { id: 'new', name: '', category: 'Другое' as const };
  expect(applyHallDraft({ ...hall, equipment: [...hall.equipment, newItem] }, [], ['new'])).toEqual(hall);
  const allRemoved = applyHallDraft(hall, hall.photos, hall.equipment.map(e => e.id));
  expect(allRemoved.coverPhoto).toBeNull(); expect(allRemoved.equipment).toEqual([]);
});

it('starts a fresh browser with the known base data and no invented stock', async () => {
  const base = (await import('../data/base.json')).default;
  const { halls } = await import('./halls');
  const { pricing } = await import('./pricing');
  const { equipmentCatalog } = await import('./equipment-catalog');
  expect(halls.get().map(h => ({ id: h.id, name: h.name, area: h.area, prices: h.prices, photos: h.photos, equipment: h.equipment.map(e => e.name) }))).toEqual(
    base.rooms.map(r => ({ id: r.id, name: r.name, area: r.area, prices: r.prices, photos: r.photos, equipment: r.equipment ?? [] })));
  expect(halls.get().every(h => h.visible)).toBe(true);
  const config = pricing.get();
  expect(config.tariffs.map(t => t.id)).toEqual(['day', 'peak']);
  for (let day = 0; day < 7; day++) for (const [index, slot] of base.schedule.slots.entries()) {
    expect(config.assignment[`${slot.id}:${day}`]).toBe(day < 5 && index < 3 ? 'day' : 'peak');
  }
  expect(equipmentCatalog.get().map(e => ({ id: e.id, price: e.price, freeQty: e.freeQty }))).toEqual(base.rentals.map(e => ({ id: e.id, price: e.price, freeQty: e.freeQty ?? 0 })));
  expect(equipmentCatalog.get().every(e => e.visible && e.quantity === null)).toBe(true);
});
