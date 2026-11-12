import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Task } from '../api';
import { relativeDay, ymd } from '../lib/date';
import { useStore } from '../store';
import { Icon } from './Icon';
import { checklistProgress } from './NotesEditor';

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

interface Opt {
  value: string;
  label: string;
  group?: string;
}

/**
 * A dropdown whose last option lets you add a new option inline.
 * onCreate gets the typed text and returns the new option's value (or null to cancel).
 */
export function CreatableSelect({
  id, value, options, onChange, newLabel, onCreate, inputType = 'text', inputHint, ariaLabel,
}: {
  id?: string;
  value: string;
  options: Opt[];
  onChange: (v: string) => void;
  newLabel?: string;
  onCreate?: (text: string) => Promise<string | null> | string | null;
  inputType?: string;
  inputHint?: string;
  ariaLabel?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState('');
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  async function add() {
    if (!text.trim() || !onCreate) return;
    const v = await onCreate(text.trim());
    if (v !== null) onChange(v);
    setCreating(false);
    setText('');
  }
  if (creating)
    return (
      <span className="creatable-new">
        <input
          id={id}
          autoFocus
          type={inputType}
          value={text}
          placeholder={inputHint}
          aria-label={ariaLabel ?? newLabel}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(); }
            if (e.key === 'Escape') { e.stopPropagation(); setCreating(false); }
          }}
        />
        <button type="button" className="btn-accent small-btn" onClick={add} disabled={!text.trim()}>Add</button>
        <button type="button" className="btn-ghost small-btn" onClick={() => setCreating(false)}>Cancel</button>
      </span>
    );
  const render = (o: Opt) => <option key={o.value} value={o.value}>{o.label}</option>;
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(e) => (e.target.value === '__new__' ? setCreating(true) : onChange(e.target.value))}>
      {groups.length > 1
        ? groups.map((g) => (g ? <optgroup key={g} label={g}>{options.filter((o) => o.group === g).map(render)}</optgroup> : options.filter((o) => !o.group).map(render)))
        : options.map(render)}
      {onCreate && newLabel && <option value="__new__">＋ {newLabel}</option>}
    </select>
  );
}

export function AreaSelect({ value, onChange, id }: { value: string | null; onChange: (v: string) => void; id?: string }) {
  const { areas, createArea } = useStore();
  return (
    <CreatableSelect
      id={id}
      value={value ?? ''}
      options={areas.map((a) => ({ value: a.id, label: a.name }))}
      onChange={onChange}
      newLabel="New area…"
      inputHint="Area name"
      onCreate={async (name) => (await createArea(name)).id}
    />
  );
}

