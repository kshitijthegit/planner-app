import { all, HttpError, json, patchRow, readJson, run, str, uuid } from '../lib/core';
import type { BackendModule } from './types';

const COLOR = /^#[0-9a-fA-F]{6}$/;

function color(v: unknown): string {
  if (typeof v !== 'string' || !COLOR.test(v)) throw new HttpError(400, 'color must be #RRGGBB');
  return v;
}

export const areasModule: BackendModule = {
  id: 'areas',
  register(r) {
    r.get('/api/areas', async ({ env }) =>
      json({
        areas: await all(env, 'SELECT * FROM areas ORDER BY sort, name'),
        categories: await all(env, 'SELECT * FROM categories ORDER BY sort, name'),
      }),
    );

    r.post('/api/areas', async ({ env, req }) => {
      const b = await readJson(req);
      const id = uuid();
      await run(env, 'INSERT INTO areas (id, name, color, sort) VALUES (?, ?, ?, ?)', id, str(b.name, 'name', { max: 60 }), color(b.color), Number(b.sort ?? 99));
      return json({ id }, 201);
    });

    r.patch('/api/areas/:id', async ({ env, req, params }) => {
      const b = await readJson(req);
      if (b.color !== undefined) color(b.color);
      await patchRow(env, 'areas', params.id, b, ['name', 'color', 'sort']);
      return json({ ok: true });
    });

    r.delete('/api/areas/:id', async ({ env, params }) => {
      const sub = 'SELECT id FROM categories WHERE area_id = ?';
      await env.DB.batch([
        env.DB.prepare(`UPDATE tasks SET category_id = NULL WHERE category_id IN (${sub})`).bind(params.id),
        env.DB.prepare(`UPDATE events SET category_id = NULL WHERE category_id IN (${sub})`).bind(params.id),
        env.DB.prepare(`UPDATE sources SET category_id = NULL WHERE category_id IN (${sub})`).bind(params.id),
        env.DB.prepare(`DELETE FROM ext_overrides WHERE category_id IN (${sub})`).bind(params.id),
        env.DB.prepare('DELETE FROM categories WHERE area_id = ?').bind(params.id),
        env.DB.prepare('DELETE FROM areas WHERE id = ?').bind(params.id),
      ]);
      return json({ ok: true });
    });

    r.post('/api/categories', async ({ env, req }) => {
      const b = await readJson(req);
      const id = uuid();
      await run(
        env,
        'INSERT INTO categories (id, area_id, name, color, sort) VALUES (?, ?, ?, ?, ?)',
        id,
        str(b.area_id, 'area_id'),
        str(b.name, 'name', { max: 60 }),
        color(b.color),
        Number(b.sort ?? 99),
      );
      return json({ id }, 201);
    });

    r.patch('/api/categories/:id', async ({ env, req, params }) => {
      const b = await readJson(req);
      if (b.color !== undefined) color(b.color);
      await patchRow(env, 'categories', params.id, b, ['name', 'color', 'sort', 'area_id']);
      return json({ ok: true });
    });

    r.delete('/api/categories/:id', async ({ env, params }) => {
      await env.DB.batch([
        env.DB.prepare('UPDATE tasks SET category_id = NULL WHERE category_id = ?').bind(params.id),
        env.DB.prepare('UPDATE events SET category_id = NULL WHERE category_id = ?').bind(params.id),
        env.DB.prepare('UPDATE sources SET category_id = NULL WHERE category_id = ?').bind(params.id),
        env.DB.prepare('DELETE FROM ext_overrides WHERE category_id = ?').bind(params.id),
        env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(params.id),
      ]);
      return json({ ok: true });
    });
  },
};
