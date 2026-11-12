// Notes with an optional checklist. Checklist items are stored inside the notes as "- [ ] item" / "- [x] item" lines.
import { useState } from 'react';
import { Icon } from './Icon';

const ITEM = /^\s*- \[( |x|X)\] ?(.*)$/;

export interface ChecklistItem {
  done: boolean;
  text: string;
}

export function parseNotes(notes: string): { text: string; items: ChecklistItem[] } {
  const text: string[] = [];
  const items: ChecklistItem[] = [];
  for (const line of (notes ?? '').split('\n')) {
    const m = ITEM.exec(line);
    if (m) items.push({ done: m[1] !== ' ', text: m[2] });
    else text.push(line);
  }
  return { text: text.join('\n').replace(/\s+$/, ''), items };
}

export function serializeNotes(text: string, items: ChecklistItem[]): string {
  const list = items.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n');
  return [text.replace(/\s+$/, ''), list].filter(Boolean).join('\n');
}

/** "2/5" progress for a notes checklist, or null when there is none. */
export function checklistProgress(notes: string): string | null {
  const { items } = parseNotes(notes);
  return items.length ? `${items.filter((i) => i.done).length}/${items.length}` : null;
}

/** Gmail links in notes (added by the Gmail add-on), shown as an "Open email" button. */
export function gmailLinks(text: string): string[] {
  return [...new Set(text.match(/https:\/\/mail\.google\.com\/[^\s)]+/g) ?? [])];
}

export function NotesEditor({ value, onChange, id = 'notes' }: { value: string; onChange: (v: string) => void; id?: string }) {
  const { text, items } = parseNotes(value);
  const [showList, setShowList] = useState(items.length > 0);
  const [draft, setDraft] = useState('');
  const update = (t: string, it: ChecklistItem[]) => onChange(serializeNotes(t, it));
  const addItem = () => {
    if (!draft.trim()) return;
    update(text, [...items, { done: false, text: draft.trim() }]);
    setDraft('');
  };

  return (
    <div className="notes-editor">
      <div className="notes-head">
        <label htmlFor={id}>Notes</label>
        {!showList && (
          <button type="button" className="link-btn" onClick={() => setShowList(true)}>
            <Icon name="tasks" size={14} /> Add checklist
          </button>
        )}
      </div>
      <textarea id={id} rows={3} value={text} onChange={(e) => update(e.target.value, items)} />
      {gmailLinks(text).map((url) => (
        <a key={url} className="link-btn gmail-link" href={url} target="_blank" rel="noreferrer">
          <Icon name="link" size={14} /> Open email in Gmail
        </a>
      ))}
      {showList && (
        <div className="checklist" role="group" aria-label="Checklist">
          <div className="checklist-head">
            <span>Checklist {items.length > 0 && <span className="muted small">· {items.filter((i) => i.done).length}/{items.length} done</span>}</span>
            {items.length === 0 && (
              <button type="button" className="link-btn muted-link" onClick={() => setShowList(false)}>Remove</button>
            )}
          </div>
          {items.map((it, i) => (
            <div key={i} className={`check-item${it.done ? ' done' : ''}`}>
              <input
                type="checkbox"
                aria-label={`Done: ${it.text}`}
                checked={it.done}
                onChange={(e) => update(text, items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
              />
              <input
                className="check-text"
                aria-label={`Checklist item ${i + 1}`}
                value={it.text}
                onChange={(e) => update(text, items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              />
              <button type="button" className="icon-btn small" aria-label={`Remove ${it.text}`} onClick={() => update(text, items.filter((_, j) => j !== i))}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          <div className="check-item add">
            <Icon name="plus" size={14} />
            <input
              className="check-text"
              aria-label="New checklist item"
              placeholder="Add an item and press Enter"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem();
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
