import { useState } from 'react';
import type { Task } from '../api';
import { fromLocalInput, toLocalInput, ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';
import { CategorySelect, Modal, ReminderSelect, TaskLine } from './ui';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function TaskEditor({ initial, onClose }: { initial: Partial<Task>; onClose: () => void }) {
  const { saveTask, removeTask, tasks, settings } = useStore();
  const [t, setT] = useState<Partial<Task>>({ priority: 0, notes: '', ...initial });
  const [sub, setSub] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = ymd(new Date());
  const set = <K extends keyof Task>(k: K, v: Task[K] | null) => setT((x) => ({ ...x, [k]: v }));
  const subtasks = t.id ? tasks.filter((x) => x.parent_id === t.id) : [];

  async function save() {
    if (!t.title?.trim()) return;
    const draft = { ...t, title: t.title.trim() };
    if (draft.due_time && !draft.due_date) draft.due_date = today;
    if (!initial.id && draft.reminder_min === undefined && (draft.due_time || draft.scheduled_start)) draft.reminder_min = settings.defaultReminderMin;
    await saveTask(draft);
    onClose();
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!sub.trim() || !t.id) return;
    await saveTask({ title: sub.trim(), parent_id: t.id, category_id: t.category_id ?? null });
    setSub('');
  }

  return (
    <Modal
      title={t.id ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <>
          {t.id &&
            (confirmDelete ? (
              <button className="btn-danger" onClick={async () => { await removeTask(t.id!); onClose(); }}>Confirm delete</button>
            ) : (
              <button className="btn-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Delete</button>
            ))}
          <span className="grow" />
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-accent" onClick={save} disabled={!t.title?.trim()}>Save</button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field full">
          <span>Title</span>
          <input value={t.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="What needs doing?" />
        </label>
        <label className="field">
          <span>Category</span>
          <CategorySelect value={t.category_id ?? null} onChange={(v) => set('category_id', v)} />
        </label>
        <label className="field">
          <span>Priority</span>
          <select value={t.priority ?? 0} onChange={(e) => set('priority', Number(e.target.value))}>
            <option value={0}>None</option>
            <option value={1}>Low</option>
            <option value={2}>Medium</option>
            <option value={3}>High</option>
          </select>
        </label>
        <label className="field">
          <span>Due date</span>
          <input type="date" value={t.due_date ?? ''} onChange={(e) => set('due_date', e.target.value || null)} />
        </label>
        <label className="field">
          <span>Due time</span>
          <input type="time" value={t.due_time ?? ''} onChange={(e) => set('due_time', e.target.value || null)} />
        </label>
        <label className="field">
          <span>Time block (calendar)</span>
          <input
            type="datetime-local"
            value={t.scheduled_start ? toLocalInput(new Date(t.scheduled_start)) : ''}
            onChange={(e) => set('scheduled_start', e.target.value ? fromLocalInput(e.target.value).toISOString() : null)}
          />
        </label>
        <label className="field">
          <span>Duration</span>
          <select value={t.duration_min ?? ''} onChange={(e) => set('duration_min', e.target.value ? Number(e.target.value) : null)}>
            <option value="">Not set</option>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reminder</span>
          <ReminderSelect value={t.reminder_min ?? null} onChange={(v) => set('reminder_min', v)} />
        </label>
        <label className="field">
          <span>Repeat</span>
          <select value={t.recurrence ?? ''} onChange={(e) => set('recurrence', (e.target.value || null) as Task['recurrence'])}>
            <option value="">Never</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="field full toggle-row">
          <input type="checkbox" checked={t.top3_date === today} onChange={(e) => set('top3_date', e.target.checked ? today : null)} />
          <span>In today's Top 3</span>
        </label>
        <label className="field full">
          <span>Notes</span>
          <textarea rows={3} value={t.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
      {t.id && !t.parent_id && (
        <section className="subtasks">
          <h3>Subtasks</h3>
          {subtasks.map((s) => <TaskLine key={s.id} task={s} compact />)}
          <form onSubmit={addSub} className="qa-row">
            <label htmlFor="sub-add" className="sr-only">Add subtask</label>
            <input id="sub-add" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add subtask" />
            <button className="btn-ghost icon-only" aria-label="Add subtask" disabled={!sub.trim()}><Icon name="plus" /></button>
          </form>
        </section>
      )}
    </Modal>
  );
}
