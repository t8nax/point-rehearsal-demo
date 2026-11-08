import base from '../data/base.json';
import { equipmentCategories } from './equipment-catalog';
export const hallEquipmentCategories = [...equipmentCategories, 'Усилители и кабинеты'] as const;
export type HallEquipmentCategory = typeof hallEquipmentCategories[number];
import { localStore } from './local-store';

export interface HallEquipment { id: string; name: string; category: HallEquipmentCategory }
export interface Hall {
  // Numeric IDs preserve the existing booking data format.
  id: number; name: string; area: number | null; visible: boolean;
  photos: string[]; coverPhoto?: string | null; prices: Record<string, number | null>; equipment: HallEquipment[];
}
export const HALLS_STORAGE_KEY = 'point-halls-v1';
export function defaultHalls(): Hall[] {
  return base.rooms.map(room => ({ ...room, visible: true, coverPhoto: room.photos[0] ?? null, equipment: (room.equipment ?? []).map((name, i) => ({
    id: `${room.id}-${i}`, name, category: /барабан/i.test(name) ? 'Барабаны' : /бас|гитар/i.test(name) ? 'Усилители и кабинеты' : 'Другое',
  })) }));
}
export function decodeHalls(raw: string | null): Hall[] | null {
  try {
    const halls: Hall[] = JSON.parse(raw || 'null');
    return Array.isArray(halls) && halls.length <= 100 && new Set(halls.map(h => h.id)).size === halls.length && halls.every(h =>
      h && Number.isSafeInteger(h.id) && h.id > 0 && typeof h.name === 'string' && !!h.name.trim() && h.name.length <= 160 &&
      (h.area === null || Number.isFinite(h.area) && h.area > 0 && h.area <= 100000) && typeof h.visible === 'boolean' &&
      Array.isArray(h.photos) && h.photos.length <= 30 && h.photos.every(p => typeof p === 'string' && p.length <= 1500000 && (/^\/photos\/[\w./-]+$/.test(p) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p))) &&
      (h.coverPhoto === undefined || h.coverPhoto === null || typeof h.coverPhoto === 'string' && h.photos.includes(h.coverPhoto)) &&
      h.prices && typeof h.prices === 'object' && !Array.isArray(h.prices) && Object.values(h.prices).every(p => p === null || Number.isFinite(p) && p >= 0 && p <= 1000000) &&
      Array.isArray(h.equipment) && h.equipment.length <= 100 && new Set(h.equipment.map(e => e.id)).size === h.equipment.length && h.equipment.every(e => e && typeof e.id === 'string' && !!e.id && typeof e.name === 'string' && !!e.name.trim() && e.name.length <= 500 && hallEquipmentCategories.includes(e.category))
    ) ? halls.map(h => ({ ...h, coverPhoto: hallCover(h) ?? null, equipment: h.equipment.map(e => e.category === 'Гитары' && /усилител|кабинет|комбо|стек|Hartke|Hiwatt|Randall|Ampeg/i.test(e.name) ? { ...e, category: 'Усилители и кабинеты' as const } : e) })) : null;
  } catch { return null; }
}
const storage = localStore(HALLS_STORAGE_KEY, defaultHalls, decodeHalls);
export const halls = {
  get: storage.get, subscribe: storage.subscribe,
  save(hall: Hall) {
    const latest = storage.latest();
    const item = { ...hall, name: hall.name.trim() };
    storage.save(latest.some(h => h.id === hall.id) ? latest.map(h => h.id === hall.id ? item : h) : [...latest, item]);
  },
  remove(id: number) { storage.save(storage.latest().filter(h => h.id !== id)); },
  retainTariffs(ids: string[]) { storage.save(storage.latest().map(h => ({ ...h, prices: Object.fromEntries(ids.map(id => [id, h.prices[id] ?? null])) }))); },
  stageTariffs(ids: string[]) { return storage.stage(storage.latest().map(h => ({ ...h, prices: Object.fromEntries(ids.map(id => [id, h.prices[id] ?? null])) }))); },
};

export function hallCover(hall: Pick<Hall, 'photos' | 'coverPhoto'>): string | undefined {
  return hall.coverPhoto && hall.photos.includes(hall.coverPhoto) ? hall.coverPhoto : hall.photos[0];
}
export function applyHallDraft(hall: Hall, removedPhotos: string[], removedEquipment: string[]): Hall {
  const photos = hall.photos.filter(p => !removedPhotos.includes(p));
  return { ...hall, photos, coverPhoto: hallCover({ photos, coverPhoto: hallCover(hall) }) ?? null,
    equipment: hall.equipment.filter(e => !removedEquipment.includes(e.id)) };
}
export function moveHallPhoto(photos: string[], source: string, target: string): string[] {
  if (source === target || !photos.includes(source) || !photos.includes(target)) return photos;
  const next = photos.filter(p => p !== source);
  next.splice(photos.indexOf(target), 0, source);
  return next;
}
