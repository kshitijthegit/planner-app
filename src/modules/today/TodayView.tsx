import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Task } from '../../api';
import { Icon } from '../../components/Icon';
import { QuickAdd } from '../../components/QuickAdd';
import { Check, Dot, Empty, TaskLine, TaskTree } from '../../components/ui';
import { addDays, fmtDayLong, fmtDuration, fmtTime, greeting, parseYmd, startOfDay, ymd } from '../../lib/date';
import { attClass, buildItems, itemsOnDay, topRowOrder, type Item } from '../../lib/items';
import { TopPill } from '../calendar/TimeGrid';
import { navigate } from '../../router';
import { useAgenda, useIsMobile, useStore } from '../../store';
import { isEnabled } from '../registry';

export function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface Row {
  key: string;
  at: Date;
  node: ReactNode;
}

export function TodayView() {
  const { tasks, settings, openEditor, colorOf, labelOf, completeTask, reopenTask } = useStore();
  const mobile = useIsMobile();
  const now = useNow();
  const dayStart = useMemo(() => startOfDay(now), [ymd(now)]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = ymd(dayStart);
  const { events, goals: agendaGoals } = useAgenda(dayStart, addDays(dayStart, 1));

  const items = useMemo(() => itemsOnDay(buildItems(events, tasks, agendaGoals), dayStart), [events, tasks, agendaGoals, dayStart]);
  // Top of the day: all-day events and goals (untimed tasks live in the to-do list).
  const allDay = items.filter((i) => i.allDay && i.kind !== 'task').sort(topRowOrder);
  const timed = items.filter((i) => !i.allDay);
  const roots = tasks.filter((t) => !t.parent_id);
  const open = roots.filter((t) => !t.done_at);
  const allOpen = tasks.filter((t) => !t.done_at); // subtasks have their own deadlines
  const overdue = allOpen.filter((t) => t.due_date && t.due_date < today);
  const dueToday = allOpen.filter((t) => t.due_date === today);
  const top3 = roots.filter((t) => t.top3_date === today).slice(0, 3);
  const eventCount = items.filter((i) => i.kind === 'own' || i.kind === 'ext').length;
  const unscheduled = open
    .filter((t) => !t.scheduled_start && (!t.due_date || t.due_date <= today) && t.top3_date !== today)
    .sort((a, b) => Number(!!b.due_date && b.due_date < today) - Number(!!a.due_date && a.due_date < today) || b.priority - a.priority);

  // Timeline rows: events + time blocks + due-time markers, with a "now" line.
  const rows: Row[] = [
    ...timed.map((it) => ({ key: it.key, at: it.start, node: <TimelineItem item={it} /> })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const nowIdx = rows.findIndex((r) => r.at > now);

  const counts = [
    `${eventCount} event${eventCount === 1 ? '' : 's'}`,
    `${dueToday.length} due today`,
    overdue.length ? `${overdue.length} overdue` : null,
  ].filter(Boolean);

  const top3Section = (
    <section aria-labelledby="top3-h" className="section top3-section">
      {!mobile && <CoffeeRing />}
      <div className="section-head">
        <h2 id="top3-h" className="section-title">Top 3 today</h2>
        <button className="link-btn" onClick={() => openEditor({ type: 'top3' })}>Choose</button>
      </div>
      {mobile && top3.length > 0 && (
        <div className="paper-list">
          {top3.map((t) => <TaskLine key={t.id} task={t} compact />)}
        </div>
      )}
      <div className={mobile ? 'top3-list' : 'top3-grid'}>
        {top3.map((t) =>
          mobile ? null : (
            <div key={t.id} className={`top3-card paper${t.done_at ? ' done' : ''}`}>
              <div className="top3-row">
                <span className="cat-label" style={{ color: onPaper(colorOf(t.category_id)), fontWeight: 600 }}>{labelOf(t.category_id)}</span>
                <Check checked={!!t.done_at} label={`Complete ${t.title}`} onChange={(v) => (v ? completeTask(t.id) : reopenTask(t.id))} />
              </div>
              <button className="top3-title" onClick={() => openEditor({ type: 'task', task: t })}>{t.title}</button>
              <span className="muted small">{taskSub(t, today)}</span>
            </div>
          ),
        )}
        {Array.from({ length: 3 - top3.length }).map((_, i) => (
          <button key={`empty-${i}`} className="top3-empty" onClick={() => openEditor({ type: 'top3' })}>
            <Icon name="plus" size={16} /> Pick a priority
          </button>
        ))}
      </div>
    </section>
  );

  const timeline = (
    <section aria-labelledby="tl-h" className="section">
      <h2 id="tl-h" className="section-title">Timeline</h2>
      {allDay.length > 0 && (
        <div className="allday-row">
          {allDay.map((it) => <TopPill key={it.key} item={it} />)}
        </div>
      )}
      {rows.length === 0 && <Empty>Nothing scheduled. Drag tasks onto the calendar to time-block them.</Empty>}
      <ol className="timeline">
        {rows.map((r, i) => (
          <li key={r.key}>
            {i === nowIdx && <NowLine now={now} />}
            <div className="tl-row">
              <span className="tl-time">{fmtTime(r.at)}</span>
              {r.node}
            </div>
          </li>
        ))}
        {rows.length > 0 && nowIdx === -1 && (
          <li>
            <NowLine now={now} />
          </li>
        )}
      </ol>
    </section>
  );

  const side = (
    <>
      {!mobile && (
        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">Quick add</h2>
            <button className="link-btn" onClick={() => openEditor({ type: 'task', task: {} })}>＋ Event, task or goal</button>
          </div>
          <QuickAdd extra={{ due_date: null }} />
        </section>
      )}
      <section aria-labelledby="un-h" className="section">
        <div className="section-head">
          <h2 id="un-h" className="eyebrow">To do · not scheduled</h2>
          <button className="link-btn" onClick={() => navigate('/tasks')}>All tasks</button>
        </div>
        {unscheduled.length === 0 && <Empty>All clear.</Empty>}
        <div className="list">
          {unscheduled.slice(0, 12).map((t) => <TaskTree key={t.id} task={t} hideDone />)}
        </div>
      </section>
      {isEnabled(settings.modules, 'shutdown') && (
        <section className="card shutdown-card">
          <NotebookArt />
          <div className="shutdown-body">
            <span className="muted small">Tonight, {settings.shutdownTime}</span>
            <strong>Evening shutdown</strong>
            <span className="muted small">Close out today and pick tomorrow’s top 3.</span>
            <button className="btn-ghost" onClick={() => openEditor({ type: 'shutdown' })}>
              <Icon name="moon" size={16} /> Start now
            </button>
          </div>
        </section>
      )}
    </>
  );

  return (
    <div className="today-page">
      <div className="today-main">
        <header className="hero">
          <CoffeeArt />
          <div className="hero-text">
            <p>{greeting(now)}, {settings.displayName}</p>
            <h1>{fmtDayLong(now)}</h1>
            <p>{counts.join(' · ')}</p>
          </div>
        </header>
        {top3Section}
        {timeline}
        {mobile && side}
      </div>
      {!mobile && <aside className="today-side">{side}</aside>}
      {mobile && (
        <div className="mobile-qa">
          <QuickAdd id="quick-add-m" compact />
        </div>
      )}
    </div>
  );
}

function taskSub(t: Task, today: string): string {
  const parts: string[] = [];
  if (t.due_date) parts.push(t.due_date < today ? 'Overdue' : t.due_date === today ? 'Due today' : `Due ${parseYmd(t.due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`);
  if (t.duration_min) parts.push(`~${fmtDuration(t.duration_min)}`);
  return parts.join(' · ') || ' ';
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="now-line" aria-label={`Now, ${fmtTime(now)}`}>
      <span className="tl-time">{fmtTime(now)}</span>
      <span className="now-bar" />
    </div>
  );
}

function TimelineItem({ item }: { item: Item }) {
  const { colorOf, labelOf, openEditor, completeTask, reopenTask } = useStore();
  const color = colorOf(item.categoryId);
  const range = `${fmtTime(item.start)}–${fmtTime(item.end)}`;
  if (item.kind === 'task') {
    const t = item.task!;
    return (
      <div className={`tl-card block${t.done_at ? ' done' : ''}`} style={{ borderColor: color }}>
        <span className="tl-bar" style={{ background: color }} />
        <Check checked={!!t.done_at} label={`Complete ${t.title}`} onChange={(v) => (v ? completeTask(t.id) : reopenTask(t.id))} />
        <button className="tl-body" onClick={() => openEditor({ type: 'task', task: t })}>
          <span className="tl-title">{t.title}</span>
          <span className="tl-sub">{t.scheduled_start ? `Time block · ${range}` : `Due ${t.due_time}`} · {labelOf(item.categoryId)}</span>
        </button>
      </div>
    );
  }
  const e = item.event!;
  const src = e.kind === 'ext' ? ` · ${e.source_name}` : '';
  const att = e.attendance === 'no' ? ' · Not attending' : e.attendance === 'maybe' ? ' · Maybe' : '';
  return (
    <div className={`tl-card${attClass(item)}`}>
      <span className="tl-bar" style={{ background: color }} />
      <button className="tl-body" onClick={() => openEditor({ type: 'event', event: e })}>
        <span className="tl-title">{item.title}</span>
        <span className="tl-sub">{labelOf(item.categoryId)}{src} · {range}{e.location ? ` · ${e.location}` : ''}{att}</span>
      </button>
    </div>
  );
}

/** Darken a category colour so it reads on cream paper. */
function onPaper(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number, ink: number) => Math.round(c * 0.45 + ink * 0.55);
  const r = mix((n >> 16) & 255, 0x2b);
  const g = mix((n >> 8) & 255, 0x1d);
  const b = mix(n & 255, 0x14);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Illustrated stand-in for a coffee flat-lay photo (set --hero-photo on .hero to use a real image). */
function CoffeeArt() {
  return (
    <svg className="hero-art" aria-hidden="true" viewBox="0 0 300 168" preserveAspectRatio="xMaxYMid meet" fill="none">
      <rect x="150" y="30" width="120" height="150" rx="6" fill="#F3EBDD" opacity="0.92" transform="rotate(-8 210 105)" />
      <g transform="rotate(-8 210 105)" stroke="#C9B79C" strokeWidth="1">
        <path d="M162 62h96M162 76h96M162 90h96M162 104h96M162 118h96" />
      </g>
      <circle cx="110" cy="84" r="46" fill="#1B120B" />
      <circle cx="110" cy="84" r="38" fill="#3B2618" />
      <circle cx="110" cy="84" r="30" fill="#6F4E37" />
      <path d="M94 80c8-10 24-10 32 0-8 6-24 6-32 0z" fill="#C89F72" opacity="0.8" />
      <rect x="150" y="118" width="64" height="6" rx="3" fill="#C89F72" transform="rotate(30 182 121)" />
    </svg>
  );
}

function NotebookArt() {
  return (
    <svg className="shutdown-art" aria-hidden="true" viewBox="0 0 330 104" preserveAspectRatio="xMidYMid slice" fill="none">
      <ellipse cx="250" cy="20" rx="120" ry="70" fill="#C89F72" opacity="0.18" />
      <rect x="60" y="34" width="150" height="88" rx="6" fill="#F3EBDD" transform="rotate(-4 135 78)" />
      <path d="M135 32v90" stroke="#C9B79C" strokeWidth="1.5" transform="rotate(-4 135 78)" />
      <g stroke="#C9B79C" strokeWidth="1" transform="rotate(-4 135 78)">
        <path d="M72 56h54M72 68h54M72 80h54M144 56h54M144 68h54" />
      </g>
      <rect x="200" y="70" width="80" height="5" rx="2.5" fill="#6F4E37" transform="rotate(-20 240 72)" />
    </svg>
  );
}

function CoffeeRing() {
  return (
    <svg className="coffee-ring" aria-hidden="true" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="22" stroke="#6F4E37" strokeWidth="4" strokeDasharray="110 8 18 6" />
    </svg>
  );
}
