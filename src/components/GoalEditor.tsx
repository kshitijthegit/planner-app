import { useState, type ReactNode } from 'react';
import type { Goal } from '../api';
import { ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';
import { AreaSelect, CategorySelect, Modal, PrioritySelect } from './ui';

export function GoalEditor({ initial, onClose, top }: { initial: Partial<Goal>; onClose: () => void; top?: ReactNode }) {
  const { saveGoal, removeGoal } = useStore();
  const today = ymd(new Date());
  const [g, setG] = useState<Partial<Goal>>({ priority: 0, notes: '', start_date: today, end_date: today, ...initial });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Goal>(k: K, v: Goal[K] | null) => setG((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!g.title?.trim() || !g.start_date) return;
    const end = !g.end_date || g.end_date < g.start_date ? g.start_date : g.end_date;
    await saveGoal({ ...g, title: g.title.trim(), end_date: end });
    onClose();
  }

  return (
    <Modal
      title={g.id ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      footer={
        <>
          {g.id &&
            (confirmDelete ? (
              <button className="btn-danger" onClick={async () => { await removeGoal(g.id!); onClose(); }}>Confirm delete</button>
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
        <label className="field">
          <span>From</span>
          <input type="date" value={g.start_date ?? ''} onChange={(e) => e.target.value && set('start_date', e.target.value)} />
        </label>
        <label className="field">
          <span>Until (same day = one-day goal)</span>
          <input type="date" value={g.end_date ?? ''} min={g.start_date} onChange={(e) => e.target.value && set('end_date', e.target.value)} />
        </label>
        {g.id && (
          <label className="field full toggle-row">
            <input type="checkbox" checked={!!g.done_at} onChange={(e) => set('done_at', e.target.checked ? new Date().toISOString() : null)} />
            <span>Achieved</span>
          </label>
        )}
        <label className="field full">
          <span>Notes</span>
          <textarea rows={3} value={g.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
