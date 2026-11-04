import { addDays, adminBookingEnd, base, bookingRentalTotal, bookingUndoAction, isActive, isPastSlot, price, rentalTotal, today, type Booking, type BookingMode, type BookingStatus, type BookingUndoAction } from './domain';



import { equipmentCatalog } from './equipment-catalog';

export const STORAGE_KEY = 'point-of-count-demo-v1';

export interface DemoState { bookings: Booking[]; mode: BookingMode }

export type BookingInput = Omit<Booking, 'id' | 'total' | 'status' | 'createdAt' | 'mode' | 'paidAt' | 'completedAt' | 'paymentOrigin' | 'corrections' | 'completionPaid' | 'noShowAt' | 'rentalSnapshot'>;



function hash(value: string): number {

  let result = 2166136261;

  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);

  // Avalanche the final bits so neighbouring room/slot IDs are independent.

  result = Math.imul(result ^ (result >>> 16), 0x85ebca6b);

  result = Math.imul(result ^ (result >>> 13), 0xc2b2ae35);

  result ^= result >>> 16;

  return (result >>> 0) / 4294967296;

}

export function seedState(start = today()): DemoState {

  const names = ['Северный ветер', 'Тихий час', 'Бетон', 'Пятый такт', 'Дальний свет', 'Пауза'];

  const bookings: Booking[] = [];

  for (let day = 0; day < 14; day++) {

    const date = addDays(start, day);

    const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());

    const candidates: { booking: Booking; score: number }[] = [];

    for (const room of base.rooms) for (const slot of base.schedule.slots) {

      const id = `seed-${date}-${room.id}-${slot.id}`;

      const random = hash(`${start}/${id}`);

      candidates.push({ score: random + (slot.id === 's4' ? 0.35 : 0), booking: {

        id, roomId: room.id, date, slotId: slot.id, band: names[Math.floor(hash(id) * names.length)],

        channel: 'Telegram', contact: '@demo_group', rentals: {}, total: price(room, date, slot.id),

        status: 'confirmed', createdAt: `${start}T08:00:00+03:00`, source: 'seed', mode: 'instant',

      }});

    }

    // Keep every day useful for the demo: 46% on weekdays, 57% on weekends,

    // with at least one free slot in each room and busier evenings.

    const target = weekend ? 16 : 13;

    const roomCounts = new Map<number, number>();

    let selected = 0;

    for (const { booking } of candidates.sort((a, b) => b.score - a.score)) {

      const count = roomCounts.get(booking.roomId) || 0;

      if (count >= base.schedule.slots.length - 1) continue;

      bookings.push(booking);

      roomCounts.set(booking.roomId, count + 1);

      if (++selected === target) break;

    }

  }

  bookings.sort((a, b) => `${a.date}${a.slotId}`.localeCompare(`${b.date}${b.slotId}`));

  return { bookings, mode: 'instant' };

}

