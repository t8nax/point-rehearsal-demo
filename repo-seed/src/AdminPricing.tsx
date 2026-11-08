import { newId } from './id';
import { Fragment, useState, useSyncExternalStore } from 'react';
import { base } from './domain';
import { savePricing } from './settings';
import { pricing, removeTariff, weekDays, type PricingConfig, type Tariff } from './pricing';
import { Trash, useDirtyGuard } from './AdminEditing';

const palette = [
  ['#171a1d', '#292e33', '#9ba2aa'], ['rgba(223,203,149,.055)', 'rgba(223,203,149,.3)', '#dfcb95'],
  ['rgba(164,210,172,.06)', 'rgba(164,210,172,.3)', '#a4d2ac'], ['rgba(168,184,201,.07)', 'rgba(168,184,201,.32)', '#a8b8c9'],
  ['rgba(242,189,182,.06)', 'rgba(242,189,182,.3)', '#f2bdb6'],
];
export const tariffStyle = (t: Tariff) => ({ background: palette[t.color][0], borderColor: palette[t.color][1], color: palette[t.color][2] });
export function Swatch({ tariff }: { tariff: Tariff }) { return <span className="tariff-swatch" style={tariffStyle(tariff)}/>; }
export default function AdminPricing() {
  const saved = useSyncExternalStore(pricing.subscribe, pricing.get);
  const [edited, setEdited] = useState<PricingConfig | null>(null);
  const draft = edited ?? saved;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const guard = useDirtyGuard(dirty, 'Изменения в «Тарифы» не сохранены и пропадут.');
  const [error, setError] = useState('');
  function save() {
    try {
      savePricing(draft);
      setEdited(null); setError('');
    } catch (e) { setError((e as Error).message); }
  }
  return <>
    <main className="admin-content pricing-content"><div className="pricing-page">
    <div className="pricing-heading"><h1>Тарифы</h1><p>Общие для всех залов: тарифы и когда какой действует. Цену каждого тарифа задают в карточке зала.</p></div>
    <section className="pricing-card"><h2>Тарифы</h2><p>Для каждого тарифа в карточке зала указывается своя цена.</p>
      {draft.tariffs.map(t => <div className="tariff-row" key={t.id}><Swatch tariff={t}/><input aria-label={`Название тарифа: ${t.name}`} maxLength={80} value={t.name} onChange={e => setEdited({ ...draft, tariffs: draft.tariffs.map(x => x.id === t.id ? { ...x, name: e.target.value } : x) })}/>
        {draft.tariffs.length > 1 && <button className="catalog-edit catalog-delete" aria-label={`Удалить тариф: ${t.name}`} onClick={() => setEdited(removeTariff(draft, t.id))}><Trash/></button>}
      </div>)}
      <button className="pricing-add-tariff" disabled={draft.tariffs.length >= 5} onClick={() => setEdited({ ...draft, tariffs: [...draft.tariffs, { id: newId(), name: 'Новый тариф', color: [0, 1, 2, 3, 4].find(c => !draft.tariffs.some(t => t.color === c)) ?? 0 }] })}>+ Добавить тариф</button>
    </section>
    <section className="pricing-card"><div className="pricing-grid-heading"><h2>Когда действует тариф</h2><div className="tariff-legend">{draft.tariffs.map(t => <span key={t.id}><Swatch tariff={t}/>{t.name}</span>)}</div></div><p>Нажмите на ячейку, чтобы сменить тариф на следующий из списка.</p>
      <div className="tariff-grid"><span/>{weekDays.map((day, i) => <span className={i > 4 ? 'weekend' : ''} key={day}>{day}</span>)}
        {base.schedule.slots.map(slot => <Fragment key={slot.id}><span className="tariff-time">{slot.start}–{slot.end}</span>{weekDays.map((day, d) => {
          const key = `${slot.id}:${d}`, t = draft.tariffs.find(t => t.id === draft.assignment[key])!;
          return <button key={key} style={tariffStyle(t)} aria-label={`${day}, ${slot.start}–${slot.end}: ${t.name}`} onClick={() => setEdited({ ...draft, assignment: { ...draft.assignment, [key]: draft.tariffs[(draft.tariffs.indexOf(t) + 1) % draft.tariffs.length].id } })}>{t.name}</button>;
        })}</Fragment>)}
      </div>
    </section>
    {error && <p className="admin-error" role="alert">{error}</p>}
    </div></main>
    {dirty && <div className="pricing-save-bar" role="region" aria-label="Несохранённые изменения"><span><i/>Есть несохранённые изменения</span><div><button onClick={() => { setEdited(null); setError(''); }}>Отменить</button><button className="admin-primary" onClick={save}>Сохранить</button></div></div>}
    {guard.modal}
  </>;
}
