import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminEquipment from './AdminEquipment';
import { addDays, adminBookingEnd, base, bookingRentalTotal, bookingTimePhase, bookingUndoAction, formatDate, isActive, isPastSlot, newBookingDefaults, price, rentalTotal, statusLabels, today, type Booking, type BookingUndoAction } from './domain';
import { store } from './store';
import AdminDatePicker from './AdminDatePicker';
import AdminSelect from './AdminSelect';
import './admin.css';
import { equipmentCatalog, equipmentTariff } from './equipment-catalog';

const money = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;
const slotText = (id: string) => { const slot = base.schedule.slots.find(item => item.id === id); return slot ? `${slot.start}–${slot.end}` : id; };
type Selection = { bookingId: string } | { roomId: number; slotId: string; date: string };
type ActionConfirmation = 'cancelled' | 'no_show' | { undo: BookingUndoAction; completedAt?: string; paidAt?: string; noShowAt?: string };
const undoLabels: Record<BookingUndoAction, string> = {
  paid_completion: 'Отменить завершение и отметку оплаты',
  completion: 'Отменить завершение',
  payment: 'Отменить завершение',
  no_show: 'Отменить неявку',
};
type IconName = 'grid' | 'arrow' | 'calendar' | 'plus' | 'close' | 'check' | 'clock' | 'user' | 'chevron' | 'ban' | 'undo';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  return now;
}

