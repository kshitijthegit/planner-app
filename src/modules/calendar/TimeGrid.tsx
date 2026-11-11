import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { addDays, addMinutes, fmtTime, minutesOfDay, sameDay, startOfDay } from '../../lib/date';
import { attClass, isWholeDay, itemsOnDay, layoutLanes, onDark, textOn, topRowOrder, type Item } from '../../lib/items';
import { useStore } from '../../store';

const DAY_MIN = 24 * 60;
const SNAP = 15; // minutes
const TOP_ROW_MAX = 3; // visible items per day in the top-of-day row

interface Props {
  days: Date[];
  items: Item[];
  now: Date;
  onCreate: (start: Date) => void;
  onCreateGoal: (day: Date) => void;
  onDropTask: (taskId: string, start: Date) => void;
  onShowDay: (day: Date) => void;
}

/** Minutes since midnight from a pointer position inside a day column (whole day fits the column height). */
function minutesFromEvent(e: React.MouseEvent | React.DragEvent): number {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const frac = (e.clientY - rect.top) / rect.height;
  return Math.max(0, Math.min(DAY_MIN - SNAP, Math.round((frac * DAY_MIN) / SNAP) * SNAP));
}

const pct = (min: number) => `${(min / DAY_MIN) * 100}%`;

/** Pill used in the top-of-day row: event = filled, goal = outline, task = thin with a check. */
export function TopPill({ item }: { item: Item }) {
  const { openEditor, areaColor, areaIdOf, completeTask, reopenTask, saveGoal } = useStore();
  const color = areaColor(item.areaId ?? areaIdOf({ category_id: item.categoryId }));
  const open = () =>
    item.task ? openEditor({ type: 'task', task: item.task }) : item.goal ? openEditor({ type: 'goal', goal: item.goal }) : item.event && openEditor({ type: 'event', event: item.event });
  if (item.kind === 'task')
    return (
      <span className={`pill-task${item.done ? ' done' : ''}`} style={{ borderColor: onDark(color), ['--c' as string]: color }}>
        <button className="mini-check" role="checkbox" aria-checked={item.done} aria-label={`Complete ${item.title}`} onClick={() => (item.done ? reopenTask(item.task!.id) : completeTask(item.task!.id))}>
          {item.done && <Icon name="check" size={10} stroke={3} />}
        </button>
        <button className="pill-label" onClick={open}>{item.title}</button>
      </span>
    );
  if (item.kind === 'goal')
    return (
      <span className={`pill-goal${item.done ? ' done' : ''}`} style={{ borderColor: onDark(color), ['--c' as string]: color }}>
        <button
          className="mini-check round"
          role="checkbox"
          aria-checked={item.done}
          aria-label={`Mark goal ${item.title} achieved`}
          onClick={() => saveGoal({ id: item.goal!.id, done_at: item.done ? null : new Date().toISOString() })}
        >
          {item.done && <Icon name="check" size={10} stroke={3} />}
        </button>
        <button className="pill-label" onClick={open}>{item.title}</button>
      </span>
    );
  return (
    <button className={`pill-event${attClass(item)}`} style={{ background: color, color: textOn(color) }} onClick={open}>
      {item.title}
    </button>
  );
}

