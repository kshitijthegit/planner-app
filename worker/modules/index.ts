// Backend module registry. Add new feature modules here.
import { areasModule } from './areas';
import { authModule } from './auth';
import { eventsModule } from './events';
import { notifyModule } from './notify';
import { pushModule } from './push';
import { settingsModule } from './settings';
import { sourcesModule } from './sources';
import { tasksModule } from './tasks';
import type { BackendModule } from './types';

export const modules: BackendModule[] = [
  authModule,
  settingsModule,
  areasModule,
  tasksModule,
  eventsModule,
  sourcesModule,
  pushModule,
  notifyModule,
];
