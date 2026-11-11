// Frontend module registry. To add a feature: build it in src/modules/<id>/ and add an entry here.
// Toggleable modules can be switched off in Settings → Modules.
import type { ComponentType } from 'react';
import { AreasView } from './areas/AreasView';
import { CalendarView } from './calendar/CalendarView';
import { SettingsView } from './settings/SettingsView';
import { TasksView } from './tasks/TasksView';
import { TodayView } from './today/TodayView';

export interface FrontendModule {
  id: string;
  title: string;
  description: string;
  path: string | null; // null = no page of its own (e.g. a flow or card)
  icon: string;
  component: ComponentType | null;
  toggleable: boolean;
}

export const MODULES: FrontendModule[] = [
  { id: 'today', title: 'Today', description: 'Home: top 3, timeline, quick add', path: '/', icon: 'today', component: TodayView, toggleable: false },
  { id: 'calendar', title: 'Calendar', description: 'Day / week / month planner with drag-to-time-block', path: '/calendar', icon: 'calendar', component: CalendarView, toggleable: true },
  { id: 'tasks', title: 'Tasks', description: 'All tasks grouped by area and category', path: '/tasks', icon: 'tasks', component: TasksView, toggleable: true },
  { id: 'areas', title: 'Areas', description: 'Manage areas, categories and colours', path: '/areas', icon: 'areas', component: AreasView, toggleable: true },
  { id: 'shutdown', title: 'Evening shutdown', description: 'Nightly review: close out today, pick tomorrow’s top 3', path: null, icon: 'moon', component: null, toggleable: true },
  { id: 'settings', title: 'Settings', description: 'Calendars, notifications, modules', path: '/settings', icon: 'settings', component: SettingsView, toggleable: false },
];

export function isEnabled(modules: Record<string, boolean>, id: string): boolean {
  return modules[id] !== false;
}
