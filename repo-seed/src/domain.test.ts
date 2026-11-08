import { describe, expect, it } from 'vitest';
import { defaultPricing } from './pricing';
import { addDays, adminBookingEnd, base, bookingTimePhase, bookingUndoAction, cancellationFee, createIcs, isActive, normalizeRentals, newBookingDefaults, price, rentalTotal, slotEnd, today, type Booking } from './domain';

const booking: Booking = { id: 'test', roomId: 1, date: '2026-11-02', slotId: 's1', band: 'Тест, группа', channel: 'Telegram', contact: '@test', rentals: {}, total: 1100, status: 'pending', createdAt: '2026-10-30T09:00:00Z', source: 'site', mode: 'request' };
it('uses a third named tariff for the assigned weekday and slot', () => {
  const config = defaultPricing();
  config.tariffs.push({ id: 'special', name: 'Особый', color: 2 });
  config.assignment['s2:0'] = 'special';
  const room = { prices: { ...base.rooms[0].prices, special: 1550 } };
  expect(price(room, '2026-11-02', 's2', config)).toBe(1550);
  expect(price(room, '2026-11-03', 's2', config)).toBe(room.prices.day);
  expect(price({ prices: {} }, '2026-11-02', 's2', config)).toBeNull();
});
describe('tariffs from base.json', () => {
  for (const room of base.rooms) {
    it(`${room.name}: all weekday daytime slots`, () => {
      for (const slot of ['s1', 's2', 's3']) expect(price(room, '2026-11-02', slot)).toBe(room.prices.day);
    });
    it(`${room.name}: weekday evening`, () => expect(price(room, '2026-11-02', 's4')).toBe(room.prices.peak));
    it(`${room.name}: every Saturday and Sunday slot`, () => {
      for (const date of ['2026-10-31', '2026-11-01']) for (const slot of base.schedule.slots) expect(price(room, date, slot.id)).toBe(room.prices.peak);
    });
  }
});
it('rental total includes free microphones and paid extras', () => {
  expect(rentalTotal({ mic: 0 })).toBe(0);
  expect(rentalTotal({ mic: 1 })).toBe(0);
  expect(rentalTotal({ mic: 2 })).toBe(0);
  expect(rentalTotal({ mic: 4, cymbals: 1, 'double-pedal': 1, pedal: 1 })).toBe(400);
  expect(rentalTotal({ mic: -1, cymbals: 2, invented: 3 })).toBe(200);
});
it('cancellation boundary and uncertain room 7 fee', () => {
  expect(cancellationFee(booking, new Date('2026-10-31T08:00:00Z'))).toBe(0);
  expect(cancellationFee(booking, new Date('2026-10-31T08:00:01Z'))).toBe(700);
  expect(cancellationFee({ ...booking, slotId: 's4' }, new Date('2026-11-02T08:00:00Z'))).toBe(1000);
  expect(cancellationFee({ ...booking, roomId: 7 }, new Date('2026-11-02T08:00:00Z'))).toBeNull();
});
it('uses the venue timezone and supports month boundaries', () => {
  expect(today(new Date('2026-10-30T22:30:00Z'))).toBe('2026-10-31');
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
});
it('calendar uses UTC event times, escaping, and tentative status', () => {
  const ics = createIcs(booking);
  expect(ics).toContain('DTSTART:20261102T080000Z');
  expect(ics).toContain('DTEND:20261102T110000Z');
  expect(ics).toContain('STATUS:TENTATIVE');
  expect(ics.replace(/\r\n /g, '')).toContain('Тест\\, группа');
  for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
});
it('schedule phases follow Moscow boundaries without changing attendance status', () => {
  expect(bookingTimePhase(booking, new Date('2026-11-02T07:59:59Z'))).toBe('upcoming');
  expect(bookingTimePhase(booking, new Date('2026-11-02T08:00:00Z'))).toBe('current');
  expect(bookingTimePhase(booking, new Date('2026-11-02T10:59:59Z'))).toBe('current');
  expect(bookingTimePhase(booking, new Date('2026-11-02T11:00:00Z'))).toBe('ended');
  expect(slotEnd(booking.date, booking.slotId).toISOString()).toBe('2026-11-02T11:00:00.000Z');
  expect(booking.status).toBe('pending');
});
it('completed visits continue occupying their historical slot, cancellations and no-shows do not', () => {
  expect(isActive({ ...booking, status: 'completed' })).toBe(true);
  expect(isActive({ ...booking, status: 'cancelled' })).toBe(false);
  expect(isActive({ ...booking, status: 'no_show' })).toBe(true);
  expect(createIcs({ ...booking, status: 'completed' })).toContain('STATUS:CONFIRMED');
});
it('equipment quantities are finite nonnegative integers and single items cannot multiply', () => {
  const rentals = normalizeRentals({ mic: 4.9, cymbals: 10, china: -2, guitar: Infinity, invented: 100 });
  expect(rentals.mic).toBe(4);
  expect(rentals.cymbals).toBe(1);
  expect(rentals.china).toBe(0);
  expect(rentals.guitar).toBe(0);
  expect(rentals.invented).toBeUndefined();
  expect(rentalTotal({ mic: NaN, cymbals: Infinity })).toBe(0);
});
it('undo follows the recorded payment action even when separate operations share a timestamp', () => {
  const completed = { ...booking, status: 'completed' as const, completedAt: '2026-11-02T11:00:00Z', paidAt: '2026-11-02T11:00:00Z' };
  expect(bookingUndoAction({ ...completed, paymentOrigin: 'completion' })).toBe('completion');
  expect(bookingUndoAction({ ...completed, paymentOrigin: 'later' })).toBe('completion');
  expect(bookingUndoAction({ ...completed, paidAt: undefined })).toBe('completion');
  expect(bookingUndoAction({ ...completed, status: 'confirmed' })).toBeNull();
  expect(bookingUndoAction({ ...completed, status: 'cancelled' })).toBeNull();
  expect(bookingUndoAction({ ...completed, status: 'no_show' })).toBe('no_show');
});
it('legacy completed visits infer the most recent action only when origin metadata is missing', () => {
  const completed = { ...booking, status: 'completed' as const, completedAt: '2026-11-02T11:00:00Z', paidAt: '2026-11-02T11:00:00Z' };
  expect(bookingUndoAction(completed)).toBe('completion');
  expect(bookingUndoAction({ ...completed, paidAt: '2026-11-02T11:01:00Z' })).toBe('completion');
  expect(bookingUndoAction({ ...completed, paidAt: '2026-11-02T11:01:00Z', paymentOrigin: 'completion' })).toBe('completion');
});