function issueRentals(rentals: Record<string, number>, previous?: Booking) {
  const normalized: Record<string, number> = {};
  const rentalSnapshot: NonNullable<Booking['rentalSnapshot']> = {};
  for (const item of equipmentCatalog.get()) {
    const value = rentals[item.id];
    const qty = Number.isSafeInteger(Math.floor(value)) ? Math.max(0, Math.floor(value)) : 0;
    normalized[item.id] = qty;
    if (!normalized[item.id]) continue;
    const old = previous?.rentals[item.id] ? previous.rentalSnapshot?.[item.id] || base.rentals.find(r => r.id === item.id) : undefined;
    const source = old || item;
    normalized[item.id] = source.perUnit ? qty : Math.min(1, qty);
    rentalSnapshot[item.id] = { name: source.name, price: source.price, ...(source.perUnit === undefined ? {} : { perUnit: source.perUnit }), ...(source.freeQty === undefined ? {} : { freeQty: source.freeQty }) };
  }
  return { rentals: normalized, rentalSnapshot };
}
function decode(raw: string | null): DemoState | null {

  if (!raw) return null;

  try {

    const parsed = JSON.parse(raw) as DemoState;

    if (!['request', 'instant'].includes(parsed.mode) || !Array.isArray(parsed.bookings)) return null;

    if (!parsed.bookings.every(b => typeof b.id === 'string' && typeof b.band === 'string' && typeof b.contact === 'string' &&

      typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && base.rooms.some(r => r.id === b.roomId) &&

      base.schedule.slots.some(s => s.id === b.slotId) && ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'no_show'].includes(b.status) &&

      ['request', 'instant'].includes(b.mode) && b.rentals && typeof b.rentals === 'object' && Number.isFinite(b.total) &&

      (b.rentalSnapshot === undefined || b.rentalSnapshot && typeof b.rentalSnapshot === 'object' && Object.values(b.rentalSnapshot).every(r => r && typeof r.name === 'string' && Number.isFinite(r.price) && r.price >= 0 && (r.perUnit === undefined || typeof r.perUnit === 'boolean') && (r.freeQty === undefined || Number.isSafeInteger(r.freeQty) && r.freeQty >= 0))) &&
      (b.paidAt === undefined || typeof b.paidAt === 'string' && Number.isFinite(Date.parse(b.paidAt))) &&

      (b.completedAt === undefined || typeof b.completedAt === 'string' && Number.isFinite(Date.parse(b.completedAt))) &&

      (b.completionPaid === undefined || typeof b.completionPaid === 'boolean') &&

      (b.noShowAt === undefined || typeof b.noShowAt === 'string' && Number.isFinite(Date.parse(b.noShowAt))) &&

      (b.paymentOrigin === undefined || b.paymentOrigin === 'completion' || b.paymentOrigin === 'later') &&

      (b.corrections === undefined || Array.isArray(b.corrections) && b.corrections.every(c => c && typeof c.id === 'string' &&

        ['paid_completion', 'completion', 'payment', 'no_show'].includes(c.action) && typeof c.at === 'string' && Number.isFinite(Date.parse(c.at)))))) return null;

    // Preserve existing records, totals, identities and equipment when retiring manual approval.

    return { ...parsed, mode: 'instant', bookings: parsed.bookings.map(b => ({ ...b, mode: 'instant', status: b.status === 'pending' ? 'confirmed' : b.status })) };

  } catch { return null; }

}

function read(): DemoState | null {

  try { return typeof localStorage === 'undefined' ? null : decode(localStorage.getItem(STORAGE_KEY)); } catch { return null; }

}

let state = read() || seedState();

const listeners = new Set<() => void>();

function emit(): void { listeners.forEach(listener => listener()); }

function commit(next: DemoState): void {

  if (typeof localStorage !== 'undefined') {

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }

    catch { throw new Error('Не удалось сохранить бронь. Разрешите хранение данных в браузере и попробуйте снова.'); }

  }

  state = next; emit();

}

function findBooking(current: DemoState, id: string): Booking {

  const booking = current.bookings.find(item => item.id === id);

  if (!booking) throw new Error('Бронь больше не существует');

  return booking;

}

function requireOpen(booking: Booking): void {

  if (booking.status !== 'confirmed' || booking.paidAt) throw new Error('Эта запись уже закрыта или оплачена');

}

function replaceBooking(current: DemoState, booking: Booking): void {

  commit({ ...current, bookings: current.bookings.map(item => item.id === booking.id ? booking : item) });

}

if (typeof window !== 'undefined') window.addEventListener('storage', event => {

  if (event.key === STORAGE_KEY || event.key === null) {

    state = decode(event.newValue) || seedState(); emit();

  }

});

