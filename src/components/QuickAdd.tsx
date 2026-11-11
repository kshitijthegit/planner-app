import { useMemo, useState } from 'react';
import { fmtDuration, relativeDay } from '../lib/date';
import { parseQuickAdd } from '../lib/quickadd';
import { useStore } from '../store';
import { Icon } from './Icon';

export function QuickAdd({ id = 'quick-add', autoFocus, compact, extra }: { id?: string; autoFocus?: boolean; compact?: boolean; extra?: Partial<{ category_id: string | null; due_date: string | null }> }) {
  const { categories, areas, saveTask, settings, labelOf, colorOf } = useStore();
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseQuickAdd(text, categories, areas), [text, categories, areas]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title.trim()) return;
    await saveTask({
      ...extra,
      ...Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null && v !== 0 && v !== '')),
      title: parsed.title,
      reminder_min: parsed.due_time ? settings.defaultReminderMin : null,
    });
    setText('');
  }

  const chips: React.ReactNode[] = [];
  if (parsed.category_id) chips.push(<span key="c" className="chip" style={{ color: colorOf(parsed.category_id) }}>{labelOf(parsed.category_id)}</span>);
  if (parsed.due_date) chips.push(<span key="d" className="chip">{relativeDay(parsed.due_date)}{parsed.due_time ? ` ${parsed.due_time}` : ''}</span>);
  if (parsed.priority) chips.push(<span key="p" className="chip">{['', 'Low', 'Medium', 'High'][parsed.priority]} priority</span>);
  if (parsed.duration_min) chips.push(<span key="m" className="chip">{fmtDuration(parsed.duration_min)}</span>);

  return (
    <form className={`quick-add${compact ? ' compact' : ''}`} onSubmit={submit}>
      <label htmlFor={id} className="sr-only">Quick add a task</label>
      <div className="qa-row">
        <input
          id={id}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add task… e.g. laundry sat 10am #chores !high 30m"
          autoComplete="off"
          enterKeyHint="done"
        />
        <button type="submit" className="btn-accent icon-only" aria-label="Add task" disabled={!parsed.title.trim()}>
          <Icon name="plus" />
        </button>
      </div>
      {text && chips.length > 0 && <div className="qa-chips">{chips}</div>}
    </form>
  );
}
