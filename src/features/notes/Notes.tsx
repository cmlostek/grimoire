import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { useNotes, type Folder, type Note } from './notesStore';
import { useSession } from '../session/sessionStore';
import PageHeader from '../../components/PageHeader';
import {
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  FilePlus,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  PencilLine,
  Search,
  HelpCircle,
  Home,
  Mountain,
  Flag,
  Ship,
  AlertTriangle,
  Gem,
  Flame,
  Swords,
  Skull,
  BookOpen,
  Star,
  Crown,
  Compass,
  Lock,
  MapPin,
  ArrowUpAZ,
  Clock,
  Palette,
} from 'lucide-react';
import { useVisibilityReload } from '../../hooks/useVisibilityReload';
import { useCampaignSettings } from './campaignSettingsStore';

// ─── Folder colour palette ───────────────────────────────────────────────────
const FOLDER_COLORS = [
  { color: '#60a5fa', label: 'Blue' },
  { color: '#f87171', label: 'Red' },
  { color: '#fbbf24', label: 'Amber' },
  { color: '#34d399', label: 'Green' },
  { color: '#a78bfa', label: 'Purple' },
  { color: '#fb923c', label: 'Orange' },
  { color: '#f472b6', label: 'Pink' },
  { color: '#94a3b8', label: 'Slate' },
] as const;

// ─── Note icon palette ───────────────────────────────────────────────────────
type NoteIconDef = {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: React.ComponentType<any>;
  color: string;
  label: string;
};

const NOTE_ICONS: NoteIconDef[] = [
  { id: 'note',      Icon: FileText,      color: '#64748b', label: 'Note' },
  { id: 'town',      Icon: Home,          color: '#60a5fa', label: 'Town' },
  { id: 'dungeon',   Icon: Mountain,      color: '#c2863b', label: 'Dungeon' },
  { id: 'quest',     Icon: Flag,          color: '#f87171', label: 'Quest' },
  { id: 'travel',    Icon: Ship,          color: '#38bdf8', label: 'Travel' },
  { id: 'alert',     Icon: AlertTriangle, color: '#fbbf24', label: 'Alert' },
  { id: 'mystery',   Icon: HelpCircle,    color: '#a78bfa', label: 'Mystery' },
  { id: 'treasure',  Icon: Gem,           color: '#34d399', label: 'Treasure' },
  { id: 'danger',    Icon: Flame,         color: '#fb923c', label: 'Danger' },
  { id: 'combat',    Icon: Swords,        color: '#f472b6', label: 'Combat' },
  { id: 'death',     Icon: Skull,         color: '#94a3b8', label: 'Death' },
  { id: 'lore',      Icon: BookOpen,      color: '#c084fc', label: 'Lore' },
  { id: 'important', Icon: Star,          color: '#facc15', label: 'Important' },
  { id: 'npc',       Icon: Crown,         color: '#f59e0b', label: 'NPC' },
  { id: 'explore',   Icon: Compass,       color: '#2dd4bf', label: 'Explore' },
  { id: 'secret',    Icon: Lock,          color: '#818cf8', label: 'Secret' },
  { id: 'location',  Icon: MapPin,        color: '#fb7185', label: 'Location' },
];

function getNoteIconDef(iconId: string | null | undefined): NoteIconDef {
  return NOTE_ICONS.find((i) => i.id === iconId) ?? NOTE_ICONS[0];
}

