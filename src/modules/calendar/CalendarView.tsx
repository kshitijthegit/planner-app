import { useMemo, useState } from 'react';
import type { Task } from '../../api';
import { Icon } from '../../components/Icon';
import { Dot, Empty } from '../../components/ui';
import { addDays, fmtDuration, sameDay, startOfDay, startOfWeek, ymd } from '../../lib/date';
import { buildItems } from '../../lib/items';
import { useAgenda, useIsMobile, useStore } from '../../store';
import { useNow } from '../today/TodayView';
import { MonthGrid, TimeGrid } from './TimeGrid';

type View = 'day' | 'week' | 'month';

function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('cal-hidden') || '[]'));
  } catch {
    return new Set();
  }
}

export function CalendarView() {
  const { tasks, categories, colorOf, saveTask, openEditor, sources, settings } = useStore();
  const mobile = useIsMobile();
  const now = useNow();
  const [view, setView] = useState<View>(mobile ? 'day' : 'week');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [trayOpen, setTrayOpen] = useState(false);

  const [from, to, days] = useMemo(() => {
    if (view === 'day') return [anchor, addDays(anchor, 1), [anchor]];
    if (view === 'week') {
      const s = startOfWeek(anchor);
      return [s, addDays(s, 7), Array.from({ length: 7 }, (_, i) => addDays(s, i))];
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const s = addDays(first, -((first.getDay() + 6) % 7));
    return [s, addDays(s, 42), []];
  }, [view, anchor]);

  const { events } = useAgenda(from, to);
  const items = useMemo(
    () => buildItems(events, tasks).filter((i) => !hidden.has(i.categoryId ?? 'none')),
    [events, tasks, hidden],
  );

  function toggleCat(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    try {
      localStorage.setItem('cal-hidden', JSON.stringify([...next]));
    } catch {
      /* storage unavailable */
    }
  }

  function step(dir: number) {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === 'week') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  }

  const title =
    view === 'month'
      ? anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${days[0].getDate()} ${days[0].toLocaleDateString('en-GB', { month: 'short' })} – ${days[6].getDate()} ${days[6].toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
        : anchor.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const newEvent = (start: Date) =>
    openEditor({ type: 'event', event: { kind: 'own', start_at: start.toISOString(), end_at: new Date(start.getTime() + 3600000).toISOString(), all_day: 0 } });

  const dropTask = (id: string, start: Date) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    saveTask({ id, scheduled_start: start.toISOString(), duration_min: t.duration_min ?? 60, ...(t.reminder_min == null ? { reminder_min: settings.defaultReminderMin } : {}) });
  };

  const planOnMobile = (t: Task) => {
    const base = sameDay(anchor, new Date()) ? new Date() : new Date(anchor);
    if (sameDay(anchor, new Date())) base.setHours(base.getHours() + 1, 0, 0, 0);
    else base.setHours(9, 0, 0, 0);
    setTrayOpen(false);
    openEditor({ type: 'task', task: { ...t, scheduled_start: base.toISOString(), duration_min: t.duration_min ?? 60 } });
  };

  const hasSync = sources.some((s) => s.enabled);

  return (
    <div className={`calendar${mobile ? ' mobile' : ''}`}>
      <header className="cal-head">
        <div className="cal-nav">
          <button className="icon-btn bordered" aria-label="Previous" onClick={() => step(-1)}><Icon name="left" /></button>
          <button className="icon-btn bordered" aria-label="Next" onClick={() => step(1)}><Icon name="right" /></button>
          <button className="btn-ghost" onClick={() => setAnchor(startOfDay(new Date()))}>Today</button>
        </div>
        <h1 className="cal-title">{title}</h1>
        <div className="segmented" role="group" aria-label="View">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} aria-pressed={view === v} className={view === v ? 'on' : undefined} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <div className="filters" role="group" aria-label="Show categories">
          {categories.map((c) => (
            <button key={c.id} className={`filter-chip${hidden.has(c.id) ? ' off' : ''}`} aria-pressed={!hidden.has(c.id)} onClick={() => toggleCat(c.id)}>
              <Dot color={c.color} /> {c.name}
            </button>
          ))}
          <button className={`filter-chip${hidden.has('none') ? ' off' : ''}`} aria-pressed={!hidden.has('none')} onClick={() => toggleCat('none')}>
            <Dot color={colorOf(null)} /> Other
          </button>
        </div>
      </header>

      {mobile && view === 'day' && (
        <div className="week-strip" role="group" aria-label="Pick a day">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)).map((d) => (
            <button key={d.toISOString()} className={`ws-day${sameDay(d, anchor) ? ' on' : ''}${sameDay(d, now) ? ' today' : ''}`} aria-pressed={sameDay(d, anchor)} onClick={() => setAnchor(d)}>
              <span>{d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>
              <strong>{d.getDate()}</strong>
            </button>
          ))}
        </div>
      )}

      <div className="cal-body">
        <section className="cal-main" aria-label="Calendar">
          {view === 'month' ? (
            <MonthGrid anchor={anchor} items={items} now={now} onPickDay={(d) => { setAnchor(d); setView('day'); }} />
          ) : (
            <TimeGrid days={days} items={items} now={now} onCreate={newEvent} onDropTask={dropTask} />
          )}
          {!hasSync && <p className="muted small hint">Tip: connect Google Calendar or your uni Outlook calendar in Settings.</p>}
        </section>
        {mobile ? (
          <section className={`tray-sheet${trayOpen ? ' open' : ''}`} aria-label="Unscheduled tasks">
            <button className="sheet-handle" aria-expanded={trayOpen} onClick={() => setTrayOpen(!trayOpen)}>
              <span className="handle-bar" aria-hidden="true" />
              <span>Unscheduled · {tasks.filter((t) => !t.done_at && !t.parent_id && !t.scheduled_start).length}</span>
            </button>
            {trayOpen && <TaskTray onPlan={planOnMobile} />}
          </section>
        ) : (
          <aside className="tray" aria-label="Task tray">
            <h2>Task tray</h2>
            <p className="muted small">Drag a task onto the calendar to time-block it.</p>
            <TaskTray />
          </aside>
        )}
      </div>
      {mobile && !trayOpen && (
        <button className="fab" aria-label="New event" onClick={() => { const s = new Date(anchor); s.setHours(sameDay(anchor, new Date()) ? new Date().getHours() + 1 : 9, 0, 0, 0); newEvent(s); }}>
          <Icon name="plus" size={22} />
        </button>
      )}
    </div>
  );
}

