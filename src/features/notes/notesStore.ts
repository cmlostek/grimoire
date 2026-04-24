import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type Note = {
  id: string;
  campaign_id: string;
  title: string;
  body: string;
  folder_id: string | null;
  visible_to_players: boolean;
  /** null = read-only for players; true = any player may edit (DB col added by migration) */
  player_editable: boolean | null;
  owner_user_id: string | null;
  icon: string | null;
  /** Separate color for the note icon — stored locally until DB migration adds the column */
  icon_color: string | null;
  created_at: string;
  updated_at: string;
};

export type Folder = {
  id: string;
  campaign_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  expanded?: boolean;
};

const EXPANDED_KEY   = 'dnd-gm:expandedFolders';
const ACTIVE_NOTE_KEY = 'dnd-gm:activeNoteId';
const ICON_KEY        = 'dnd-gm:noteIcons';
const ICON_COLOR_KEY  = 'dnd-gm:noteIconColors';
const EDITABLE_KEY    = 'dnd-gm:noteEditable';

function loadExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function persistExpanded(map: Record<string, boolean>) {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify(map));
}

/** Icons are persisted locally so they work even before the DB migration runs. */
function readLocalIcons(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ICON_KEY) ?? '{}'); }
  catch { return {}; }
}
function writeLocalIcon(noteId: string, icon: string | null) {
  const map = readLocalIcons();
  if (icon) map[noteId] = icon;
  else delete map[noteId];
  localStorage.setItem(ICON_KEY, JSON.stringify(map));
}
function mergeIcon(note: Note): Note {
  if (note.icon) return note;           // DB value wins once migration is run
  const local = readLocalIcons()[note.id];
  return local ? { ...note, icon: local } : note;
}

/** player_editable persisted to localStorage until DB column exists. */
function readLocalEditables(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(EDITABLE_KEY) ?? '{}'); }
  catch { return {}; }
}
function writeLocalEditable(noteId: string, editable: boolean | null) {
  const map = readLocalEditables();
  if (editable != null) map[noteId] = editable;
  else delete map[noteId];
  localStorage.setItem(EDITABLE_KEY, JSON.stringify(map));
}
function mergeEditable(note: Note): Note {
  if (note.player_editable != null) return note; // DB value wins
  const local = readLocalEditables()[note.id];
  return local !== undefined ? { ...note, player_editable: local } : note;
}

/** icon_color persisted locally until DB column exists. */
function readLocalIconColors(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ICON_COLOR_KEY) ?? '{}'); }
  catch { return {}; }
}
function writeLocalIconColor(noteId: string, color: string | null) {
  const map = readLocalIconColors();
  if (color) map[noteId] = color;
  else delete map[noteId];
  localStorage.setItem(ICON_COLOR_KEY, JSON.stringify(map));
}
function mergeIconColor(note: Note): Note {
  if (note.icon_color) return note; // DB value wins
  const local = readLocalIconColors()[note.id];
  return local ? { ...note, icon_color: local } : note;
}

function mergeAll(note: Note): Note {
  return mergeIconColor(mergeEditable(mergeIcon(note)));
}

type NotesState = {
  notes: Note[];
  folders: Folder[];
  activeNoteId: string | null;
  loaded: boolean;
  error: string | null;

  loadForCampaign: (campaignId: string) => Promise<void>;
  subscribe: (campaignId: string) => () => void;
  clear: () => void;

  setActiveNote: (id: string | null) => void;

  createNote: (campaignId: string, folderId: string | null, ownerId?: string | null) => Promise<string | null>;
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'folder_id' | 'visible_to_players' | 'icon' | 'icon_color' | 'player_editable'>>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  moveNote: (id: string, folderId: string | null) => Promise<void>;

  createFolder: (campaignId: string, name: string, parentId: string | null) => Promise<string | null>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  toggleFolderExpanded: (id: string) => void;
  isFolderExpanded: (id: string) => boolean;
};

const expandedMap = loadExpanded();

