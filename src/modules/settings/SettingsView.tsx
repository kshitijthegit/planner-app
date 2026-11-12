import { useEffect, useState } from 'react';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { ReminderSelect } from '../../components/ui';
import { disablePush, enablePush, pushStatus } from '../../lib/push';
import { useStore } from '../../store';
import { navigate } from '../../router';
import { TimeField } from '../../components/pickers';
import { MODULES } from '../registry';


export function SettingsView() {
  const { settings, updateSettings, toast } = useStore();
  return (
    <div className="settings-page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>
      <Notifications />
      <GmailAddon />
      <section className="card settings-card">
        <h2>Linked calendars</h2>
        <p className="muted small">Google and Outlook (ICS) calendars, each with its own sync switch.</p>
        <a className="btn-ghost" href="/calendars" onClick={(e) => { e.preventDefault(); navigate('/calendars'); }}>
          <Icon name="link" size={16} /> Manage linked calendars
        </a>
      </section>
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
        <label className="toggle-row">
          <input type="checkbox" checked={settings.dayCycle !== false} onChange={(e) => updateSettings({ dayCycle: e.target.checked })} />
          <span>
            <strong>Background follows the time of day</strong>{' '}
            <span className="muted small">— light mint from 6am, a shade darker each hour, phthalo deep at night</span>
          </span>
        </label>
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
        <div className="field">
          <span>Digest time</span>
          <TimeField ariaLabel="Digest time" clearable={false} value={settings.digestTime} onChange={(v) => v && updateSettings({ digestTime: v })} />
        </div>
        <label className="field toggle-row">
          <input type="checkbox" checked={settings.shutdownEnabled} onChange={(e) => updateSettings({ shutdownEnabled: e.target.checked })} />
          <span>Evening shutdown reminder</span>
        </label>
        <div className="field">
          <span>Shutdown time</span>
          <TimeField ariaLabel="Shutdown time" clearable={false} value={settings.shutdownTime} onChange={(v) => v && updateSettings({ shutdownTime: v })} />
        </div>
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


/** Access key for the Gmail add-on ("Add to Planner" beside an open email). */
function GmailAddon() {
  const { toast } = useStore();
  const [info, setInfo] = useState<{ exists: boolean; created_at: string | null } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const refresh = () => api.get<{ exists: boolean; created_at: string | null }>('/api/capture/key').then(setInfo).catch(() => setInfo(null));
  useEffect(() => { refresh(); }, []);
  async function generate() {
    if (info?.exists && !confirm('Make a new key? The add-on will stop working until you paste the new one into it.')) return;
    const r = await api.post<{ key: string }>('/api/capture/key');
    setFresh(r.key);
    refresh();
  }
  return (
    <section className="card settings-card">
      <h2>Gmail add-on</h2>
      <p className="muted small">
        Adds an “Add to Planner” panel beside emails in Gmail (web and Android). It uses an access key that can only add events and tasks.{' '}
        <a href="https://github.com/kshitijthegit/planner-app/blob/main/gmail-addon/README.md" target="_blank" rel="noreferrer">Setup guide</a>
      </p>
      <p className="muted small">
        {info?.exists ? `Key active since ${new Date(info.created_at!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'No key yet.'}
      </p>
      {fresh && (
        <div className="key-box">
          <code>{fresh}</code>
          <button className="btn-ghost" onClick={async () => { await navigator.clipboard.writeText(fresh); toast('Key copied'); }}>
            <Icon name="copy" size={14} /> Copy
          </button>
          <p className="muted small">Shown once. Paste it into the add-on’s settings in Gmail.</p>
        </div>
      )}
      <div className="btn-row">
        <button className="btn-accent" onClick={generate}>{info?.exists ? 'Make new key' : 'Make access key'}</button>
        {info?.exists && (
          <button className="btn-ghost" onClick={async () => { if (!confirm('Turn off the key? The add-on will stop working.')) return; await api.del('/api/capture/key'); setFresh(null); refresh(); toast('Key turned off'); }}>
            Turn off key
          </button>
        )}
      </div>
    </section>
  );
}
