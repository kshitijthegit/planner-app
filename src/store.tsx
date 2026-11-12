import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** prev = the event as it was before editing (for undo). */
  saveEvent: (draft: Partial<CalEvent>, prev?: Partial<CalEvent>) => Promise<void>;
  removeEvent: (ev: CalEvent) => Promise<void>;
  setOverride: (sourceId: string, seriesId: string, categoryId: string | null, prevCategoryId?: string | null) => Promise<void>;
  setExtAttendance: (sourceId: string, extId: string, attendance: Attendance, prev?: Attendance) => Promise<void>;
  undo: () => Promise<void>;
  canUndo: boolean;
  /** Change one occurrence of a repeating event/goal. prev = its current override (null if none) for undo. */
  setOccurrence: (o: OccChange, prev: OccChange | null, label: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  editor: Editor;
  openEditor: (e: Editor) => void;
  toast: (msg: string, action?: ToastAction) => void;
  toasts: Toast[];
}

type Attendance = 'yes' | 'no' | 'maybe';
export interface OccChange {
  kind: 'event' | 'goal';
  series_id: string;
  occ_date: string;
  cancelled?: boolean;
  done_at?: string | null;
  data?: Record<string, unknown>;
}
interface ToastAction {
  label: string;
  run: () => void;
}
interface Toast {
  id: number;
  msg: string;
  action?: ToastAction;
}
interface UndoEntry {
  label: string;
  run: () => Promise<unknown>;
}
const UNDO_LIMIT = 50;

/** Only the fields that changed, with their previous values. */
function previousValues<T extends object>(prev: T, draft: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(draft) as (keyof T)[]) {
    if (['id', 'created_at', 'updated_at', 'kind'].includes(k as string)) continue;
    if (prev[k] !== draft[k]) out[k] = prev[k] ?? (null as T[keyof T]);
  }
  return out;
}