/** Sub-category picker. With areaId it lists that area's sub-categories and can create new ones. */
export function CategorySelect({ value, onChange, id, allowNone = true, areaId }: { value: string | null; onChange: (v: string | null) => void; id?: string; allowNone?: boolean; areaId?: string | null }) {
  const { areas, categories, createCategory } = useStore();
  const opts: Opt[] = [
    ...(allowNone ? [{ value: '', label: areaId ? 'No sub-category' : 'No category' }] : []),
    ...(areaId
      ? categories.filter((c) => c.area_id === areaId).map((c) => ({ value: c.id, label: c.name }))
      : areas.flatMap((a) => categories.filter((c) => c.area_id === a.id).map((c) => ({ value: c.id, label: c.name, group: a.name })))),
  ];
  return (
    <CreatableSelect
      id={id}
      value={value ?? ''}
      options={opts}
      onChange={(v) => onChange(v || null)}
      newLabel={areaId ? 'New sub-category…' : undefined}
      inputHint="Sub-category name"
      onCreate={areaId ? async (name) => (await createCategory(areaId, name)).id : undefined}
    />
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

function minutesLabel(m: number): string {
  if (m === 0) return 'At time';
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? '' : 's'} before`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'} before`;
  return `${m} min before`;
}

/** Parse "45", "45m", "2h", "1d" → minutes. */
function parseMinutes(t: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)?$/i.exec(t.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const u = (m[2] ?? 'm').toLowerCase()[0];
  const v = Math.round(u === 'h' ? n * 60 : u === 'd' ? n * 1440 : n);
  return v >= 0 && v <= 100000 ? v : null;
}

export function ReminderSelect({ value, onChange, id }: { value: number | null; onChange: (v: number | null) => void; id?: string }) {
  const { toast } = useStore();
  const opts: Opt[] = REMINDER_OPTIONS.map(([label, v]) => ({ value: v === null ? '' : String(v), label }));
  if (value !== null && !opts.some((o) => o.value === String(value))) opts.push({ value: String(value), label: minutesLabel(value) });
  return (
    <CreatableSelect
      id={id}
      value={value === null ? '' : String(value)}
      options={opts}
      onChange={(v) => onChange(v === '' ? null : Number(v))}
      newLabel="Custom reminder…"
      inputHint="e.g. 45m, 2h, 3d before"
      onCreate={(t) => {
        const m = parseMinutes(t);
        if (m === null) toast('Try something like 45m, 2h or 3d');
        return m === null ? null : String(m);
      }}
    />
  );
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export function durationLabel(d: number): string {
  return d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d / 60} h`;
}

export function DurationSelect({ value, onChange, id }: { value: number | null; onChange: (v: number | null) => void; id?: string }) {
  const { toast } = useStore();
  const opts: Opt[] = [{ value: '', label: 'Not set' }, ...DURATIONS.map((d) => ({ value: String(d), label: durationLabel(d) }))];
  if (value !== null && !DURATIONS.includes(value)) opts.push({ value: String(value), label: durationLabel(value) });
  return (
    <CreatableSelect
      id={id}
      value={value === null ? '' : String(value)}
      options={opts}
      onChange={(v) => onChange(v ? Number(v) : null)}
      newLabel="Custom duration…"
      inputHint="e.g. 20m, 1.5h"
      onCreate={(t) => {
        const m = parseMinutes(t);
        if (!m) toast('Try something like 20m or 1.5h');
        return m ? String(m) : null;
      }}
    />
  );
}

export function PrioritySelect({ value, onChange, id }: { value: number; onChange: (v: number) => void; id?: string }) {
  const { settings, updateSettings } = useStore();
  const labels = settings.priorityLabels;
  return (
    <CreatableSelect
      id={id}
      value={String(value)}
      options={labels.map((l, i) => ({ value: String(i), label: l }))}
      onChange={(v) => onChange(Number(v))}
      newLabel={labels.length < 10 ? 'New priority level…' : undefined}
      inputHint="e.g. Critical (ranks above the rest)"
      onCreate={async (t) => {
        await updateSettings({ priorityLabels: [...labels, t] });
        return String(labels.length);
      }}
    />
  );
}

const REPEATS: Opt[] = [
  { value: '', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function repeatLabel(r: string | null): string {
  if (!r) return 'Never';
  const m = /^every:(\d+):(day|week|month)$/.exec(r);
  if (m) return `Every ${m[1]} ${m[2]}${m[1] === '1' ? '' : 's'}`;
  return REPEATS.find((o) => o.value === r)?.label ?? r;
}

export function RepeatSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  const { toast } = useStore();
  const opts = [...REPEATS];
  if (value && !opts.some((o) => o.value === value)) opts.push({ value, label: repeatLabel(value) });
  return (
    <CreatableSelect
      id={id}
      value={value ?? ''}
      options={opts}
      onChange={(v) => onChange(v || null)}
      newLabel="Custom repeat…"
      inputHint="e.g. 3 days, 2 weeks, 6 months"
      onCreate={(t) => {
        const m = /^(?:every\s+)?(\d{1,3})\s*(d|day|days|w|wk|week|weeks|m|mo|month|months)$/i.exec(t.trim());
        if (!m || Number(m[1]) < 1) {
          toast('Try something like 3 days, 2 weeks or 6 months');
          return null;
        }
        const u = m[2].toLowerCase()[0];
        return `every:${Number(m[1])}:${u === 'd' ? 'day' : u === 'w' ? 'week' : 'month'}`;
      }}
    />
  );
}


/** One task line used in lists. */
export function TaskLine({ task, compact, extra, hideCategory }: { task: Task; compact?: boolean; extra?: ReactNode; hideCategory?: boolean }) {
  const { completeTask, reopenTask, openEditor, labelOf, colorOf, tasks, settings } = useStore();
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
  if (task.priority) meta.push(<span key="p" className={`prio p${Math.min(task.priority, 3)}`}><Icon name="flag" size={12} /> {settings.priorityLabels[task.priority] ?? `P${task.priority}`}</span>);
  if (task.recurrence) meta.push(<span key="r" className="inline-icon"><Icon name="repeat" size={12} /> {repeatLabel(task.recurrence)}</span>);
  if (subs.length) meta.push(<span key="s">{subs.filter((s) => s.done_at).length}/{subs.length} subtasks</span>);
  const cl = checklistProgress(task.notes);
  if (cl) meta.push(<span key="c" className="inline-icon"><Icon name="tasks" size={12} /> {cl}</span>);
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
