import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';

export function Pencil() { return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-4-4L4 15z"/></svg>; }
export function Trash() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>; }
export function Dialog({ children, title, close, className = 'admin-dialog' }: { children: ReactNode; title: string; close: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={className} aria-label={title} onCancel={e => {
    // File inputs also emit a bubbling cancel event when their picker is dismissed.
    if (e.target !== e.currentTarget) return;
    e.preventDefault(); e.stopPropagation(); close();
  }} onClick={e => {
    if (e.target !== e.currentTarget) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  }}>{children}</dialog>;
}
export function Confirmation({ title, text, action, cancel, confirm, deletion = false }: { title: string; text: string; action: string; cancel: () => void; confirm: () => void; deletion?: boolean }) {
  const [error, setError] = useState('');
  return <Dialog title={title} close={cancel} className="admin-confirm-dialog">
    <h2>{title}</h2><p>{text}</p>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <div className="admin-confirm-actions"><button autoFocus onClick={cancel}>{deletion ? 'Отмена' : 'Продолжить редактирование'}</button><button className="admin-destructive" onClick={() => { try { confirm(); } catch (e) { setError((e as Error).message); } }}>{action}</button></div>
  </Dialog>;
}
export function DeleteConfirmation({ name, hall = false, cancel, confirm }: { name: string; hall?: boolean; cancel: () => void; confirm: () => void }) {
  return <Confirmation deletion title={`Удалить «${name}»?`} text={hall ? 'Зал пропадёт из расписания и с клиентского сайта. Действие нельзя отменить.' : 'Позиция пропадёт из каталога и с клиентского сайта. В уже сохранённых бронях она останется. Действие нельзя отменить.'} action={hall ? 'Удалить зал' : 'Удалить позицию'} cancel={cancel} confirm={confirm}/>;
}
export function useDirtyGuard(dirty: boolean, text: string) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  const blocked = blocker.state === 'blocked';
  return {
    request: (action: () => void) => dirty ? setPending(() => action) : action(),
    modal: (pending || blocked) && <Confirmation title="Закрыть без сохранения?" text={text} action="Не сохранять" cancel={() => { setPending(null); if (blocked) blocker.reset(); }} confirm={() => { setPending(null); if (blocked) blocker.proceed(); else pending?.(); }}/>,
  };
}
export function EditorHead({ label, title, close, remove, hall = false }: { label: string; title: string; close: () => void; remove?: () => void; hall?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => { if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss); return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return <div className="admin-panel-head"><div><p className="admin-label">{label}</p><h2>{title}</h2></div><div className="editor-head-actions" ref={ref} onKeyDown={e => { if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }}>
    {remove && <button className="admin-icon-button" aria-label="Другие действия" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>⋯</button>}
    <button className="admin-icon-button" aria-label="Закрыть редактирование" onClick={close}>×</button>
    {open && <div id={id} className="editor-more"><button onClick={() => { setOpen(false); remove?.(); }}><Trash/>{hall ? 'Удалить зал' : 'Удалить позицию'}</button></div>}
  </div></div>;
}