/** Row as POST body (keeps the id so undo restores the same item). */
function restoreBody<T extends object>(row: T): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !['created_at', 'updated_at', 'kind', 'source_name', 'source_kind', 'series_start_at', 'series_end_at'].includes(k))) as Partial<T>;
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const undoStack = useRef<UndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const toast = useCallback((msg: string, action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3500);
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
  const reloadGoals = useCallback(async () => setGoals(await api.get<Goal[]>('/api/goals')), []);

  const undo = useCallback(async () => {
    const entry = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (!entry) {
      toast('Nothing to undo');
      return;
    }
    try {
      await entry.run();
      toast(`Undone: ${entry.label}`);
    } catch (e) {
      toast(`Couldn’t undo: ${e instanceof Error ? e.message : 'error'}`);
    }
    await Promise.all([reloadTasks(), reloadGoals()]).catch(() => {});
    bumpAgenda();
  }, [toast, reloadTasks, reloadGoals, bumpAgenda]);

  /** Record how to reverse an action, and offer an Undo button. */
  const pushUndo = useCallback(
    (label: string, run: () => Promise<unknown>) => {
      undoStack.current = [...undoStack.current.slice(-(UNDO_LIMIT - 1)), { label, run }];
      setCanUndo(true);
      toast(label, { label: 'Undo', run: () => void undo() });
    },
    [toast, undo],
  );

  // Ctrl+Z / Cmd+Z anywhere outside a text field (text fields keep their own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      void undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

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
        const prev = id ? goals.find((g) => g.id === id) : undefined;
        const saved = id ? await guard(api.patch<Goal>(`/api/goals/${id}`, body)) : await guard(api.post<Goal>('/api/goals', body));
        setGoals((gs) => (id ? gs.map((g) => (g.id === id ? saved : g)) : [...gs, saved]));
        if (prev) {
          const back = previousValues(prev, draft);
          const label = 'done_at' in draft && Object.keys(draft).length === 2 ? (draft.done_at ? `Goal achieved: ${saved.title}` : `Goal reopened: ${saved.title}`) : `Edited goal “${saved.title}”`;
          pushUndo(label, () => api.patch(`/api/goals/${saved.id}`, back));
        } else pushUndo(`Added goal “${saved.title}”`, () => api.del(`/api/goals/${saved.id}`));
        return saved;
      },
      async removeGoal(id) {
        const prev = goals.find((g) => g.id === id);
        await guard(api.del(`/api/goals/${id}`));
        setGoals((gs) => gs.filter((g) => g.id !== id));
        if (prev) pushUndo(`Deleted goal “${prev.title}”`, () => api.post('/api/goals', restoreBody(prev)));
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
        const prev = id ? tasks.find((t) => t.id === id) : undefined;
        const saved = id
          ? await guard(api.patch<Task>(`/api/tasks/${id}`, body))
          : await guard(api.post<Task>('/api/tasks', body));
        setTasks((ts) => (id ? ts.map((t) => (t.id === id ? saved : t)) : [...ts, saved]));
        if (prev) {
          const back = previousValues(prev, body as Partial<Task>);
          if (Object.keys(back).length) pushUndo(`Edited “${saved.title}”`, () => api.patch(`/api/tasks/${saved.id}`, back));
        } else pushUndo(`Added “${saved.title}”`, () => api.del(`/api/tasks/${saved.id}`));
        return saved;
      },
      async completeTask(id) {
        const doneAt = new Date().toISOString();
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done_at: doneAt } : t)));
        const r = await guard(api.post<{ task: Task; next: Task | null }>(`/api/tasks/${id}/complete`));
        setTasks((ts) => [...ts.map((t) => (t.id === id ? r.task : t)), ...(r.next ? [r.next] : [])]);
        pushUndo(r.next ? `Completed “${r.task.title}” · next one scheduled` : `Completed “${r.task.title}”`, async () => {
          await api.patch(`/api/tasks/${id}`, { done_at: null });
          if (r.next) await api.del(`/api/tasks/${r.next.id}`);
        });
      },
      async reopenTask(id) {
        const prevDone = tasks.find((t) => t.id === id)?.done_at ?? null;
        setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done_at: null } : t)));
        const t = await guard(api.post<Task>(`/api/tasks/${id}/reopen`));
        setTasks((ts) => ts.map((x) => (x.id === id ? t : x)));
        if (prevDone) pushUndo(`Reopened “${t.title}”`, () => api.patch(`/api/tasks/${id}`, { done_at: prevDone }));
      },
      async removeTask(id) {
        const victim = tasks.find((t) => t.id === id);
        const kids = tasks.filter((t) => t.parent_id === id);
        const grandkids = tasks.filter((t) => kids.some((k) => k.id === t.parent_id));
        await guard(api.del(`/api/tasks/${id}`));
        const gone = new Set([id, ...kids.map((k) => k.id), ...grandkids.map((g) => g.id)]);
        setTasks((ts) => ts.filter((t) => !gone.has(t.id)));
        if (victim)
          pushUndo(`Deleted “${victim.title}”`, async () => {
            for (const row of [victim, ...kids, ...grandkids]) await api.post('/api/tasks', restoreBody(row));
          });
      },
      async saveEvent(draft, prev) {
        const { id, kind: _k, ...rest } = draft;
        if (id) {
          await guard(api.patch(`/api/events/${id}`, rest));
          if (prev) {
            const back = previousValues(prev, rest as Partial<CalEvent>);
            if (Object.keys(back).length) pushUndo(`Edited “${draft.title ?? prev.title}”`, () => api.patch(`/api/events/${id}`, back));
          }
        } else {
          const created = await guard(api.post<CalEvent>('/api/events', rest));
          pushUndo(`Added “${created.title}”`, () => api.del(`/api/events/${created.id}`));
        }
        bumpAgenda();
      },
      async removeEvent(ev) {
        await guard(api.del(`/api/events/${ev.id}`));
        bumpAgenda();
        const series = { ...ev, start_at: ev.series_start_at ?? ev.start_at, end_at: ev.series_end_at ?? ev.end_at };
        pushUndo(`Deleted “${ev.title}”`, () => api.post('/api/events', restoreBody(series)));
      },
      async setOverride(source_id, series_id, category_id, prevCategoryId) {
        await guard(api.put('/api/ext-overrides', { source_id, series_id, category_id }));
        bumpAgenda();
        if (prevCategoryId !== undefined && prevCategoryId !== category_id)
          pushUndo('Changed sub-category', () => api.put('/api/ext-overrides', { source_id, series_id, category_id: prevCategoryId }));
      },
      async setExtAttendance(source_id, ext_id, attendance, prev) {
        await guard(api.put('/api/ext-attendance', { source_id, ext_id, attendance }));
        bumpAgenda();
        if (prev && prev !== attendance) pushUndo(`Attendance set to “${attendance}”`, () => api.put('/api/ext-attendance', { source_id, ext_id, attendance: prev }));
      },
      undo,
      canUndo,
      async setOccurrence(o, prev, label) {
        await guard(api.put('/api/occurrences', o));
        bumpAgenda();
        pushUndo(label, () => (prev ? api.put('/api/occurrences', prev) : api.post('/api/occurrences/reset', o)));
      },
      async updateSettings(patch) {
        setSettings(await guard(api.put<Settings>('/api/settings', patch)));
      },
      editor,
      openEditor: setEditor,
      toast,
      toasts,
    };
  }, [settings, areas, categories, tasks, goals, sources, googleConnected, agendaVersion, editor, toasts, reloadTasks, reloadAreas, reloadSources, bumpAgenda, guard, toast, undo, canUndo, pushUndo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Fetch calendar events for [from, to); refetches when anything calendar-related changes. */
export function useAgenda(from: Date, to: Date): { events: CalEvent[]; goals: Goal[]; loading: boolean } {
  const { agendaVersion, goals: goalSeries } = useStore();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const f = from.getTime();
  const t = to.getTime();
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get<{ events: CalEvent[]; goals: Goal[] }>(`/api/agenda?from=${new Date(f).toISOString()}&to=${new Date(t).toISOString()}`)
      .then((r) => {
        if (!alive) return;
        setEvents(r.events);
        setGoals(r.goals ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [f, t, agendaVersion, goalSeries]);
  return { events, goals, loading };
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