it('defaults new bookings to today and the nearest future free slot', () => {
  const now = new Date('2026-11-03T12:30:00+03:00');
  expect(newBookingDefaults([], now)).toEqual({ date: '2026-11-03', roomId: 1, slotId: '' });
  const occupied = base.rooms.map(room => ({ ...booking, roomId: room.id, date: '2026-11-03', slotId: 's2', status: 'confirmed' as const }));
  expect(newBookingDefaults(occupied, now).slotId).toBe('');
  expect(newBookingDefaults(occupied.slice(0, 1), now).roomId).toBe(2);
});
it('keeps the form usable with today selected after closing or when fully booked', () => {
  expect(newBookingDefaults([], new Date('2026-11-03T23:30:00+03:00'))).toEqual({ date: '2026-11-04', roomId: 1, slotId: '' });
  const full = base.rooms.flatMap(room => base.schedule.slots.map(slot => ({ ...booking, roomId: room.id, date: '2026-11-03', slotId: slot.id, status: 'confirmed' as const })));
  expect(newBookingDefaults(full, new Date('2026-11-03T10:00:00+03:00'))).toEqual({ date: '2026-11-04', roomId: 1, slotId: '' });
});

it('uses a calendar year for the administrator booking horizon', () => {
  expect(adminBookingEnd('2026-11-03')).toBe('2027-11-03');
  expect(adminBookingEnd('2024-02-29')).toBe('2025-02-28');
});
