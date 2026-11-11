// Themed date & time pickers (replace the browser's native calendar pop-ups).
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addDays, parseYmd, pad, sameDay, startOfWeek, ymd } from '../lib/date';
import { Icon } from './Icon';

function usePopover() {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });

  const place = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const h = panel.current?.offsetHeight ?? 340;
    const w = panel.current?.offsetWidth ?? 300;
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left, up });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        anchor.current?.focus();
      }
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  const render = (children: ReactNode, label: string) =>
    open &&
    createPortal(
      <div ref={panel} className="picker-pop" role="dialog" aria-label={label} style={{ top: pos.top, left: pos.left }}>
        {children}
      </div>,
      document.body,
    );

  return { anchor, open, setOpen, render };
}

export function fmtDateLabel(v: string): string {
  return parseYmd(v).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

interface DateFieldProps {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  min?: string | null;
  placeholder?: string;
  clearable?: boolean;
  compact?: boolean;
  short?: boolean;
  ariaLabel?: string;
}

export function DateField({ value, onChange, id, min, placeholder = 'Pick a date', clearable = true, compact, short, ariaLabel }: DateFieldProps) {
  const { anchor, open, setOpen, render } = usePopover();
  const [month, setMonth] = useState(() => (value ? parseYmd(value) : new Date()));
  useEffect(() => {
    if (open) setMonth(value ? parseYmd(value) : new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const pick = (d: Date) => {
    onChange(ymd(d));
    setOpen(false);
    anchor.current?.focus();
  };

  return (
    <>
      <button
        ref={anchor}
        id={id}
        type="button"
        className={`picker-btn${compact ? ' compact' : ''}${value ? '' : ' empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(!open)}
      >
        <Icon name="calendar" size={compact ? 14 : 16} />
        <span>{value ? (compact ? parseYmd(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : short ? parseYmd(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : fmtDateLabel(value)) : placeholder}</span>
      </button>
      {render(
        <div className="cal-pop">
          <div className="cal-pop-head">
            <button type="button" className="icon-btn small" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <Icon name="left" size={16} />
            </button>
            <strong>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" className="icon-btn small" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <Icon name="right" size={16} />
            </button>
          </div>
          <div className="cal-pop-grid" role="grid">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <span key={d} className="cal-pop-dow" aria-hidden="true">{d}</span>
            ))}
            {days.map((d) => {
              const v = ymd(d);
              const disabled = !!min && v < min;
              const selected = value === v;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  className={`cal-pop-day${d.getMonth() !== month.getMonth() ? ' other' : ''}${sameDay(d, today) ? ' today' : ''}${selected ? ' on' : ''}`}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="cal-pop-foot">
            <button type="button" className="link-btn" onClick={() => pick(today)}>Today</button>
            <button type="button" className="link-btn" onClick={() => pick(addDays(today, 1))}>Tomorrow</button>
            <span className="grow" />
            {clearable && value && (
              <button type="button" className="link-btn muted-link" onClick={() => { onChange(null); setOpen(false); }}>Clear</button>
            )}
          </div>
        </div>,
        'Choose a date',
      )}
    </>
  );
}

/** "9", "930", "9:30", "9.30pm", "21:15" → "HH:MM" */
export function parseTimeInput(t: string): string | null {
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const TIMES = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

export function TimeField({ value, onChange, id, placeholder = 'Add time', clearable = true, ariaLabel }: { value: string | null; onChange: (v: string | null) => void; id?: string; placeholder?: string; clearable?: boolean; ariaLabel?: string }) {
  const { anchor, open, setOpen, render } = usePopover();
  const [typed, setTyped] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setTyped('');
    requestAnimationFrame(() => {
      const target = list.current?.querySelector<HTMLElement>('.on') ?? list.current?.querySelector<HTMLElement>('[data-t="09:00"]');
      target?.scrollIntoView({ block: 'center' });
    });
  }, [open]);
  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
    anchor.current?.focus();
  };
  return (
    <>
      <button ref={anchor} id={id} type="button" className={`picker-btn${value ? '' : ' empty'}`} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(!open)}>
        <Icon name="clock" size={16} />
        <span>{value ?? placeholder}</span>
      </button>
      {render(
        <div className="time-pop">
          <form
            className="time-pop-type"
            onSubmit={(e) => {
              e.preventDefault();
              const v = parseTimeInput(typed);
              if (v) pick(v);
            }}
          >
            <label className="sr-only" htmlFor={`${id ?? 'time'}-type`}>Type a time</label>
            <input id={`${id ?? 'time'}-type`} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type e.g. 9:30 or 2pm" />
          </form>
          <div className="time-pop-list" ref={list} role="listbox" aria-label="Times">
            {TIMES.map((t) => (
              <button key={t} type="button" role="option" aria-selected={value === t} data-t={t} className={`time-pop-item${value === t ? ' on' : ''}`} onClick={() => pick(t)}>
                {t}
              </button>
            ))}
          </div>
          {clearable && value && (
            <div className="cal-pop-foot">
              <span className="grow" />
              <button type="button" className="link-btn muted-link" onClick={() => pick(null)}>Clear</button>
            </div>
          )}
        </div>,
        'Choose a time',
      )}
    </>
  );
}

/** Date + time for an ISO timestamp. Picking a date with no time yet uses 09:00. */
export function DateTimeField({ value, onChange, id, clearable = true, label }: { value: string | null; onChange: (iso: string | null) => void; id?: string; clearable?: boolean; label?: string }) {
  const d = value ? new Date(value) : null;
  const date = d ? ymd(d) : null;
  const time = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : null;
  const combine = (dt: string | null, tm: string | null) => {
    if (!dt) return onChange(null);
    const x = parseYmd(dt);
    const [h, m] = (tm ?? '09:00').split(':').map(Number);
    x.setHours(h, m, 0, 0);
    onChange(x.toISOString());
  };
  return (
    <span className="dt-field">
      <DateField id={id} short ariaLabel={label ? `${label} date` : undefined} value={date} clearable={clearable} onChange={(v) => combine(v, time)} />
      <TimeField ariaLabel={label ? `${label} time` : undefined} value={time} clearable={false} onChange={(v) => combine(date ?? ymd(new Date()), v)} />
    </span>
  );
}
