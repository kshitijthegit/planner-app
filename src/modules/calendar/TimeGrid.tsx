import { useEffect, useRef, useState } from 'react';
import { Dot } from '../../components/ui';
import { addDays, addMinutes, fmtTime, minutesOfDay, sameDay, startOfDay } from '../../lib/date';
import { itemsOnDay, layoutLanes, type Item } from '../../lib/items';
import { useStore } from '../../store';

const HOUR = 48; // px per hour
const SNAP = 15; // minutes

interface Props {
  days: Date[];
  items: Item[];
  now: Date;
  onCreate: (start: Date) => void;
  onDropTask: (taskId: string, start: Date) => void;
}

function minutesFromY(y: number): number {
  return Math.max(0, Math.min(24 * 60 - SNAP, Math.round((y / HOUR) * 60 / SNAP) * SNAP));
}

export function TimeGrid({ days, items, now, onCreate, onDropTask }: Props) {
  const { colorOf, openEditor } = useStore();
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ day: number; min: number } | null>(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR;
  }, []);

  const hasAllDay = days.some((d) => itemsOnDay(items, d).some((i) => i.allDay));
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="tg">
      <div className={`tg-head${days.length === 1 ? ' single' : ''}`} style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((d) => (
          <span key={d.toISOString()} className={`tg-day${sameDay(d, now) ? ' today' : ''}`}>
            {d.toLocaleDateString('en-GB', { weekday: 'short' })} <strong>{d.getDate()}</strong>
          </span>
        ))}
      </div>
      {hasAllDay && (
        <div className="tg-allday" style={{ gridTemplateColumns: cols }}>
          <span className="tg-gutter-label">all day</span>
          {days.map((d) => (
            <div key={d.toISOString()} className="tg-allday-cell">
              {itemsOnDay(items, d)
                .filter((i) => i.allDay)
                .map((i) => (
                  <button key={i.key} className="allday-pill" style={{ background: `${colorOf(i.categoryId)}26`, borderColor: colorOf(i.categoryId) }} onClick={() => i.event && openEditor({ type: 'event', event: i.event })}>
                    {i.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="tg-gutter">
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} style={{ top: h * HOUR - 7 }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>
            ))}
          </div>
          {days.map((day, di) => {
            const dayStart = startOfDay(day);
            const dayEnd = addDays(dayStart, 1);
            const timed = itemsOnDay(items, day).filter((i) => !i.allDay);
            const placed = layoutLanes(timed);
            const yFor = (e: React.MouseEvent | React.DragEvent) => e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
            return (
              <div
                key={day.toISOString()}
                className={`tg-col${hover?.day === di ? ' drop' : ''}`}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  onCreate(addMinutes(dayStart, minutesFromY(yFor(e))));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const min = minutesFromY(yFor(e));
                  if (hover?.day !== di || hover.min !== min) setHover({ day: di, min });
                }}
                onDragLeave={(e) => {
                  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setHover(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setHover(null);
                  const data = e.dataTransfer.getData('text/plain');
                  if (data.startsWith('task:')) onDropTask(data.slice(5), addMinutes(dayStart, minutesFromY(yFor(e))));
                }}
              >
                {hover?.day === di && <div className="drop-marker" style={{ top: (hover.min / 60) * HOUR }}>{fmtTime(addMinutes(dayStart, hover.min))}</div>}
                {placed.map(({ item, lane, lanes }) => {
                  const s = item.start < dayStart ? dayStart : item.start;
                  const e = item.end > dayEnd ? dayEnd : item.end;
                  const top = (minutesOfDay(s) / 60) * HOUR;
                  const height = Math.max(((e.getTime() - s.getTime()) / 3600000) * HOUR - 2, 20);
                  const color = colorOf(item.categoryId);
                  const isTask = item.kind === 'task';
                  return (
                    <button
                      key={item.key}
                      className={`tg-block${isTask ? ' task' : ''}${item.task?.done_at ? ' done' : ''}`}
                      style={{
                        top,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        borderColor: color,
                        background: isTask ? 'transparent' : `${color}26`,
                      }}
                      draggable={isTask}
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/plain', `task:${item.task!.id}`);
                        ev.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => (isTask ? openEditor({ type: 'task', task: item.task! }) : openEditor({ type: 'event', event: item.event! }))}
                    >
                      <span className="tg-block-title">{item.title}</span>
                      {height > 34 && <span className="tg-block-time">{fmtTime(item.start)}–{fmtTime(item.end)}</span>}
                    </button>
                  );
                })}
                {sameDay(day, now) && (
                  <div className="tg-now" style={{ top: (minutesOfDay(now) / 60) * HOUR }} aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MonthGrid({ anchor, items, now, onPickDay }: { anchor: Date; items: Item[]; now: Date; onPickDay: (d: Date) => void }) {
  const { colorOf } = useStore();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <span key={d} className="month-dow">{d}</span>
      ))}
      {days.map((d) => {
        const its = itemsOnDay(items, d);
        return (
          <button
            key={d.toISOString()}
            className={`month-cell${d.getMonth() !== anchor.getMonth() ? ' other' : ''}${sameDay(d, now) ? ' today' : ''}`}
            onClick={() => onPickDay(d)}
            aria-label={`${d.toDateString()}, ${its.length} items`}
          >
            <span className="month-num">{d.getDate()}</span>
            {its.slice(0, 3).map((i) => (
              <span key={i.key} className="month-item">
                <Dot color={colorOf(i.categoryId)} size={6} />
                {i.title}
              </span>
            ))}
            {its.length > 3 && <span className="month-more">+{its.length - 3} more</span>}
          </button>
        );
      })}
    </div>
  );
}
