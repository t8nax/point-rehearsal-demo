import { base } from './domain';

export const equipmentCategories = ['Барабаны', 'Гитары', 'Клавишные', 'Другое'] as const;
export type EquipmentCategory = typeof equipmentCategories[number];
export interface CatalogItem {
  id: string; name: string; category: EquipmentCategory; price: number;
  quantity: number | null; visible: boolean; perUnit?: boolean; freeQty?: number; note?: string;
}
export const EQUIPMENT_STORAGE_KEY = 'point-equipment-catalog-v1';
const quantities: Record<string, number> = { pedal: 7, cymbals: 2, 'cymbals-fx': 1, china: 1, 'crash-extra': 2, 'double-pedal': 2, guitar: 2, bass: 4, synth: 2 };
export function defaultCatalog(): CatalogItem[] {
  return base.rentals.map(item => ({ ...item, name: item.id === 'mic' ? 'Микрофон' : item.name, perUnit: true, freeQty: item.freeQty ?? 0, category: item.id === 'mic' ? 'Другое' : item.id === 'synth' ? 'Клавишные' : ['guitar', 'bass'].includes(item.id) ? 'Гитары' : 'Барабаны', quantity: quantities[item.id] ?? null, visible: item.id !== 'double-pedal' }));
}
function valid(item: unknown): item is CatalogItem {
  if (!item || typeof item !== 'object') return false;
  const x = item as CatalogItem;
  return typeof x.id === 'string' && x.id.length > 0 && x.id.length < 100 && typeof x.name === 'string' && x.name.trim().length > 0 && x.name.length <= 160 && equipmentCategories.includes(x.category) && Number.isFinite(x.price) && x.price >= 0 && x.price <= 1000000 && (x.quantity === null || Number.isInteger(x.quantity) && x.quantity >= 0 && x.quantity <= 10000) && typeof x.visible === 'boolean' && (x.perUnit === undefined || typeof x.perUnit === 'boolean') && (x.freeQty === undefined || Number.isInteger(x.freeQty) && x.freeQty >= 0 && x.freeQty <= 10000) && (x.note === undefined || typeof x.note === 'string' && x.note.length <= 500);
}
export function decodeCatalog(raw: string | null): CatalogItem[] | null {
  try { const parsed: unknown = JSON.parse(raw || 'null'); const value = Array.isArray(parsed) ? parsed.map(item => item && typeof item === 'object' && item.category === 'Микрофоны' ? { ...item, category: 'Другое' } : item) : parsed; return Array.isArray(value) && value.length <= 500 && value.every(valid) && new Set(value.map(x => x.id)).size === value.length ? value.map(normalizeCatalogItem) : null; } catch { return null; }
}
function read(): CatalogItem[] | null { try { return decodeCatalog(localStorage.getItem(EQUIPMENT_STORAGE_KEY)); } catch { return null; } }
let snapshot = read() || defaultCatalog();
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key !== EQUIPMENT_STORAGE_KEY && event.key !== null) return;
  snapshot = read() || defaultCatalog(); listeners.forEach(listener => listener());
});
export const equipmentCatalog = {
  get: () => snapshot,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  save(item: CatalogItem) {
    const normalized = normalizeCatalogItem({ ...item, name: item.name.trim() });
    if (!valid(normalized)) throw new Error('Проверьте название, цену и количество оборудования.');
    const latest = read() || snapshot;
    const next = latest.some(x => x.id === item.id) ? latest.map(x => x.id === item.id ? normalized : x) : [...latest, normalized];
    if (next.length > 500) throw new Error('Достигнут предел количества позиций.');
    try { localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(next)); } catch { throw new Error('Не удалось сохранить изменения в браузере.'); }
    snapshot = next; listeners.forEach(listener => listener());
  },
};

function normalizeCatalogItem(item: CatalogItem): CatalogItem {
  return { ...item, name: item.id === 'mic' && item.name === 'Микрофон (первые 2 бесплатно)' ? 'Микрофон' : item.name, perUnit: true, freeQty: item.freeQty ?? 0 };
}
export function equipmentTariff(item: { price: number; freeQty?: number }): string {
  if (item.price === 0) return 'Без доплаты';
  const price = `${item.price.toLocaleString('ru-RU')} ₽/шт.`;
  return item.freeQty ? `${item.freeQty} шт. бесплатно, далее ${price}` : price;
}