export function TimeGrid({ days, items, now, onCreate, onCreateGoal, onDropTask, onShowDay }: Props) {
  const { openEditor, areaColor, areaIdOf, completeTask, reopenTask } = useStore();
  const [hover, setHover] = useState<{ day: number; min: number } | null>(null);
  const cols = `44px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className={`tg${days.length > 1 ? " multi" : ""}`}>
      <div className={`tg-head${days.length === 1 ? ' single' : ''}`} style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((d) => (
          <span key={d.toISOString()} className={`tg-day${sameDay(d, now) ? ' today' : ''}`}>
            {d.toLocaleDateString('en-GB', { weekday: 'short' })} <strong>{d.getDate()}</strong>
          </span>
        ))}
      </div>

      {/* Top of day: all-day events, goals, untimed tasks */}
      <div className="tg-top" style={{ gridTemplateColumns: cols }}>
        <span className="tg-gutter-label">all day</span>
        {days.map((d) => {
          const top = itemsOnDay(items, d).filter((i) => i.allDay).sort(topRowOrder);
          return (
            <div
              key={d.toISOString()}
              className={`tg-top-cell${isWholeDay(items, d) ? ' whole' : ''}`}
              onClick={(e) => e.target === e.currentTarget && onCreateGoal(d)}
              title="Click empty space to add a goal"
            >
              {top.slice(0, TOP_ROW_MAX).map((i) => <TopPill key={i.key} item={i} />)}
              {top.length > TOP_ROW_MAX && (
                <button className="more-link" onClick={() => onShowDay(d)}>+{top.length - TOP_ROW_MAX} more</button>
              )}
            </div>
          );
        })}
      </div>

      <div className="tg-fill" style={{ gridTemplateColumns: cols }}>
        <div className="tg-gutter" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (i + 1) * 2).map((h) => (
            <span key={h} style={{ top: pct(h * 60) }}>{String(h).padStart(2, '0')}:00</span>
          ))}
        </div>
        {days.map((day, di) => {
          const dayStart = startOfDay(day);
          const dayEnd = addDays(dayStart, 1);
          const placed = layoutLanes(itemsOnDay(items, day).filter((i) => !i.allDay));
          return (
            <div
              key={day.toISOString()}
              className={`tg-col${hover?.day === di ? ' drop' : ''}${isWholeDay(items, day) ? ' whole' : ''}`}
              onClick={(e) => e.target === e.currentTarget && onCreate(addMinutes(dayStart, minutesFromEvent(e)))}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const min = minutesFromEvent(e);
                if (hover?.day !== di || hover.min !== min) setHover({ day: di, min });
              }}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setHover(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setHover(null);
                const data = e.dataTransfer.getData('text/plain');
                if (data.startsWith('task:')) onDropTask(data.slice(5), addMinutes(dayStart, minutesFromEvent(e)));
              }}
            >
              {hover?.day === di && <div className="drop-marker" style={{ top: pct(hover.min) }}>{fmtTime(addMinutes(dayStart, hover.min))}</div>}
              {placed.map(({ item, lane, lanes }) => {
                const s = item.start < dayStart ? dayStart : item.start;
                const e = item.end > dayEnd ? dayEnd : item.end;
                const startMin = minutesOfDay(s);
                const durMin = Math.max((e.getTime() - s.getTime()) / 60000, 15);
                const color = areaColor(item.areaId ?? areaIdOf({ category_id: item.categoryId }));
                const left = `calc(${(lane / lanes) * 100}% + 2px)`;
                const laneW = `${100 / lanes}%`;
                if (item.kind === 'task') {
                  const t = item.task!;
                  return (
                    <div
                      key={item.key}
                      className={`tg-task${item.done ? ' done' : ''}`}
                      style={{ top: pct(startMin), height: `max(${pct(durMin)}, 18px)`, left, width: `calc(${laneW} * 0.62 - 2px)`, borderColor: onDark(color), ['--c' as string]: color }}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/plain', `task:${t.id}`);
                        ev.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <button className="mini-check" role="checkbox" aria-checked={item.done} aria-label={`Complete ${t.title}`} onClick={() => (item.done ? reopenTask(t.id) : completeTask(t.id))}>
                        {item.done && <Icon name="check" size={10} stroke={3} />}
                      </button>
                      <button className="tg-task-title" onClick={() => openEditor({ type: 'task', task: t })}>{item.title}</button>
                    </div>
                  );
                }
                return (
                  <button
                    key={item.key}
                    className={`tg-block${attClass(item)}`}
                    style={{ top: pct(startMin), height: `max(calc(${pct(durMin)} - 2px), 16px)`, left, width: `calc(${laneW} - 4px)`, background: color, color: textOn(color) }}
                    onClick={() => openEditor({ type: 'event', event: item.event! })}
                  >
                    <span className="tg-block-title">{item.title}</span>
                    {durMin >= 90 && <span className="tg-block-time">{fmtTime(item.start)}–{fmtTime(item.end)}</span>}
                  </button>
                );
              })}
              {sameDay(day, now) && <div className="tg-now" style={{ top: pct(minutesOfDay(now)) }} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthGrid({ anchor, items, now, onPickDay }: { anchor: Date; items: Item[]; now: Date; onPickDay: (d: Date) => void }) {
  const { areaColor, areaIdOf } = useStore();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <span key={d} className="month-dow">{d}</span>
      ))}
      {days.map((d) => {
        const its = itemsOnDay(items, d).sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || topRowOrder(a, b) || a.start.getTime() - b.start.getTime());
        return (
          <button
            key={d.toISOString()}
            className={`month-cell${d.getMonth() !== anchor.getMonth() ? ' other' : ''}${sameDay(d, now) ? ' today' : ''}${isWholeDay(items, d) ? ' whole' : ''}`}
            onClick={() => onPickDay(d)}
            aria-label={`${d.toDateString()}, ${its.length} items`}
          >
            <span className="month-num">{d.getDate()}</span>
            {its.slice(0, 3).map((i) => {
              const c = areaColor(i.areaId ?? areaIdOf({ category_id: i.categoryId }));
              const isEvent = i.kind === 'own' || i.kind === 'ext';
              return (
                <span key={i.key} className={`month-item ${isEvent ? 'event' : i.kind}${i.done ? ' done' : ''}${attClass(i)}`}>
                  <span className="month-mark" style={isEvent ? { background: c, borderColor: onDark(c) } : { borderColor: onDark(c) }} aria-hidden="true">
                    {i.kind === 'task' && <Icon name="check" size={8} stroke={3} />}
                  </span>
                  {i.title}
                </span>
              );
            })}
            {its.length > 3 && <span className="month-more">+{its.length - 3} more</span>}
          </button>
        );
      })}
    </div>
  );
}