export const useNotes = create<NotesState>((set, get) => ({
  notes: [],
  folders: [],
  activeNoteId: localStorage.getItem(ACTIVE_NOTE_KEY),
  loaded: false,
  error: null,

  loadForCampaign: async (campaignId) => {
    set({ loaded: false, error: null });
    try {
      const [notesRes, foldersRes] = await Promise.all([
        supabase
          .from('notes')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('note_folders')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('sort_order'),
      ]);
      if (notesRes.error) throw notesRes.error;
      if (foldersRes.error) throw foldersRes.error;
      set({
        notes: ((notesRes.data ?? []) as Note[]).map(mergeAll),
        folders: (foldersRes.data ?? []) as Folder[],
        loaded: true,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loaded: true });
    }
  },

  subscribe: (campaignId) => {
    const channel = supabase
      .channel(`notes:${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const { notes } = get();
          if (payload.eventType === 'INSERT') {
            const n = mergeAll(payload.new as Note);
            if (!notes.find((x) => x.id === n.id)) set({ notes: [n, ...notes] });
          } else if (payload.eventType === 'UPDATE') {
            // mergeAll ensures local icon/player_editable survives if DB columns don't exist yet
            const n = mergeAll(payload.new as Note);
            set({ notes: notes.map((x) => (x.id === n.id ? n : x)) });
          } else if (payload.eventType === 'DELETE') {
            const n = payload.old as Partial<Note>;
            set({ notes: notes.filter((x) => x.id !== n.id) });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'note_folders', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const { folders } = get();
          if (payload.eventType === 'INSERT') {
            const f = payload.new as Folder;
            if (!folders.find((x) => x.id === f.id)) set({ folders: [...folders, f] });
          } else if (payload.eventType === 'UPDATE') {
            const f = payload.new as Folder;
            set({ folders: folders.map((x) => (x.id === f.id ? f : x)) });
          } else if (payload.eventType === 'DELETE') {
            const f = payload.old as Partial<Folder>;
            set({ folders: folders.filter((x) => x.id !== f.id) });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  clear: () => set({ notes: [], folders: [], activeNoteId: null, loaded: false, error: null }),

  setActiveNote: (id) => {
    if (id) localStorage.setItem(ACTIVE_NOTE_KEY, id);
    else localStorage.removeItem(ACTIVE_NOTE_KEY);
    set({ activeNoteId: id });
  },

  createNote: async (campaignId, folderId, ownerId) => {
    const insert: Record<string, unknown> = {
      campaign_id: campaignId,
      folder_id: folderId,
      title: 'Untitled',
      body: '',
    };
    if (ownerId != null) insert.owner_user_id = ownerId;
    const { data, error } = await supabase
      .from('notes')
      .insert(insert)
      .select()
      .single();
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to create note' });
      return null;
    }
    const note = data as Note;
    set((s) => ({ notes: [note, ...s.notes], activeNoteId: note.id }));
    localStorage.setItem(ACTIVE_NOTE_KEY, note.id);
    return note.id;
  },

  updateNote: async (id, patch) => {
    // Persist locally-only fields first so they survive DB errors / missing columns
    if ('icon' in patch) writeLocalIcon(id, patch.icon ?? null);
    if ('icon_color' in patch) writeLocalIconColor(id, patch.icon_color ?? null);
    if ('player_editable' in patch) writeLocalEditable(id, patch.player_editable ?? null);

    const prev = get().notes.find((n) => n.id === id);
    if (!prev) return;
    const optimistic = { ...prev, ...patch };
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? optimistic : n)) }));

    const { error } = await supabase.from('notes').update(patch).eq('id', id);
    if (error) {
      if ('icon' in patch || 'icon_color' in patch || 'player_editable' in patch) {
        // Already saved to localStorage — don't revert visual state.
        // DB columns may not exist yet; local values used until migrations run.
        set({ error: error.message });
      } else {
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? prev : n)),
          error: error.message,
        }));
      }
    }
  },

  deleteNote: async (id) => {
    const prev = get().notes;
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    }));
    if (localStorage.getItem(ACTIVE_NOTE_KEY) === id) localStorage.removeItem(ACTIVE_NOTE_KEY);
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) set({ notes: prev, error: error.message });
  },

  moveNote: async (id, folderId) => {
    await get().updateNote(id, { folder_id: folderId });
  },

  createFolder: async (campaignId, name, parentId) => {
    const { data, error } = await supabase
      .from('note_folders')
      .insert({ campaign_id: campaignId, name: name || 'New Folder', parent_id: parentId })
      .select()
      .single();
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to create folder' });
      return null;
    }
    const folder = data as Folder;
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder.id;
  },

  renameFolder: async (id, name) => {
    const prev = get().folders.find((f) => f.id === id);
    if (!prev) return;
    set((s) => ({ folders: s.folders.map((f) => (f.id === id ? { ...f, name } : f)) }));
    const { error } = await supabase.from('note_folders').update({ name }).eq('id', id);
    if (error) {
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? prev : f)),
        error: error.message,
      }));
    }
  },

  deleteFolder: async (id) => {
    const prev = { folders: get().folders, notes: get().notes };
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      notes: s.notes.map((n) => (n.folder_id === id ? { ...n, folder_id: null } : n)),
    }));
    const { error } = await supabase.from('note_folders').delete().eq('id', id);
    if (error) set({ folders: prev.folders, notes: prev.notes, error: error.message });
  },

  moveFolder: async (id, parentId) => {
    if (id === parentId) return;
    const folders = get().folders;
    const isDescendant = (candidateId: string | null): boolean => {
      if (!candidateId) return false;
      if (candidateId === id) return true;
      const parent = folders.find((f) => f.id === candidateId);
      return parent ? isDescendant(parent.parent_id) : false;
    };
    if (isDescendant(parentId)) return;
    const prev = folders.find((f) => f.id === id);
    if (!prev) return;
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? { ...f, parent_id: parentId } : f)),
    }));
    const { error } = await supabase
      .from('note_folders')
      .update({ parent_id: parentId })
      .eq('id', id);
    if (error) {
      set((s) => ({
        folders: s.folders.map((f) => (f.id === id ? prev : f)),
        error: error.message,
      }));
    }
  },

  toggleFolderExpanded: (id) => {
    expandedMap[id] = !(expandedMap[id] ?? true);
    persistExpanded(expandedMap);
    // Force rerender by touching state (folders array identity change)
    set((s) => ({ folders: [...s.folders] }));
  },

  isFolderExpanded: (id) => expandedMap[id] ?? true,
}));
