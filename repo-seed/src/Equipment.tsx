import { useId, useState, useSyncExternalStore } from 'react';
import { type Room } from './domain';
import { equipmentCatalog, type CatalogItem } from './equipment-catalog';

type Icon = 'drum' | 'guitar' | 'speaker' | 'cymbal' | 'keys' | 'mic' | 'other';
type EquipmentRow = { category: string; title: string; detail?: string; icon: Icon };

export function EquipmentIcon({ kind }: { kind: Icon }) {
  const paths = {
    other: <><path d="M14 17V3l6 3v5l-6-3"/><ellipse cx="10" cy="17" rx="4" ry="3"/></>,
    drum: <><ellipse cx="12" cy="8" rx="9" ry="4" /><path d="M3 8v9c0 5 18 5 18 0V8M7 12v7m10-7v7M6 2l8 4m4-5-5 5" /></>,
    guitar: <><path d="m14 8 6-6 2 2-6 6M14 8c-2-2-4-1-4 1 0 2-1 3-3 3-3-1-6 3-4 6l3 3c3 2 7-1 6-4 0-2 1-3 3-3 2 0 3-2 1-4" /><circle cx="9" cy="15" r="2" /></>,
    speaker: <><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="15" r="4" /><circle cx="12" cy="6" r="1" /></>,
    cymbal: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 6a6 6 0 0 1 6 6M6 12a6 6 0 0 0 6 6" /></>,
    keys: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M7 5v8h3V5m4 0v8h3V5M8 13v6m8-6v6" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function roomEquipment(equipment: Room['equipment']): EquipmentRow[] {
  return equipment.map(item => ({ category: item.category, title: item.name, icon: item.category === 'Барабаны' ? 'drum' : item.category === 'Гитары' ? 'guitar' : item.category === 'Клавишные' ? 'keys' : item.category === 'Усилители и кабинеты' ? 'speaker' : 'other' }));
}

function additionalEquipment(items: CatalogItem[]): EquipmentRow[] {
  return items.filter(item => item.visible).map(item => ({ category: item.category, title: item.name, detail: item.note, icon: item.category === 'Барабаны' ? 'drum' : item.category === 'Гитары' ? 'guitar' : item.category === 'Клавишные' ? 'keys' : 'other' }));
}

function EquipmentList({ items }: { items: EquipmentRow[] }) {
  return <ul className="client-equipment-stack">{items.map(item => <li key={item.title}>
    <EquipmentIcon kind={item.icon} />
    <div><span className="client-equipment-category">{item.category}</span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</div>
  </li>)}</ul>;
}

export default function Equipment({ room }: { room: Room }) {
  const catalog = useSyncExternalStore(equipmentCatalog.subscribe, equipmentCatalog.get, equipmentCatalog.get);
  const [section, setSection] = useState<'room' | 'extra'>('room');
  const id = useId();
  return <>
    <h3>Оборудование</h3>
    <div className="client-equipment-switch" role="group" aria-label="Раздел оборудования">
      <button type="button" aria-pressed={section === 'room'} aria-controls={`${id}-room`} onClick={() => setSection('room')}>В зале</button>
      <button type="button" aria-pressed={section === 'extra'} aria-controls={`${id}-extra`} onClick={() => setSection('extra')}>Дополнительно</button>
    </div>
    <section id={`${id}-room`} hidden={section !== 'room'} aria-label="Оборудование в зале">
      {room.equipment.length ? <EquipmentList items={roomEquipment(room.equipment)} /> : <p className="client-muted">Оборудование — уточняйте у администратора</p>}
    </section>
    <section id={`${id}-extra`} hidden={section !== 'extra'} aria-label="Дополнительное оборудование">
      <p className="client-equipment-hint">Выбирается на месте. Наличие уточняйте у администратора.</p>
      <EquipmentList items={additionalEquipment(catalog)} />
    </section>
  </>;
}
