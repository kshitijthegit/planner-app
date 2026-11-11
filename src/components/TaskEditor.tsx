import { useState } from 'react';
import type { Task } from '../api';
import { fromLocalInput, toLocalInput, ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';
import { CategorySelect, childrenOf, depthOf, MAX_SUBTASK_DEPTH, Modal, ReminderSelect, TaskLine } from './ui';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function TaskEditor({ initial, onClose }: { initial: Partial<Task>; onClose: () => void }) {
  const { saveTask, removeTask, tasks, settings, openEditor } = useStore();
  const [t, setT] = useState<Partial<Task>>({ priority: 0, notes: '', ...initial });
  const [sub, setSub] = useState('');
  const [subDue, setSubDue] = useState('');
  const [pending, setPending] = useState<{ title: string; due_date: string | null }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = ymd(new Date());
  const set = <K extends keyof Task>(k: K, v: Task[K] | null) => setT((x) => ({ ...x, [k]: v }));
  const depth = depthOf(tasks, t);
  const canHaveSubtasks = depth < MAX_SUBTASK_DEPTH;
  const parent = t.parent_id ? tasks.find((x) => x.id === t.parent_id) : undefined;

  async function save() {
    if (!t.title?.trim()) return;
    const draft = { ...t, title: t.title.trim() };
    if (draft.due_time && !draft.due_date) draft.due_date = today;
    if (!initial.id && draft.reminder_min === undefined && (draft.due_time || draft.scheduled_start)) draft.reminder_min = settings.defaultReminderMin;
    const saved = await saveTask(draft);
    for (const p of pending) await saveTask({ title: p.title, due_date: p.due_date, parent_id: saved.id, category_id: saved.category_id });
    onClose();
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!sub.trim()) return;
    if (t.id) await saveTask({ title: sub.trim(), due_date: subDue || null, parent_id: t.id, category_id: t.category_id ?? null });
    else setPending((p) => [...p, { title: sub.trim(), due_date: subDue || null }]);
    setSub('');
    setSubDue('');
  }

  return (
    <Modal
      title={t.id ? (depth ? 'Edit subtask' : 'Edit task') : depth ? 'New subtask' : 'New task'}
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
      {parent && (
        <button className="link-btn crumb" onClick={() => openEditor({ type: 'task', task: parent })}>
          <Icon name="left" size={14} /> Subtask of “{parent.title}”
        </button>
      )}
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
      {canHaveSubtasks && (
        <section className="subtasks" aria-labelledby="subs-h">
          <h3 id="subs-h">Subtasks <span className="muted small">· each can have its own deadline{depth === 0 ? ' and its own subtasks' : ''}</span></h3>
          {t.id && childrenOf(tasks, t.id).map((c) => <SubtaskRow key={c.id} task={c} level={depth + 1} />)}
          {pending.map((p, i) => (
            <div key={i} className="task-line compact pending">
              <span className="grow">{p.title}</span>
              {p.due_date && <span className="muted small">{p.due_date}</span>}
              <button className="icon-btn small" aria-label={`Remove ${p.title}`} onClick={() => setPending((x) => x.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
            </div>
          ))}
          <form onSubmit={addSub} className="qa-row sub-add">
            <label htmlFor="sub-add" className="sr-only">Subtask title</label>
            <input id="sub-add" value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add subtask" />
            <label htmlFor="sub-due" className="sr-only">Subtask deadline</label>
            <input id="sub-due" type="date" value={subDue} onChange={(e) => setSubDue(e.target.value)} className="date-mini" />
            <button className="btn-ghost icon-only" aria-label="Add subtask" disabled={!sub.trim()}><Icon name="plus" /></button>
          </form>
          {!t.id && pending.length > 0 && <p className="muted small">Subtasks are created when you save.</p>}
        </section>
      )}
    </Modal>
  );
}

/** A subtask in the editor: complete, open, set its own deadline, and (one level down) see its own subtasks. */
function SubtaskRow({ task, level }: { task: Task; level: number }) {
  const { tasks, saveTask } = useStore();
  const kids = childrenOf(tasks, task.id);
  return (
    <div className={level > 1 ? 'subtree' : undefined}>
      <TaskLine
        task={task}
        hideCategory
        extra={
          <>
            <label htmlFor={`due-${task.id}`} className="sr-only">Deadline for {task.title}</label>
            <input id={`due-${task.id}`} type="date" className="date-mini" value={task.due_date ?? ''} onChange={(e) => saveTask({ id: task.id, due_date: e.target.value || null })} />
          </>
        }
      />
      {level < MAX_SUBTASK_DEPTH && kids.map((k) => <SubtaskRow key={k.id} task={k} level={level + 1} />)}
    </div>
  );
}
