import base from '../data/base.json';
import { localStore } from './local-store';

export interface Tariff { id: string; name: string; color: number }
export interface PricingConfig { tariffs: Tariff[]; assignment: Record<string, string> }
export const PRICING_STORAGE_KEY = 'point-pricing-v1';
export const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export function defaultPricing(): PricingConfig {
  return { tariffs: [{ id: 'day', name: 'Дневной', color: 0 }, { id: 'peak', name: 'Пиковый', color: 1 }],
    assignment: Object.fromEntries(base.schedule.slots.flatMap((s, i) => weekDays.map((_, d) => [`${s.id}:${d}`, i < 3 && d < 5 ? 'day' : 'peak']))) };
}
export function decodePricing(raw: string | null): PricingConfig | null {
  try {
    const p: PricingConfig = JSON.parse(raw || 'null');
    if (!p || !Array.isArray(p.tariffs) || !p.tariffs.length || p.tariffs.length > 5 || new Set(p.tariffs.map(t => t.id)).size !== p.tariffs.length ||
      !p.tariffs.every(t => t && typeof t.id === 'string' && /^[\w-]{1,100}$/.test(t.id) && typeof t.name === 'string' && !!t.name.trim() && t.name.length <= 80 && Number.isInteger(t.color) && t.color >= 0 && t.color < 5) ||
      !p.assignment || Object.keys(p.assignment).length !== 28 || !Object.keys(defaultPricing().assignment).every(k => p.tariffs.some(t => t.id === p.assignment[k]))) return null;
    return p;
  } catch { return null; }
}
export const pricing = localStore(PRICING_STORAGE_KEY, defaultPricing, decodePricing);
export function removeTariff(config: PricingConfig, id: string): PricingConfig {
  if (config.tariffs.length === 1) return config;
  const tariffs = config.tariffs.filter(t => t.id !== id);
  return { tariffs, assignment: Object.fromEntries(Object.entries(config.assignment).map(([k, v]) => [k, v === id ? tariffs[0].id : v])) };
}
export function tariffSchedule(config: PricingConfig, id: string): string {
  const groups: { days: number[]; times: string }[] = [];
  weekDays.forEach((_, d) => {
    const slots = base.schedule.slots.filter(s => config.assignment[`${s.id}:${d}`] === id);
    if (!slots.length) return;
    const ranges: { start: string; end: string }[] = [];
    slots.forEach(s => { const last = ranges.at(-1); if (last?.end === s.start) last.end = s.end; else ranges.push({ start: s.start, end: s.end }); });
    const times = slots.length === 4 ? 'весь день' : ranges.map(r => `${r.start}–${r.end}`).join(', ');
    const last = groups.at(-1);
    if (last?.times === times && last.days.at(-1) === d - 1) last.days.push(d); else groups.push({ days: [d], times });
  });
  return groups.map(g => `${g.days.length === 1 ? weekDays[g.days[0]] : g.days.length === 2 ? g.days.map(d => weekDays[d].toLowerCase()).join(' и ') : `${weekDays[g.days[0]]}–${weekDays[g.days.at(-1)!].toLowerCase()}`} ${g.times === 'весь день' ? '' : '· '}${g.times}`).join(', ') || 'Пока не назначен ни одному слоту';
}
