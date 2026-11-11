import { useMemo, useState } from 'react';
import { Check, Dot, Empty, Modal } from '../../components/ui';
import { addDays, fmtDayLong, relativeDay, sameDay, ymd } from '../../lib/date';
import { useStore } from '../../store';

/** Evening shutdown: close out today, then pick tomorrow's top 3. */
export function ShutdownFlow({ onClose }: { onClose: () => void }) {
  const { tasks, completeTask, saveTask } = useStore();
  const [step, setStep] = useState<1 | 2>(1);
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const [handled, setHandled] = useState<Record<string, string>>({});

  const todays = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!t.done_at || handled[t.id]) &&
          ((t.due_date && t.due_date <= today) || t.top3_date === today || (t.scheduled_start && sameDay(new Date(t.scheduled_start), new Date()))),
      ),
    // keep rows visible after acting on them in this session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks],
  );

  if (step === 2) return <Top3Picker date={tomorrow} onClose={onClose} title="Pick tomorrow’s top 3" />;

  return (
    <Modal
      title="Evening shutdown"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted small grow">Step 1 of 2 · close out today</span>
          <button className="btn-accent" onClick={() => setStep(2)}>Next: plan tomorrow</button>
        </>
      }
    >
      {todays.length === 0 && <Empty>Nothing left from today. Nice.</Empty>}
      <div className="list">
        {todays.map((t) => (
          <div key={t.id} className={`shutdown-row${handled[t.id] ? ' handled' : ''}`}>
            <span className="grow">
              {t.parent_id && <span className="muted small">{tasks.find((p) => p.id === t.parent_id)?.title} › </span>}
              <strong>{t.title}</strong>
              <span className="muted small"> {t.due_date ? `· ${relativeDay(t.due_date, today)}` : ''}</span>
            </span>
            {handled[t.id] ? (
              <span className="muted small">{handled[t.id]}</span>
            ) : (
              <span className="row-actions">
                <button className="btn-ghost small-btn" onClick={async () => { await completeTask(t.id); setHandled((h) => ({ ...h, [t.id]: 'Done' })); }}>Done</button>
                <button className="btn-ghost small-btn" onClick={async () => { await saveTask({ id: t.id, due_date: tomorrow, scheduled_start: null, top3_date: null }); setHandled((h) => ({ ...h, [t.id]: 'Moved to tomorrow' })); }}>Tomorrow</button>
                <button className="btn-ghost small-btn" onClick={async () => { await saveTask({ id: t.id, due_date: null, scheduled_start: null, top3_date: null }); setHandled((h) => ({ ...h, [t.id]: 'Moved to someday' })); }}>Someday</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function Top3Picker({ onClose, date = ymd(new Date()), title }: { onClose: () => void; date?: string; title?: string }) {
  const { tasks, saveTask, colorOf } = useStore();
  const candidates = tasks
    .filter((t) => !t.done_at && !t.parent_id)
    .sort((a, b) => Number(!!b.due_date && b.due_date <= date) - Number(!!a.due_date && a.due_date <= date) || b.priority - a.priority);
  const initial = candidates.filter((t) => t.top3_date === date).map((t) => t.id);
  const [picked, setPicked] = useState<string[]>(initial);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  }

  async function save() {
    const changes = [
      ...picked.filter((id) => !initial.includes(id)).map((id) => saveTask({ id, top3_date: date })),
      ...initial.filter((id) => !picked.includes(id)).map((id) => saveTask({ id, top3_date: null })),
    ];
    await Promise.all(changes);
    onClose();
  }

  const label = date === ymd(new Date()) ? 'today' : fmtDayLong(new Date(`${date}T00:00:00`));
  return (
    <Modal
      title={title ?? 'Top 3 today'}
      onClose={onClose}
      footer={
        <>
          <span className="muted small grow">{picked.length}/3 picked for {label}</span>
          <button className="btn-accent" onClick={save}>Save</button>
        </>
      }
    >
      {candidates.length === 0 && <Empty>No open tasks yet. Add some first.</Empty>}
      <div className="list">
        {candidates.slice(0, 40).map((t) => (
          <div key={t.id} className="pick-row">
            <Check checked={picked.includes(t.id)} label={`Pick ${t.title}`} onChange={() => toggle(t.id)} />
            <button className="grow pick-title" onClick={() => toggle(t.id)}>{t.title}</button>
            {t.due_date && <span className="muted small">{relativeDay(t.due_date)}</span>}
            <Dot color={colorOf(t.category_id)} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
