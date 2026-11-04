import { useEffect, useId, useRef, useState } from 'react';

interface Option { value: string; label: string; disabled?: boolean }
interface Props {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  name?: string;
  hideLabel?: boolean;
}

export default function AdminSelect({ label, value, options, onChange, name, hideLabel }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const selected = options.findIndex(option => option.value === value);
  const enabled = options.flatMap((option, index) => option.disabled ? [] : [index]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const menu = root.current?.querySelector<HTMLElement>('[role="listbox"]');
    const option = root.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`);
    if (!menu || !option) return;
    const bounds = menu.getBoundingClientRect(), item = option.getBoundingClientRect();
    if (item.top < bounds.top) menu.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) menu.scrollTop += item.bottom - bounds.bottom;
  }, [active, open]);

  function show() {
    const bounds = root.current!.getBoundingClientRect(), expected = Math.min(options.length * 39 + 12, 250);
    setAbove(window.innerHeight - bounds.bottom < expected + 12 && bounds.top > expected);
    setActive(selected >= 0 && !options[selected].disabled ? selected : enabled[0] ?? 0); setOpen(true);
  }
  function choose(index: number) {
    if (!options[index] || options[index].disabled) return;
    onChange(options[index].value); setOpen(false); trigger.current?.focus({ preventScroll: true });
  }

  return <div className={`admin-select${hideLabel ? ' admin-select-compact' : ''}`} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true }); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      const index = enabled.indexOf(active), direction = event.key === 'ArrowDown' ? 1 : -1;
      setActive(enabled[(index + direction + enabled.length) % enabled.length] ?? 0); return;
    }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); setOpen(true); setActive(event.key === 'Home' ? enabled[0] ?? 0 : enabled.at(-1) ?? 0); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(active); else show(); }
  }}>
    <span id={`${id}-label`} className={hideLabel ? 'admin-sr-only' : 'admin-select-label'}>{label}</span>
    {name && <input type="hidden" name={name} value={value}/>}
    <button type="button" ref={trigger} className="admin-select-trigger" role="combobox" aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`} aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-option-${active}` : undefined} onClick={() => { if (open) setOpen(false); else show(); }}>
      <span id={`${id}-value`}>{options[selected]?.label || 'Выберите'}</span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
    </button>
    {open && <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className={`admin-select-menu${above ? ' admin-select-menu-above' : ''}`}>
      {options.map((option, index) => <button key={option.value} type="button" role="option" id={`${id}-option-${index}`} data-option-index={index} tabIndex={-1} disabled={option.disabled} aria-selected={option.value === value} className={index === active ? 'admin-option-active' : ''} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>}</button>)}
    </div>}
  </div>;
}
