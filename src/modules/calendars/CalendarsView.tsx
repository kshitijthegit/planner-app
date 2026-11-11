import { useEffect, useState } from 'react';
import { api, type Source } from '../../api';
import { Icon } from '../../components/Icon';
import { CategorySelect, Empty, ReminderSelect, Toggle } from '../../components/ui';
import { useStore } from '../../store';

interface GCal {
  id: string;
  name: string;
  primary: boolean;
}

function since(iso: string | null): string {
  if (!iso) return 'not synced yet';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'synced just now' : m < 60 ? `synced ${m} min ago` : `synced ${Math.round(m / 60)} h ago`;
}

/** Every linked calendar in one place, each with its own sync switch. */
export function CalendarsView() {
  const { sources, googleConnected, reloadSources, bumpAgenda, toast } = useStore();
  const google = sources.find((s) => s.kind === 'google');
  const ics = sources.filter((s) => s.kind === 'ics');
  const [cals, setCals] = useState<GCal[] | null>(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wipeArmed, setWipeArmed] = useState(false);

  useEffect(() => {
    if (!googleConnected) return;
    api
      .get<GCal[]>('/api/google/calendars')
      .then(setCals)
      .catch((e) => setCalError((e as Error).message));
  }, [googleConnected]);

  async function run(p: Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await p;
      if (ok) toast(ok);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      await reloadSources();
      bumpAgenda();
    }
  }

  const selected = google?.calendarIds ?? [];
  const primaryId = cals?.find((c) => c.primary)?.id;
  const isOn = (c: GCal) => selected.includes(c.id) || (c.primary && selected.includes('primary'));
  const countFor = (c: GCal) => (google?.calendarCounts?.[c.id] ?? 0) + (c.id === primaryId ? google?.calendarCounts?.primary ?? 0 : 0);
  const totalOn = (cals ?? []).filter(isOn).length + ics.filter((s) => s.enabled).length;
  const totalLinked = (cals?.length ?? 0) + ics.length;

  function toggleGoogle(c: GCal, on: boolean) {
    if (!google || !cals) return;
    const ids = cals.filter((x) => (x.id === c.id ? on : isOn(x))).map((x) => x.id);
    run(api.patch(`/api/sources/${google.id}`, { calendarIds: ids }), on ? `Syncing ${c.name}` : `Stopped syncing ${c.name}`);
  }

  return (
    <div className="calendars-page">
      <header className="page-head">
        <h1>Linked calendars</h1>
        <p className="muted">
          Read-only. Switch a calendar off to stop syncing it and remove its events from the planner. {totalLinked > 0 && `${totalOn} of ${totalLinked} syncing.`}
        </p>
        <div className="btn-row">
          <button className="btn-ghost" disabled={busy || totalOn === 0} onClick={() => run(api.post('/api/sources/sync-all'), 'Synced')}>
            <Icon name="sync" size={16} /> Sync all now
          </button>
        </div>
      </header>

      <section className="card settings-card" aria-labelledby="g-h">
        <div className="card-head">
          <h2 id="g-h">Google Calendar</h2>
          {google && googleConnected && <span className={`small ${google.last_error ? 'warn' : 'muted'}`}>{google.last_error ? `Sync failed: ${google.last_error}` : since(google.last_sync)}</span>}
        </div>
        {!googleConnected || !google ? (
          <a className="btn-accent" href="/api/auth/login">Connect Google</a>
        ) : (
          <>
            {calError && <p className="warn small">Couldn’t load your Google calendars: {calError}</p>}
            {!cals && !calError && <p className="muted small">Loading calendars…</p>}
            {cals?.length === 0 && <Empty>No calendars found in this Google account.</Empty>}
            <ul className="cal-rows">
              {cals?.map((c) => (
                <li key={c.id} className="cal-row">
                  <span className="cal-row-main">
                    <strong>{c.name}</strong>
                    <span className="muted small">{c.primary ? 'Main calendar · ' : ''}{isOn(c) ? `${countFor(c)} event${countFor(c) === 1 ? '' : 's'} synced` : 'Sync off'}</span>
                  </span>
                  <Toggle checked={isOn(c)} disabled={busy} label={`Sync ${c.name}`} onChange={(v) => toggleGoogle(c, v)} />
                </li>
              ))}
            </ul>
            <SourceDefaults source={google} run={run} />
          </>
        )}
      </section>

      <section className="card settings-card" aria-labelledby="i-h">
        <div className="card-head">
          <h2 id="i-h">Outlook &amp; other ICS calendars</h2>
        </div>
        {ics.length === 0 && <Empty>None linked yet. Add your uni Outlook “Publish calendar” ICS link below.</Empty>}
        <ul className="cal-rows">
          {ics.map((s) => (
            <li key={s.id} className="cal-row-block">
              <div className="cal-row">
                <span className="cal-row-main">
                  <strong>{s.name}</strong>
                  <span className={`small ${s.last_error && s.enabled ? 'warn' : 'muted'}`}>
                    {s.urlHint} · {!s.enabled ? 'Sync off' : s.last_error ? `Sync failed: ${s.last_error}` : `${s.eventCount ?? 0} event${s.eventCount === 1 ? '' : 's'} · ${since(s.last_sync)}`}
                  </span>
                </span>
                <Toggle
                  checked={!!s.enabled}
                  disabled={busy}
                  label={`Sync ${s.name}`}
                  onChange={(v) => run(api.patch(`/api/sources/${s.id}`, { enabled: v }), v ? `Syncing ${s.name}` : `Stopped syncing ${s.name}`)}
                />
              </div>
              <SourceDefaults source={s} run={run} removable />
            </li>
          ))}
        </ul>
        <AddIcs run={run} busy={busy} />
      </section>

      <section className="card settings-card danger-zone" aria-labelledby="w-h">
        <h2 id="w-h">Wipe calendar data</h2>
        <p className="muted small">Deletes every event in the planner: your own events and all synced copies. Linked calendars stay listed with sync switched off. Tasks are not affected.</p>
        {wipeArmed ? (
          <div className="btn-row">
            <button className="btn-danger" onClick={() => { setWipeArmed(false); run(api.post('/api/calendar/wipe'), 'Calendar data wiped'); }}>Yes, wipe everything</button>
            <button className="btn-ghost" onClick={() => setWipeArmed(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn-ghost" onClick={() => setWipeArmed(true)}><Icon name="trash" size={16} /> Wipe all calendar data</button>
        )}
      </section>
    </div>
  );
}

function SourceDefaults({ source, run, removable }: { source: Source; run: (p: Promise<unknown>, ok?: string) => Promise<void>; removable?: boolean }) {
  const patch = (b: Record<string, unknown>) => run(api.patch(`/api/sources/${source.id}`, b));
  return (
    <details className="source-defaults">
      <summary>Category, reminders{removable ? ' & remove' : ''}</summary>
      <div className="form">
        <label className="field">
          <span>Default category for its events</span>
          <CategorySelect value={source.category_id} onChange={(v) => patch({ category_id: v })} />
        </label>
        <label className="field">
          <span>Reminder for its events</span>
          <ReminderSelect value={source.reminder_min} onChange={(v) => patch({ reminder_min: v })} />
        </label>
        <div className="field full btn-row">
          <button type="button" className="btn-ghost" disabled={!source.enabled} onClick={() => run(api.post(`/api/sources/${source.id}/sync`), 'Synced')}>
            <Icon name="sync" size={16} /> Sync now
          </button>
          {removable && (
            <button type="button" className="btn-ghost" onClick={() => run(api.del(`/api/sources/${source.id}`), 'Calendar removed')}>
              <Icon name="trash" size={16} /> Unlink
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function AddIcs({ run, busy }: { run: (p: Promise<unknown>, ok?: string) => Promise<void>; busy: boolean }) {
  const [a, setA] = useState({ name: 'Uni Outlook', url: '', category_id: 'cat-classes' as string | null, reminder_min: 15 as number | null });
  return (
    <form
      className="form add-ics"
      onSubmit={(e) => {
        e.preventDefault();
        run(api.post('/api/sources', { kind: 'ics', ...a }), 'Calendar linked').then(() => setA((x) => ({ ...x, url: '' })));
      }}
    >
      <h3 className="field full">Link an ICS calendar</h3>
      <label className="field">
        <span>Name</span>
        <input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
      </label>
      <label className="field">
        <span>ICS link (kept private)</span>
        <input type="url" value={a.url} onChange={(e) => setA({ ...a, url: e.target.value })} placeholder="https://outlook.office365.com/…/calendar.ics" />
      </label>
      <label className="field">
        <span>Default category</span>
        <CategorySelect value={a.category_id} onChange={(v) => setA({ ...a, category_id: v })} />
      </label>
      <label className="field">
        <span>Reminder</span>
        <ReminderSelect value={a.reminder_min} onChange={(v) => setA({ ...a, reminder_min: v })} />
      </label>
      <div className="field full">
        <button className="btn-accent" disabled={busy || !a.url.trim() || !a.name.trim()}>Link calendar</button>
      </div>
    </form>
  );
}
