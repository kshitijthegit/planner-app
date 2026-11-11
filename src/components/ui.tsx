import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Task } from '../api';
import { relativeDay, ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    ref.current?.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('.modal-body input:not([type=checkbox]), .modal-body textarea, .modal-body select');
    (first ?? ref.current)?.focus();
    const el = ref.current;
    return () => el?.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check${checked ? ' on' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      {checked && <Icon name="check" size={14} stroke={2.6} />}
    </button>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="dot" style={{ background: color, width: size, height: size }} />;
}

export function CategorySelect({ value, onChange, id, allowNone = true }: { value: string | null; onChange: (v: string | null) => void; id?: string; allowNone?: boolean }) {
  const { areas, categories } = useStore();
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">No category</option>}
      {areas.map((a) => (
        <optgroup key={a.id} label={a.name}>
          {categories
            .filter((c) => c.area_id === a.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export const REMINDER_OPTIONS: [string, number | null][] = [
  ['No reminder', null],
  ['At time', 0],
  ['5 min before', 5],
  ['10 min before', 10],
  ['15 min before', 15],
  ['30 min before', 30],
  ['1 hour before', 60],
  ['1 day before', 1440],
];

export function ReminderSelect({ value, onChange, id }: { value: number | null; onChange: (v: number | null) => void; id?: string }) {
  return (
    <select id={id} value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      {REMINDER_OPTIONS.map(([label, v]) => (
        <option key={label} value={v === null ? '' : String(v)}>
          {label}
        </option>
      ))}
    </select>
  );
}

const PRIORITY_LABEL = ['', 'Low', 'Medium', 'High'];

/** One task line used in lists. */
export function TaskLine({ task, compact, extra, hideCategory }: { task: Task; compact?: boolean; extra?: ReactNode; hideCategory?: boolean }) {
  const { completeTask, reopenTask, openEditor, labelOf, colorOf, tasks } = useStore();
  const today = ymd(new Date());
  const overdue = !task.done_at && task.due_date && task.due_date < today;
  const subs = descendants(tasks, task.id);
  const meta: ReactNode[] = [];
  if (task.due_date)
    meta.push(
      <span key="due" className={overdue ? 'warn' : undefined}>
        {overdue ? 'Overdue · ' : ''}
        {relativeDay(task.due_date, today)}
        {task.due_time ? ` ${task.due_time}` : ''}
      </span>,
    );
  if (task.priority) meta.push(<span key="p" className={`prio p${task.priority}`}><Icon name="flag" size={12} /> {PRIORITY_LABEL[task.priority]}</span>);
  if (task.recurrence) meta.push(<span key="r" className="inline-icon"><Icon name="repeat" size={12} /> {task.recurrence}</span>);
  if (subs.length) meta.push(<span key="s">{subs.filter((s) => s.done_at).length}/{subs.length} subtasks</span>);
  return (
    <div className={`task-line${task.done_at ? ' done' : ''}${compact ? ' compact' : ''}`}>
      <Check checked={!!task.done_at} label={`Complete ${task.title}`} onChange={(v) => (v ? completeTask(task.id) : reopenTask(task.id))} />
      <button className="task-main" onClick={() => openEditor({ type: 'task', task })}>
        <span className="task-title">{task.title}</span>
        {!compact && (meta.length > 0 || (task.category_id && !hideCategory)) && (
          <span className="task-meta">
            {task.category_id && !hideCategory && (
              <span className="cat-label" style={{ color: colorOf(task.category_id) }}>
                {labelOf(task.category_id)}
              </span>
            )}
            {meta}
          </span>
        )}
      </button>
      {compact && task.category_id && <Dot color={colorOf(task.category_id)} />}
      {extra}
    </div>
  );
}

export const MAX_SUBTASK_DEPTH = 2;

export function childrenOf(tasks: Task[], id: string): Task[] {
  return tasks.filter((t) => t.parent_id === id).sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || a.created_at.localeCompare(b.created_at));
}

/** All subtasks and sub-subtasks of a task. */
export function descendants(tasks: Task[], id: string): Task[] {
  const kids = tasks.filter((t) => t.parent_id === id);
  return [...kids, ...kids.flatMap((k) => tasks.filter((t) => t.parent_id === k.id))];
}

export function depthOf(tasks: Task[], task: Partial<Task>): number {
  let d = 0;
  let p = task.parent_id;
  while (p && d < 5) {
    d++;
    p = tasks.find((t) => t.id === p)?.parent_id ?? null;
  }
  return d;
}

/** A task with its subtasks (and their subtasks) nested underneath, collapsible. */
export function TaskTree({ task, depth = 0, hideDone = false }: { task: Task; depth?: number; hideDone?: boolean }) {
  const { tasks } = useStore();
  const kids = childrenOf(tasks, task.id).filter((k) => !hideDone || !k.done_at);
  const [open, setOpen] = useState(true);
  return (
    <div className={depth ? 'subtree' : undefined}>
      <TaskLine
        task={task}
        hideCategory={depth > 0}
        extra={
          kids.length > 0 && (
            <button className="icon-btn small" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} subtasks of ${task.title}`} onClick={() => setOpen(!open)}>
              <Icon name={open ? 'down' : 'right'} size={16} />
            </button>
          )
        }
      />
      {open && kids.map((k) => <TaskTree key={k.id} task={k} depth={depth + 1} hideDone={hideDone} />)}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
