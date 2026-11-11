import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type Area, type CalEvent, type Category, type Goal, type Settings, type Source, type Task } from './api';

export type Editor =
  | { type: 'task'; task: Partial<Task> }
  | { type: 'event'; event: Partial<CalEvent> }
  | { type: 'goal'; goal: Partial<Goal> }
  | { type: 'shutdown' }
  | { type: 'top3' }
  | null;

interface Store {
  settings: Settings;
  areas: Area[];
  categories: Category[];
  tasks: Task[];
  goals: Goal[];
  sources: Source[];
  googleConnected: boolean;
  agendaVersion: number;
  /** Area of an item: its own area_id, else its category's area. */
  areaIdOf: (item: { area_id?: string | null; category_id?: string | null }) => string | null;
  areaColor: (areaId: string | null | undefined) => string;
  saveGoal: (draft: Partial<Goal>) => Promise<Goal>;
  removeGoal: (id: string) => Promise<void>;
  createCategory: (areaId: string, name: string) => Promise<Category>;
  createArea: (name: string) => Promise<Area>;
  catById: (id: string | null | undefined) => Category | undefined;
  areaById: (id: string | null | undefined) => Area | undefined;
  colorOf: (catId: string | null | undefined) => string;
  labelOf: (catId: string | null | undefined) => string;
  reloadTasks: () => Promise<void>;
  reloadAreas: () => Promise<void>;
  reloadSources: () => Promise<void>;
  bumpAgenda: () => void;
  saveTask: (draft: Partial<Task>) => Promise<Task>;
  completeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  saveEvent: (draft: Partial<CalEvent>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  setOverride: (sourceId: string, seriesId: string, categoryId: string | null) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  editor: Editor;
  openEditor: (e: Editor) => void;
  toast: (msg: string) => void;
  toasts: { id: number; msg: string }[];
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => useContext(Ctx)!;

export const NEUTRAL = '#93A79C';

interface Boot {
  settings: Settings;
  areas: Area[];
  categories: Category[];
  tasks: Task[];
  goals: Goal[];
  sources: Source[];
  googleConnected: boolean;
}

export async function loadBoot(): Promise<Boot> {
  const [settings, ac, tasks, src, goals] = await Promise.all([
    api.get<Settings>('/api/settings'),
    api.get<{ areas: Area[]; categories: Category[] }>('/api/areas'),
    api.get<Task[]>('/api/tasks'),
    api.get<{ sources: Source[]; googleConnected: boolean }>('/api/sources'),
    api.get<Goal[]>('/api/goals'),
  ]);
  return { settings, ...ac, tasks, goals, sources: src.sources, googleConnected: src.googleConnected };
}

export function StoreProvider({ boot, children }: { boot: Boot; children: ReactNode }) {
  const [settings, setSettings] = useState(boot.settings);
  const [areas, setAreas] = useState(boot.areas);
  const [categories, setCategories] = useState(boot.categories);
  const [tasks, setTasks] = useState(boot.tasks);
  const [goals, setGoals] = useState(boot.goals);
  const [sources, setSources] = useState(boot.sources);
  const [googleConnected, setGoogleConnected] = useState(boot.googleConnected);
  const [agendaVersion, setAgendaVersion] = useState(0);
  const [editor, setEditor] = useState<Editor>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const guard = useCallback(
    async <T,>(p: Promise<T>): Promise<T> => {
      try {
        return await p;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Something went wrong');
        throw e;
      }
    },
    [toast],
  );

  const reloadTasks = useCallback(async () => setTasks(await api.get<Task[]>('/api/tasks')), []);
  const reloadAreas = useCallback(async () => {
    const r = await api.get<{ areas: Area[]; categories: Category[] }>('/api/areas');
    setAreas(r.areas);
    setCategories(r.categories);
  }, []);
  const reloadSources = useCallback(async () => {
    const r = await api.get<{ sources: Source[]; googleConnected: boolean }>('/api/sources');
    setSources(r.sources);
    setGoogleConnected(r.googleConnected);
  }, []);
  const bumpAgenda = useCallback(() => setAgendaVersion((v) => v + 1), []);

  // Refresh when the app comes back to the foreground (e.g. phone unlocked).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        reloadTasks().catch(() => {});
        bumpAgenda();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [reloadTasks, bumpAgenda]);

  const value = useMemo<Store>(() => {
    const catById = (id: string | null | undefined) => categories.find((c) => c.id === id);
    const areaById = (id: string | null | undefined) => areas.find((a) => a.id === id);
    return {
      settings, areas, categories, tasks, goals, sources, googleConnected, agendaVersion,
      catById,
      areaById,
      areaIdOf: (it) => it.area_id ?? catById(it.category_id)?.area_id ?? null,
      areaColor: (id) => areaById(id)?.color ?? NEUTRAL,
      async saveGoal(draft) {
        const { id, ...rest } = draft;
        const body = Object.fromEntries(Object.entries(rest).filter(([k]) => !['created_at', 'updated_at'].includes(k)));
        const saved = id ? await guard(api.patch<Goal>(`/api/goals/${id}`, body)) : await guard(api.post<Goal>('/api/goals', body));
        setGoals((gs) => (id ? gs.map((g) => (g.id === id ? saved : g)) : [...gs, saved]));
        return saved;
      },
      async removeGoal(id) {
        await guard(api.del(`/api/goals/${id}`));
        setGoals((gs) => gs.filter((g) => g.id !== id));
      },
      async createCategory(areaId, name) {
        // Light colours so sub-category labels stay readable on the green background.
        const PALETTE = ['#8EC5E8', '#C7A6E8', '#E8C46A', '#E8956A', '#9ED39A', '#E88A7A', '#7FD1C8', '#E0A3CF'];
        const color = PALETTE[categories.length % PALETTE.length];
        const { id } = await guard(api.post<{ id: string }>('/api/categories', { area_id: areaId, name, color }));
        const c: Category = { id, area_id: areaId, name, color, sort: 99 };
        setCategories((cs) => [...cs, c]);
        return c;
      },
      async createArea(name) {
        const color = '#93A79C';
        const { id } = await guard(api.post<{ id: string }>('/api/areas', { name, color }));
        const a: Area = { id, name, color, sort: 99 };
        setAreas((as) => [...as, a]);
        return a;
      },
      colorOf: (id) => catById(id)?.color ?? NEUTRAL,
      labelOf: (id) => {
        const c = catById(id);
        if (!c) return 'No category';
        const a = areaById(c.area_id);
        return a ? `${a.name} · ${c.name}` : c.name;
      },
      reloadTasks, reloadAreas, reloadSources, bumpAgenda,
      async saveTask(draft) {
        const { id, ...rest } = draft;
        const body = Object.fromEntries(
          Object.entries(rest).filter(([k]) => !['done_at', 'created_at', 'updated_at'].includes(k)),
        );
        const saved = id
          ? await guard(api.patch<Task>(`/api/tasks/${id}`, body))
          : await guard(api.post<Task>('/api/tasks', body));
        setTasks((ts) => (id ? ts.map((t) => (t.id === id ? saved : t)) : [...ts, saved]));
        return saved;
      },
      async completeTask(id) {
        const doneAt = new Date().toISOString();
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done_at: doneAt } : t)));
        const r = await guard(api.post<{ task: Task; next: Task | null }>(`/api/tasks/${id}/complete`));
        setTasks((ts) => [...ts.map((t) => (t.id === id ? r.task : t)), ...(r.next ? [r.next] : [])]);
        if (r.next) toast(`Next "${r.next.title}" scheduled`);
      },
      async reopenTask(id) {
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done_at: null } : t)));
        const t = await guard(api.post<Task>(`/api/tasks/${id}/reopen`));
        setTasks((ts) => ts.map((x) => (x.id === id ? t : x)));
      },
      async removeTask(id) {
        await guard(api.del(`/api/tasks/${id}`));
        setTasks((ts) => ts.filter((t) => t.id !== id && t.parent_id !== id));
      },
      async saveEvent(draft) {
        const { id, kind: _k, ...rest } = draft;
        if (id) await guard(api.patch(`/api/events/${id}`, rest));
        else await guard(api.post('/api/events', rest));
        bumpAgenda();
      },
      async removeEvent(id) {
        await guard(api.del(`/api/events/${id}`));
        bumpAgenda();
      },
      async setOverride(source_id, series_id, category_id) {
        await guard(api.put('/api/ext-overrides', { source_id, series_id, category_id }));
        bumpAgenda();
      },
      async updateSettings(patch) {
        setSettings(await guard(api.put<Settings>('/api/settings', patch)));
      },
      editor,
      openEditor: setEditor,
      toast,
      toasts,
    };
  }, [settings, areas, categories, tasks, goals, sources, googleConnected, agendaVersion, editor, toasts, reloadTasks, reloadAreas, reloadSources, bumpAgenda, guard, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Fetch calendar events for [from, to); refetches when anything calendar-related changes. */
export function useAgenda(from: Date, to: Date): { events: CalEvent[]; loading: boolean } {
  const { agendaVersion } = useStore();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const f = from.getTime();
  const t = to.getTime();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get<{ events: CalEvent[] }>(`/api/agenda?from=${new Date(f).toISOString()}&to=${new Date(t).toISOString()}`)
      .then((r) => alive && setEvents(r.events))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [f, t, agendaVersion]);
  return { events, loading };
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

export const useIsMobile = () => useMediaQuery('(max-width: 820px)');
