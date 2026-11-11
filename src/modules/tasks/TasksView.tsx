import { useState } from 'react';
import type { Task } from '../../api';
import { QuickAdd } from '../../components/QuickAdd';
import { descendants, Empty, TaskLine, TaskTree } from '../../components/ui';
import { ymd } from '../../lib/date';
import { useStore } from '../../store';

type Tab = 'today' | 'upcoming' | 'someday' | 'done';

export function TasksView() {
  const { tasks, areas, categories } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const today = ymd(new Date());
  const roots = tasks.filter((t) => !t.parent_id);
  const open = roots.filter((t) => !t.done_at);

  const lists: Record<Tab, Task[]> = {
    // A top-level task shows in Today if it, or any of its subtasks, is due by today.
    today: open.filter(
      (t) => (t.due_date && t.due_date <= today) || t.top3_date === today || descendants(tasks, t.id).some((d) => !d.done_at && d.due_date && d.due_date <= today),
    ),
    upcoming: open.filter((t) => t.due_date && t.due_date > today && t.top3_date !== today && !descendants(tasks, t.id).some((d) => !d.done_at && d.due_date && d.due_date <= today)),
    someday: open.filter((t) => !t.due_date && t.top3_date !== today),
    done: roots.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
  };
  const list = lists[tab];
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || b.priority - a.priority;

  const groups = [
    ...areas.flatMap((a) => categories.filter((c) => c.area_id === a.id).map((c) => ({ id: c.id as string | null, area: a.name, name: c.name, color: c.color }))),
    { id: null, area: '', name: 'No category', color: '#93A79C' },
  ];
  const known = new Set(categories.map((c) => c.id));

  return (
    <div className="tasks-page">
      <header className="page-head">
        <h1>Tasks</h1>
      </header>
      <QuickAdd id="qa-tasks" extra={tab === 'today' ? { due_date: today } : undefined} />
      <div className="tabs" role="tablist" aria-label="Task lists">
        {(['today', 'upcoming', 'someday', 'done'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)} <span className="count">{lists[t].length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <Empty>{tab === 'done' ? 'Nothing completed in the last 2 weeks.' : 'Nothing here.'}</Empty>}
      {tab === 'done' ? (
        <div className="list">{list.map((t) => <TaskLine key={t.id} task={t} />)}</div>
      ) : (
        groups.map((g) => {
          const items = list.filter((t) => (g.id === null ? !t.category_id || !known.has(t.category_id) : t.category_id === g.id)).sort(byDue);
          if (!items.length) return null;
          return (
            <section key={g.id ?? 'none'} className="section">
              <h2 className="eyebrow" style={{ color: g.color }}>{g.area ? `${g.area} · ${g.name}` : g.name}</h2>
              <div className="list">{items.map((t) => <TaskTree key={t.id} task={t} hideDone />)}</div>
            </section>
          );
        })
      )}
    </div>
  );
}