function Equipment({ booking, onError }: { booking: Booking; onError: (message: string) => void }) {
  const catalog = useSyncExternalStore(equipmentCatalog.subscribe, equipmentCatalog.get, equipmentCatalog.get);
  const editable = booking.status === 'confirmed' && !booking.paidAt;
  const selected = catalog.filter(item => booking.rentals[item.id] > 0).map(item => ({ ...item, ...(booking.rentalSnapshot?.[item.id] || base.rentals.find(original => original.id === item.id)) }));
  function change(id: string, qty: number) {
    try { store.updateRentals(booking.id, { ...booking.rentals, [id]: qty }); onError(''); }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Не удалось сохранить оборудование'); }
  }
  return <section className="admin-equipment" aria-label="Дополнительное оборудование">
    <div className="admin-section-heading"><h3>Дополнительное оборудование</h3><span>{money(bookingRentalTotal(booking))}</span></div>
    {selected.length ? <ul className="admin-issued-equipment">{selected.map(item => <li key={item.id}><span>{item.name}{item.perUnit ? ` · ${booking.rentals[item.id]} шт.` : ''}</span><strong>{money(bookingRentalTotal({ rentals: { [item.id]: booking.rentals[item.id] }, rentalSnapshot: booking.rentalSnapshot }))}</strong></li>)}</ul> : <p className="admin-form-hint">Оборудование не добавлено</p>}
    {editable && <details className="admin-equipment-picker"><summary>{selected.length ? 'Изменить оборудование' : 'Добавить оборудование'}</summary><div>{catalog.map(entry => { const item = booking.rentals[entry.id] ? { ...entry, ...(booking.rentalSnapshot?.[entry.id] || base.rentals.find(original => original.id === entry.id)) } : entry; return <div className="admin-equipment-option" key={item.id}>
      {item.perUnit ? <><label htmlFor={`rental-${item.id}`}>{item.name}<small>{equipmentTariff(item)}</small></label><input id={`rental-${item.id}`} type="number" min="0" step="1" aria-label={`Количество: ${item.name}`} value={booking.rentals[item.id] || 0} onChange={event => change(item.id, Number(event.target.value))}/></> : <label><input type="checkbox" checked={!!booking.rentals[item.id]} onChange={event => change(item.id, event.target.checked ? 1 : 0)}/><span>{item.name}<small>{item.price === 0 ? 'Без доплаты' : money(item.price)}</small></span></label>}
    </div>; })}</div></details>}
  </section>;
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    arrow: <path d="M7 17 17 7M7 7h10v10"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    user: <><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    ban: <><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,
    undo: <><path d="M3 4v6h6"/><path d="M3 10a9 9 0 1 1 1 9"/></>,
  };
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function BookingPanel({ selection, onClose, onCreated }: { selection: Selection; onClose: () => void; onCreated: (booking: Booking) => void }) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<ActionConfirmation | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [paidOnCompletion, setPaidOnCompletion] = useState(true);
  const actionsRef = useRef<HTMLDivElement>(null);
  const actionsToggle = useRef<HTMLButtonElement>(null);
  const actionsMenuId = useId();
  const now = useClock();
  const [roomId, setRoomId] = useState('roomId' in selection ? selection.roomId : 1);
  const [date, setDate] = useState('date' in selection ? selection.date : today());
  const [slotId, setSlotId] = useState('slotId' in selection ? selection.slotId : base.schedule.slots[0].id);
  const [channel, setChannel] = useState('Telegram');
  const booking = 'bookingId' in selection ? state.bookings.find(item => item.id === selection.bookingId) : undefined;
  const undoAction = booking ? bookingUndoAction(booking) : null;
  const room = base.rooms.find(item => item.id === (booking?.roomId ?? roomId))!;
  const available = base.schedule.slots.filter(slot => !isPastSlot(date, slot.id) && !state.bookings.some(item => isActive(item) && item.roomId === roomId && item.date === date && item.slotId === slot.id));
  const slotAvailable = available.some(slot => slot.id === slotId);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target)) setActionsOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [actionsOpen]);

  useEffect(() => {
    if (confirmation) dialog.current?.querySelector<HTMLButtonElement>('.admin-action-confirmation button')?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (booking?.status === 'confirmed') setPaidOnCompletion(booking.completionPaid ?? true);
  }, [booking?.id, booking?.status, booking?.completionPaid]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const created = store.addBooking({ roomId, date, slotId, band: String(data.get('band') || ''), contact: String(data.get('contact') || ''), channel: String(data.get('channel')), rentals: {}, source: 'admin' });
      onCreated(created);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить запись'); }
  }
  function perform(action: () => void) {
    try { action(); setConfirmation(null); setActionsOpen(false); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения'); }
  }
  function confirmAction() {
    if (!booking || !confirmation) return;
    const choice = confirmation;
    perform(() => {
      if (typeof choice === 'object') store.undoBookingAction(booking.id, { action: choice.undo, completedAt: choice.completedAt, paidAt: choice.paidAt, noShowAt: choice.noShowAt });
      else store.updateStatus(booking.id, choice);
    });
  }
  function confirmationText(): string {
    if (!confirmation || !booking) return '';
    if (typeof confirmation === 'object') {
      return `${confirmation.undo === 'no_show' ? 'Отменить неявку' : 'Отменить завершение'}? Запись вернётся в «Забронирована». Оборудование и сумма сохранятся.`;
    }
    return confirmation === 'cancelled' ? 'Отменить бронь? Время станет свободным, запись сохранится в истории.' : 'Клиент не пришёл? Запись останется в расписании со статусом «Неявка».';
  }

  return <dialog ref={dialog} className="admin-dialog" aria-labelledby="admin-panel-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <div className="admin-panel-head"><div><p className="admin-label">{booking ? 'БРОНЬ' : 'РУЧНАЯ ЗАПИСЬ'}</p><h2 id="admin-panel-title">{booking ? 'Детали репетиции' : 'Новая бронь'}</h2></div><button className="admin-icon-button" aria-label="Закрыть карточку" onClick={onClose}><Icon name="close"/></button></div>
    {booking ? <div className="admin-panel-content">
      <div className="admin-booking-badges"><span className={`admin-booking-status ${booking.status}`}><Icon name={booking.status === 'confirmed' || booking.status === 'completed' ? 'check' : 'clock'}/>{statusLabels[booking.status]}</span>{isActive(booking) && <span className={`admin-payment-badge ${booking.paidAt ? 'paid' : ''}`}>{booking.paidAt ? 'Оплачено' : 'Не оплачено'}</span>}</div>
      <h3 className="admin-band-title">{booking.band}</h3>
      <dl className="admin-summary"><div><dt>Зал</dt><dd>{room.name}</dd></div><div><dt>Дата</dt><dd>{formatDate(booking.date)}</dd></div><div><dt>Время</dt><dd>{slotText(booking.slotId)}</dd></div><div><dt>Способ связи</dt><dd>{booking.channel}</dd></div><div><dt>Контакт</dt><dd className="admin-contact-value">{booking.contact}</dd></div>{booking.demoIdentity && <div><dt>Вход</dt><dd>Telegram · демо</dd></div>}<div><dt>Источник</dt><dd>{booking.source === 'admin' ? 'Ручная запись' : booking.source === 'site' ? 'Сайт' : 'Демо-запись'}</dd></div></dl>
      <Equipment booking={booking} onError={setError}/>
      <dl className="admin-cost-breakdown"><div><dt>Зал</dt><dd>{money(booking.total - bookingRentalTotal(booking))}</dd></div><div><dt>Оборудование</dt><dd>{money(bookingRentalTotal(booking))}</dd></div></dl>
      <div className="admin-panel-total"><span>{booking.paidAt ? 'Оплачено' : 'Итого'}</span><strong>{money(booking.total)}</strong></div>
      {(booking.status === 'confirmed' || booking.status === 'completed' || booking.status === 'no_show') && <div className="admin-lifecycle-actions">
        {booking.status === 'confirmed' && bookingTimePhase(booking, now) === 'upcoming' && <p className="admin-form-hint">Расчёт доступен с начала репетиции.</p>}
        {booking.status === 'confirmed' && <label className="admin-payment-check"><input type="checkbox" checked={paidOnCompletion} disabled={bookingTimePhase(booking, now) === 'upcoming'} onChange={event => setPaidOnCompletion(event.target.checked)}/><span>Оплачено</span></label>}
        {(booking.status === 'completed' && booking.paidAt || booking.status === 'no_show') && undoAction ? <button className="admin-undo-direct" onClick={() => setConfirmation({ undo: undoAction, completedAt: booking.completedAt, paidAt: booking.paidAt, noShowAt: booking.noShowAt })}><Icon name="undo"/>{undoLabels[undoAction]}</button> : <div className="admin-booking-actions" ref={actionsRef} onKeyDown={event => { if (event.key === 'Escape' && actionsOpen) { event.preventDefault(); event.stopPropagation(); setActionsOpen(false); actionsToggle.current?.focus(); } }}>
          <div className="admin-booking-action-row">
            {booking.status === 'confirmed' && <button className="admin-primary" disabled={bookingTimePhase(booking, now) === 'upcoming'} onClick={() => perform(() => store.completeBooking(booking.id, paidOnCompletion))}><Icon name="check"/>Завершить репетицию</button>}
            {booking.status === 'completed' && !booking.paidAt && <button className="admin-primary" onClick={() => perform(() => store.markPaid(booking.id))}>Отметить оплату</button>}
            <button ref={actionsToggle} className="admin-actions-toggle" aria-expanded={actionsOpen} aria-controls={actionsMenuId} onClick={() => { setActionsOpen(!actionsOpen); setConfirmation(null); }}>Ещё<Icon name="chevron"/></button>
          </div>
          {actionsOpen && <div id={actionsMenuId} className="admin-booking-action-menu" role="group" aria-label="Другие действия с бронью">
            {booking.status === 'confirmed' && <>{bookingTimePhase(booking, now) !== 'upcoming' && <button onClick={() => { setConfirmation('no_show'); setActionsOpen(false); }}><Icon name="user"/>Отметить неявку</button>}<button className="admin-action-cancel" onClick={() => { setConfirmation('cancelled'); setActionsOpen(false); }}><Icon name="ban"/>Отменить бронь</button></>}
            {undoAction && <button onClick={() => { setConfirmation({ undo: undoAction, completedAt: booking.completedAt, paidAt: booking.paidAt, noShowAt: booking.noShowAt }); setActionsOpen(false); }}><Icon name="undo"/>{undoLabels[undoAction]}</button>}
          </div>}
        </div>}
      </div>}
      {confirmation && <div className="admin-action-confirmation" role="group" aria-label="Подтверждение действия"><p>{confirmationText()}</p><div className="admin-panel-actions"><button className="admin-danger" onClick={confirmAction}>{typeof confirmation === 'object' ? undoLabels[confirmation.undo] : confirmation === 'cancelled' ? 'Отменить бронь' : 'Подтвердить неявку'}</button><button onClick={() => setConfirmation(null)}>Назад</button></div></div>}
      {error && <p className="admin-error" role="alert">{error}</p>}
    </div> : <form className="admin-panel-content admin-form" onSubmit={submit}>
      <div className="admin-form-pair"><AdminSelect label="Зал" value={String(roomId)} options={base.rooms.map(item => ({ value: String(item.id), label: item.name }))} onChange={value => { setRoomId(Number(value)); setSlotId(''); setError(''); }}/><AdminDatePicker label="Дата" showLabel value={date} min={today()} max={adminBookingEnd()} onChange={value => { setDate(value); setSlotId(''); setError(''); }}/></div>
      <AdminSelect label="Время" value={slotId} options={base.schedule.slots.map(slot => ({ value: slot.id, label: `${slot.start}–${slot.end}`, disabled: !available.some(item => item.id === slot.id) }))} onChange={value => { setSlotId(value); setError(''); }}/>
      {!slotAvailable && <p className="admin-form-hint" role="status">{available.length ? 'Выберите свободное время.' : 'На эту дату свободного времени в зале нет.'}</p>}
      <label>Имя или название группы<input name="band" required maxLength={80} placeholder="Введите имя или название группы"/></label>
      <AdminSelect label="Способ связи" name="channel" value={channel} options={['Telegram', 'MAX', 'WhatsApp'].map(value => ({ value, label: value }))} onChange={setChannel}/>
      <label>Контакт<input name="contact" required maxLength={120} placeholder="Номер телефона или @username"/></label>
      <div className="admin-panel-total"><span>Стоимость зала</span><strong>{slotId ? money(price(room, date, slotId)) : '—'}</strong></div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button className="admin-primary admin-save" type="submit" disabled={!slotAvailable}><Icon name="plus"/>Создать бронь</button>

    </form>}
  </dialog>;
}

