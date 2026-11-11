import { useEffect, useState } from 'react';
import { api, type Source } from '../../api';
import { Icon } from '../../components/Icon';
import { CategorySelect, ReminderSelect } from '../../components/ui';
import { disablePush, enablePush, pushStatus } from '../../lib/push';
import { useStore } from '../../store';
import { MODULES } from '../registry';

function since(iso: string | null): string {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function SettingsView() {
  const { settings, updateSettings, toast } = useStore();
  return (
    <div className="settings-page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>
      <Notifications />
      <Calendars />
      <section className="card settings-card">
        <h2>Modules</h2>
        <p className="muted small">Turn features on or off. New features will appear here as they’re added.</p>
        {MODULES.filter((m) => m.toggleable).map((m) => (
          <label key={m.id} className="toggle-row">
            <input type="checkbox" checked={settings.modules[m.id] !== false} onChange={(e) => updateSettings({ modules: { [m.id]: e.target.checked } })} />
            <span>
              <strong>{m.title}</strong> <span className="muted small">— {m.description}</span>
            </span>
          </label>
        ))}
      </section>
      <section className="card settings-card">
        <h2>General</h2>
        <div className="form">
          <label className="field">
            <span>Name in greetings</span>
            <input defaultValue={settings.displayName} onBlur={(e) => e.target.value.trim() && updateSettings({ displayName: e.target.value.trim() })} />
          </label>
          <label className="field">
            <span>Timezone (for reminders)</span>
            <input defaultValue={settings.timezone} onBlur={(e) => updateSettings({ timezone: e.target.value.trim() })} />
          </label>
        </div>
        <p className="muted small">Install: in Chrome on Android use ⋮ → “Add to Home screen”; in Edge/Chrome on Windows use the install icon in the address bar.</p>
        <button
          className="btn-ghost"
          onClick={async () => {
            await api.post('/api/auth/logout');
            toast('Signed out');
            window.location.href = '/';
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}

function Notifications() {
  const { settings, updateSettings, toast } = useStore();
  const [status, setStatus] = useState<string>('…');
  const refresh = () => pushStatus().then(setStatus);
  useEffect(() => {
    refresh();
  }, []);
  const label: Record<string, string> = {
    on: 'On for this device',
    off: 'Off for this device',
    denied: 'Blocked — allow notifications for this site in browser settings',
    unsupported: 'Not supported in this browser',
    '…': '…',
  };
  return (
    <section className="card settings-card">
      <h2>Notifications</h2>
      <p className="muted small"><Icon name="bell" size={14} /> {label[status] ?? status}</p>
      <div className="btn-row">
        {status === 'off' && (
          <button className="btn-accent" onClick={async () => { try { await enablePush(); toast('Notifications on'); } catch (e) { toast((e as Error).message); } refresh(); }}>
            Enable on this device
          </button>
        )}
        {status === 'on' && (
          <>
            <button className="btn-ghost" onClick={async () => { const r = await api.post<{ delivered: number }>('/api/push/test'); toast(`Sent to ${r.delivered} device(s)`); }}>Send test</button>
            <button className="btn-ghost" onClick={async () => { await disablePush(); refresh(); }}>Turn off here</button>
          </>
        )}
      </div>
      <div className="form">
        <label className="field toggle-row">
          <input type="checkbox" checked={settings.digestEnabled} onChange={(e) => updateSettings({ digestEnabled: e.target.checked })} />
          <span>Morning digest</span>
        </label>
        <label className="field">
          <span>Digest time</span>
          <input type="time" value={settings.digestTime} onChange={(e) => e.target.value && updateSettings({ digestTime: e.target.value })} />
        </label>
        <label className="field toggle-row">
          <input type="checkbox" checked={settings.shutdownEnabled} onChange={(e) => updateSettings({ shutdownEnabled: e.target.checked })} />
          <span>Evening shutdown reminder</span>
        </label>
        <label className="field">
          <span>Shutdown time</span>
          <input type="time" value={settings.shutdownTime} onChange={(e) => e.target.value && updateSettings({ shutdownTime: e.target.value })} />
        </label>
        <label className="field">
          <span>Default reminder for new timed tasks/events</span>
          <ReminderSelect value={settings.defaultReminderMin} onChange={(v) => updateSettings({ defaultReminderMin: v })} />
        </label>
      </div>
      <button className="btn-ghost" onClick={async () => { const r = await api.post<{ body: string; delivered: number }>('/api/digest/send-now'); toast(r.delivered ? 'Digest sent' : `Preview: ${r.body.replace(/\n/g, ' · ')}`); }}>
        Send today’s digest now
      </button>
    </section>
  );
}

function Calendars() {
  const { sources, googleConnected, reloadSources, bumpAgenda, toast } = useStore();
  const google = sources.find((s) => s.kind === 'google');
  const ics = sources.filter((s) => s.kind === 'ics');
  const [adding, setAdding] = useState({ name: 'Uni Outlook', url: '', category_id: 'cat-classes' as string | null, reminder_min: 15 as number | null });
  const [busy, setBusy] = useState(false);

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

  return (
    <section className="card settings-card">
      <h2>Calendars (read-only sync)</h2>
      <div className="source">
        <h3>Google Calendar</h3>
        {!googleConnected || !google ? (
          <a className="btn-accent" href="/api/auth/login">Connect Google</a>
        ) : (
          <SourceControls source={google} onChange={run} busy={busy} />
        )}
        {google && <GoogleCalendarPicker source={google} onChange={run} />}
      </div>
      {ics.map((s) => (
        <div key={s.id} className="source">
          <h3>{s.name} <span className="muted small">({s.urlHint})</span></h3>
          <SourceControls source={s} onChange={run} busy={busy} removable />
        </div>
      ))}
      <form
        className="source form"
        onSubmit={(e) => {
          e.preventDefault();
          run(api.post('/api/sources', { kind: 'ics', ...adding }), 'Calendar added').then(() => setAdding((a) => ({ ...a, url: '' })));
        }}
      >
        <h3 className="field full">Add an ICS calendar (e.g. Outlook “Publish calendar” link)</h3>
        <label className="field">
          <span>Name</span>
          <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
        </label>
        <label className="field">
          <span>ICS link (kept private)</span>
          <input type="url" value={adding.url} onChange={(e) => setAdding({ ...adding, url: e.target.value })} placeholder="https://outlook.office365.com/…/calendar.ics" />
        </label>
        <label className="field">
          <span>Default category</span>
          <CategorySelect value={adding.category_id} onChange={(v) => setAdding({ ...adding, category_id: v })} />
        </label>
        <label className="field">
          <span>Reminder</span>
          <ReminderSelect value={adding.reminder_min} onChange={(v) => setAdding({ ...adding, reminder_min: v })} />
        </label>
        <div className="field full">
          <button className="btn-accent" disabled={busy || !adding.url.trim() || !adding.name.trim()}>Add calendar</button>
        </div>
      </form>
    </section>
  );
}

function SourceControls({ source, onChange, busy, removable }: { source: Source; onChange: (p: Promise<unknown>, ok?: string) => Promise<void>; busy: boolean; removable?: boolean }) {
  const patch = (b: Record<string, unknown>) => onChange(api.patch(`/api/sources/${source.id}`, b));
  return (
    <div className="form">
      <p className={`field full small ${source.last_error ? 'warn' : 'muted'}`}>
        {source.last_error ? `Last sync failed: ${source.last_error}` : `Synced ${since(source.last_sync)}`}
      </p>
      <label className="field">
        <span>Default category</span>
        <CategorySelect value={source.category_id} onChange={(v) => patch({ category_id: v })} />
      </label>
      <label className="field">
        <span>Reminder for its events</span>
        <ReminderSelect value={source.reminder_min} onChange={(v) => patch({ reminder_min: v })} />
      </label>
      <label className="field toggle-row">
        <input type="checkbox" checked={!!source.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        <span>Show on calendar</span>
      </label>
      <div className="field btn-row">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => onChange(api.post(`/api/sources/${source.id}/sync`), 'Synced')}>
          <Icon name="sync" size={16} /> Sync now
        </button>
        {removable && (
          <button type="button" className="btn-ghost" onClick={() => onChange(api.del(`/api/sources/${source.id}`), 'Removed')}>
            <Icon name="trash" size={16} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function GoogleCalendarPicker({ source, onChange }: { source: Source; onChange: (p: Promise<unknown>, ok?: string) => Promise<void> }) {
  const [cals, setCals] = useState<{ id: string; name: string; primary: boolean }[] | null>(null);
  const selected = source.calendarIds?.length ? source.calendarIds : ['primary'];
  const isOn = (c: { id: string; primary: boolean }) => selected.includes(c.id) || (c.primary && selected.includes('primary'));
  if (!cals)
    return (
      <button className="link-btn" onClick={() => api.get<typeof cals>('/api/google/calendars').then(setCals).catch(() => setCals([]))}>
        Choose which Google calendars to show
      </button>
    );
  return (
    <div className="cal-picker">
      {cals.length === 0 && <p className="muted small">Couldn’t load calendars.</p>}
      {cals.map((c) => (
        <label key={c.id} className="toggle-row">
          <input
            type="checkbox"
            checked={isOn(c)}
            onChange={(e) => {
              const ids = cals.filter((x) => (x.id === c.id ? e.target.checked : isOn(x))).map((x) => x.id);
              onChange(api.patch(`/api/sources/${source.id}`, { calendarIds: ids }), 'Calendars updated');
            }}
          />
          <span>{c.name}{c.primary ? ' (main)' : ''}</span>
        </label>
      ))}
    </div>
  );
}