function TaskTray({ onPlan }: { onPlan?: (t: Task) => void }) {
  const { tasks, areas, categories, openEditor } = useStore();
  const today = ymd(new Date());
  const open = tasks.filter((t) => !t.done_at && !t.parent_id && !t.scheduled_start);
  const groups = [
    ...areas.flatMap((a) => categories.filter((c) => c.area_id === a.id).map((c) => ({ id: c.id, label: `${a.name} · ${c.name}`, color: c.color }))),
    { id: null as string | null, label: 'No category', color: '#8A8F98' },
  ]
    .map((g) => ({ ...g, tasks: open.filter((t) => (t.category_id ?? null) === g.id || (g.id === null && t.category_id && !categories.some((c) => c.id === t.category_id))) }))
    .filter((g) => g.tasks.length);

  return (
    <div className="tray-groups">
      {groups.length === 0 && <Empty>No unscheduled tasks.</Empty>}
      {groups.map((g) => (
        <div key={g.id ?? 'none'} className="tray-group">
          <h3 className="eyebrow" style={{ color: g.color }}>{g.label}</h3>
          {g.tasks.map((t) => (
            <div
              key={t.id}
              className="tray-item"
              draggable={!onPlan}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', `task:${t.id}`);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              {!onPlan && <span className="grip" aria-hidden="true"><Icon name="grip" size={16} /></span>}
              <button className="tray-title" onClick={() => openEditor({ type: 'task', task: t })}>{t.title}</button>
              {t.due_date && t.due_date < today ? <span className="warn small">Overdue</span> : <span className="pill">{fmtDuration(t.duration_min ?? 60)}</span>}
              {onPlan && <button className="btn-ghost small-btn" onClick={() => onPlan(t)}>Plan</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