function NoteIconDisplay({ iconId, size = 11 }: { iconId: string | null | undefined; size?: number }) {
  const { Icon, color } = getNoteIconDef(iconId);
  return <Icon size={size} style={{ color }} className="shrink-0" />;
}
// ─── Note permission helpers ─────────────────────────────────────────────────
type PermLevel = 'private' | 'read' | 'edit';
function getPermLevel(n: { visible_to_players: boolean; player_editable: boolean | null }): PermLevel {
  if (!n.visible_to_players) return 'private';
  if (n.player_editable) return 'edit';
  return 'read';
}
const PERM_META: Record<PermLevel, { label: string; title: string; cls: string }> = {
  private: {
    label: 'GM Only',
    title: 'Only GM can see — click to share with players',
    cls: 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700',
  },
  read: {
    label: 'View Only',
    title: 'Players can view (read-only) — click to let them edit',
    cls: 'bg-sky-900/40 border border-sky-800 text-sky-200 hover:bg-sky-900/60',
  },
  edit: {
    label: 'Editable',
    title: 'Players can edit — click to make read-only',
    cls: 'bg-emerald-900/40 border border-emerald-800 text-emerald-200 hover:bg-emerald-900/60',
  },
};
function permIcon(level: PermLevel) {
  if (level === 'private') return <EyeOff size={13} className="text-slate-500" />;
  if (level === 'edit')    return <Eye    size={13} className="text-emerald-400" />;
  return                          <Eye    size={13} className="text-sky-400" />;
}

import { buildWikiIndex } from './wikiIndex';
import { remarkNoteDecorators, preprocessDecorators } from './decorators';
import { Secret } from './Secret';
import { PartyRefSpan } from './PartyTooltip';
import { useParty } from '../party/partyStore';

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return (children as React.ReactNode[]).map(extractText).join('');
  if (children !== null && typeof children === 'object' && 'props' in (children as object)) {
    const el = children as { props: { children?: React.ReactNode } };
    return extractText(el.props.children);
  }
  return '';
}

function toggleSecret(body: string, index: number): string {
  const fence = /```[\s\S]*?```/g;
  const segments: Array<{ code: boolean; text: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(body)) !== null) {
    if (m.index > last) segments.push({ code: false, text: body.slice(last, m.index) });
    segments.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ code: false, text: body.slice(last) });
  let count = 0;
  return segments
    .map((seg) => {
      if (seg.code) return seg.text;
      return seg.text.replace(/\{\{([\s\S]*?)\}\}/g, (match, inner: string) => {
        if (count++ === index) {
          return inner.startsWith('!') ? `{{${inner.slice(1)}}}` : `{{!${inner}}}`;
        }
        return match;
      });
    })
    .join('');
}
import { QuickDiceButton } from '../dice/QuickDice';
import { useQuickDice } from '../dice/quickDiceStore';
import { LiveEditor } from './LiveEditor';

type DragItem =
  | { kind: 'note'; id: string }
  | { kind: 'folder'; id: string };

