import { useState } from 'react';
import type { Task } from '../../api';
import { QuickAdd } from '../../components/QuickAdd';
import { Icon } from '../../components/Icon';
import { Check, descendants, Empty, TaskLine, TaskTree } from '../../components/ui';
import { relativeDay, ymd } from '../../lib/date';
import { onDark } from '../../lib/items';
import { useStore } from '../../store';

type Tab = 'today' | 'upcoming' | 'someday' | 'goals' | 'done';

export function TasksView() {
  const { tasks, goals, areas, categories, openEditor, areaColor, areaIdOf, saveGoal } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const today = ymd(new Date());
  const roots = tasks.filter((t) => !t.parent_id);
  const open = roots.filter((t) => !t.done_at);

  const lists: Record<Exclude<Tab, 'goals'>, Task[]> = {
    // A top-level task shows in Today if it, or any of its subtasks, is due by today.
    today: open.filter(
      (t) => (t.due_date && t.due_date <= today) || t.top3_date === today || descendants(tasks, t.id).some((d) => !d.done_at && d.due_date && d.due_date <= today),
    ),
    upcoming: open.filter((t) => t.due_date && t.due_date > today && t.top3_date !== today && !descendants(tasks, t.id).some((d) => !d.done_at && d.due_date && d.due_date <= today)),
    someday: open.filter((t) => !t.due_date && t.top3_date !== today),
    done: roots.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
  };
  const list = tab === 'goals' ? [] : lists[tab as Exclude<Tab, 'goals'>];
  const openGoals = goals.filter((g) => !g.done_at).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9') || b.priority - a.priority;

  const groups = [
    ...areas.flatMap((a) => categories.filter((c) => c.area_id === a.id).map((c) => ({ id: c.id as string | null, area: a.name, name: c.name, color: c.color }))),
    { id: null, area: '', name: 'No category', color: '#93A79C' },
  ];
  const known = new Set(categories.map((c) => c.id));

  return (
    <div className="tasks-page">
      <header className="page-head row">
        <h1>Tasks</h1>
        <button className="btn-accent" onClick={() => (tab === 'goals' ? openEditor({ type: 'goal', goal: {} }) : openEditor({ type: 'task', task: tab === 'today' ? { due_date: today } : {} }))}>
          <Icon name="plus" size={16} /> New
        </button>
      </header>
      <QuickAdd id="qa-tasks" extra={tab === 'today' ? { due_date: today } : undefined} />
      <div className="tabs" role="tablist" aria-label="Task lists">
        {(['today', 'upcoming', 'someday', 'goals', 'done'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)} <span className="count">{t === 'goals' ? openGoals.length : lists[t].length}</span>
          </button>
        ))}
      </div>
      {tab === 'goals' && (
        <div className="list">
          {openGoals.length === 0 && <Empty>No goals yet. Goals show at the top of each day they cover.</Empty>}
          {openGoals.map((g) => (
            <div key={g.id} className="task-line">
              <Check checked={!!g.done_at} label={`Mark ${g.title} achieved`} onChange={(v) => saveGoal({ id: g.id, done_at: v ? new Date().toISOString() : null })} />
              <button className="task-main" onClick={() => openEditor({ type: 'goal', goal: g })}>
                <span className="task-title">{g.title}</span>
                <span className="task-meta">
                  <span className="cat-label" style={{ color: onDark(areaColor(areaIdOf(g))) }}>{areas.find((a) => a.id === areaIdOf(g))?.name ?? 'No area'}</span>
                  <span>{g.start_date === g.end_date ? relativeDay(g.start_date) : `${relativeDay(g.start_date)} – ${relativeDay(g.end_date)}`}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {tab !== 'goals' && list.length === 0 && <Empty>{tab === 'done' ? 'Nothing completed in the last 2 weeks.' : 'Nothing here.'}</Empty>}
      {tab === 'goals' ? null : tab === 'done' ? (
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
