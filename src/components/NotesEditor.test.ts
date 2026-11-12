import { describe, expect, it } from 'vitest';
import { checklistProgress, parseNotes, serializeNotes } from './NotesEditor';

describe('notes checklist', () => {
  it('splits text and checklist and round-trips', () => {
    const notes = 'Bring laptop\n- [x] Read brief\n- [ ] Draft outline';
    const p = parseNotes(notes);
    expect(p).toEqual({ text: 'Bring laptop', items: [{ done: true, text: 'Read brief' }, { done: false, text: 'Draft outline' }] });
    expect(serializeNotes(p.text, p.items)).toBe(notes);
    expect(checklistProgress(notes)).toBe('1/2');
    expect(checklistProgress('just text')).toBeNull();
  });
});
