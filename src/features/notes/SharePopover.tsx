import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, Share2, Users, UserCheck, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../session/sessionStore';
import { useNotes, type Note, type NotePermission } from './notesStore';

type Member = {
  user_id: string;
  display_name: string;
  role: 'gm' | 'player';
};

type Props = {
  note: Note;
  /** Closes the popover. */
  onClose: () => void;
};

/**
 * Per-user view/edit matrix with quick preset buttons.
 * GM and the note's author always have full access (rows shown as locked).
 */
export function SharePopover({ note, onClose }: Props) {
  const campaignId = useSession((s) => s.campaignId);
  const myUserId = useSession((s) => s.userId);
  const myRole = useSession((s) => s.role);
  const perms = useNotes((s) => s.permissions[note.id] ?? []);
  const setNotePermissions = useNotes((s) => s.setNotePermissions);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Local working copy — only flushed to the store/DB on change.
  const [draft, setDraft] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>(() => {
    const out: Record<string, { can_view: boolean; can_edit: boolean }> = {};
    for (const p of perms) out[p.user_id] = { can_view: p.can_view, can_edit: p.can_edit };
    return out;
  });

  // Sync local draft when external perms change (realtime).
  useEffect(() => {
    const out: Record<string, { can_view: boolean; can_edit: boolean }> = {};
    for (const p of perms) out[p.user_id] = { can_view: p.can_view, can_edit: p.can_edit };
    setDraft(out);
  }, [perms]);

  useEffect(() => {
    let cancelled = false;
    if (!campaignId) return;
    (async () => {
      const { data, error } = await supabase
        .from('campaign_members')
        .select('user_id, display_name, role')
        .eq('campaign_id', campaignId);
      if (cancelled) return;
      if (!error && data) setMembers(data as Member[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  // Close when clicking outside.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  // Players to show in the matrix: everyone in the campaign except the GM
  // (who has implicit full access) and the note's author (also implicit).
  const matrixMembers = useMemo(
    () => members.filter((m) => m.role !== 'gm' && m.user_id !== note.owner_user_id),
    [members, note.owner_user_id]
  );

  const persist = (next: Record<string, { can_view: boolean; can_edit: boolean }>) => {
    setDraft(next);
    const rows: NotePermission[] = Object.entries(next).map(([user_id, v]) => ({
      note_id: note.id,
      user_id,
      can_view: v.can_view,
      can_edit: v.can_edit,
    }));
    setNotePermissions(note.id, rows);
  };

  const toggle = (userId: string, field: 'can_view' | 'can_edit') => {
    const cur = draft[userId] ?? { can_view: false, can_edit: false };
    const next = { ...cur, [field]: !cur[field] };
    // Edit implies view — can't edit what you can't see.
    if (field === 'can_edit' && next.can_edit) next.can_view = true;
    // Removing view also removes edit.
    if (field === 'can_view' && !next.can_view) next.can_edit = false;
    persist({ ...draft, [userId]: next });
  };

  const applyPreset = (preset: 'gm_only' | 'party_view' | 'party_edit') => {
    const next: Record<string, { can_view: boolean; can_edit: boolean }> = {};
    if (preset !== 'gm_only') {
      for (const m of matrixMembers) {
        next[m.user_id] = {
          can_view: true,
          can_edit: preset === 'party_edit',
        };
      }
    }
    persist(next);
  };

  // Detect which preset is active (for visual hint).
  const activePreset = useMemo<'gm_only' | 'party_view' | 'party_edit' | null>(() => {
    const entries = Object.entries(draft);
    if (entries.length === 0) return 'gm_only';
    if (matrixMembers.length === 0) return null;
    const allView = matrixMembers.every((m) => draft[m.user_id]?.can_view);
    if (!allView) return null;
    const allEdit = matrixMembers.every((m) => draft[m.user_id]?.can_edit);
    return allEdit ? 'party_edit' : 'party_view';
  }, [draft, matrixMembers]);

  // The GM and author are shown above the matrix as a static "always has access" row.
  const authorMember = members.find((m) => m.user_id === note.owner_user_id);
  const gmMember = members.find((m) => m.role === 'gm');

  // The control is only enabled for the author or GM. Callers gate the
  // button itself, but defensive guard here too in case of stale UI.
  const canManage = myRole === 'gm' || note.owner_user_id === myUserId;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-40 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 text-xs"
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
        <Share2 size={11} /> Share note
      </div>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-1 mb-3">
        <PresetButton
          icon={<Lock size={11} />}
          label="GM only"
          active={activePreset === 'gm_only'}
          onClick={() => applyPreset('gm_only')}
          disabled={!canManage}
        />
        <PresetButton
          icon={<Eye size={11} />}
          label="Party view"
          active={activePreset === 'party_view'}
          onClick={() => applyPreset('party_view')}
          disabled={!canManage || matrixMembers.length === 0}
        />
        <PresetButton
          icon={<Pencil size={11} />}
          label="Party edit"
          active={activePreset === 'party_edit'}
          onClick={() => applyPreset('party_edit')}
          disabled={!canManage || matrixMembers.length === 0}
        />
      </div>

      {/* Always-on access (GM + author) */}
      <div className="border border-slate-800 rounded mb-2 divide-y divide-slate-800">
        {gmMember && (
          <FixedAccessRow
            name={gmMember.display_name}
            role="GM"
            youAre={gmMember.user_id === myUserId}
          />
        )}
        {authorMember && authorMember.user_id !== gmMember?.user_id && (
          <FixedAccessRow
            name={authorMember.display_name}
            role="Author"
            youAre={authorMember.user_id === myUserId}
          />
        )}
      </div>

      {/* Per-user matrix */}
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] uppercase tracking-wider text-slate-500 px-2">
          <span>Players</span>
          <span className="w-10 text-center">View</span>
          <span className="w-10 text-center">Edit</span>
        </div>
        {loading && (
          <div className="px-2 py-2 text-slate-500 italic">Loading…</div>
        )}
        {!loading && matrixMembers.length === 0 && (
          <div className="px-2 py-2 text-slate-500 italic">No other players in this campaign.</div>
        )}
        {matrixMembers.map((m) => {
          const v = draft[m.user_id] ?? { can_view: false, can_edit: false };
          return (
            <div
              key={m.user_id}
              className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1 rounded hover:bg-slate-800/40"
            >
              <span className="text-slate-200 truncate">{m.display_name}</span>
              <Checkbox
                checked={v.can_view}
                onChange={() => toggle(m.user_id, 'can_view')}
                disabled={!canManage}
                label="View"
              />
              <Checkbox
                checked={v.can_edit}
                onChange={() => toggle(m.user_id, 'can_edit')}
                disabled={!canManage}
                label="Edit"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 leading-relaxed">
        GM and the author of a note always have full access. Edit access implies view.
      </div>
    </div>
  );
}

function PresetButton({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-0.5 rounded px-1.5 py-1.5 border transition-colors text-[10px] ${
        active
          ? 'bg-sky-900/40 border-sky-700 text-sky-200'
          : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FixedAccessRow({ name, role, youAre }: { name: string; role: 'GM' | 'Author'; youAre: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 items-center px-2 py-1">
      <span className="text-slate-300 truncate flex items-center gap-1.5">
        {role === 'GM' ? <UserCheck size={11} className="text-amber-400" /> : <Users size={11} className="text-sky-400" />}
        {name}
        {youAre && <span className="text-[9px] text-slate-500">(you)</span>}
      </span>
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{role} • full</span>
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      title={label}
      className={`w-10 flex justify-center items-center h-5 rounded transition-colors ${
        checked
          ? 'bg-sky-700/60 hover:bg-sky-600/60 text-sky-100'
          : 'bg-slate-800 hover:bg-slate-700 text-slate-600'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      {checked ? <Eye size={11} /> : <EyeOff size={11} />}
    </button>
  );
}
