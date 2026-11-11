import { useEffect, useState } from 'react';
import { api } from './api';
import { AddFlow } from './components/AddFlow';
import { EventEditor } from './components/EventEditor';
import { GoalEditor } from './components/GoalEditor';
import { Icon } from './components/Icon';
import { TaskEditor } from './components/TaskEditor';
import { isEnabled, MODULES } from './modules/registry';
import { ShutdownFlow, Top3Picker } from './modules/shutdown/ShutdownFlow';
import { navigate, usePath } from './router';
import { loadBoot, StoreProvider, useIsMobile, useStore } from './store';

type Boot = Awaited<ReturnType<typeof loadBoot>>;

export function App() {
  const [state, setState] = useState<'loading' | 'out' | 'in' | 'error'>('loading');
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    const out = () => setState('out');
    window.addEventListener('planner:unauth', out);
    (async () => {
      try {
        const me = await api.get<{ authenticated: boolean }>('/api/auth/me');
        if (!me.authenticated) return setState('out');
        setBoot(await loadBoot());
        setState('in');
      } catch {
        setState('error');
      }
    })();
    return () => window.removeEventListener('planner:unauth', out);
  }, []);

  if (state === 'loading') return <div className="center-screen muted">Loading…</div>;
  if (state === 'error')
    return (
      <div className="center-screen">
        <p>Can’t reach the planner right now.</p>
        <button className="btn-accent" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  if (state === 'out' || !boot) return <Login />;
  return (
    <StoreProvider boot={boot}>
      <Shell />
    </StoreProvider>
  );
}

function Login() {
  const err = new URLSearchParams(window.location.search).get('auth_error');
  return (
    <div className="center-screen login">
      <div className="brand-mark" aria-hidden="true"><Icon name="check" size={28} stroke={2.4} /></div>
      <h1>Planner</h1>
      <p className="muted">Your calendar, tasks and daily plan in one place.</p>
      {err && <p className="warn" role="alert">{err}</p>}
      <a className="btn-accent big" href="/api/auth/login">Sign in with Google</a>
    </div>
  );
}

function Shell() {
  const path = usePath();
  const mobile = useIsMobile();
  const { settings, editor, openEditor, toasts } = useStore();
  const enabled = MODULES.filter((m) => isEnabled(settings.modules, m.id));
  const routed = enabled.filter((m) => m.path);
  const current = routed.find((m) => m.path === path) ?? routed[0];
  const Page = current.component!;

  // Push notification deep link: /?shutdown=1
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('shutdown') && isEnabled(settings.modules, 'shutdown')) {
      openEditor({ type: 'shutdown' });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [openEditor, settings.modules]);

  useEffect(() => {
    document.title = current.id === 'today' ? 'Planner' : `${current.title} · Planner`;
  }, [current]);

  const nav = (
    <nav aria-label="Main" className={mobile ? 'bottom-nav' : 'rail'}>
      {routed
        .filter((m) => !m.hideInNav && !(mobile ? false : m.id === 'settings'))
        .map((m) => (
          <a
            key={m.id}
            href={m.path!}
            aria-label={m.title}
            aria-current={m === current ? 'page' : undefined}
            className={m === current || (m.id === 'settings' && current.id === 'calendars') ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate(m.path!);
            }}
          >
            <Icon name={m.icon} />
            {mobile && <span>{m.title}</span>}
          </a>
        ))}
      {!mobile && (
        <>
          <span className="grow" />
          <a
            href="/settings"
            aria-label="Settings"
            aria-current={current.id === 'settings' ? 'page' : undefined}
            className={current.id === 'settings' || current.id === 'calendars' ? 'active' : undefined}
            onClick={(e) => {
              e.preventDefault();
              navigate('/settings');
            }}
          >
            <Icon name="settings" />
          </a>
        </>
      )}
    </nav>
  );

  return (
    <div className={`shell${mobile ? ' mobile' : ''}`}>
      {!mobile && nav}
      <main className="page">
        <Page />
      </main>
      {mobile && nav}
      {editor?.type === 'task' && (editor.task.id || editor.task.parent_id
        ? <TaskEditor key={editor.task.id ?? 'new'} initial={editor.task} onClose={() => openEditor(null)} />
        : <AddFlow kind="task" initial={editor.task} onClose={() => openEditor(null)} />)}
      {editor?.type === 'event' && (editor.event.id || editor.event.kind === 'ext'
        ? <EventEditor initial={editor.event} onClose={() => openEditor(null)} />
        : <AddFlow kind="event" initial={editor.event} onClose={() => openEditor(null)} />)}
      {editor?.type === 'goal' && (editor.goal.id
        ? <GoalEditor initial={editor.goal} onClose={() => openEditor(null)} />
        : <AddFlow kind="goal" initial={editor.goal} onClose={() => openEditor(null)} />)}
      {editor?.type === 'shutdown' && <ShutdownFlow onClose={() => openEditor(null)} />}
      {editor?.type === 'top3' && <Top3Picker onClose={() => openEditor(null)} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
