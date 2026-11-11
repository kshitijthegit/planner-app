import { json, readJson } from '../lib/core';
import { getSettings, saveSettings } from '../lib/settings';
import type { BackendModule } from './types';

export const settingsModule: BackendModule = {
  id: 'settings',
  register(r) {
    r.get('/api/settings', async ({ env }) => json(await getSettings(env)));
    r.put('/api/settings', async ({ env, req }) => json(await saveSettings(env, await readJson(req))));
  },
};