export default function Notes() {
  const campaignId = useSession((s) => s.campaignId);
  const userId = useSession((s) => s.userId);
  const role = useSession((s) => s.role);
  const isGM = role === 'gm';
  const canEditNote = (n: Note) => isGM || n.owner_user_id === userId || n.player_editable === true;

  const notes = useNotes((s) => s.notes);
  const folders = useNotes((s) => s.folders);
  const activeNoteId = useNotes((s) => s.activeNoteId);
  const loadForCampaign = useNotes((s) => s.loadForCampaign);
  const subscribe = useNotes((s) => s.subscribe);
  const setActiveNote = useNotes((s) => s.setActiveNote);
  const createNote = useNotes((s) => s.createNote);
  const updateNote = useNotes((s) => s.updateNote);
  const deleteNote = useNotes((s) => s.deleteNote);
  const createFolder = useNotes((s) => s.createFolder);
  const renameFolder = useNotes((s) => s.renameFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);
  const moveNote = useNotes((s) => s.moveNote);
  const moveFolder = useNotes((s) => s.moveFolder);
  const toggleFolderExpanded = useNotes((s) => s.toggleFolderExpanded);
  const isFolderExpanded = useNotes((s) => s.isFolderExpanded);

  const homebrewItems = useStore((s) => s.homebrewItems);
  const homebrewSpells = useStore((s) => s.homebrewSpells);
  const party = useParty((s) => s.party);
  const rollFormula = useQuickDice((s) => s.rollFormula);

  const loadSettings = useCampaignSettings((s) => s.load);
  const subscribeSettings = useCampaignSettings((s) => s.subscribe);
  const campaignSettings = useCampaignSettings((s) => s.settings);

  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    const unsub = subscribe(campaignId);
    loadSettings(campaignId);
    const unsubSettings = subscribeSettings(campaignId);
    return () => { unsub(); unsubSettings(); };
  }, [campaignId, loadForCampaign, subscribe, loadSettings, subscribeSettings]);

  // Re-fetch when the tab becomes visible again (stale realtime guard)
  useVisibilityReload(() => {
    if (campaignId) loadForCampaign(campaignId);
  });

  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragOverId, setDragOverId] = useState<string | 'root' | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [sortMode, setSortMode] = useState<'updated' | 'alpha'>(() => {
    const stored = localStorage.getItem('dnd-gm:noteSortMode');
    return stored === 'alpha' ? 'alpha' : 'updated';
  });

  const visibleNotes = useMemo(
    () =>
      isGM
        ? notes
        : notes.filter((n) => n.visible_to_players || n.owner_user_id === userId),
    [isGM, notes, userId]
  );

  // Apply sort order to notes and folders for the sidebar
  const sortedVisibleNotes = useMemo(
    () =>
      sortMode === 'alpha'
        ? [...visibleNotes].sort((a, b) =>
            (a.title || 'Untitled').localeCompare(b.title || 'Untitled')
          )
        : visibleNotes,
    [visibleNotes, sortMode]
  );
  const sortedFolders = useMemo(
    () =>
      sortMode === 'alpha'
        ? [...folders].sort((a, b) => a.name.localeCompare(b.name))
        : folders,
    [folders, sortMode]
  );

  const active = visibleNotes.find((n) => n.id === activeNoteId) ?? null;

  const wikiIndex = useMemo(
    () => buildWikiIndex(homebrewItems, homebrewSpells),
    [homebrewItems, homebrewSpells]
  );
  const plugins = useMemo(
    () => [remarkGfm, remarkNoteDecorators(wikiIndex)],
    [wikiIndex]
  );

  const q = query.toLowerCase().trim();
  const matchingNoteIds = useMemo(() => {
    if (!q) return null;
    return new Set(
      visibleNotes
        .filter(
          (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
        )
        .map((n) => n.id)
    );
  }, [q, visibleNotes]);

  const onCreateNote = async (folderId: string | null) => {
    if (!campaignId) return;
    const ownerId = isGM ? null : userId;
    await createNote(campaignId, folderId, ownerId);
  };

  const onDrop = (target: string | null) => {
    if (!isGM) return;
    const raw = dragData;
    if (!raw) return;
    if (raw.kind === 'note') moveNote(raw.id, target);
    else moveFolder(raw.id, target);
    setDragOverId(null);
    setDragData(null);
  };

  const [dragData, setDragData] = useState<DragItem | null>(null);

  const { hiddenFolderIds } = campaignSettings;
  const rootFolders = sortedFolders.filter(
    (f) => f.parent_id === null && (isGM || !hiddenFolderIds.includes(f.id))
  );
  const rootNotes = sortedVisibleNotes.filter((n) => n.folder_id === null);

  const onWikiClick = (href: string) => {
    const [path, hash] = href.split('#');
    navigate(path + (hash ? `#${hash}` : ''));
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Notebook">
        <div className="relative flex items-center gap-2">
          <QuickDiceButton compact />
          <button
            onClick={() => setShowLegend((s) => !s)}
            className="px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
            title="Decorator cheatsheet"
          >
            <HelpCircle size={12} /> Syntax
          </button>
          {showLegend && (
            <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-slate-900 border border-slate-700 rounded shadow-lg p-3 text-xs space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                Note decorators
              </div>
              <LegendRow syntax="@{Waterdeep}" label="location">
                <span className="note-deco note-loc">Waterdeep</span>
              </LegendRow>
              <LegendRow syntax="?{retrieve key}" label="dependency">
                <span className="note-deco note-dep">retrieve key</span>
              </LegendRow>
              <LegendRow syntax="!{reach level 5}" label="milestone">
                <span className="note-deco note-milestone">reach level 5</span>
              </LegendRow>
              <LegendRow syntax="${crown of stars}" label="artifact">
                <span className="note-deco note-artifact">crown of stars</span>
              </LegendRow>
              <LegendRow syntax="%%GM aside%%" label="comment">
                <span className="note-comment">GM aside</span>
              </LegendRow>
              <LegendRow syntax="[[Longsword]]" label="wiki link">
                <span className="note-link">Longsword</span>
              </LegendRow>
              <LegendRow syntax="{{spoiler}}" label="secret">
                <span className="note-secret">spoiler</span>
              </LegendRow>
              <LegendRow syntax="$1d20 + 8$" label="dice roll">
                <button className="note-dice" style={{ pointerEvents: 'none' }}>🎲 1d20 + 8</button>
              </LegendRow>
            </div>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-56 border-r border-slate-800 flex flex-col bg-slate-950">
          <div className="px-2 py-1.5 border-b border-slate-800 flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
              Explorer
            </div>
            <div className="flex gap-0.5">
              <button
                onClick={() => {
                  const next = sortMode === 'alpha' ? 'updated' : 'alpha';
                  setSortMode(next);
                  localStorage.setItem('dnd-gm:noteSortMode', next);
                }}
                title={sortMode === 'alpha' ? 'A–Z order — click for recent first' : 'Recent first — click for A–Z'}
                className="p-1 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded"
              >
                {sortMode === 'alpha' ? <ArrowUpAZ size={12} /> : <Clock size={12} />}
              </button>
              <button
                onClick={() => onCreateNote(null)}
                title="New note"
                className="p-1 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded"
              >
                <FilePlus size={12} />
              </button>
              <button
                onClick={async () => {
                  if (!campaignId) return;
                  const id = await createFolder(campaignId, 'New Folder', null);
                  if (id) {
                    if (isGM) {
                      setRenamingFolderId(id);
                      setRenameValue('New Folder');
                    }
                  }
                }}
                title="New folder"
                className="p-1 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded"
              >
                <FolderPlus size={12} />
              </button>
            </div>
          </div>

          <div className="px-2 py-1.5 border-b border-slate-800">
            <div className="relative">
              <Search
                size={11}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="w-full bg-slate-900 border border-slate-800 rounded pl-5 pr-1.5 py-1 text-[11px] font-mono focus:outline-none focus:border-sky-700"
              />
            </div>
          </div>

          <div
            className={`flex-1 overflow-y-auto py-1 font-mono text-[12px] ${
              dragOverId === 'root' ? 'bg-sky-950/20' : ''
            }`}
            onDragOver={(e) => {
              if (!isGM) return;
              e.preventDefault();
              setDragOverId('root');
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => {
              if (!isGM) return;
              e.preventDefault();
              onDrop(null);
            }}
          >
            {isGM && folders.length === 0 && visibleNotes.length === 0 && (
              <div className="px-3 py-4 text-[11px] text-slate-600 italic font-sans">
                {isGM
                  ? 'No notes yet. Create one with the file icon above.'
                  : 'No notes shared with players yet.'}
              </div>
            )}
            {rootFolders.map((f) => (
              <FolderNode
                key={f.id}
                folder={f}
                depth={0}
                folders={sortedFolders}
                notes={sortedVisibleNotes}
                activeNoteId={activeNoteId}
                matching={matchingNoteIds}
                renamingFolderId={renamingFolderId}
                renameValue={renameValue}
                confirmingId={confirmingId}
                dragOverId={dragOverId}
                isGM={isGM}
                hiddenFolderIds={hiddenFolderIds}
                isExpanded={isFolderExpanded}
                onToggle={toggleFolderExpanded}
                onSelectNote={(id) => {
                  setActiveNote(id);
                }}
                onCreateNote={onCreateNote}
                onCreateFolder={async (parentId) => {
                  if (!campaignId) return;
                  const id = await createFolder(campaignId, 'New Folder', parentId);
                  if (id) {
                    setRenamingFolderId(id);
                    setRenameValue('New Folder');
                  }
                }}
                onStartRename={(id, name) => {
                  setRenamingFolderId(id);
                  setRenameValue(name);
                }}
                onFinishRename={(id) => {
                  if (renameValue.trim()) renameFolder(id, renameValue.trim());
                  setRenamingFolderId(null);
                }}
                onCancelRename={() => setRenamingFolderId(null)}
                onRenameChange={setRenameValue}
                onStartDeleteNote={setConfirmingId}
                onDeleteNote={(id) => {
                  deleteNote(id);
                  setConfirmingId(null);
                }}
                onCancelDelete={() => setConfirmingId(null)}
                onStartDeleteFolder={setConfirmingId}
                onDeleteFolder={(id) => {
                  deleteFolder(id);
                  setConfirmingId(null);
                }}
                onDragStart={setDragData}
                onDragOverItem={setDragOverId}
                onDrop={onDrop}
              />
            ))}
            {rootNotes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                depth={0}
                active={n.id === activeNoteId}
                dimmed={matchingNoteIds !== null && !matchingNoteIds.has(n.id)}
                confirming={confirmingId === n.id}
                isGM={isGM}
                onSelect={() => {
                  setActiveNote(n.id);
                }}
                onStartDelete={() => setConfirmingId(n.id)}
                onDelete={() => {
                  deleteNote(n.id);
                  setConfirmingId(null);
                }}
                onCancelDelete={() => setConfirmingId(null)}
                onDragStart={() => setDragData({ kind: 'note', id: n.id })}
              />
            ))}
          </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          {!active && (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              Select or create a note.
            </div>
          )}
          {active && (
            <>
              <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-3">
                {/* Icon picker button */}
                {canEditNote(active) ? (
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setShowIconPicker((p) => !p)}
                      title="Change note icon"
                      className="p-1.5 rounded hover:bg-slate-800 transition-colors"
                    >
                      <NoteIconDisplay iconId={active.icon} size={18} />
                    </button>
                    {showIconPicker && (
                      <>
                        {/* Backdrop to close picker */}
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setShowIconPicker(false)}
                        />
                        <div className="absolute top-full left-0 mt-1 z-30 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-2 grid grid-cols-6 gap-1 w-56">
                          {NOTE_ICONS.map(({ id, Icon, color, label }) => (
                            <button
                              key={id}
                              title={label}
                              onClick={() => {
                                updateNote(active.id, { icon: id === 'note' ? null : id });
                                setShowIconPicker(false);
                              }}
                              className={`flex flex-col items-center gap-0.5 rounded p-1.5 transition-colors hover:bg-slate-800 ${
                                (active.icon ?? 'note') === id
                                  ? 'bg-slate-700 ring-1 ring-sky-500'
                                  : ''
                              }`}
                            >
                              <Icon size={14} style={{ color }} />
                              <span className="text-[8px] text-slate-500 leading-none truncate w-full text-center">
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="shrink-0 p-1.5">
                    <NoteIconDisplay iconId={active.icon} size={18} />
                  </div>
                )}
                <input
                  value={active.title}
                  onChange={(e) => updateNote(active.id, { title: e.target.value })}
                  readOnly={!canEditNote(active)}
                  className="flex-1 bg-transparent font-serif text-xl outline-none"
                  placeholder="Title"
                />
                {/* Permission-level cycle: GM Only → View Only → Editable → … */}
                {(isGM || active.owner_user_id === userId) && (() => {
                  const level = getPermLevel(active);
                  const meta = PERM_META[level];
                  const cycleNext = () => {
                    if (level === 'private') {
                      updateNote(active.id, { visible_to_players: true, player_editable: false });
                    } else if (level === 'read') {
                      updateNote(active.id, { visible_to_players: true, player_editable: true });
                    } else {
                      updateNote(active.id, { visible_to_players: false, player_editable: false });
                    }
                  };
                  return (
                    <button
                      onClick={cycleNext}
                      title={meta.title}
                      className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${meta.cls}`}
                    >
                      {permIcon(level)}
                      {meta.label}
                    </button>
                  );
                })()}
                {canEditNote(active) && (confirmingId === active.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 mr-1">Delete this note?</span>
                    <button
                      onClick={() => {
                        deleteNote(active.id);
                        setConfirmingId(null);
                      }}
                      className="px-2 py-1 text-xs bg-rose-700 hover:bg-rose-600 text-white rounded"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(active.id)}
                    className="px-2 py-1 text-xs bg-slate-800 hover:bg-rose-900 text-slate-300 hover:text-rose-200 rounded flex items-center gap-1"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                ))}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {canEditNote(active) ? (
                  /* Live editor — highlights decorators inline as you type */
                  <LiveEditor
                    key={active.id}
                    body={active.body}
                    onChange={(v) => updateNote(active.id, { body: v })}
                    wikiIndex={wikiIndex}
                    onNavigate={onWikiClick}
                    rollFormula={rollFormula}
                    party={party}
                  />
                ) : (
                  /* Read-only rendered view for players / non-owners */
                  <div
                    className="h-full overflow-y-auto px-8 py-6 markdown-body"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      const link = target.closest<HTMLAnchorElement>('a[data-wiki="true"]');
                      if (link) {
                        e.preventDefault();
                        onWikiClick(link.getAttribute('href') || '');
                      }
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={plugins}
                      components={{
                        span: ({ node, children, ...props }) => {
                          const p = props as Record<string, unknown>;
                          const className = (p.className as string) ?? '';
                          if (className.includes('note-secret')) {
                            const revealed = p['data-secret-revealed'] === 'true';
                            const idx = parseInt((p['data-secret-index'] as string) ?? '0', 10);
                            // Content is passed as data-secret-content so we can
                            // render it with its own ReactMarkdown (supports bold,
                            // headings, lists, etc. inside the secret block).
                            const content = (p['data-secret-content'] as string) ?? '';
                            return (
                              <Secret
                                isGM={isGM}
                                revealed={revealed}
                                onToggle={() => {
                                  if (active) updateNote(active.id, { body: toggleSecret(active.body, idx) });
                                }}
                              >
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {content}
                                </ReactMarkdown>
                              </Secret>
                            );
                          }
                          if (className.includes('note-loc')) {
                            const text = extractText(children);
                            const member = party.find(
                              (m) => m.name.trim().toLowerCase() === text.trim().toLowerCase()
                            );
                            if (member) {
                              return (
                                <PartyRefSpan member={member} className={className}>
                                  {children}
                                </PartyRefSpan>
                              );
                            }
                          }
                          if (className.includes('note-dice')) {
                            const formula = (p['data-dice-formula'] as string) ?? extractText(children);
                            return (
                              <button
                                className="note-dice"
                                title={`Roll ${formula}`}
                                onClick={() => rollFormula(formula)}
                              >
                                🎲 {formula}
                              </button>
                            );
                          }
                          return <span {...props}>{children}</span>;
                        },
                      }}
                    >
                      {active.body ? preprocessDecorators(active.body) : '*Empty note.*'}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function LegendRow({
  syntax,
  label,
  children,
}: {
  syntax: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className="text-[10px] text-slate-400 bg-slate-950 px-1 py-0.5 rounded font-mono w-28 shrink-0">
        {syntax}
      </code>
      <span className="text-slate-500 text-[10px] w-16 shrink-0">{label}</span>
      <span className="text-[11px]">{children}</span>
    </div>
  );
}


type FolderNodeProps = {
  folder: Folder;
  depth: number;
  folders: Folder[];
  notes: Note[];
  activeNoteId: string | null;
  matching: Set<string> | null;
  renamingFolderId: string | null;
  renameValue: string;
  confirmingId: string | null;
  dragOverId: string | 'root' | null;
  isGM: boolean;
  hiddenFolderIds: string[];
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelectNote: (id: string) => void;
  onCreateNote: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onStartRename: (id: string, name: string) => void;
  onFinishRename: (id: string) => void;
  onCancelRename: () => void;
  onRenameChange: (v: string) => void;
  onStartDeleteNote: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onCancelDelete: () => void;
  onStartDeleteFolder: (id: string) => void;
  onDeleteFolder: (id: string) => void;
  onDragStart: (d: DragItem) => void;
  onDragOverItem: (id: string | null) => void;
  onDrop: (target: string | null) => void;
};

function FolderNode(props: FolderNodeProps) {
  const { folder, depth, folders, notes, matching, isGM, isExpanded, hiddenFolderIds } = props;
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Campaign settings (folder color & visibility)
  const toggleFolder = useCampaignSettings((s) => s.toggleFolder);
  const setFolderColor = useCampaignSettings((s) => s.setFolderColor);
  const folderColors = useCampaignSettings((s) => s.settings.folderColors);
  const folderColor = folderColors[folder.id] ?? '#60a5fa';
  const isHiddenFromPlayers = hiddenFolderIds.includes(folder.id);

  const children = folders.filter(
    (f) => f.parent_id === folder.id && (isGM || !hiddenFolderIds.includes(f.id))
  );
  const folderNotes = notes.filter((n) => n.folder_id === folder.id);
  const renaming = props.renamingFolderId === folder.id;
  const confirming = props.confirmingId === folder.id;
  const isDragOver = props.dragOverId === folder.id;
  const expanded = isExpanded(folder.id);

  return (
    <div>
      <div
        draggable={isGM && !renaming}
        onDragStart={(e) => {
          if (!isGM) return;
          e.stopPropagation();
          props.onDragStart({ kind: 'folder', id: folder.id });
        }}
        onDragOver={(e) => {
          if (!isGM) return;
          e.preventDefault();
          e.stopPropagation();
          props.onDragOverItem(folder.id);
        }}
        onDragLeave={() => props.onDragOverItem(null)}
        onDrop={(e) => {
          if (!isGM) return;
          e.preventDefault();
          e.stopPropagation();
          props.onDrop(folder.id);
        }}
        className={`group flex items-center gap-1 px-1 py-0.5 cursor-pointer transition-colors duration-100 hover:bg-slate-900 ${
          isDragOver ? 'bg-sky-950/40 ring-1 ring-sky-700' : ''
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => props.onToggle(folder.id)}
      >
        {/* Chevron rotates smoothly on expand/collapse */}
        <ChevronRight
          size={12}
          className="text-slate-500 shrink-0 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        {/* Lucide folder icon with campaign color */}
        <FolderIcon
          size={12}
          className="shrink-0"
          style={{ color: isHiddenFromPlayers && isGM ? '#475569' : folderColor }}
        />
        {renaming ? (
          <input
            autoFocus
            value={props.renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => props.onRenameChange(e.target.value)}
            onBlur={() => props.onFinishRename(folder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onFinishRename(folder.id);
              if (e.key === 'Escape') props.onCancelRename();
            }}
            className="flex-1 min-w-0 bg-slate-800 border border-sky-700 px-1 text-[12px] outline-none"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              if (!isGM) return;
              e.stopPropagation();
              props.onStartRename(folder.id, folder.name);
            }}
            className={`flex-1 min-w-0 truncate ${isHiddenFromPlayers && isGM ? 'text-slate-500 italic' : 'text-slate-200'}`}
          >
            {folder.name}
          </span>
        )}
        {!renaming && !confirming && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 relative">
            <button
              onClick={(e) => { e.stopPropagation(); props.onCreateNote(folder.id); }}
              title="New note"
              className="p-0.5 text-slate-500 hover:text-sky-300"
            >
              <FilePlus size={11} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); props.onCreateFolder(folder.id); }}
              title="New subfolder"
              className="p-0.5 text-slate-500 hover:text-sky-300"
            >
              <FolderPlus size={11} />
            </button>
            {isGM && (
              <button
                onClick={(e) => { e.stopPropagation(); props.onStartRename(folder.id, folder.name); }}
                title="Rename folder"
                className="p-0.5 text-slate-500 hover:text-sky-300"
              >
                <Pencil size={11} />
              </button>
            )}
            {isGM && (
              /* Folder color picker */
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v); }}
                  title="Folder colour"
                  className="p-0.5 text-slate-500 hover:text-sky-300"
                >
                  <Palette size={11} />
                </button>
                {showColorPicker && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setShowColorPicker(false); }} />
                    <div
                      className="absolute left-0 top-full mt-1 z-40 bg-slate-900 border border-slate-700 rounded shadow-lg p-1.5 flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {FOLDER_COLORS.map(({ color, label }) => (
                        <button
                          key={color}
                          title={label}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFolderColor(folder.id, color);
                            setShowColorPicker(false);
                          }}
                          className={`w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
                            folderColor === color ? 'border-white' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {isGM && (
              /* Hide/show folder from players */
              <button
                onClick={(e) => { e.stopPropagation(); toggleFolder(folder.id); }}
                title={isHiddenFromPlayers ? 'Hidden from players — click to show' : 'Visible to players — click to hide'}
                className={`p-0.5 ${isHiddenFromPlayers ? 'text-amber-500 hover:text-amber-300 opacity-100' : 'text-slate-500 hover:text-amber-400'}`}
              >
                {isHiddenFromPlayers ? <EyeOff size={11} /> : <Eye size={11} />}
              </button>
            )}
            {isGM && (
              <button
                onClick={(e) => { e.stopPropagation(); props.onStartDeleteFolder(folder.id); }}
                title="Delete folder"
                className="p-0.5 text-slate-500 hover:text-rose-400"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
        {isGM && confirming && (
          <div
            className="flex gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => props.onDeleteFolder(folder.id)}
              className="px-1 text-[10px] bg-rose-700 hover:bg-rose-600 text-white rounded"
            >
              Delete
            </button>
            <button
              onClick={() => props.onCancelDelete()}
              className="px-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Animated expand/collapse via CSS grid trick */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          {children.map((c) => (
            <FolderNode {...props} key={c.id} folder={c} depth={depth + 1} />
          ))}
          {folderNotes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              depth={depth + 1}
              active={n.id === props.activeNoteId}
              dimmed={matching !== null && !matching.has(n.id)}
              confirming={props.confirmingId === n.id}
              isGM={isGM}
              onSelect={() => props.onSelectNote(n.id)}
              onStartDelete={() => props.onStartDeleteNote(n.id)}
              onDelete={() => props.onDeleteNote(n.id)}
              onCancelDelete={() => props.onCancelDelete()}
              onDragStart={() => props.onDragStart({ kind: 'note', id: n.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type NoteRowProps = {
  note: Note;
  depth: number;
  active: boolean;
  dimmed: boolean;
  confirming: boolean;
  isGM: boolean;
  onSelect: () => void;
  onStartDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  onDragStart: () => void;
};

function NoteRow({
  note,
  depth,
  active,
  dimmed,
  confirming,
  isGM,
  onSelect,
  onStartDelete,
  onDelete,
  onCancelDelete,
  onDragStart,
}: NoteRowProps) {
  return (
    <div
      draggable={isGM}
      onDragStart={(e) => {
        if (!isGM) return;
        e.stopPropagation();
        onDragStart();
      }}
      onClick={onSelect}
      className={`group flex items-center gap-1 px-1 py-0.5 cursor-pointer transition-colors duration-100 ${
        active ? 'bg-sky-900/40 text-sky-100' : 'hover:bg-slate-900 text-slate-300'
      } ${dimmed ? 'opacity-30' : ''}`}
      style={{ paddingLeft: 16 + depth * 12 }}
    >
      <NoteIconDisplay iconId={note.icon} size={11} />
      <span className="flex-1 min-w-0 truncate">{note.title || 'Untitled'}</span>
      {isGM && !active && (() => {
        const level = getPermLevel(note);
        if (level === 'edit')    return <Eye size={10} className="text-emerald-400 shrink-0" />;
        if (level === 'read')    return <Eye size={10} className="text-sky-400 shrink-0" />;
        return null;
      })()}
      {isGM && (confirming ? (
        <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onDelete}
            className="px-1 text-[10px] bg-rose-700 hover:bg-rose-600 text-white rounded"
          >
            Del
          </button>
          <button
            onClick={onCancelDelete}
            className="px-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
          >
            X
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStartDelete();
          }}
          className="p-0.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          <Trash2 size={11} />
        </button>
      ))}
    </div>
  );
}
