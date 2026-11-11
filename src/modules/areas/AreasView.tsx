import { useState } from 'react';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';

const PALETTE = ['#8EC5E8', '#C7A6E8', '#E8C46A', '#E8956A', '#9ED39A', '#E88A7A', '#7FD1C8', '#E0A3CF'];

function DeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return armed ? (
    <button className="btn-danger small-btn" onClick={onConfirm} onBlur={() => setArmed(false)} autoFocus>
      Delete?
    </button>
  ) : (
    <button className="icon-btn" aria-label={`Delete ${label}`} onClick={() => setArmed(true)}>
      <Icon name="trash" size={16} />
    </button>
  );
}

export function AreasView() {
  const { areas, categories, reloadAreas, reloadTasks, bumpAgenda, toast } = useStore();
  const [newArea, setNewArea] = useState('');
  const [newCat, setNewCat] = useState<Record<string, string>>({});

  async function act(p: Promise<unknown>) {
    try {
      await p;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed');
    }
    await reloadAreas();
  }

  const nextColor = (i: number) => PALETTE[i % PALETTE.length];

  return (
    <div className="areas-page">
      <header className="page-head">
        <h1>Areas</h1>
        <p className="muted">Areas group categories. Every task and event can carry a category and its colour.</p>
      </header>
      {areas.map((a) => (
        <section key={a.id} className="card area-card">
          <div className="area-row">
            <label className="sr-only" htmlFor={`ac-${a.id}`}>Colour for {a.name}</label>
            <input id={`ac-${a.id}`} type="color" value={a.color} onChange={(e) => act(api.patch(`/api/areas/${a.id}`, { color: e.target.value }))} />
            <label className="sr-only" htmlFor={`an-${a.id}`}>Area name</label>
            <input id={`an-${a.id}`} className="name-input strong" defaultValue={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && act(api.patch(`/api/areas/${a.id}`, { name: e.target.value.trim() }))} />
            <DeleteButton label={a.name} onConfirm={() => act(api.del(`/api/areas/${a.id}`).then(() => { reloadTasks(); bumpAgenda(); }))} />
          </div>
          <div className="cat-list">
            {categories
              .filter((c) => c.area_id === a.id)
              .map((c) => (
                <div key={c.id} className="area-row sub">
                  <label className="sr-only" htmlFor={`cc-${c.id}`}>Colour for {c.name}</label>
                  <input id={`cc-${c.id}`} type="color" value={c.color} onChange={(e) => act(api.patch(`/api/categories/${c.id}`, { color: e.target.value }).then(bumpAgenda))} />
                  <label className="sr-only" htmlFor={`cn-${c.id}`}>Category name</label>
                  <input id={`cn-${c.id}`} className="name-input" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && act(api.patch(`/api/categories/${c.id}`, { name: e.target.value.trim() }))} />
                  <DeleteButton label={c.name} onConfirm={() => act(api.del(`/api/categories/${c.id}`).then(() => { reloadTasks(); bumpAgenda(); }))} />
                </div>
              ))}
            <form
              className="area-row sub add"
              onSubmit={(e) => {
                e.preventDefault();
                const name = (newCat[a.id] ?? '').trim();
                if (!name) return;
                act(api.post('/api/categories', { area_id: a.id, name, color: nextColor(categories.length) }));
                setNewCat((n) => ({ ...n, [a.id]: '' }));
              }}
            >
              <label className="sr-only" htmlFor={`nc-${a.id}`}>New category in {a.name}</label>
              <input id={`nc-${a.id}`} placeholder="+ Add category" value={newCat[a.id] ?? ''} onChange={(e) => setNewCat((n) => ({ ...n, [a.id]: e.target.value }))} />
            </form>
          </div>
        </section>
      ))}
      <form
        className="card area-row add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newArea.trim()) return;
          const color = nextColor(areas.length + 3);
          await act(
            api.post<{ id: string }>('/api/areas', { name: newArea.trim(), color }).then((r) =>
              api.post('/api/categories', { area_id: r.id, name: 'General', color }),
            ),
          );
          setNewArea('');
        }}
      >
        <label className="sr-only" htmlFor="new-area">New area</label>
        <input id="new-area" placeholder="+ New area (e.g. Health, Projects)" value={newArea} onChange={(e) => setNewArea(e.target.value)} />
        <button className="btn-ghost" disabled={!newArea.trim()}>Add</button>
      </form>
    </div>
  );
}
