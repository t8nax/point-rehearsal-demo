import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { base, today, addDays, formatDate, price, statusLabels, isPastSlot, isActive, type Booking, type Room } from './domain';
import { store } from './store';
import { demoAuth } from './demo-auth';
import Equipment from './Equipment';
import './client.css';

const money = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

function ContactIcon({ kind }: { kind: 'send' | 'community' | 'chat' | 'phone' }) {
  const paths = {
    send: <><path d="m21 3-7 18-4-7-7-4 18-7Z" /><path d="m10 14 5-5" /></>,
    community: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87" /><circle cx="9" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chat: <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z" />,
  };
  return <svg className="client-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function RoomPhoto({ room, src }: { room: Room; src?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed
    ? <img src={src} alt={room.name} loading="lazy" onError={() => setFailed(true)} />
    : <div className="client-placeholder"><span>{String(room.id).padStart(2, '0')}</span><small>Фото пока нет</small></div>;
}

function Modal({ children, title, onClose, className = '' }: {
  children: ReactNode; title: string; onClose: () => void; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const element = dialog.current;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`client-dialog ${className}`} aria-label={title}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <button className="client-close" aria-label="Закрыть" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
    {children}
  </dialog>;
}

function SlotButtons({ room, date, bookings, onSelect }: {
  room: Room; date: string; bookings: Booking[]; onSelect: (slotId: string) => void;
}) {
  return <div className="client-slots">{base.schedule.slots.map(slot => {
    const busy = bookings.some(booking => booking.roomId === room.id && booking.date === date && booking.slotId === slot.id && isActive(booking));
    const past = isPastSlot(date, slot.id);
    const unavailable = busy || past;
    return <button key={slot.id} disabled={unavailable} onClick={() => onSelect(slot.id)}
      aria-label={`${room.name}, ${slot.start}–${slot.end}, ${money(price(room, date, slot.id))}${unavailable ? `, ${busy ? 'занято' : 'прошло'}` : ''}`}>
      <span>{slot.start}–{slot.end}</span>
      <small>{money(price(room, date, slot.id))}</small>
    </button>;
  })}</div>;
}