export const store = {

  get: (): DemoState => state,

  subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },

  addBooking(input: BookingInput): Booking {

    const current = read() || state;

    const room = base.rooms.find(item => item.id === input.roomId);

    if (!room || !base.schedule.slots.some(item => item.id === input.slotId)) throw new Error('Выберите зал и время');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < today() || input.date > (input.source === 'admin' ? adminBookingEnd() : addDays(today(), 13)) || isPastSlot(input.date, input.slotId)) throw new Error('Это время уже недоступно. Выберите другой слот');

    if (!input.band.trim() || !input.contact.trim()) throw new Error('Укажите имя или название группы и контакт');

    if (current.bookings.some(item => isActive(item) && item.roomId === input.roomId && item.date === input.date && item.slotId === input.slotId)) throw new Error('Этот слот уже занят. Выберите другое время');

    const issued = issueRentals(input.rentals);
    const rentals = issued.rentals;

    const booking: Booking = { roomId: input.roomId, date: input.date, slotId: input.slotId,

      source: input.source, channel: input.channel, rentals, rentalSnapshot: issued.rentalSnapshot, band: input.band.trim(), contact: input.contact.trim(),

      ...(input.demoIdentity ? { demoIdentity: {

        provider: input.demoIdentity.provider, mode: input.demoIdentity.mode,

        name: input.demoIdentity.name, username: input.demoIdentity.username,

      } } : {}),

      id: crypto.randomUUID(), total: price(room, input.date, input.slotId) + bookingRentalTotal(issued),

      status: 'confirmed', createdAt: new Date().toISOString(), mode: 'instant' };

    commit({ ...current, bookings: [...current.bookings, booking] });

    return booking;

  },

  updateStatus(id: string, status: BookingStatus): void {

    const current = read() || state;

    const booking = findBooking(current, id);

    requireOpen(booking);

    if (status !== 'cancelled' && status !== 'no_show') throw new Error('Этот статус больше нельзя изменить');

    if (status === 'no_show' && !isPastSlot(booking.date, booking.slotId)) throw new Error('Неявку можно отметить только после начала записи');

    replaceBooking(current, { ...booking, status, ...(status === 'no_show' ? { noShowAt: new Date().toISOString() } : {}) });

  },

  updateRentals(id: string, rentals: Record<string, number>): void {

    const current = read() || state;

    const booking = findBooking(current, id);

    requireOpen(booking);

    const issued = issueRentals(rentals, booking);

    const roomAmount = booking.total - bookingRentalTotal(booking);

    replaceBooking(current, { ...booking, ...issued, total: roomAmount + bookingRentalTotal(issued) });

  },

  completeBooking(id: string, paid: boolean): void {

    const current = read() || state;

    const booking = findBooking(current, id);

    requireOpen(booking);

    if (!isPastSlot(booking.date, booking.slotId)) throw new Error('Завершить репетицию можно только после начала записи');

    const timestamp = new Date().toISOString();

    const completed: Booking = { ...booking, status: 'completed', completedAt: timestamp };

    if (paid) { completed.paidAt = timestamp; completed.paymentOrigin = 'completion'; }

    else { delete completed.paidAt; delete completed.paymentOrigin; }

    replaceBooking(current, completed);

  },

  markPaid(id: string): void {

    const current = read() || state;

    const booking = findBooking(current, id);

    if (booking.status !== 'completed' || booking.paidAt) throw new Error('Оплату этой записи больше нельзя изменить');

    replaceBooking(current, { ...booking, paidAt: new Date().toISOString(), paymentOrigin: 'later' });

  },

  undoBookingAction(id: string, expected: { action: BookingUndoAction; completedAt?: string; paidAt?: string; noShowAt?: string }): void {

    const current = read() || state;

    const booking = findBooking(current, id);

    const action = bookingUndoAction(booking);

    if (!action || action !== expected.action || booking.completedAt !== expected.completedAt || booking.paidAt !== expected.paidAt || booking.noShowAt !== expected.noShowAt) {

      throw new Error('Запись изменилась. Откройте действие заново и проверьте данные.');

    }

    const corrected: Booking = { ...booking, corrections: [...(booking.corrections || []), {

      id: crypto.randomUUID(), action, at: new Date().toISOString(),

    }] };

    if (current.bookings.some(other => other.id !== id && isActive(other) && other.roomId === booking.roomId && other.date === booking.date && other.slotId === booking.slotId)) throw new Error('Этот слот уже занят другой записью');

    if (action === 'completion') corrected.completionPaid = Boolean(booking.paidAt);

    corrected.status = 'confirmed';

    delete corrected.completedAt;

    delete corrected.noShowAt;

    delete corrected.paidAt;

    delete corrected.paymentOrigin;

    replaceBooking(current, corrected);

  },

  setMode(mode: BookingMode): void {

    if (mode !== 'request' && mode !== 'instant') throw new Error('Неизвестный режим записи');

    commit({ ...(read() || state), mode: 'instant' });

  },

  reset(): void { commit(seedState()); },

};



