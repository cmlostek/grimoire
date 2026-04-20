import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useSession } from '../session/sessionStore';
import { useNotes } from '../notes/notesStore';
import { useTranscripts, type Transcript } from './transcriptionStore';
import { Mic, Square, Save, Trash2, AlertTriangle, FileText, Clock } from 'lucide-react';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function formatDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return '…';
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function Transcription() {
  const campaignId = useSession((s) => s.campaignId);

  const transcripts = useTranscripts((s) => s.transcripts);
  const loadTranscripts = useTranscripts((s) => s.loadForCampaign);
  const createTranscript = useTranscripts((s) => s.createTranscript);
  const deleteTranscript = useTranscripts((s) => s.deleteTranscript);
  const linkToNote = useTranscripts((s) => s.linkToNote);

  const notes = useNotes((s) => s.notes);
  const createNote = useNotes((s) => s.createNote);
  const updateNote = useNotes((s) => s.updateNote);

  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [recording, setRecording] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTextRef = useRef('');

  useEffect(() => {
    if (campaignId) loadTranscripts(campaignId);
  }, [campaignId, loadTranscripts]);

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setRecError(null);
    finalTextRef.current = finalText;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let latestInterim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTextRef.current += (finalTextRef.current ? ' ' : '') + text.trim();
          setFinalText(finalTextRef.current);
        } else {
          latestInterim += text;
        }
      }
      setInterim(latestInterim);
    };
    rec.onerror = (e: any) => {
      setRecError(e?.error ?? 'Speech recognition error');
    };
    rec.onend = () => {
      if (recognitionRef.current === rec && recording) {
        try {
          rec.start();
        } catch {
          setRecording(false);
        }
      }
    };
    recognitionRef.current = rec;
    rec.start();
    setRecording(true);
    setStartedAt(new Date().toISOString());
  };

  const stop = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    setRecording(false);
    setInterim('');
    if (rec) {
      try { rec.stop(); } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        try { rec.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  const reset = () => {
    setFinalText('');
    setInterim('');
    finalTextRef.current = '';
    setStartedAt(null);
    setRecError(null);
  };

  const saveTranscriptOnly = async () => {
    if (!campaignId || !finalText.trim()) return;
    const id = await createTranscript(campaignId, finalText.trim(), null);
    if (id) {
      reset();
      setSelectedId(id);
    }
  };

  const saveAsNote = async () => {
    if (!campaignId || !finalText.trim()) return;
    const noteId = await createNote(campaignId, null);
    if (!noteId) return;
    const title = `Session transcript — ${formatDate(startedAt ?? new Date().toISOString())}`;
    await updateNote(noteId, { title, body: finalText.trim() });
    const tid = await createTranscript(campaignId, finalText.trim(), noteId);
    if (tid) {
      reset();
      setSelectedId(tid);
    }
  };

  const selected = transcripts.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Session Recorder" />

      {!supported && (
        <div className="mx-6 mt-4 p-3 bg-amber-950/40 border border-amber-800 rounded text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            Your browser doesn't support the Web Speech API. Use Chrome or Edge on desktop for live dictation. You can still view saved transcripts below.
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <section className="flex-1 min-w-0 flex flex-col p-6 gap-4">
          <div className="flex items-center gap-3">
            {!recording ? (
              <button
                onClick={start}
                disabled={!supported}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold rounded flex items-center gap-2"
              >
                <Mic size={16} /> Start recording
              </button>
            ) : (
              <button
                onClick={stop}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded flex items-center gap-2"
              >
                <Square size={16} /> Stop
              </button>
            )}
            {recording && (
              <span className="flex items-center gap-1.5 text-xs text-rose-300">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                Listening…
              </span>
            )}
            {finalText && !recording && (
              <>
                <button
                  onClick={saveAsNote}
                  className="px-3 py-2 bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold rounded flex items-center gap-2 text-sm"
                >
                  <Save size={14} /> Save as note
                </button>
                <button
                  onClick={saveTranscriptOnly}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-2 text-sm"
                >
                  <Save size={14} /> Save transcript only
                </button>
                <button
                  onClick={reset}
                  className="px-3 py-2 bg-slate-800 hover:bg-rose-900 text-slate-300 rounded flex items-center gap-2 text-sm"
                >
                  <Trash2 size={14} /> Discard
                </button>
              </>
            )}
          </div>

          {recError && (
            <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded p-2">
              {recError}
            </div>
          )}

          <div className="flex-1 min-h-0 bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-y-auto">
            {!finalText && !interim && (
              <div className="text-slate-600 text-sm italic">
                {recording
                  ? 'Listening. Words will appear here as they are recognized.'
                  : supported
                    ? 'Press Start recording to dictate session notes. On stop, save the transcript as a new note or keep it in the archive below.'
                    : 'Live dictation unavailable in this browser.'}
              </div>
            )}
            {(finalText || interim) && (
              <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">
                {finalText}
                {interim && <span className="text-slate-500 italic"> {interim}</span>}
              </div>
            )}
          </div>
        </section>

        <aside className="w-72 shrink-0 border-l border-slate-800 flex flex-col">
          <div className="px-3 py-2 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
            Archive ({transcripts.length})
          </div>
          <div className="flex-1 overflow-y-auto">
            {transcripts.length === 0 && (
              <div className="p-4 text-xs text-slate-600 italic">No saved transcripts yet.</div>
            )}
            {transcripts.map((t) => (
              <TranscriptRow
                key={t.id}
                t={t}
                noteTitle={notes.find((n) => n.id === t.note_id)?.title ?? null}
                active={t.id === selectedId}
                onSelect={() => setSelectedId(t.id)}
                onDelete={() => {
                  deleteTranscript(t.id);
                  if (selectedId === t.id) setSelectedId(null);
                }}
                onUnlink={() => linkToNote(t.id, null)}
              />
            ))}
          </div>
          {selected && (
            <div className="border-t border-slate-800 p-3 max-h-64 overflow-y-auto bg-slate-950">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                <Clock size={10} />
                {formatDate(selected.started_at)}
                <span className="opacity-50">·</span>
                {formatDuration(selected.started_at, selected.ended_at)}
              </div>
              <div className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selected.body}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TranscriptRow({
  t, noteTitle, active, onSelect, onDelete, onUnlink,
}: {
  t: Transcript;
  noteTitle: string | null;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUnlink: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div
      onClick={onSelect}
      className={`group px-3 py-2 cursor-pointer border-b border-slate-800 ${
        active ? 'bg-sky-900/30' : 'hover:bg-slate-900'
      }`}
    >
      <div className="text-xs text-slate-200 truncate">
        {t.body.slice(0, 60) || '(empty)'}
        {t.body.length > 60 ? '…' : ''}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
        <Clock size={9} /> {formatDate(t.started_at)}
        {t.note_id && noteTitle && (
          <>
            <span className="opacity-50">·</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnlink();
              }}
              className="flex items-center gap-0.5 text-sky-400 hover:text-sky-200 truncate"
              title="Unlink from note"
            >
              <FileText size={9} /> {noteTitle}
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          {confirm ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="px-1 text-[9px] bg-rose-700 hover:bg-rose-600 text-white rounded"
              >
                Del
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirm(false); }}
                className="px-1 text-[9px] bg-slate-700 text-slate-200 rounded"
              >
                X
              </button>
            </>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirm(true); }}
              className="p-0.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100"
            >
              <Trash2 size={10} />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
