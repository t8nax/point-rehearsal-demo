import { useEffect, useId, useRef, useState } from 'react';
import { addDays, today } from './domain';
import { formatDateInput, parseDateInput } from './admin-dates';

interface Props {
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
  label: string;
  showLabel?: boolean;
}

function monthOffset(month: string, offset: number) {
  const date = new Date(`${month}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

export default function AdminDatePicker({ value, min, max, onChange, label, showLabel = false }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState(() => formatDateInput(value));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(`${value.slice(0, 7)}-01`);
  const [error, setError] = useState('');

  useEffect(() => {
    setText(formatDateInput(value)); setError(''); input.current?.setCustomValidity('');
    setMonth(`${value.slice(0, 7)}-01`);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const start = new Date(`${month}T12:00:00Z`);
  const first = addDays(month, -((start.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index));
  const previous = monthOffset(month, -1), next = monthOffset(month, 1);
  const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start).replace(' г.', '');
  const currentDay = today();

  function message(raw: string) {
    const parsed = parseDateInput(raw);
    if (!parsed) return 'Введите существующую дату в формате ДД.ММ.ГГГГ';
    if (parsed < min || parsed > max) return `Выберите дату с ${formatDateInput(min)} по ${formatDateInput(max)}`;
    return '';
  }

  function commit() {
    const issue = message(text);
    setError(issue); input.current?.setCustomValidity(issue);
    if (issue) return;
    const parsed = parseDateInput(text)!;
    setText(formatDateInput(parsed)); onChange(parsed);
  }

  function choose(day: string) {
    setText(formatDateInput(day)); setError(''); input.current?.setCustomValidity('');
    onChange(day); setOpen(false); toggle.current?.focus({ preventScroll: true });
  }

  return <div className={`admin-date-field${showLabel ? ' admin-date-field-labeled' : ''}`} ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); toggle.current?.focus({ preventScroll: true }); }
  }}>
    {showLabel && <label htmlFor={`${id}-input`}>{label}</label>}
    <div className="admin-date-entry">
      <input ref={input} id={`${id}-input`} aria-label={label} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} type="text" inputMode="numeric" required autoComplete="off" maxLength={10} placeholder="ДД.ММ.ГГГГ" value={text} onChange={event => {
        const raw = event.target.value;
        const masked = /^\d{1,8}$/.test(raw) ? raw.slice(0, 2) + (raw.length > 2 ? `.${raw.slice(2, 4)}` : '') + (raw.length > 4 ? `.${raw.slice(4)}` : '') : raw;
        setText(masked); setError(''); input.current?.setCustomValidity(message(masked));
      }} onBlur={commit} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); setOpen(false); }
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
      }}/>
      <button ref={toggle} className="admin-date-toggle" type="button" aria-label={`Открыть календарь: ${label.toLowerCase()}`} aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => { if (!open) setMonth(`${value.slice(0, 7)}-01`); setOpen(!open); }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
      </button>
    </div>
    {error && <p className="admin-date-error" id={`${id}-error`} role="alert">{error}</p>}
    {open && <section className="admin-calendar-popup" id={`${id}-calendar`} aria-label={`Календарь: ${label.toLowerCase()}`}>
      <div className="admin-calendar-heading"><strong aria-live="polite">{monthLabel}</strong><div><button type="button" aria-label="Предыдущий месяц" disabled={addDays(month, -1) < min} onClick={() => setMonth(previous)}>‹</button><button type="button" aria-label="Следующий месяц" disabled={next > max} onClick={() => setMonth(next)}>›</button></div></div>
      <div className="admin-calendar-week" aria-hidden="true">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="admin-calendar-days" role="group" aria-label="Дни месяца">{days.map(day => <button type="button" key={day} data-day={day} className={`${day.slice(0, 7) !== month.slice(0, 7) ? 'admin-day-adjacent ' : ''}${day === currentDay ? 'admin-day-today' : ''}`} disabled={day < min || day > max} aria-pressed={day === value} aria-current={day === currentDay ? 'date' : undefined} aria-label={new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))} onClick={() => choose(day)} onKeyDown={event => {
        const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
        if (offset === undefined) return;
        event.preventDefault();
        root.current?.querySelector<HTMLButtonElement>(`[data-day="${addDays(day, offset)}"]:not(:disabled)`)?.focus();
      }}>{Number(day.slice(8))}</button>)}</div>
      <div className="admin-calendar-bottom"><button type="button" disabled={currentDay < min || currentDay > max} onClick={() => choose(currentDay)}>Сегодня</button><span>ДД.ММ.ГГГГ</span></div>
    </section>}
  </div>;
}
