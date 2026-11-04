import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import AdminSelect from './AdminSelect';
import { equipmentCatalog, equipmentCategories, equipmentTariff, type CatalogItem, type EquipmentCategory } from './equipment-catalog';
import './admin-equipment.css';

function Pencil() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15z"/></svg>; }
function Editor({ item, close }: { item: CatalogItem; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<EquipmentCategory>(item.category);
  const [error, setError] = useState('');
  const isNew = !equipmentCatalog.get().some(x => x.id === item.id);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.current?.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    try { equipmentCatalog.save({ ...item, name: String(data.get('name')), category, price: Number(data.get('price')), quantity: data.get('quantity') === '' ? null : Number(data.get('quantity')), visible: data.has('visible'), perUnit: true, freeQty: Number(data.get('freeQty')) }); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить позицию.'); }
  }
  return <dialog ref={dialog} className="admin-dialog" aria-labelledby="equipment-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="admin-panel-head"><div><p className="admin-label">ДОП. ОБОРУДОВАНИЕ</p><h2 id="equipment-editor-title">{isNew ? 'Добавить позицию' : 'Редактировать позицию'}</h2></div><button className="admin-icon-button" aria-label="Закрыть редактирование" onClick={close}>×</button></div>
    <form className="admin-panel-content admin-form" onSubmit={submit}>
      <label>Название<input name="name" defaultValue={item.name} placeholder="Название оборудования" maxLength={160} required/></label>
      <AdminSelect label="Категория" value={category} options={equipmentCategories.map(value => ({ value, label: value }))} onChange={value => setCategory(value as EquipmentCategory)}/>
      <div className="admin-form-pair catalog-tariff-fields"><label>Цена за единицу за репетицию, ₽<input name="price" type="number" min="0" max="1000000" step="1" defaultValue={item.price} required/></label><label>В наличии<input name="quantity" type="number" min="0" max="10000" step="1" defaultValue={item.quantity ?? ''} placeholder="Не указано"/></label></div>
      {<label>Бесплатно за репетицию, шт.<input name="freeQty" type="number" min="0" max="10000" step="1" defaultValue={item.freeQty ?? 0} required/></label>}
      <label className="admin-payment-check"><input name="visible" type="checkbox" defaultChecked={item.visible}/><span>Показывать на сайте</span></label>

      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-primary admin-save" type="submit">Сохранить</button>
    </form>
  </dialog>;
}

export default function AdminEquipment() {
  const items = useSyncExternalStore(equipmentCatalog.subscribe, equipmentCatalog.get, equipmentCatalog.get);
  const [query, setQuery] = useState('');

  const [category, setCategory] = useState('Все');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [error, setError] = useState('');
  const filtered = items.filter(item => (category === 'Все' || item.category === category) && item.name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  function toggleVisible(item: CatalogItem) { try { equipmentCatalog.save({ ...item, visible: !item.visible }); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.'); } }
  return <>
    <div className="catalog-heading"><h1>Доп. оборудование</h1><div className="catalog-tools"><label className="catalog-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label="Найти позицию" placeholder="Найти позицию" value={query} onChange={event => setQuery(event.target.value)}/></label><button className="catalog-add" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', category: 'Другое', price: 0, quantity: null, visible: true })}>＋ Добавить позицию</button></div></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-date-shortcuts catalog-filters" role="group" aria-label="Категория оборудования">{['Все', ...equipmentCategories].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th scope="col">Позиция</th><th scope="col">Стоимость за репетицию</th><th scope="col">В наличии</th><th scope="col">На сайте</th><th scope="col"><span className="admin-sr-only">Редактирование</span></th></tr></thead><tbody>
      {equipmentCategories.map(group => { const rows = filtered.filter(item => item.category === group); if (!rows.length) return null; return <Fragment key={group}>
        <tr className="catalog-category"><th colSpan={5} scope="rowgroup">{group}</th></tr>
        {rows.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{equipmentTariff(item)}</td><td className="catalog-quantity">{item.quantity ?? '—'}</td><td><button className="catalog-switch" role="switch" aria-checked={item.visible} aria-label={`Показывать на сайте: ${item.name}`} onClick={() => toggleVisible(item)}><span/></button></td><td><button className="catalog-edit" aria-label={`Редактировать: ${item.name}`} onClick={() => setEditing(item)}><Pencil/></button></td></tr>)}
      </Fragment>; })}
      {!filtered.length && <tr><td colSpan={5} className="catalog-empty">Ничего не найдено. Измените запрос или категорию.</td></tr>}
    </tbody></table></div>
    {editing && <Editor item={editing} close={() => setEditing(null)}/>}
  </>;
}