export default function Site() {
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [date, setDate] = useState(today);
  const [details, setDetails] = useState<Room | null>(null);
  const [selection, setSelection] = useState<{ room: Room; slotId: string } | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const result = state.bookings.find(booking => booking.id === resultId);
  const chooseSlot = (room: Room, slotId: string) => { setDetails(null); setSelection({ room, slotId }); };

  return <div className="client-app">
    <header className="client-header">
      <div className="client-topbar client-container">
        <span className="client-demo">Демо-концепт</span>
        <a className="client-wordmark" href="/" aria-label={`${base.base.name} — главная`}><span>Точка</span> Отсчёта</a>
        <div className="client-header-actions">
          <Link className="client-admin-link" to="/admin"><span>Панель администратора</span><span aria-hidden="true">→</span></Link>
        </div>
      </div>
      <div className="client-calendar client-container">
        <div className="client-calendar-label"><h1>Выберите дату</h1></div>
        <div className="client-dates" aria-label="Дата репетиции">
          {Array.from({ length: 14 }, (_, index) => addDays(today(), index)).map((day, index) => {
            const value = new Date(day + 'T12:00:00');
            return <button key={day} aria-pressed={date === day} aria-label={formatDate(day)}
              className={[0, 6].includes(value.getDay()) ? 'client-weekend' : ''}
              onClick={() => setDate(day)}>
              <small>{index === 0 ? 'Сегодня' : index === 1 ? 'Завтра' : value.toLocaleDateString('ru-RU', { weekday: 'short' })}</small>
              <strong>{value.getDate()}</strong>
            </button>;
          })}
        </div>
      </div>
    </header>

    <main className="client-main client-container">
      <div className="client-room-grid">{base.rooms.map(room => <article className="client-room" key={room.id}>
        <button className="client-room-photo" aria-label={`Фото и оборудование: ${room.name}`} onClick={() => setDetails(room)}>
          <RoomPhoto room={room} src={room.photos[0]} />
        </button>
        <div className="client-room-body">
          <div className="client-room-heading">
            <button onClick={() => setDetails(room)} aria-label={`Подробнее: ${room.name}`}><h2><span>Зал</span> {room.id}</h2></button>
            {room.area && <span className="client-area">{room.area} м²</span>}
          </div>
          <SlotButtons room={room} date={date} bookings={state.bookings} onSelect={slot => chooseSlot(room, slot)} />
        </div>
      </article>)}</div>
    </main>

    <footer className="client-footer">
      <div className="client-footer-grid client-container">
        <section><h2>Как добраться</h2><p>{base.base.city}, {base.base.address}</p><p className="client-muted">Метро: {base.base.metro.join(' / ')}</p>
          <a className="client-map-link" href={base.base.yandexMapsUrl} target="_blank" rel="noreferrer">Открыть в Яндекс Картах ↗</a>
        </section>
        <section><h2>Соцсети и связь</h2><div className="client-contact-links">
          <a href={base.base.contacts.telegram} target="_blank" rel="noreferrer"><ContactIcon kind="send" />Telegram</a>
          <a href={base.base.contacts.vk} target="_blank" rel="noreferrer"><ContactIcon kind="community" />ВКонтакте</a>
          <a href={base.base.contacts.max} target="_blank" rel="noreferrer"><ContactIcon kind="chat" />MAX</a>
          <a href={`https://wa.me/${base.base.contacts.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><ContactIcon kind="phone" />WhatsApp</a>
        </div><p className="client-muted">Администратор · {base.base.contacts.adminHours}. {base.base.contacts.note}</p></section>
      </div>
    </footer>

    {details && <RoomDetails room={details} date={date} bookings={state.bookings} onClose={() => setDetails(null)} onSelect={slot => chooseSlot(details, slot)} />}
    {selection && <BookingForm room={selection.room} date={date} slotId={selection.slotId} onClose={() => setSelection(null)} onBooked={booking => { setSelection(null); setResultId(booking.id); }} />}
    {result && <BookingResult booking={result} onClose={() => setResultId(null)} />}
  </div>;
}

function RoomDetails({ room, date, bookings, onClose, onSelect }: {
  room: Room; date: string; bookings: Booking[]; onClose: () => void; onSelect: (slotId: string) => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  return <Modal title={`Подробности: ${room.name}`} onClose={onClose} className="client-details-dialog">
    <div className="client-gallery" ref={strip} onScroll={event => setPhotoIndex(Math.round(event.currentTarget.scrollLeft / event.currentTarget.clientWidth))}>
      {room.photos.length ? room.photos.map(src => <div key={src}><RoomPhoto room={room} src={src} /></div>) : <RoomPhoto room={room} />}
    </div>
    {room.photos.length > 1 && <div className="client-gallery-controls">{room.photos.map((src, index) => <button key={src} aria-label={`Фото ${index + 1}`} aria-pressed={photoIndex === index}
      onClick={() => strip.current?.scrollTo({ left: index * strip.current.clientWidth, behavior: 'smooth' })}><span /></button>)}</div>}
    <div className="client-dialog-content">
      <div className="client-details-title"><h2>{room.name}</h2>{room.area && <span className="client-area">{room.area} м²</span>}</div>
      <Equipment room={room} />
      <h3 className="client-details-date">{formatDate(date)}</h3>
      <SlotButtons room={room} date={date} bookings={bookings} onSelect={onSelect} />
    </div>
  </Modal>;
}

function BookingForm({ room, date, slotId, onClose, onBooked }: {
  room: Room; date: string; slotId: string; onClose: () => void; onBooked: (booking: Booking) => void;
}) {
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const account = useSyncExternalStore(demoAuth.subscribe, demoAuth.get);
  const [band, setBand] = useState('');
  const [consent, setConsent] = useState(false);
  const slot = base.schedule.slots.find(item => item.id === slotId)!;
  function signIn() {
    try { demoAuth.login(); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить демо-вход.'); }
  }
  function signOut() {
    try { demoAuth.logout(); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выйти.'); }
  }
  return <Modal title="Бронирование" onClose={onClose}>
    <div className="client-dialog-content">
      <h2>Бронирование</h2>
      <dl className="client-booking-summary">
        <div><dt>Зал</dt><dd>{room.name}</dd></div>
        <div><dt>Дата</dt><dd>{formatDate(date)}</dd></div>
        <div><dt>Время</dt><dd>{slot.start}–{slot.end}</dd></div>
        <div className="client-summary-total"><dt>К оплате на месте</dt><dd>{money(price(room, date, slotId))}</dd></div>
      </dl>
      {!account ? <div className="client-auth-prompt" aria-live="polite">
        <h3>Войдите, чтобы забронировать</h3>
        <button type="button" className="client-telegram-login" onClick={signIn}><ContactIcon kind="send" />Войти через Telegram</button>
      </div> : <>
      <div className="client-auth-account" role="status">
        <span className="client-auth-avatar" aria-hidden="true">Д</span>
        <div><strong>{account.name}</strong><span>Telegram · {account.username} · демо</span></div>
        <button type="button" onClick={signOut}>Выйти</button>
      </div>
      <form onSubmit={event => {
        event.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
          const currentAccount = demoAuth.get();
          if (!currentAccount) throw new Error('Войдите через Telegram, чтобы продолжить запись.');
          onBooked(store.addBooking({ roomId: room.id, date, slotId, rentals: {}, band: band.trim(), channel: 'Telegram', contact: currentAccount.username, source: 'site',
            demoIdentity: { provider: 'telegram', mode: 'demo', name: currentAccount.name, username: currentAccount.username } }));
        } catch (err) { setError((err as Error).message); setSubmitting(false); }
      }}>
        <label className="client-field">Имя или название группы<input name="band" required maxLength={80} placeholder="Как вас записать?" value={band} onChange={event => setBand(event.target.value)} /></label>
        <div className="client-consent">
          <input id="client-cancellation-consent" type="checkbox" required aria-label="Согласен с правилами отмены" checked={consent} onChange={event => setConsent(event.target.checked)} />
          <div><label htmlFor="client-cancellation-consent">Согласен с </label><button type="button" className="client-rules-link" onClick={() => setShowRules(true)} aria-haspopup="dialog">правилами отмены</button>
          </div>
        </div>
        <button className="client-primary" type="submit" disabled={submitting}>Забронировать</button>
      </form>
      </>}
      {error && <p className="client-error" role="alert">{error}</p>}
      <p className="client-disclaimer">Демо-концепт. Реальная бронь не создаётся.</p>
    </div>
    {showRules && <Modal title="Правила отмены" onClose={() => setShowRules(false)}>
      <div className="client-dialog-content client-rules-content">
        <button type="button" className="client-rules-back" onClick={() => setShowRules(false)}>← Назад к записи</button>
        <h2>Правила отмены</h2>
        <p>{base.rules.cancellation.text}</p>
        {room.id === 7 && <p className="client-muted">Для зала 7 условия неустойки уточняйте у администратора.</p>}
      </div>
    </Modal>}
  </Modal>;
}

function BookingResult({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const slot = base.schedule.slots.find(item => item.id === booking.slotId)!;
  const title = booking.status === 'confirmed' ? 'Вы записаны' : statusLabels[booking.status];
  const date = new Date(`${booking.date}T12:00:00+03:00`);
  const month = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'Europe/Moscow' }).format(date);
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'Europe/Moscow' }).format(date);
  const duration = (Number(slot.end.split(':')[0]) * 60 + Number(slot.end.split(':')[1]) - Number(slot.start.split(':')[0]) * 60 - Number(slot.start.split(':')[1])) / 60;
  return <Modal title="Результат записи" onClose={onClose} className="client-result-dialog">
    <div className="client-dialog-content">
      <div className="client-ticket-status" aria-live="polite"><span aria-hidden="true">✓</span>{title}</div>
      <h2>{base.rooms.find(room => room.id === booking.roomId)?.name}</h2>
      <div className="client-ticket-date">
        <div><span>{month}</span><strong>{booking.date.slice(-2)}</strong><span>{weekday}</span></div>
        <div><strong>{slot.start}–{slot.end}</strong><span>{duration} часа</span></div>
      </div>
      <div className="client-ticket-total"><span>К оплате на месте</span><strong>{money(booking.total)}</strong></div>
      {booking.demoIdentity && <p className="client-disclaimer">Демо-концепт. Реальная бронь не создаётся.</p>}
    </div>
  </Modal>;
}
