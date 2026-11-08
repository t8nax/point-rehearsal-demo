import { newId } from './id';
import { Dialog, EditorHead, DeleteConfirmation, Pencil, Trash, useDirtyGuard } from './AdminEditing';
import { Fragment, useState, useSyncExternalStore } from 'react';
import AdminSelect from './AdminSelect';
import { equipmentCatalog, equipmentCategories, equipmentTariff, type CatalogItem, type EquipmentCategory } from './equipment-catalog';
import './admin-equipment.css';

function Editor({ item, close }: { item: CatalogItem; close: () => void }) {
  const [draft, setDraft] = useState({ ...item, freeQty: item.freeQty ?? 0 });
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const isNew = !equipmentCatalog.get().some(x => x.id === item.id);
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify({ ...item, freeQty: item.freeQty ?? 0 });
  const guard = useDirtyGuard(dirty, 'Изменения в позиции не сохранены и пропадут.');
  const requestClose = () => guard.request(close);
  return <Dialog title={isNew ? 'Добавить позицию' : 'Редактировать позицию'} close={requestClose}>
    <EditorHead label="ДОП. ОБОРУДОВАНИЕ" title={isNew ? 'Добавить позицию' : 'Редактировать позицию'} close={requestClose} remove={isNew ? undefined : () => setDeleting(true)}/>
    <form className="admin-panel-content admin-form" onSubmit={event => {
      event.preventDefault();
      try { equipmentCatalog.save(draft); close(); } catch (e) { setError((e as Error).message); }
    }}>
      <label>Название<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Название оборудования" maxLength={160} required/></label>
      <AdminSelect label="Категория" value={draft.category} options={equipmentCategories.map(value => ({ value, label: value }))} onChange={value => setDraft({ ...draft, category: value as EquipmentCategory })}/>
      <div className="admin-form-pair catalog-tariff-fields"><label>Цена за единицу за репетицию, ₽<input type="number" min="0" max="1000000" step="1" value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })} required/></label><label>В наличии<input type="number" min="0" max="10000" step="1" value={draft.quantity ?? ''} onChange={e => setDraft({ ...draft, quantity: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Не указано"/></label></div>
      <label>Бесплатно за репетицию, шт.<input type="number" min="0" max="10000" step="1" value={draft.freeQty} onChange={e => setDraft({ ...draft, freeQty: Number(e.target.value) })} required/></label>
      <label className="admin-payment-check"><input type="checkbox" checked={draft.visible} onChange={e => setDraft({ ...draft, visible: e.target.checked })}/><span>Показывать на сайте</span></label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-primary admin-save" type="submit" disabled={!dirty}>Сохранить</button>
    </form>
    {guard.modal}
    {deleting && <DeleteConfirmation name={item.name} cancel={() => setDeleting(false)} confirm={() => { equipmentCatalog.remove(item.id); close(); }}/>}
  </Dialog>;
}

export default function AdminEquipment() {
  const items = useSyncExternalStore(equipmentCatalog.subscribe, equipmentCatalog.get, equipmentCatalog.get);
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);
  const [query, setQuery] = useState('');

  const [category, setCategory] = useState('Все');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [error, setError] = useState('');
  const filtered = items.filter(item => (category === 'Все' || item.category === category) && item.name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  function toggleVisible(item: CatalogItem) { try { equipmentCatalog.save({ ...item, visible: !item.visible }); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.'); } }
  return <>
    <div className="catalog-heading"><h1>Доп. оборудование</h1><div className="catalog-tools"><label className="catalog-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label="Найти позицию" placeholder="Найти позицию" value={query} onChange={event => setQuery(event.target.value)}/></label><button className="catalog-add" onClick={() => setEditing({ id: newId(), name: '', category: 'Другое', price: 0, quantity: null, visible: true })}>＋ Добавить позицию</button></div></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-date-shortcuts catalog-filters" role="group" aria-label="Категория оборудования">{['Все', ...equipmentCategories].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="catalog-table-wrap"><table className="catalog-table equipment-table"><thead><tr><th scope="col">Позиция</th><th scope="col">Стоимость за репетицию</th><th scope="col">В наличии</th><th scope="col">На сайте</th><th scope="col">Действия</th></tr></thead><tbody>
      {equipmentCategories.map(group => { const rows = filtered.filter(item => item.category === group); if (!rows.length) return null; return <Fragment key={group}>
        <tr className="catalog-category"><th colSpan={5} scope="rowgroup">{group}</th></tr>
        {rows.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{equipmentTariff(item)}</td><td className="catalog-quantity">{item.quantity ?? '—'}</td><td><button className="catalog-switch" role="switch" aria-checked={item.visible} aria-label={`Показывать на сайте: ${item.name}`} onClick={() => toggleVisible(item)}><span/></button></td><td><div className="catalog-actions"><button className="catalog-edit" aria-label={`Редактировать: ${item.name}`} onClick={() => setEditing(item)}><Pencil/></button><button className="catalog-edit catalog-delete" aria-label={`Удалить: ${item.name}`} onClick={() => setDeleting(item)}><Trash/></button></div></td></tr>)}
      </Fragment>; })}
      {!filtered.length && <tr><td colSpan={5} className="catalog-empty">Ничего не найдено. Измените запрос или категорию.</td></tr>}
    </tbody></table></div>
    {deleting && <DeleteConfirmation name={deleting.name} cancel={() => setDeleting(null)} confirm={() => { equipmentCatalog.remove(deleting.id); setDeleting(null); }}/> }
    {editing && <Editor item={editing} close={() => setEditing(null)}/>}
  </>;
}







