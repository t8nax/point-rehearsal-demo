import { equipmentCatalog } from './equipment-catalog';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addDays, base, bookingUndoAction, isActive, rentalTotal, slotStart, today, type Booking } from './domain';
import { seedState, store, STORAGE_KEY, type BookingInput } from './store';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-30T07:00:00Z'));
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) });
  store.reset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function available(): BookingInput {
  const date = addDays(today(), 1);
  for (const room of base.rooms) for (const slot of base.schedule.slots) {
    if (!store.get().bookings.some(b => isActive(b) && b.roomId === room.id && b.slotId === slot.id && b.date === date)) return {
      roomId: room.id, slotId: slot.id, date, band: 'Новая группа', contact: '@group', channel: 'Telegram', rentals: { mic: 3 }, source: 'site',
    };
  }
  throw new Error('No free seed slots');
}
function undoSnapshot(booking: Booking) {
  const action = bookingUndoAction(booking);
  if (!action) throw new Error('No undoable action');
  return { action, completedAt: booking.completedAt, paidAt: booking.paidAt };
}
it('seed is deterministic, about half full, and requires no manual confirmations', () => {
  expect(seedState('2026-10-30')).toEqual(seedState('2026-10-30'));
  const initial = store.get();
  expect(initial.bookings.length / (14 * 7 * 4)).toBeGreaterThanOrEqual(0.4);
  expect(initial.bookings.length / (14 * 7 * 4)).toBeLessThanOrEqual(0.6);
  expect(initial.mode).toBe('instant');
  expect(initial.bookings.every(b => b.status === 'confirmed' && b.mode === 'instant')).toBe(true);
  expect(new Set(initial.bookings.map(b => `${b.date}/${b.roomId}/${b.slotId}`)).size).toBe(initial.bookings.length);
});
it('spreads bookings across days and rooms, with busier evenings and weekends', () => {
  for (const start of ['2026-10-30', '2026-12-31', '2027-01-11', '2027-06-05']) {
    const { bookings } = seedState(start);
    expect(seedState(start).bookings).toEqual(bookings);
    let weekdayCount = 0;
    let weekendCount = 0;
    for (let offset = 0; offset < 14; offset++) {
      const date = addDays(start, offset);
      const daily = bookings.filter(b => b.date === date);
      expect(daily.length / 28).toBeGreaterThanOrEqual(0.4);
      expect(daily.length / 28).toBeLessThanOrEqual(0.6);
      for (const room of base.rooms) expect(daily.filter(b => b.roomId === room.id).length).toBeLessThan(4);
      if ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) weekendCount += daily.length;
      else weekdayCount += daily.length;
    }
    expect(weekendCount / 4).toBeGreaterThan(weekdayCount / 10);
    const evening = bookings.filter(b => b.slotId === 's4').length;
    expect(evening).toBeGreaterThan((bookings.length - evening) / 3);
  }
});
it('all new bookings reserve immediately and cancellation frees their slots', () => {
  const input = available();
  const created = store.addBooking(input);
  expect(created.status).toBe('confirmed');
  expect(created.mode).toBe('instant');
  expect(() => store.addBooking(input)).toThrow('занят');
  expect(() => store.updateStatus(created.id, 'rejected')).toThrow();
  store.updateStatus(created.id, 'cancelled');
  expect(store.addBooking(input).status).toBe('confirmed');
  expect(() => store.updateStatus(created.id, 'confirmed')).toThrow();
});
it('legacy request-mode switches cannot reintroduce manual confirmation', () => {
  store.setMode('request');
  expect(store.get().mode).toBe('instant');
  expect(store.addBooking(available()).status).toBe('confirmed');
  expect(store.addBooking({ ...available(), source: 'admin' }).status).toBe('confirmed');
});
it('instant Telegram bookings preserve the demo identity without persisting extra identity properties', () => {
  const demoIdentity = { provider: 'telegram', mode: 'demo', name: 'Демо-музыкант', username: '@demo_musician' } as const;
  const demo = store.addBooking({ ...available(), demoIdentity });
  expect(demo.status).toBe('confirmed');
  expect(demo.mode).toBe('instant');
  expect(demo.demoIdentity).toEqual(demoIdentity);
  expect(store.get().mode).toBe('instant');
  const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(persisted.bookings.find((item: { id: string }) => item.id === demo.id)).toEqual(demo);
  expect(store.addBooking(available()).status).toBe('confirmed');
  const manual = store.addBooking({ ...available(), source: 'admin', demoIdentity });
  expect(manual.status).toBe('confirmed');
  expect(manual.mode).toBe('instant');
});
it('reset restores seeded bookings and the automatic mode', () => {
  const input = available();
  const created = store.addBooking(input);
  store.updateStatus(created.id, 'cancelled');
  expect(store.addBooking(input).id).not.toBe(created.id);
  store.setMode('instant');
  store.reset();
  expect(store.get()).toEqual(seedState());
});
it('notifies subscribers, has a stable snapshot, and persists state', () => {
  const notify = vi.fn();
  const unsubscribe = store.subscribe(notify);
  expect(store.get()).toBe(store.get());
  store.addBooking(available());
  expect(notify).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(store.get());
  unsubscribe();
  store.setMode('instant');
  expect(notify).toHaveBeenCalledTimes(1);
});
it('checks latest persisted state before a conflicting reservation', () => {
  const input = available();
  const otherTab = { ...store.get(), bookings: [...store.get().bookings, { ...input, id: 'other-tab', status: 'pending', total: 123, mode: 'request' }] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(otherTab));
  expect(() => store.addBooking(input)).toThrow('занят');
});
it('rejects past and out of range slots and blank contact', () => {
  const input = available();
  expect(() => store.addBooking({ ...input, date: '2026-10-29' })).toThrow('недоступно');
  expect(() => store.addBooking({ ...input, date: addDays(today(), 14) })).toThrow('недоступно');
  expect(() => store.addBooking({ ...input, contact: ' ' })).toThrow('контакт');
});
it('failed persistence does not falsely announce successful booking', () => {
  const input = available();
  const snapshot = store.get();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota'); } });
  expect(() => store.addBooking(input)).toThrow('сохранить');
  expect(store.get()).toBe(snapshot);
});
it('receives changes and deletions through storage events from another tab', async () => {
  let onStorage: ((event: { key: string | null; newValue: string | null }) => void) | undefined;
  vi.stubGlobal('window', { addEventListener: (name: string, handler: typeof onStorage) => { if (name === 'storage') onStorage = handler; } });
  vi.resetModules();
  const remoteStore = (await import('./store')).store;
  const notify = vi.fn();
  const unsubscribe = remoteStore.subscribe(notify);
  const remote = { ...seedState(), mode: 'instant' };
  onStorage!({ key: STORAGE_KEY, newValue: JSON.stringify(remote) });
  expect(remoteStore.get().mode).toBe('instant');
  expect(notify).toHaveBeenCalledTimes(1);
  onStorage!({ key: STORAGE_KEY, newValue: null });
  expect(remoteStore.get()).toEqual(seedState());
  expect(notify).toHaveBeenCalledTimes(2);
  unsubscribe();
});
it('migrates stored requests in place without resetting user bookings, equipment or prices', async () => {
  const created = store.addBooking(available());
  const legacy = { ...store.get(), mode: 'request', bookings: store.get().bookings.map(b => b.id === created.id ? {
    ...b, status: 'pending', mode: 'request', total: 4321,
    demoIdentity: { provider: 'telegram', mode: 'demo', name: 'Демо-музыкант', username: '@demo_musician' },
  } : b) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
  vi.resetModules();
  const migrated = (await import('./store')).store.get();
  expect(migrated.mode).toBe('instant');
  expect(migrated.bookings).toHaveLength(legacy.bookings.length);
  expect(migrated.bookings.find(b => b.id === created.id)).toEqual({
    ...legacy.bookings.find(b => b.id === created.id), mode: 'instant', status: 'confirmed',
  });
});
it('equipment edits preserve the agreed room price and include free microphone allowance', () => {
  const created = store.addBooking(available());
  const agreedRoomAmount = created.total - rentalTotal(created.rentals);
  store.updateRentals(created.id, { mic: 4, cymbals: 8, guitar: Infinity });
  const updated = store.get().bookings.find(b => b.id === created.id)!;
  expect(updated.rentals.mic).toBe(4);
  expect(updated.rentals.cymbals).toBe(8);
  expect(updated.rentals.guitar).toBe(0);
  expect(updated.total).toBe(agreedRoomAmount + 1700);
  store.updateRentals(created.id, { mic: 2 });
  expect(store.get().bookings.find(b => b.id === created.id)?.total).toBe(agreedRoomAmount);
});
it('does not reprice an existing room reservation when equipment changes', () => {
  const created = store.addBooking(available());
  const current = store.get();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, bookings: current.bookings.map(b => b.id === created.id ? { ...b, total: 950 } : b) }));
  const previousRoomAmount = 950 - rentalTotal(created.rentals);
  store.updateRentals(created.id, { cymbals: 1 });
  expect(store.get().bookings.find(b => b.id === created.id)?.total).toBe(previousRoomAmount + 200);
});
it('a future site booking can be completed and paid while retaining its schedule and edit protections', () => {
  const created = store.addBooking(available());
  expect(slotStart(created.date, created.slotId).getTime()).toBeGreaterThan(Date.now());
  expect(() => store.markPaid(created.id)).toThrow();
  store.completeBooking(created.id, true);
  const completed = store.get().bookings.find(b => b.id === created.id)!;
  expect(completed.status).toBe('completed');
  expect(completed.completedAt).toBe(new Date().toISOString());
  expect(completed.paidAt).toBe(completed.completedAt);
  expect(completed).toMatchObject({ date: created.date, slotId: created.slotId, source: 'site' });
  expect(completed.total).toBe(created.total);
  expect(isActive(completed)).toBe(true);
  expect(() => store.completeBooking(created.id, true)).toThrow();
  expect(() => store.updateRentals(created.id, {})).toThrow();
  expect(() => store.updateStatus(created.id, 'cancelled')).toThrow();
  expect(() => store.markPaid(created.id)).toThrow();
});
it('future unpaid completion keeps the debt until payment is recorded separately', () => {
  const created = store.addBooking(available());
  store.completeBooking(created.id, false);
  const completed = store.get().bookings.find(b => b.id === created.id)!;
  expect(completed.status).toBe('completed');
  expect(completed.paidAt).toBeUndefined();
  expect(() => store.updateRentals(created.id, {})).toThrow();
  vi.setSystemTime(new Date(Date.now() + 60_000));
  store.markPaid(created.id);
  const paid = store.get().bookings.find(b => b.id === created.id)!;
  expect(paid.paidAt).toBe(new Date().toISOString());
  expect(paid.completedAt).toBe(completed.completedAt);
  expect(paid.total).toBe(created.total);
});
it('elapsed time alone does not complete a reservation or mark a no-show', () => {
  const created = store.addBooking(available());
  expect(() => store.updateStatus(created.id, 'no_show')).toThrow('после начала');
  vi.setSystemTime(new Date(slotStart(created.date, created.slotId).getTime() + 5 * 3_600_000));
  expect(store.get().bookings.find(b => b.id === created.id)?.status).toBe('confirmed');
  store.updateStatus(created.id, 'no_show');
  const missed = store.get().bookings.find(b => b.id === created.id)!;
  expect(missed.status).toBe('no_show');
  expect(missed.paidAt).toBeUndefined();
  expect(isActive(missed)).toBe(true);
  expect(() => store.completeBooking(created.id, true)).toThrow();
  expect(() => store.updateRentals(created.id, {})).toThrow();
});
it('completed unpaid and paid records survive reload with their amounts and equipment intact', async () => {
  const created = store.addBooking(available());
  store.updateRentals(created.id, { mic: 4, cymbals: 1, pedal: 1 });
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, false);
  const completed = store.get().bookings.find(b => b.id === created.id)!;
  vi.resetModules();
  const reloaded = (await import('./store')).store;
  expect(reloaded.get().bookings.find(b => b.id === created.id)).toEqual(completed);
  reloaded.markPaid(created.id);
  const paid = reloaded.get().bookings.find(b => b.id === created.id)!;
  expect(paid.rentals).toEqual(completed.rentals);
  expect(paid.total).toBe(completed.total);
  vi.resetModules();
  expect((await import('./store')).store.get().bookings.find(b => b.id === created.id)).toEqual(paid);
});
it('failed completion persistence leaves the booking and its equipment editable and unpaid', () => {
  const created = store.addBooking(available());
  store.updateRentals(created.id, { cymbals: 1 });
  vi.setSystemTime(slotStart(created.date, created.slotId));
  const snapshot = store.get();
  const persisted = localStorage.getItem(STORAGE_KEY);
  vi.stubGlobal('localStorage', { getItem: () => persisted, setItem: () => { throw new Error('quota'); } });
  expect(() => store.completeBooking(created.id, true)).toThrow('сохранить');
  expect(store.get()).toBe(snapshot);
  const unchanged = store.get().bookings.find(b => b.id === created.id)!;
  expect(unchanged.status).toBe('confirmed');
  expect(unchanged.paidAt).toBeUndefined();
  expect(unchanged.rentals.cymbals).toBe(1);
});
it('stale tabs cannot change equipment after another tab completes the visit', () => {
  const created = store.addBooking(available());
  const current = store.get();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, bookings: current.bookings.map(b => b.id === created.id ? {
    ...b, status: 'completed', completedAt: '2026-10-31T12:00:00Z', paidAt: '2026-10-31T12:00:00Z',
  } : b) }));
  expect(() => store.updateRentals(created.id, { mic: 4 })).toThrow('закрыта');
  expect(() => store.updateStatus(created.id, 'cancelled')).toThrow('закрыта');
});
it('undoing paid completion reopens the visit with its agreed price, equipment and identity intact', () => {
  const demoIdentity = { provider: 'telegram', mode: 'demo', name: 'Демо-музыкант', username: '@demo_musician' } as const;
  const created = store.addBooking({ ...available(), demoIdentity });
  store.updateRentals(created.id, { cymbals: 1, mic: 4 });
  const agreed = store.get().bookings.find(b => b.id === created.id)!;
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, true);
  const completed = store.get().bookings.find(b => b.id === created.id)!;
  expect(completed.paymentOrigin).toBe('completion');
  const expected = undoSnapshot(completed);
  store.undoBookingAction(created.id, expected);
  const reopened = store.get().bookings.find(b => b.id === created.id)!;
  expect(reopened).toMatchObject({ ...agreed, status: 'confirmed' });
  expect(reopened).not.toHaveProperty('completedAt');
  expect(reopened).not.toHaveProperty('paidAt');
  expect(reopened).not.toHaveProperty('paymentOrigin');
  expect(reopened.corrections).toEqual([{ id: expect.any(String), action: 'completion', at: new Date().toISOString() }]);
  expect(isActive(reopened)).toBe(true);
  expect(() => store.undoBookingAction(created.id, expected)).toThrow('изменилась');
  store.updateRentals(created.id, { mic: 2 });
  const edited = store.get().bookings.find(b => b.id === created.id)!;
  expect(edited.total).toBe(agreed.total - rentalTotal(agreed.rentals));
  expect(edited.corrections).toEqual(reopened.corrections);
});
it('undoing unpaid completion removes only the completion state and preserves earlier corrections', () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, false);
  const completed = store.get().bookings.find(b => b.id === created.id)!;
  store.undoBookingAction(created.id, undoSnapshot(completed));
  const reopened = store.get().bookings.find(b => b.id === created.id)!;
  expect(reopened.status).toBe('confirmed');
  expect(reopened).not.toHaveProperty('completedAt');
  expect(reopened).not.toHaveProperty('paidAt');
  expect(reopened.total).toBe(created.total);
  expect(reopened.corrections?.[0].action).toBe('completion');
  expect(reopened.completionPaid).toBe(false);
  vi.setSystemTime(new Date(Date.now() + 1000));
  store.completeBooking(created.id, false);
  store.undoBookingAction(created.id, undoSnapshot(store.get().bookings.find(b => b.id === created.id)!));
  const twiceCorrected = store.get().bookings.find(b => b.id === created.id)!;
  expect(twiceCorrected.corrections).toHaveLength(2);
  expect(twiceCorrected.corrections?.[0]).toEqual(reopened.corrections?.[0]);
  expect(twiceCorrected.corrections?.[1].id).not.toBe(twiceCorrected.corrections?.[0].id);
});
it('late payment also reopens the whole visit and retains the paid checkbox', () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, false);
  store.markPaid(created.id);
  const paid = store.get().bookings.find(b => b.id === created.id)!;
  expect(bookingUndoAction(paid)).toBe('completion');
  expect(() => store.undoBookingAction(created.id, { ...undoSnapshot(paid), action: 'payment' })).toThrow();
  store.undoBookingAction(created.id, undoSnapshot(paid));
  const reopened = store.get().bookings.find(b => b.id === created.id)!;
  expect(reopened.status).toBe('confirmed');
  expect(reopened.completionPaid).toBe(true);
  expect(reopened).not.toHaveProperty('paidAt');
  expect(reopened).not.toHaveProperty('completedAt');
  expect(reopened.total).toBe(paid.total);
  expect(reopened.rentals).toEqual(paid.rentals);
});
it('stale undo confirmations cannot undo a later completion, payment or different action', () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, false);
  const first = undoSnapshot(store.get().bookings.find(b => b.id === created.id)!);
  store.undoBookingAction(created.id, first);
  vi.setSystemTime(new Date(Date.now() + 1000));
  store.completeBooking(created.id, false);
  expect(() => store.undoBookingAction(created.id, first)).toThrow('изменилась');
  const latest = store.get().bookings.find(b => b.id === created.id)!;
  expect(() => store.undoBookingAction(created.id, { ...undoSnapshot(latest), action: 'paid_completion' })).toThrow('изменилась');
  store.markPaid(created.id);
  expect(() => store.undoBookingAction(created.id, undoSnapshot(latest))).toThrow('изменилась');
  const paid = undoSnapshot(store.get().bookings.find(b => b.id === created.id)!);
  store.undoBookingAction(created.id, paid);
  vi.setSystemTime(new Date(Date.now() + 1000));
  store.completeBooking(created.id, true);
  expect(() => store.undoBookingAction(created.id, paid)).toThrow('изменилась');
});
it('cancellations and no-shows cannot be restored using undo of completion', () => {
  const cancelled = store.addBooking(available());
  store.updateStatus(cancelled.id, 'cancelled');
  expect(() => store.undoBookingAction(cancelled.id, { action: 'completion' })).toThrow('изменилась');
  const missed = store.addBooking(available());
  vi.setSystemTime(slotStart(missed.date, missed.slotId));
  store.updateStatus(missed.id, 'no_show');
  expect(() => store.undoBookingAction(missed.id, { action: 'completion' })).toThrow('изменилась');
  expect(() => store.undoBookingAction('missing-id', { action: 'completion' })).toThrow('не существует');
});
it('legacy and explicit payment origins retain their undo meaning after reload', async () => {
  const created = store.addBooking(available());
  const timestamp = slotStart(created.date, created.slotId).toISOString();
  for (const variant of [
    { paidAt: timestamp, expected: 'completion' },
    { paidAt: '2026-10-31T23:00:00Z', expected: 'completion' },
    { paidAt: timestamp, paymentOrigin: 'later', expected: 'completion' },
    { paidAt: timestamp, paymentOrigin: 'completion', expected: 'completion' },
  ] as const) {
    const { expected, ...payment } = variant;
    const completed = { ...created, ...payment, status: 'completed', completedAt: timestamp };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'instant', bookings: [completed] }));
    vi.resetModules();
    const reloaded = (await import('./store')).store;
    const record = reloaded.get().bookings[0];
    expect(record).toEqual(completed);
    expect(bookingUndoAction(record)).toBe(expected);
    reloaded.undoBookingAction(created.id, undoSnapshot(record));
    vi.resetModules();
    const corrected = (await import('./store')).store.get().bookings[0];
    expect(corrected.total).toBe(created.total);
    expect(corrected.rentals).toEqual(created.rentals);
    expect(corrected.corrections?.[0].action).toBe(expected);
  }
});
it('invalid origin and correction metadata are not accepted as persisted bookings', async () => {
  const created = store.addBooking(available());
  for (const invalid of [ { paymentOrigin: 'unknown' }, { corrections: {} }, { corrections: [{ id: 'a', action: 'unknown', at: new Date().toISOString() }] }, { corrections: [{ id: 'a', action: 'payment', at: 'invalid' }] } ]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'instant', bookings: [{ ...created, ...invalid }] }));
    vi.resetModules();
    expect((await import('./store')).store.get()).toEqual(seedState());
  }
});
it('failed undo persistence is atomic and leaves the paid visit and audit trail unchanged', () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, true);
  const snapshot = store.get();
  const expected = undoSnapshot(snapshot.bookings.find(b => b.id === created.id)!);
  const persisted = localStorage.getItem(STORAGE_KEY);
  const notify = vi.fn();
  const unsubscribe = store.subscribe(notify);
  vi.stubGlobal('localStorage', { getItem: () => persisted, setItem: () => { throw new Error('quota'); } });
  expect(() => store.undoBookingAction(created.id, expected)).toThrow('сохранить');
  expect(store.get()).toBe(snapshot);
  expect(notify).not.toHaveBeenCalled();
  unsubscribe();
});
it('undo checks the persisted record when another tab changes payment before storage notification arrives', () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, false);
  const stale = store.get().bookings.find(b => b.id === created.id)!;
  const current = store.get();
  const paid = { ...stale, paidAt: new Date().toISOString(), paymentOrigin: 'later' };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, bookings: current.bookings.map(b => b.id === created.id ? paid : b) }));
  expect(() => store.undoBookingAction(created.id, undoSnapshot(stale))).toThrow('изменилась');
  const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(persisted.bookings.find((b: Booking) => b.id === created.id)).toEqual(paid);
});
it('corrected bookings and their audit entries synchronize through storage events', async () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.completeBooking(created.id, true);
  let onStorage: ((event: { key: string | null; newValue: string | null }) => void) | undefined;
  vi.stubGlobal('window', { addEventListener: (name: string, handler: typeof onStorage) => { if (name === 'storage') onStorage = handler; } });
  vi.resetModules();
  const remoteStore = (await import('./store')).store;
  const notify = vi.fn();
  const unsubscribe = remoteStore.subscribe(notify);
  const record = store.get().bookings.find(b => b.id === created.id)!;
  store.undoBookingAction(created.id, undoSnapshot(record));
  onStorage!({ key: STORAGE_KEY, newValue: localStorage.getItem(STORAGE_KEY) });
  expect(remoteStore.get()).toEqual(store.get());
  expect(notify).toHaveBeenCalledTimes(1);
  expect(remoteStore.get().bookings.find(b => b.id === created.id)?.corrections?.[0].action).toBe('completion');
  unsubscribe();
});

