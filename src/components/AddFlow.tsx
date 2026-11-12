// Two-step "add" flow: 1) who is it for (Personal / University / Work…), 2) the details.
import { useState } from 'react';
import type { CalEvent, Goal, Task } from '../api';
import { useStore } from '../store';
import { EventEditor } from './EventEditor';
import { GoalEditor } from './GoalEditor';
import { Icon } from './Icon';
import { TaskEditor } from './TaskEditor';
import { Modal } from './ui';

export type AddKind = 'event' | 'task' | 'goal';

interface Props {
  kind: AddKind;
  initial: Partial<Task> & Partial<CalEvent> & Partial<Goal>;
  onClose: () => void;
}

const KIND_LABEL: Record<AddKind, string> = { event: 'Event', task: 'Task', goal: 'Goal' };

export function AddFlow({ kind: startKind, initial, onClose }: Props) {
  const { areas, createArea, areaIdOf } = useStore();
  const [kind, setKind] = useState<AddKind>(startKind);
  const [areaId, setAreaId] = useState<string | null>(initial.area_id ?? areaIdOf(initial));
  const [newArea, setNewArea] = useState<string | null>(null);

  if (!areaId) {
    return (
      <Modal title={`New ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose}>
        <p className="step-label">Step 1 of 2 · Who is this for?</p>
        <div className="area-picks" role="group" aria-label="Area">
          {areas.map((a) => (
            <button key={a.id} className="area-pick" onClick={() => setAreaId(a.id)}>
              <span className="area-swatch" style={{ background: a.color }} aria-hidden="true" />
              <span className="area-pick-name">{a.name}</span>
              <Icon name="right" size={18} />
            </button>
          ))}
          {newArea === null ? (
            <button className="area-pick ghost" onClick={() => setNewArea('')}>
              <Icon name="plus" size={18} /> <span className="area-pick-name">New area</span>
            </button>
          ) : (
            <form
              className="creatable-new"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newArea.trim()) return;
                setAreaId((await createArea(newArea.trim())).id);
              }}
            >
              <label htmlFor="new-area-name" className="sr-only">New area name</label>
              <input id="new-area-name" autoFocus value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="e.g. Health" />
              <button className="btn-accent small-btn" disabled={!newArea.trim()}>Add</button>
              <button type="button" className="btn-ghost small-btn" onClick={() => setNewArea(null)}>Cancel</button>
            </form>
          )}
        </div>
      </Modal>
    );
  }

  const area = areas.find((a) => a.id === areaId);
  const top = (
    <div className="add-top">
      <button className="area-chip" onClick={() => setAreaId(null)} aria-label={`Change area (currently ${area?.name})`}>
        <Icon name="left" size={14} />
        <span className="area-swatch small" style={{ background: area?.color }} aria-hidden="true" />
        {area?.name}
      </button>
      <div className="segmented" role="group" aria-label="Type">
        {(['event', 'task', 'goal'] as AddKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} className={kind === k ? 'on' : undefined} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <span className="step-label">Step 2 of 2 · Details</span>
    </div>
  );
  const base = { title: initial.title, area_id: areaId, category_id: initial.category_id && areaIdOf(initial) === areaId ? initial.category_id : null };

  // key forces a fresh editor when the type or area changes.
  if (kind === 'event')
    return <EventEditor key={`e-${areaId}`} top={top} onClose={onClose} initial={{ kind: 'own', start_at: initial.start_at, end_at: initial.end_at, all_day: initial.all_day ?? 0, task_id: initial.task_id ?? null, priority: initial.priority ?? 0, ...base }} />;
  if (kind === 'goal')
    return <GoalEditor key={`g-${areaId}`} top={top} onClose={onClose} initial={{ start_date: initial.start_date ?? initial.due_date ?? undefined, end_date: initial.end_date ?? initial.due_date ?? undefined, ...base }} />;
  return <TaskEditor key={`t-${areaId}`} top={top} onClose={onClose} initial={{ due_date: initial.due_date, scheduled_start: initial.scheduled_start, parent_id: initial.parent_id, ...base }} />;
}
