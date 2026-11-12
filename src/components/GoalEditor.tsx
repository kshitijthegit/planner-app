import { useState, type ReactNode } from 'react';
import type { Goal } from '../api';
import { addDays, parseYmd, ymd } from '../lib/date';
import { useStore } from '../store';
import { ScopeSwitch, type Scope } from './EventEditor';
import { Icon } from './Icon';
import { NotesEditor } from './NotesEditor';
import { DateField } from './pickers';
import { AreaSelect, CategorySelect, Modal, PrioritySelect, RepeatSelect } from './ui';

export function GoalEditor({ initial, onClose, top }: { initial: Partial<Goal>; onClose: () => void; top?: ReactNode }) {
  const isOcc = !!(initial.id && initial.recurrence && initial.occ_date);
  const [scope, setScope] = useState<Scope>(isOcc ? 'one' : 'all');
  const occLabel = initial.occ_date ? parseYmd(initial.occ_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  return (
    <GoalForm
      key={scope}
      initial={initial}
      onClose={onClose}
      scope={isOcc ? scope : 'all'}
      top={
        <>
          {top}
          {isOcc && <ScopeSwitch scope={scope} onChange={setScope} occLabel={occLabel} />}
        </>
      }
    />
  );
}

const OCC_FIELDS: (keyof Goal)[] = ['title', 'start_date', 'end_date', 'notes', 'priority', 'category_id', 'area_id'];

function GoalForm({ initial, onClose, top, scope }: { initial: Partial<Goal>; onClose: () => void; top?: ReactNode; scope: Scope }) {
  const { saveGoal, removeGoal, setOccurrence, goals } = useStore();
  const today = ymd(new Date());
  const one = scope === 'one';
  // "Every occurrence" edits the series as stored; "only this one" starts from the occurrence.
  const series = initial.id ? goals.find((g) => g.id === initial.id) : undefined;
  const base: Partial<Goal> = one ? initial : series ? { ...series } : initial;
  const [g, setG] = useState<Partial<Goal>>({ priority: 0, notes: '', start_date: today, end_date: today, recurrence: null, ...base });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Goal>(k: K, v: Goal[K] | null) => setG((x) => ({ ...x, [k]: v }));
  const prev = initial.override
    ? { kind: 'goal' as const, series_id: initial.id!, occ_date: initial.occ_date!, cancelled: !!initial.override.cancelled, done_at: initial.override.done_at, data: initial.override.data }
    : null;

  async function save() {
    if (!g.title?.trim() || !g.start_date) return;
    const end = !g.end_date || g.end_date < g.start_date ? g.start_date : g.end_date;
    if (one) {
      const diff: Record<string, unknown> = { ...(initial.override?.data ?? {}) };
      for (const k of OCC_FIELDS) if (g[k] !== initial[k]) diff[k] = g[k] ?? null;
      diff.title = g.title.trim();
      diff.end_date = end;
      await setOccurrence(
        { kind: 'goal', series_id: initial.id!, occ_date: initial.occ_date!, data: diff, done_at: g.done_at ?? null },
        prev,
        `Changed goal “${g.title.trim()}” on ${initial.occ_date}`,
      );
      onClose();
      return;
    }
    const { occ_date: _o, series_start_date: _s, series_end_date: _e, overridden: _v, override: _x, ...rest } = g;
    if (!rest.recurrence) rest.recur_until = null;
    await saveGoal({ ...rest, title: g.title.trim(), end_date: end });
    onClose();
  }

  return (
    <Modal
      title={g.id ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      footer={
        <>
          {g.id && one && (
            <button
              className="btn-ghost"
              onClick={async () => {
                await setOccurrence(
                  { kind: 'goal', series_id: initial.id!, occ_date: initial.occ_date!, cancelled: true, data: initial.override?.data ?? {} },
                  prev,
                  `Cancelled goal “${initial.title}” on ${initial.occ_date}`,
                );
                onClose();
              }}
            >
              <Icon name="close" size={16} /> Cancel this one
            </button>
          )}
          {g.id &&
            !one &&
            (confirmDelete ? (
              <button className="btn-danger" onClick={async () => { await removeGoal(g.id!); onClose(); }}>
                {g.recurrence ? 'Delete every occurrence' : 'Confirm delete'}
              </button>
            ) : (
              <button className="btn-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete</button>
            ))}
          <span className="grow" />
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-accent" onClick={save} disabled={!g.title?.trim()}>Save</button>
        </>
      }
    >
      {top}
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field full">
          <span>Goal</span>
          <input value={g.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Finish FEM chapter 4 revision" />
        </label>
        <label className="field">
          <span>Area</span>
          <AreaSelect value={g.area_id ?? null} onChange={(v) => setG((x) => ({ ...x, area_id: v, category_id: null }))} />
        </label>
        <label className="field">
          <span>Sub-category</span>
          <CategorySelect areaId={g.area_id} value={g.category_id ?? null} onChange={(v) => set('category_id', v)} />
        </label>
        <label className="field">
          <span>Priority</span>
          <PrioritySelect value={g.priority ?? 0} onChange={(v) => set('priority', v)} />
        </label>
        <span className="field" />
        <div className="field">
          <span>From</span>
          <DateField ariaLabel="Goal start" clearable={false} value={g.start_date ?? null} onChange={(v) => {
            if (!v) return;
            // Keep the same length when moving the start.
            const len = g.start_date && g.end_date ? Math.round((parseYmd(g.end_date).getTime() - parseYmd(g.start_date).getTime()) / 86400000) : 0;
            setG((x) => ({ ...x, start_date: v, end_date: ymd(addDays(parseYmd(v), Math.max(0, len))) }));
          }} />
        </div>
        <div className="field">
          <span>Until (same day = one-day goal)</span>
          <DateField ariaLabel="Goal end" clearable={false} min={g.start_date} value={g.end_date ?? null} onChange={(v) => v && set('end_date', v)} />
        </div>
        {!one && (
          <>
            <label className="field">
              <span>Repeat</span>
              <RepeatSelect value={g.recurrence ?? null} onChange={(v) => set('recurrence', v)} />
            </label>
            {g.recurrence ? (
              <div className="field">
                <span>Repeat until (optional)</span>
                <DateField ariaLabel="Repeat until" placeholder="Forever" min={g.start_date} value={g.recur_until ?? null} onChange={(v) => set('recur_until', v)} />
              </div>
            ) : (
              <span className="field" />
            )}
          </>
        )}
        {(g.id && (one || !g.recurrence)) && (
          <label className="field full toggle-row">
            <input type="checkbox" checked={!!g.done_at} onChange={(e) => set('done_at', e.target.checked ? new Date().toISOString() : null)} />
            <span>Achieved{one ? ' (this time)' : ''}</span>
          </label>
        )}
        <div className="field full">
          <NotesEditor value={g.notes ?? ''} onChange={(v) => set('notes', v)} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
