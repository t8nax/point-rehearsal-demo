import data from '../data/base.json';
import { halls } from './halls';
import { pricing, type PricingConfig } from './pricing';

export const base = data;
export type Room = import('./halls').Hall;
export type SlotId = string;
export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed' | 'no_show';
export type BookingMode = 'request' | 'instant';
export type BookingUndoAction = 'paid_completion' | 'completion' | 'payment' | 'no_show';
export interface BookingCorrection { id: string; action: BookingUndoAction; at: string }
export interface DemoIdentity {
  provider: 'telegram'; mode: 'demo'; name: string; username: string;
}
export interface RentalSnapshot { name: string; price: number; perUnit?: boolean; freeQty?: number }
export interface Booking {
  id: string; roomId: number; date: string; slotId: SlotId; band: string;
  channel: string; contact: string; rentals: Record<string, number>; total: number;
  status: BookingStatus; createdAt: string; source: 'seed' | 'site' | 'admin'; mode: BookingMode;
  roomName?: string;
  rentalSnapshot?: Record<string, RentalSnapshot>;
  demoIdentity?: DemoIdentity;
  completionPaid?: boolean;
  noShowAt?: string;
  completedAt?: string;
  paidAt?: string;
  paymentOrigin?: 'completion' | 'later';
  corrections?: BookingCorrection[];
}
export const statusLabels: Record<BookingStatus, string> = {
  pending: 'Ожидает подтверждения', confirmed: 'Забронирована', rejected: 'Отклонена', cancelled: 'Отменена',
  completed: 'Завершена', no_show: 'Неявка',
};
export function bookingUndoAction(booking: Pick<Booking, 'status' | 'completedAt' | 'paidAt' | 'paymentOrigin'>): BookingUndoAction | null {
  return booking.status === 'completed' ? 'completion' : booking.status === 'no_show' ? 'no_show' : null;
}
export function today(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' }).format(new Date(`${date}T12:00:00Z`));
}
export function isWeekdayDay(date: string, slotId: SlotId): boolean {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5 && ['s1', 's2', 's3'].includes(slotId);
}
export function price(room: { prices: Record<string, number | null> }, date: string, slotId: SlotId, config: PricingConfig = pricing.get()): number | null {
  const day = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return room.prices[config.assignment[`${slotId}:${day}`]] ?? null;
}
function rentalQuantity(value: number | undefined): number {
  return typeof value === 'number' && Number.isSafeInteger(Math.floor(value)) ? Math.max(0, Math.floor(value)) : 0;
}
export function rentalTotal(rentals: Record<string, number>): number {
  return base.rentals.reduce((total, item) => {
    const qty = rentalQuantity(rentals[item.id]);
    return total + (item.perUnit ? Math.max(0, qty - (item.freeQty || 0)) : Math.min(1, qty)) * item.price;
  }, 0);
}
export function bookingRentalTotal(booking: Pick<Booking, 'rentals' | 'rentalSnapshot'>): number {
  return Object.entries(booking.rentals).reduce((sum, [id, value]) => {
    const item = booking.rentalSnapshot?.[id] || base.rentals.find(item => item.id === id);
    if (!item) return sum;
    const qty = rentalQuantity(value);
    return sum + (item.perUnit ? Math.max(0, qty - (item.freeQty || 0)) : Math.min(1, qty)) * item.price;
  }, 0);
}
export function normalizeRentals(rentals: Record<string, number>): Record<string, number> {
  return Object.fromEntries(base.rentals.map(item => {
    const qty = rentalQuantity(rentals[item.id]);
    return [item.id, item.perUnit ? qty : Math.min(1, qty)];
  }));
}
export function slotStart(date: string, slotId: SlotId): Date {
  const slot = base.schedule.slots.find(item => item.id === slotId);
  if (!slot) throw new Error('Неизвестное время репетиции');
  return new Date(`${date}T${slot.start}:00+03:00`);
}
export function isPastSlot(date: string, slotId: SlotId, now = new Date()): boolean {
  return slotStart(date, slotId).getTime() <= now.getTime();
}
export function slotEnd(date: string, slotId: SlotId): Date {
  const slot = base.schedule.slots.find(item => item.id === slotId);
  if (!slot) throw new Error('Неизвестное время репетиции');
  return new Date(`${date}T${slot.end}:00+03:00`);
}
// Schedule position is not evidence of attendance or payment.
export function bookingTimePhase(booking: Pick<Booking, 'date' | 'slotId'>, now = new Date()): 'upcoming' | 'current' | 'ended' {
  if (now.getTime() < slotStart(booking.date, booking.slotId).getTime()) return 'upcoming';
  return now.getTime() < slotEnd(booking.date, booking.slotId).getTime() ? 'current' : 'ended';
}
export function isActive(booking: Booking): boolean {
  return booking.status === 'pending' || booking.status === 'confirmed' || booking.status === 'completed' || booking.status === 'no_show';
}
export function cancellationFee(booking: Booking, now = new Date()): number | null {
  const hours = (slotStart(booking.date, booking.slotId).getTime() - now.getTime()) / 3_600_000;
  if (hours >= base.rules.cancellation.minHoursBefore) return 0;
  if (booking.roomId === 7) return null;
  return base.rules.cancellation.fee[isWeekdayDay(booking.date, booking.slotId) ? 'weekdayDay' : 'default'];
}
function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function icsDate(value: Date): string { return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
export function createIcs(booking: Booking): string {
  const slot = base.schedule.slots.find(item => item.id === booking.slotId)!;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Point Demo//Booking//RU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${booking.id}@point-demo.local`, `DTSTAMP:${icsDate(new Date(booking.createdAt))}`,
    `DTSTART:${icsDate(slotStart(booking.date, booking.slotId))}`, `DTEND:${icsDate(new Date(`${booking.date}T${slot.end}:00+03:00`))}`,
    `SUMMARY:${icsEscape(`Демо · ${base.base.name} · Зал ${booking.roomId} · ${booking.band}`)}`,
    `LOCATION:${icsEscape(base.base.address)}`, `DESCRIPTION:${icsEscape(`Демо-концепт. Бронь не настоящая. ${statusLabels[booking.status]}`)}`,
    `STATUS:${booking.status === 'confirmed' || booking.status === 'completed' ? 'CONFIRMED' : booking.status === 'pending' ? 'TENTATIVE' : 'CANCELLED'}`,
    'END:VEVENT', 'END:VCALENDAR'];
  // Fold by UTF-8 octets as required by RFC 5545, without splitting characters.
  return lines.map(line => {
    let result = ''; let width = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (width + size > 75) { result += '\r\n '; width = 1; }
      result += char; width += size;
    }
    return result;
  }).join('\r\n') + '\r\n';
}

export function adminBookingEnd(date = today()): string {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
export function newBookingDefaults(bookings: Booking[], now = new Date()) {
  const start = today(now), end = adminBookingEnd(start);
  for (let date = start; date <= end; date = addDays(date, 1)) {
    for (const slot of base.schedule.slots) {
      if (isPastSlot(date, slot.id, now)) continue;
      const room = halls.get().find(room => !bookings.some(booking => isActive(booking) && booking.date === date && booking.roomId === room.id && booking.slotId === slot.id));
      if (room) return { date, roomId: room.id, slotId: '' };
    }
  }
  return { date: start, roomId: halls.get()[0]?.id ?? 0, slotId: '' };
}
