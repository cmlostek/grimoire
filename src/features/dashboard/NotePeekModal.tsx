import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Check, ExternalLink } from 'lucide-react';
import { useNotes, type Note } from '../notes/notesStore';

/**
 * Lightweight "peek" editor opened from the Dashboard's Recent Notes
 * carousel — a plain title/body quick-edit, not the full collaborative
 * LiveEditor (no markdown decorators, no Yjs). Saving also clears
 * ydoc_state: LiveEditor bootstraps its content from ydoc_state whenever
 * one exists, ignoring body, so a plain body-only write would otherwise be
 * silently discarded the next time anyone opens the full editor. Clearing
 * it forces that next open to re-bootstrap from the fresh body instead.
 */
export default function NotePeekModal({
  note,
  canEdit,
  onClose,
}: {
  note: Note;
  canEdit: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const updateNote = useNotes((s) => s.updateNote);
  const setActiveNote = useNotes((s) => s.setActiveNote);

  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = title !== note.title || body !== note.body;

  const handleSave = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await updateNote(note.id, { title, body, ydoc_state: null });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const openFull = () => {
    setActiveNote(note.id);
    navigate('/notes');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex sm:items-start sm:justify-center sm:overflow-y-auto sm:py-12 sm:px-4">
      <div className="w-full max-w-lg bg-slate-900 sm:border border-slate-800 sm:rounded-lg shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <div className="text-sm uppercase tracking-wider text-slate-500">
            {canEdit ? 'Quick edit' : 'Note'}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openFull}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-sky-300"
            >
              Open full {canEdit ? 'editor' : 'note'} <ExternalLink size={11} />
            </button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {canEdit ? (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-transparent text-xl font-serif text-slate-100 outline-none border-b border-transparent focus:border-slate-700 pb-1"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write something…"
                rows={12}
                className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-sm text-slate-200 outline-none focus:border-slate-600 resize-y font-mono"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Plain text here — decorators, formatting and live collaboration are in the full editor.
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {justSaved && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                      <Check size={12} /> Saved
                    </span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="px-3 py-1.5 text-xs rounded bg-sky-800 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed text-sky-100"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-xl font-serif text-slate-100">{note.title || 'Untitled'}</div>
              <div className="markdown-body text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {note.body || '*Empty note.*'}
                </ReactMarkdown>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
