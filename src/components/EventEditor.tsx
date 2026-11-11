import { useState } from 'react';
import type { CalEvent } from '../api';
import { addDays, fmtDayShort, fmtTime, fromLocalInput, parseYmd, toLocalInput, ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';
import { CategorySelect, Modal, ReminderSelect } from './ui';

export function EventEditor({ initial, onClose }: { initial: Partial<CalEvent>; onClose: () => void }) {
  if (initial.kind === 'ext') return <ExternalEvent ev={initial as CalEvent} onClose={onClose} />;
  return <OwnEvent initial={initial} onClose={onClose} />;
}

function OwnEvent({ initial, onClose }: { initial: Partial<CalEvent>; onClose: () => void }) {
  const { saveEvent, removeEvent, settings } = useStore();
  const [e, setE] = useState<Partial<CalEvent>>({ all_day: 0, location: '', notes: '', reminder_min: initial.id ? null : settings.defaultReminderMin, ...initial });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K] | null) => setE((x) => ({ ...x, [k]: v }));
  const allDay = !!e.all_day;

  function toggleAllDay(on: boolean) {
    if (on) {
      const s = e.start_at ? new Date(e.start_at) : new Date();
      setE((x) => ({ ...x, all_day: 1, start_at: ymd(s), end_at: ymd(addDays(s, 1)) }));
    } else {
      const s = e.start_at ? parseYmd(e.start_at.slice(0, 10)) : new Date();
      s.setHours(9, 0, 0, 0);
      setE((x) => ({ ...x, all_day: 0, start_at: s.toISOString(), end_at: new Date(s.getTime() + 3600000).toISOString() }));
    }
  }

  async function save() {
    if (!e.title?.trim() || !e.start_at || !e.end_at) return;
    await saveEvent({ ...e, title: e.title.trim() });
    onClose();
  }

  return (
    <Modal
      title={e.id ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          {e.id &&
            (confirmDelete ? (
              <button className="btn-danger" onClick={async () => { await removeEvent(e.id!); onClose(); }}>Confirm delete</button>
            ) : (
              <button className="btn-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete</button>
            ))}
          <span className="grow" />
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-accent" onClick={save} disabled={!e.title?.trim()}>Save</button>
        </>
      }
    >
      <form className="form" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <label className="field full">
          <span>Title</span>
          <input value={e.title ?? ''} onChange={(x) => set('title', x.target.value)} placeholder="Event name" />
        </label>
        <label className="field">
          <span>Category</span>
          <CategorySelect value={e.category_id ?? null} onChange={(v) => set('category_id', v)} />
        </label>
        <label className="field toggle-row">
          <input type="checkbox" checked={allDay} onChange={(x) => toggleAllDay(x.target.checked)} />
          <span>All day</span>
        </label>
        {allDay ? (
          <>
            <label className="field">
              <span>Start date</span>
              <input type="date" value={e.start_at ?? ''} onChange={(x) => x.target.value && set('start_at', x.target.value)} />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                type="date"
                value={e.end_at ? ymd(addDays(parseYmd(e.end_at), -1)) : ''}
                onChange={(x) => x.target.value && set('end_at', ymd(addDays(parseYmd(x.target.value), 1)))}
              />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              <span>Starts</span>
              <input
                type="datetime-local"
                value={e.start_at ? toLocalInput(new Date(e.start_at)) : ''}
                onChange={(x) => {
                  if (!x.target.value) return;
                  const s = fromLocalInput(x.target.value);
                  const dur = e.start_at && e.end_at ? Date.parse(e.end_at) - Date.parse(e.start_at) : 3600000;
                  setE((v) => ({ ...v, start_at: s.toISOString(), end_at: new Date(s.getTime() + Math.max(dur, 0)).toISOString() }));
                }}
              />
            </label>
            <label className="field">
              <span>Ends</span>
              <input type="datetime-local" value={e.end_at ? toLocalInput(new Date(e.end_at)) : ''} onChange={(x) => x.target.value && set('end_at', fromLocalInput(x.target.value).toISOString())} />
            </label>
          </>
        )}
        <label className="field">
          <span>Location</span>
          <input value={e.location ?? ''} onChange={(x) => set('location', x.target.value)} />
        </label>
        <label className="field">
          <span>Reminder</span>
          <ReminderSelect value={e.reminder_min ?? null} onChange={(v) => set('reminder_min', v)} />
        </label>
        <label className="field full">
          <span>Notes</span>
          <textarea rows={3} value={e.notes ?? ''} onChange={(x) => set('notes', x.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ExternalEvent({ ev, onClose }: { ev: CalEvent; onClose: () => void }) {
  const { setOverride } = useStore();
  const [cat, setCat] = useState(ev.category_id);
  const start = ev.all_day ? parseYmd(ev.start_at) : new Date(ev.start_at);
  const end = ev.all_day ? addDays(parseYmd(ev.end_at), -1) : new Date(ev.end_at);
  const when = ev.all_day
    ? `${fmtDayShort(start)}${ymd(start) !== ymd(end) ? ` – ${fmtDayShort(end)}` : ''} · all day`
    : `${fmtDayShort(start)} · ${fmtTime(start)}–${fmtTime(end)}`;
  return (
    <Modal
      title={ev.title}
      onClose={onClose}
      footer={
        <>
          <span className="grow" />
          <button className="btn-accent" onClick={async () => { await setOverride(ev.source_id!, ev.series_id!, cat); onClose(); }}>Save</button>
        </>
      }
    >
      <div className="form">
        <p className="field full muted">{when}{ev.location ? ` · ${ev.location}` : ''}</p>
        <p className="field full muted">From {ev.source_name} (read-only — edit it in the original calendar)</p>
        <label className="field full">
          <span>Category for this event and all its repeats</span>
          <CategorySelect value={cat} onChange={setCat} />
        </label>
      </div>
    </Modal>
  );
}