export default function Admin() {
  const equipmentPage = useLocation().pathname === '/admin/equipment';
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const now = useClock();
  const [date, setDate] = useState(today);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [roomFilter, setRoomFilter] = useState('all');
  const currentDay = today(now), minDate = addDays(currentDay, -14), maxDate = adminBookingEnd(currentDay);
  const rooms = base.rooms.filter(room => roomFilter === 'all' || String(room.id) === roomFilter);
  const dayBookings = state.bookings.filter(booking => booking.date === date && isActive(booking));

  function changeDate(value: string) { if (value >= minDate && value <= maxDate) { setDate(value); setSelection(null); } }
  function select(value: Selection) { setSelection(value); }
  function created(booking: Booking) { setDate(booking.date); setSelection({ bookingId: booking.id }); }

  return <div className="admin-app">
    <aside className="admin-sidebar" aria-label="Панель администратора">
      <div className="admin-logo"><span className="admin-logo-mark">Т</span><div><strong>ТОЧКА ОТСЧЁТА</strong><span>Администратор</span></div></div>
      <nav className="admin-navigation" aria-label="Разделы панели администратора"><span className="admin-label">БРОНИРОВАНИЕ</span><Link to="/admin" className={!equipmentPage ? "admin-nav-current" : "admin-nav-link"} aria-current={!equipmentPage ? "page" : undefined}><Icon name="grid"/>Расписание</Link><Link to="/admin/equipment" className={equipmentPage ? "admin-nav-current" : "admin-nav-link"} aria-current={equipmentPage ? "page" : undefined}><Icon name="grid"/>Доп. оборудование</Link></nav>
      <div className="admin-sidebar-bottom"><Link to="/" className="admin-site-link"><Icon name="arrow"/>Клиентский сайт</Link></div>
    </aside>
    <div className="admin-main">
      <header className="admin-toolbar"><div className="admin-toolbar-date-controls" style={equipmentPage ? { visibility: "hidden" } : undefined}><div className="admin-date-shortcuts" role="group" aria-label="Быстрый выбор дня">{[{ label: 'Вчера', value: addDays(currentDay, -1) }, { label: 'Сегодня', value: currentDay }, { label: 'Завтра', value: addDays(currentDay, 1) }].map(day => <button key={day.label} aria-pressed={date === day.value} onClick={() => changeDate(day.value)}>{day.label}</button>)}</div><AdminDatePicker label="Выбрать дату" value={date} min={minDate} max={maxDate} onChange={changeDate}/></div><span className="admin-demo-badge">Демо-концепт</span><button className="admin-primary admin-new-booking" onClick={() => select(newBookingDefaults(store.get().bookings))}><Icon name="plus"/><span>Новая бронь</span></button></header>
      {equipmentPage ? <main className="admin-content"><AdminEquipment/></main> : <main className="admin-content">
        <div className="admin-schedule-heading"><div><h1>Расписание</h1><p>{new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' }).format(new Date(`${date}T12:00:00Z`))}</p></div><div className="admin-schedule-tools"><div className="admin-day-arrows"><button className="admin-icon-button" aria-label="Предыдущий день" disabled={date <= minDate} onClick={() => changeDate(addDays(date, -1))}>←</button><button className="admin-icon-button" aria-label="Следующий день" disabled={date >= maxDate} onClick={() => changeDate(addDays(date, 1))}>→</button></div><AdminSelect label="Выбрать зал" hideLabel value={roomFilter} options={[{ value: 'all', label: 'Все залы' }, ...base.rooms.map(room => ({ value: String(room.id), label: room.name }))]} onChange={setRoomFilter}/></div></div>
        <div className="admin-schedule-scroll" role="region" aria-label="Сетка расписания, залы по столбцам" tabIndex={0}>
          <table className="admin-schedule-table" style={{ minWidth: `${72 + rooms.length * 120}px` }}>
            <caption className="admin-sr-only">Расписание на {formatDate(date)}. Нажмите бронь для просмотра или свободное время для записи.</caption>
            <thead><tr><th className="admin-time-column" scope="col"><span className="admin-sr-only">Время</span></th>{rooms.map(room => <th scope="col" key={room.id}><div className="admin-room-heading"><strong>{room.name}</strong></div></th>)}</tr></thead>
            <tbody>{base.schedule.slots.map(slot => <tr key={slot.id}><th scope="row" className={`admin-time-column ${bookingTimePhase({ date, slotId: slot.id }, now) === 'current' ? 'admin-time-current' : ''}`}><strong>{slot.start}</strong><small>{slot.end}</small>{bookingTimePhase({ date, slotId: slot.id }, now) === 'current' && <span title="Текущий слот по расписанию">Сейчас</span>}</th>{rooms.map(room => {
              const booking = dayBookings.find(item => item.roomId === room.id && item.slotId === slot.id), past = isPastSlot(date, slot.id);
              const attention = booking && booking.status !== 'no_show' && !booking.paidAt && (booking.status === 'completed' || bookingTimePhase(booking, now) === 'ended');
              return <td key={room.id}><button className={`admin-slot ${booking ? `admin-slot-${booking.status}${attention ? ' admin-slot-attention' : ''}` : past ? 'admin-slot-past' : 'admin-slot-free'}`} disabled={!booking && past} aria-label={`${room.name}, ${slot.start}–${slot.end}: ${booking ? `${booking.band}, ${statusLabels[booking.status]}, ${booking.paidAt ? 'Оплачено' : 'Не оплачено'}, ${money(booking.total)}` : past ? 'Время прошло' : 'Свободно, добавить бронь'}`} onClick={() => select(booking ? { bookingId: booking.id } : { roomId: room.id, date, slotId: slot.id })}>
                {booking ? <><span className="admin-slot-status"><Icon name={attention ? 'clock' : 'check'}/>{statusLabels[booking.status]}</span><strong className="admin-slot-band">{booking.band}</strong><span className="admin-slot-contact"><Icon name="user"/><span>{booking.contact}</span></span><span className="admin-slot-bottom"><strong>{money(booking.total)}</strong><span className={booking.paidAt ? 'admin-payment-paid' : 'admin-payment-unpaid'}>{booking.paidAt ? 'Оплачено' : 'Не оплачено'}</span></span></> : past ? <span>Время прошло</span> : <Icon name="plus"/>}
              </button></td>;
            })}</tr>)}</tbody>
          </table>
        </div>
        <div className="admin-schedule-footer"><span>Демо · записи сохраняются в этом браузере</span></div>
      </main>}
    </div>
    {selection && <BookingPanel key={'bookingId' in selection ? selection.bookingId : `${selection.roomId}-${selection.date}-${selection.slotId}`} selection={selection} onClose={() => setSelection(null)} onCreated={created}/>}
  </div>;
}