it('no-show stays occupied, restores safely and rejects a stale second correction', () => {
  const created = store.addBooking(available());
  vi.setSystemTime(slotStart(created.date, created.slotId));
  store.updateStatus(created.id, 'no_show');
  const missed = store.get().bookings.find(b => b.id === created.id)!;
  expect(isActive(missed)).toBe(true);
  const snapshot = { action: 'no_show' as const, noShowAt: missed.noShowAt };
  store.undoBookingAction(created.id, snapshot);
  expect(store.get().bookings.find(b => b.id === created.id)).toMatchObject({ status: 'confirmed', total: created.total });
  vi.setSystemTime(new Date(Date.now() + 1000));
  store.updateStatus(created.id, 'no_show');
  expect(() => store.undoBookingAction(created.id, snapshot)).toThrow();
});

it('catalog changes preserve issued prices while new issues use the current catalog', async () => {
  const { bookingRentalTotal } = await import('./domain');
  const original = equipmentCatalog.get().find(item => item.id === 'crash-extra')!;
  const created = store.addBooking({ ...available(), rentals: { 'crash-extra': 1 } });
  const roomTotal = created.total - original.price;
  try {
    equipmentCatalog.save({ ...original, price: 777, visible: false });
    store.updateRentals(created.id, { 'crash-extra': 1, mic: 3 });
    const unchanged = store.get().bookings.find(b => b.id === created.id)!;
    expect(unchanged.total).toBe(roomTotal + original.price + 50);
    expect(bookingRentalTotal(unchanged)).toBe(original.price + 50);
    store.updateRentals(created.id, {});
    store.updateRentals(created.id, { 'crash-extra': 1 });
    expect(store.get().bookings.find(b => b.id === created.id)!.total).toBe(roomTotal + 777);
    equipmentCatalog.save({ id: 'custom-test', name: 'Test instrument', category: 'Гитары', price: 123, quantity: 1, visible: false });
    store.updateRentals(created.id, { 'custom-test': 1 });
    const custom = store.get().bookings.find(b => b.id === created.id)!;
    expect(custom.total).toBe(roomTotal + 123);
    expect(custom.rentalSnapshot?.['custom-test'].name).toBe('Test instrument');
  } finally { equipmentCatalog.save(original); }
});


it('allows administrator bookings one year ahead while retaining the client horizon', () => {
  const input = { ...available(), date: '2027-10-30', source: 'admin' as const };
  expect(store.addBooking(input).date).toBe('2027-10-30');
  expect(() => store.addBooking({ ...input, date: '2027-10-31' })).toThrow();
  expect(() => store.addBooking({ ...input, date: '2027-10-29', source: 'site' })).toThrow();
});
