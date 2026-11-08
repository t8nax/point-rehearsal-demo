import { newId } from './id';
import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { halls, hallCover, applyHallDraft, moveHallPhoto, hallEquipmentCategories, type HallEquipmentCategory, type Hall, type HallEquipment } from './halls';
import { pricing } from './pricing';
import AdminSelect from './AdminSelect';
import { DeleteConfirmation, Dialog, EditorHead, Pencil, Trash, useDirtyGuard } from './AdminEditing';
import { Swatch } from './AdminPricing';
import { EquipmentIcon } from './Equipment';

const plural = (n: number, forms: string[]) => `${n} ${forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;
export function HallPhoto({ src, name, index }: { src?: string; name: string; index: number }) {
  const [failed, setFailed] = useState<string>();
  return src && src !== failed ? <img draggable={false} src={src} alt={name} onError={() => setFailed(src)}/> : <span className="hall-placeholder">{String(index).padStart(2, '0')}</span>;
}
function HallEditor({ hall, isNew, close }: { hall: Hall; isNew: boolean; close: () => void }) {
  const [draft, setDraft] = useState(hall);
  const [draggedPhoto, setDraggedPhoto] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState<string | null>(null);
  const [tab, setTab] = useState('Основное');
  const [removedPhotos, setRemovedPhotos] = useState<string[]>([]);
  const [removedEquipment, setRemovedEquipment] = useState<string[]>([]);
  const [editingEquipment, setEditingEquipment] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const config = useSyncExternalStore(pricing.subscribe, pricing.get);
  const effective = applyHallDraft(draft, removedPhotos, removedEquipment);
  const dirty = isNew || JSON.stringify(effective) !== JSON.stringify(applyHallDraft(hall, [], []));
  const guard = useDirtyGuard(dirty, `Изменения в «${hall.name}» не сохранены и пропадут.`);
  const requestClose = () => guard.request(close);
  function editEquipment(id: string, values: Partial<HallEquipment>) { setDraft({ ...draft, equipment: draft.equipment.map(e => e.id === id ? { ...e, ...values } : e) }); }
  function removePhoto(src: string) {
    setRemovedPhotos(current => [...new Set([...current, src])]);
  }
  async function upload(files: File[]) {
    try {
      const photos: string[] = [];
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1000000) throw new Error('Выберите фото JPG, PNG или WebP размером до 1 МБ.');
        const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
        await new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error('Не удалось прочитать фото.')); img.src = src; });
        photos.push(src);
      }
      setDraft(current => ({ ...current, photos: [...new Set([...current.photos, ...photos])] })); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  return <Dialog title={isNew ? 'Новый зал' : hall.name} close={requestClose} className="admin-dialog hall-dialog">
    <EditorHead label="ЗАЛ" title={isNew ? 'Новый зал' : draft.name} hall close={requestClose} remove={isNew ? undefined : () => setDeleting(true)}/>
    <div className="hall-tabs"><div className="admin-date-shortcuts" role="group" aria-label="Настройки зала">{['Основное', 'Фото', 'Цены', 'Оборудование'].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div></div>
    <form className="hall-form" onSubmit={e => {
      e.preventDefault();
      try {
        halls.save({ ...effective, prices: Object.fromEntries(config.tariffs.map(t => [t.id, effective.prices[t.id] ?? null])) }); close();
      } catch (e) { setError((e as Error).message); }
    }}>
      <div className="admin-panel-content admin-form hall-tab-content">
        {tab === 'Основное' && <><div className="admin-form-pair catalog-tariff-fields"><label>Название<input value={draft.name} placeholder="Например, Зал 8" maxLength={160} onChange={e => setDraft({ ...draft, name: e.target.value })} required/></label><label>Площадь, м²<input type="number" min="0.1" step="any" max="100000" value={draft.area ?? ''} placeholder="Не указана" onChange={e => setDraft({ ...draft, area: e.target.value === '' ? null : Number(e.target.value) })}/></label></div>
          <div><label className="admin-payment-check"><input type="checkbox" checked={draft.visible} onChange={e => setDraft({ ...draft, visible: e.target.checked })}/><span>Показывать на сайте</span></label></div></>}
        {tab === 'Фото' && <><p className="admin-form-hint">Нажмите на фото, чтобы сделать его обложкой. Перетащите фото, чтобы изменить порядок.</p><div className="hall-photos">{draft.photos.map((src, i) => {
          const removed = removedPhotos.includes(src), cover = hallCover(effective) === src;
          return <div key={src} className={`hall-photo ${removed ? 'is-removed' : ''} ${cover ? 'is-cover' : ''} ${draggedPhoto === src ? 'is-dragging' : ''} ${dropPhoto === src ? 'is-drop-target' : ''}`}
            draggable={!removed}
            onDragStart={e => { if (removed) { e.preventDefault(); return; } setDraggedPhoto(src); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }}
            onDragEnd={() => { setDraggedPhoto(null); setDropPhoto(null); }}
            onDragOver={e => { if (draggedPhoto && !removed) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropPhoto(src); } }}
            onDragLeave={() => setDropPhoto(current => current === src ? null : current)}
            onDrop={e => { if (!draggedPhoto || removed) return; e.preventDefault(); setDraft(current => ({ ...current, coverPhoto: hallCover(current) ?? null, photos: moveHallPhoto(current.photos, draggedPhoto, src) })); setDraggedPhoto(null); setDropPhoto(null); }}>

            <button type="button" className="hall-cover-button" disabled={removed} aria-label={`Сделать обложкой фото ${i + 1}`} aria-pressed={cover} onClick={() => setDraft({ ...draft, coverPhoto: src })} onKeyDown={e => { if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const target = draft.photos[i + (e.key === 'ArrowLeft' ? -1 : 1)]; if (target) setDraft({ ...draft, coverPhoto: hallCover(draft) ?? null, photos: moveHallPhoto(draft.photos, src, target) }); } }}><HallPhoto src={src} name={`Фото ${i + 1}`} index={i + 1}/></button>
            {cover && <span className="hall-cover-label">Обложка</span>}
            {removed ? <div className="hall-photo-restore"><span>Будет удалено</span><button type="button" onClick={() => setRemovedPhotos(removedPhotos.filter(p => p !== src))}>Вернуть</button></div> : <button type="button" className="hall-remove-photo" aria-label={`Удалить фото ${i + 1}`} onClick={() => removePhoto(src)}>×</button>}
          </div>;
        })}<label className="hall-upload" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}><span>↑</span><strong>Загрузите фото</strong><small>или перетащите сюда</small><input type="file" aria-label="Загрузить фото" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { void upload(Array.from(e.target.files ?? [])); e.target.value = ''; }}/></label></div>
          {!effective.photos.length && <p className="admin-form-hint">Фото нет — на сайте показывается заглушка с номером зала.</p>}<p className="admin-form-hint">JPG, PNG или WebP · до 1 МБ на фото</p></>}
        {tab === 'Цены' && <><h3>Цена по тарифам</h3><div>{config.tariffs.map(t => <label className="hall-price-row" key={t.id}><Swatch tariff={t}/><span>{t.name}</span><span className="price-field"><input aria-label={`Цена: ${t.name}`} type="number" min="0" max="1000000" value={draft.prices[t.id] ?? ''} placeholder="Не указана" onChange={e => setDraft({ ...draft, prices: { ...draft.prices, [t.id]: e.target.value === '' ? null : Number(e.target.value) } })}/><span>₽</span></span></label>)}</div><p className="admin-form-hint">Список тарифов и время их действия общие для всех залов.</p><Link className="hall-pricing-link" to="/admin/pricing">Настроить в разделе «Тарифы»</Link></>}
        {tab === 'Оборудование' && <><h3>Оборудование в зале</h3><div className="hall-equipment-list">{draft.equipment.map(item => {
          const removed = removedEquipment.includes(item.id);
          return <div className={`hall-equipment-item ${removed ? 'is-removed' : ''}`} key={item.id}>
            {editingEquipment === item.id && !removed ? <div className="admin-form hall-inline-editor"><label>Название<textarea rows={2} maxLength={500} value={item.name} placeholder="Например: Hartke 3500 + кабинет Laney (4×10) 400 Вт" onChange={e => editEquipment(item.id, { name: e.target.value })}/></label><AdminSelect label="Категория" value={item.category} options={hallEquipmentCategories.map(value => ({ value, label: value }))} onChange={value => editEquipment(item.id, { category: value as HallEquipmentCategory })}/><button type="button" onClick={() => setEditingEquipment(null)}>Готово</button></div> : <>
              <EquipmentIcon kind={item.category === 'Барабаны' ? 'drum' : item.category === 'Гитары' ? 'guitar' : item.category === 'Клавишные' ? 'keys' : item.category === 'Усилители и кабинеты' ? 'speaker' : 'other'}/><div className="hall-equipment-name"><small>{item.category}</small><span>{item.name}</span></div>
              {removed ? <div className="hall-equipment-restore"><small>Будет удалено</small><button type="button" onClick={() => setRemovedEquipment(removedEquipment.filter(id => id !== item.id))}>Вернуть</button></div> : <div className="catalog-actions"><button type="button" className="catalog-edit" aria-label={`Редактировать: ${item.name}`} onClick={() => setEditingEquipment(item.id)}><Pencil/></button><button type="button" className="catalog-edit catalog-delete" aria-label={`Удалить: ${item.name}`} onClick={() => {
                setRemovedEquipment(current => [...new Set([...current, item.id])]);
                if (editingEquipment === item.id) setEditingEquipment(null);
              }}><Trash/></button></div>}
            </>}
          </div>;
        })}</div>{!effective.equipment.length && <p className="admin-warning">Не указано. На сайте показывается «Оборудование — уточняйте у администратора».</p>}
          <button type="button" className="hall-add-equipment" onClick={() => { const id = newId(); setDraft({ ...draft, equipment: [...draft.equipment, { id, name: '', category: 'Другое' }] }); setEditingEquipment(id); }}>+ Добавить оборудование</button></>}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </div>
      <footer className="hall-save-footer"><button className="admin-primary" type="submit" disabled={!dirty}>Сохранить</button></footer>
    </form>
    {guard.modal}{deleting && <DeleteConfirmation hall name={hall.name} cancel={() => setDeleting(false)} confirm={() => { halls.remove(hall.id); close(); }}/>}
  </Dialog>;
}
export default function AdminHalls() {
  const items = useSyncExternalStore(halls.subscribe, halls.get);
  const config = useSyncExternalStore(pricing.subscribe, pricing.get);
  const [editing, setEditing] = useState<{ hall: Hall; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Hall | null>(null);
  const [error, setError] = useState('');
  return <>
    <div className="catalog-heading"><h1>Залы</h1><button className="catalog-add" onClick={() => { const id = Math.max(Date.now(), ...items.map(h => h.id)) + 1; setEditing({ isNew: true, hall: { id, name: `Зал ${Math.max(items.length, ...items.map(h => Number(h.name.match(/^Зал (\d+)$/)?.[1]) || 0)) + 1}`, area: null, visible: true, photos: [], equipment: [], prices: Object.fromEntries(config.tariffs.map(t => [t.id, null])) } }); }}>＋ Добавить зал</button></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="catalog-table-wrap"><table className="catalog-table halls-table"><thead><tr>{['Фото', 'Зал', 'Площадь', 'Цена за репетицию', 'Оборудование', 'На сайте', 'Действия'].map(t => <th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{items.map((hall, index) => {
      const prices = config.tariffs.map(t => hall.prices[t.id]).filter((p): p is number => typeof p === 'number');
      const min = Math.min(...prices), max = Math.max(...prices);
      return <tr key={hall.id} className={editing?.hall.id === hall.id ? 'hall-selected' : ''}><td><div className="hall-thumbnail"><HallPhoto src={hallCover(hall)} name={hall.name} index={index + 1}/></div></td><th scope="row">{hall.name}</th><td>{hall.area === null ? <span className="admin-warning">Не указана</span> : `${hall.area} м²`}</td><td>{prices.length ? `${min.toLocaleString('ru-RU')}${min !== max ? ` – ${max.toLocaleString('ru-RU')}` : ''} ₽` : <span className="admin-warning">Не указана</span>}<small>{plural(config.tariffs.length, ['тариф', 'тарифа', 'тарифов'])}</small></td><td className="catalog-muted">{hall.equipment.length ? plural(hall.equipment.length, ['позиция', 'позиции', 'позиций']) : <span className="admin-warning">Не указано</span>}</td><td><button className="catalog-switch" role="switch" aria-checked={hall.visible} aria-label={`Показывать на сайте: ${hall.name}`} onClick={() => { try { halls.save({ ...hall, visible: !hall.visible }); setError(''); } catch (e) { setError((e as Error).message); } }}><span/></button></td><td><div className="catalog-actions"><button className="catalog-edit" aria-label={`Редактировать: ${hall.name}`} onClick={() => setEditing({ hall, isNew: false })}><Pencil/></button><button className="catalog-edit catalog-delete" aria-label={`Удалить: ${hall.name}`} onClick={() => setDeleting(hall)}><Trash/></button></div></td></tr>;
    })}{!items.length && <tr><td colSpan={7} className="catalog-empty">Залы не добавлены.</td></tr>}</tbody></table></div>
    {editing && <HallEditor hall={editing.hall} isNew={editing.isNew} close={() => setEditing(null)}/>}
    {deleting && <DeleteConfirmation hall name={deleting.name} cancel={() => setDeleting(null)} confirm={() => { halls.remove(deleting.id); setDeleting(null); }}/>}
  </>;
}
