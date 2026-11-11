import { useState, type ReactNode } from 'react';
import type { CalEvent } from '../api';
import { addDays, fmtDayShort, fmtTime, parseYmd, ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';
import { DateField, DateTimeField } from './pickers';
import { AreaSelect, CategorySelect, Modal, PrioritySelect, ReminderSelect, RepeatSelect } from './ui';

type Attendance = 'yes' | 'maybe' | 'no';

export function AttendancePicker({ value, onChange }: { value: Attendance; onChange: (v: Attendance) => void }) {
  const opts: [Attendance, string][] = [['yes', 'Yes'], ['maybe', 'Maybe'], ['no', 'No']];
  return (
    <div className="segmented attendance" role="radiogroup" aria-label="Planned attendance">
      {opts.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={`${value === v ? 'on' : ''} opt-${v}`} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function EventEditor({ initial, onClose, top }: { initial: Partial<CalEvent>; onClose: () => void; top?: ReactNode }) {
  if (initial.kind === 'ext') return <ExternalEvent ev={initial as CalEvent} onClose={onClose} />;
  return <OwnEvent initial={initial} onClose={onClose} top={top} />;
}

function OwnEvent({ initial, onClose, top }: { initial: Partial<CalEvent>; onClose: () => void; top?: ReactNode }) {
  const { saveEvent, removeEvent, settings, areaIdOf } = useStore();
  // An occurrence of a repeating event edits the whole series, so start from the series' own times.
  const seriesInitial: Partial<CalEvent> = {
    ...initial,
    start_at: initial.series_start_at ?? initial.start_at,
    end_at: initial.series_end_at ?? initial.end_at,
  };
  const [e, setE] = useState<Partial<CalEvent>>({
    all_day: 0, location: '', notes: '', priority: 0, attendance: 'yes', recurrence: null, recur_until: null,
    reminder_min: initial.id ? null : settings.defaultReminderMin,
    ...seriesInitial, area_id: initial.area_id ?? areaIdOf(initial),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K] | null) => setE((x) => ({ ...x, [k]: v }));
  const allDay = !!e.all_day;
  const repeating = !!initial.recurrence;

  function toggleAllDay(on: boolean) {
    if (on) {
      const s = e.start_at ? (e.start_at.length === 10 ? parseYmd(e.start_at) : new Date(e.start_at)) : new Date();
      setE((x) => ({ ...x, all_day: 1, start_at: ymd(s), end_at: ymd(addDays(s, 1)) }));
    } else {
      const s = e.start_at ? parseYmd(e.start_at.slice(0, 10)) : new Date();
      s.setHours(9, 0, 0, 0);
      setE((x) => ({ ...x, all_day: 0, start_at: s.toISOString(), end_at: new Date(s.getTime() + 3600000).toISOString() }));
    }
  }

  async function save() {
    if (!e.title?.trim() || !e.start_at || !e.end_at) return;
    const { source_id: _s, ext_id: _x, series_id: _r, source_name: _n, source_kind: _k, series_start_at: _ss, series_end_at: _se, ...own } = e;
    if (!own.recurrence) own.recur_until = null;
    await saveEvent({ ...own, title: e.title.trim() }, seriesInitial);
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
              <button className="btn-danger" onClick={async () => { await removeEvent(initial as CalEvent); onClose(); }}>
                {repeating ? 'Delete every occurrence' : 'Confirm delete'}
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete</button>
            ))}
          <span className="grow" />
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-accent" onClick={save} disabled={!e.title?.trim()}>Save</button>
        </>
      }
    >
      {top}
      {repeating && e.id && <p className="muted small note">Repeating event: changes apply to every occurrence.</p>}
      <form className="form" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        <label className="field full">
          <span>Title</span>
          <input value={e.title ?? ''} onChange={(x) => set('title', x.target.value)} placeholder="Event name" />
        </label>
        <label className="field">
          <span>Area</span>
          <AreaSelect value={e.area_id ?? null} onChange={(v) => setE((x) => ({ ...x, area_id: v, category_id: null }))} />
        </label>
        <label className="field">
          <span>Sub-category</span>
          <CategorySelect areaId={e.area_id} value={e.category_id ?? null} onChange={(v) => set('category_id', v)} />
        </label>
        <label className="field">
          <span>Priority</span>
          <PrioritySelect value={e.priority ?? 0} onChange={(v) => set('priority', v)} />
        </label>
        <div className="field">
          <span>Planned attendance</span>
          <AttendancePicker value={(e.attendance ?? 'yes') as Attendance} onChange={(v) => set('attendance', v)} />
        </div>
        <label className="field full toggle-row">
          <input type="checkbox" checked={allDay} onChange={(x) => toggleAllDay(x.target.checked)} />
          <span>All day (turns the whole day white on the calendar)</span>
        </label>
        {allDay ? (
          <>
            <div className="field">
              <span>Start date</span>
              <DateField ariaLabel="Start date" clearable={false} value={e.start_at?.slice(0, 10) ?? null} onChange={(v) => {
                if (!v) return;
                const span = e.start_at && e.end_at ? Math.max(1, Math.round((parseYmd(e.end_at).getTime() - parseYmd(e.start_at).getTime()) / 86400000)) : 1;
                setE((x) => ({ ...x, start_at: v, end_at: ymd(addDays(parseYmd(v), span)) }));
              }} />
            </div>
            <div className="field">
              <span>End date</span>
              <DateField
                ariaLabel="End date"
                clearable={false}
                min={e.start_at?.slice(0, 10)}
                value={e.end_at ? ymd(addDays(parseYmd(e.end_at), -1)) : null}
                onChange={(v) => v && set('end_at', ymd(addDays(parseYmd(v), 1)))}
              />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <span>Starts</span>
              <DateTimeField
                label="Start"
                clearable={false}
                value={e.start_at ?? null}
                onChange={(v) => {
                  if (!v) return;
                  const dur = e.start_at && e.end_at ? Date.parse(e.end_at) - Date.parse(e.start_at) : 3600000;
                  setE((x) => ({ ...x, start_at: v, end_at: new Date(Date.parse(v) + Math.max(dur, 0)).toISOString() }));
                }}
              />
            </div>
            <div className="field">
              <span>Ends</span>
              <DateTimeField label="End" clearable={false} value={e.end_at ?? null} onChange={(v) => v && set('end_at', v)} />
            </div>
          </>
        )}
        <label className="field">
          <span>Repeat</span>
          <RepeatSelect value={e.recurrence ?? null} onChange={(v) => set('recurrence', v)} />
        </label>
        {e.recurrence ? (
          <div className="field">
            <span>Repeat until (optional)</span>
            <DateField ariaLabel="Repeat until" placeholder="Forever" min={e.start_at?.slice(0, 10)} value={e.recur_until ?? null} onChange={(v) => set('recur_until', v)} />
          </div>
        ) : (
          <span className="field" />
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
  const { setOverride, setExtAttendance } = useStore();
  const [cat, setCat] = useState(ev.category_id);
  const [att, setAtt] = useState<Attendance>((ev.attendance ?? 'yes') as Attendance);
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
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-accent"
            onClick={async () => {
              if (cat !== ev.category_id) await setOverride(ev.source_id!, ev.series_id!, cat, ev.category_id);
              if (att !== (ev.attendance ?? 'yes')) await setExtAttendance(ev.source_id!, ev.ext_id!, att, (ev.attendance ?? 'yes') as Attendance);
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form">
        <p className="field full muted">{when}{ev.location ? ` · ${ev.location}` : ''}</p>
        <p className="field full muted small">From {ev.source_name}. Read-only: edit the event itself in the original calendar.</p>
        <div className="field">
          <span>Planned attendance</span>
          <AttendancePicker value={att} onChange={setAtt} />
        </div>
        <label className="field">
          <span>Sub-category for this event and all its repeats</span>
          <CategorySelect value={cat} onChange={setCat} />
        </label>
      </div>
    </Modal>
  );
}
