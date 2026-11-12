import { useEffect, useState, type ReactNode } from 'react';
import { api, type CalEvent } from '../api';
import type { Task } from '../api';
import { ymd } from '../lib/date';
import { DateField, DateTimeField, TimeField } from './pickers';
import { useStore } from '../store';
import { Icon } from './Icon';
import { NotesEditor } from './NotesEditor';
import { AreaSelect, CategorySelect, childrenOf, depthOf, DurationSelect, MAX_SUBTASK_DEPTH, Modal, PrioritySelect, ReminderSelect, RepeatSelect, TaskLine } from './ui';

export function TaskEditor({ initial, onClose, top }: { initial: Partial<Task>; onClose: () => void; top?: ReactNode }) {
  const { saveTask, removeTask, tasks, settings, openEditor, areaIdOf } = useStore();
  const [t, setT] = useState<Partial<Task>>({ priority: 0, notes: '', ...initial, area_id: initial.area_id ?? areaIdOf(initial) });
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
    for (const p of pending) await saveTask({ title: p.title, due_date: p.due_date, parent_id: saved.id, category_id: saved.category_id, area_id: saved.area_id });
    onClose();
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    if (!sub.trim()) return;
    if (t.id) await saveTask({ title: sub.trim(), due_date: subDue || null, parent_id: t.id, category_id: t.category_id ?? null, area_id: t.area_id ?? null });
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
      {top}
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
          <span>Area</span>
          <AreaSelect value={t.area_id ?? null} onChange={(v) => setT((x) => ({ ...x, area_id: v, category_id: null }))} />
        </label>
        <label className="field">
          <span>Sub-category</span>
          <CategorySelect areaId={t.area_id} value={t.category_id ?? null} onChange={(v) => set('category_id', v)} />
        </label>
        <label className="field">
          <span>Priority</span>
          <PrioritySelect value={t.priority ?? 0} onChange={(v) => set('priority', v)} />
        </label>
        <div className="field">
          <span>Due date</span>
          <DateField ariaLabel="Due date" placeholder="No due date" value={t.due_date ?? null} onChange={(v) => set('due_date', v)} />
        </div>
        <div className="field">
          <span>Due time</span>
          <TimeField ariaLabel="Due time" placeholder="No time" value={t.due_time ?? null} onChange={(v) => set('due_time', v)} />
        </div>
        <div className="field">
          <span>Time block (calendar)</span>
          <DateTimeField label="Time block" value={t.scheduled_start ?? null} onChange={(v) => set('scheduled_start', v)} />
        </div>
        <label className="field">
          <span>Duration</span>
          <DurationSelect value={t.duration_min ?? null} onChange={(v) => set('duration_min', v)} />
        </label>
        <label className="field">
          <span>Reminder</span>
          <ReminderSelect value={t.reminder_min ?? null} onChange={(v) => set('reminder_min', v)} />
        </label>
        <label className="field">
          <span>Repeat</span>
          <RepeatSelect value={t.recurrence ?? null} onChange={(v) => set('recurrence', v)} />
        </label>
        <label className="field full toggle-row">
          <input type="checkbox" checked={t.top3_date === today} onChange={(e) => set('top3_date', e.target.checked ? today : null)} />
          <span>In today's Top 3</span>
        </label>
        <div className="field full">
          <NotesEditor value={t.notes ?? ''} onChange={(v) => set('notes', v)} />
        </div>
        <button type="submit" hidden />
      </form>
      {t.id && (
        <LinkedEvents
          task={t as Task}
          beforeOpen={async () => {
            // Keep unsaved edits (e.g. checklist ticks) before switching to the event.
            if (t.title?.trim()) await saveTask({ ...t, title: t.title.trim() });
          }}
        />
      )}
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
            <DateField id="sub-due" compact ariaLabel="Subtask deadline" placeholder="Deadline" value={subDue || null} onChange={(v) => setSubDue(v ?? '')} />
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
            <DateField id={`due-${task.id}`} compact ariaLabel={`Deadline for ${task.title}`} placeholder="Deadline" value={task.due_date ?? null} onChange={(v) => saveTask({ id: task.id, due_date: v })} />
          </>
        }
      />
      {level < MAX_SUBTASK_DEPTH && kids.map((k) => <SubtaskRow key={k.id} task={k} level={level + 1} />)}
    </div>
  );
}

/** Events created to work on this task, plus a button to schedule one. */
function LinkedEvents({ task, beforeOpen }: { task: Task; beforeOpen: () => Promise<void> }) {
  const { openEditor, agendaVersion, areaIdOf } = useStore();
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  useEffect(() => {
    api.get<CalEvent[]>(`/api/events/by-task/${task.id}`).then(setEvents).catch(() => setEvents([]));
  }, [task.id, agendaVersion]);

  async function schedule() {
    await beforeOpen();
    let start: Date;
    if (task.scheduled_start) start = new Date(task.scheduled_start);
    else {
      start = new Date();
      start.setHours(start.getHours() + 1, 0, 0, 0);
      if (task.due_date && task.due_date > ymd(start)) {
        start = new Date(`${task.due_date}T09:00:00`);
      }
    }
    const end = new Date(start.getTime() + (task.duration_min || 60) * 60000);
    openEditor({
      type: 'event',
      event: {
        kind: 'own', task_id: task.id, title: `Work on: ${task.title}`, area_id: areaIdOf(task), category_id: task.category_id,
        priority: task.priority, start_at: start.toISOString(), end_at: end.toISOString(), all_day: 0,
      },
    });
  }

  return (
    <section className="subtasks" aria-labelledby="linked-h">
      <h3 id="linked-h">Linked events <span className="muted small">· time booked on your calendar to do this</span></h3>
      {events?.map((e) => {
        const s = new Date(e.start_at);
        return (
          <button key={e.id} type="button" className="linked-event" onClick={async () => { await beforeOpen(); openEditor({ type: 'event', event: e }); }}>
            <Icon name="calendar" size={14} />
            <span className="grow">{e.title}</span>
            <span className="muted small">
              {e.all_day ? e.start_at : `${s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${s.toTimeString().slice(0, 5)}`}
              {e.recurrence ? ' · repeats' : ''}
            </span>
          </button>
        );
      })}
      <button type="button" className="btn-ghost small-btn" onClick={schedule}>
        <Icon name="plus" size={14} /> Create linked event
      </button>
    </section>
  );
}
