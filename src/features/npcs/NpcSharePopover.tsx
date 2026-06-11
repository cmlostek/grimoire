import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Share2, Lock, UserCheck, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../session/sessionStore';
import { useNpcStore, EMPTY_PERMS, type NPC, type NpcPermission } from './npcStore';

type Member = {
  user_id: string;
  display_name: string;
  role: 'gm' | 'player';
};

type Props = {
  npc: NPC;
  onClose: () => void;
  /** Update the NPC's stat_block_visible flag. */
  onStatBlockVisibilityChange: (visible: boolean) => void;
};

/**
 * Per-player view matrix for an NPC + stat block visibility toggle.
 * Mirrors notes/SharePopover but view-only (players don't edit NPCs) and
 * with no "author" concept — only the GM has implicit full access.
 */
export function NpcSharePopover({ npc, onClose, onStatBlockVisibilityChange }: Props) {
  const campaignId = useSession((s) => s.campaignId);
  const myUserId = useSession((s) => s.userId);
  const myRole = useSession((s) => s.role);

  const perms = useNpcStore((s) => s.permissions[npc.id] ?? EMPTY_PERMS);
  const setNpcPermissions = useNpcStore((s) => s.setNpcPermissions);
  const updateNpc = useNpcStore((s) => s.update);

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const [draft, setDraft] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const p of perms) out[p.user_id] = p.can_view;
    return out;
  });

  useEffect(() => {
    const out: Record<string, boolean> = {};
    for (const p of perms) out[p.user_id] = p.can_view;
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

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  const matrixMembers = useMemo(
    () => members.filter((m) => m.role !== 'gm'),
    [members]
  );

  const persist = (next: Record<string, boolean>) => {
    setDraft(next);
    const rows: NpcPermission[] = Object.entries(next)
      .filter(([, v]) => v)
      .map(([user_id]) => ({ npc_id: npc.id, user_id, can_view: true }));
    setNpcPermissions(npc.id, rows);

    // Keep the legacy visible_to_players flag in sync so older clients and the
    // RLS shortcut stay consistent: true iff every player has access.
    const allShared = matrixMembers.length > 0 && matrixMembers.every((m) => next[m.user_id]);
    if (npc.visibleToPlayers !== allShared) {
      updateNpc(npc.id, { visibleToPlayers: allShared });
    }
  };

  const toggle = (userId: string) => {
    persist({ ...draft, [userId]: !draft[userId] });
  };

  const applyPreset = (preset: 'gm_only' | 'party_view') => {
    const next: Record<string, boolean> = {};
    if (preset === 'party_view') {
      for (const m of matrixMembers) next[m.user_id] = true;
    }
    persist(next);
  };

  const activePreset = useMemo<'gm_only' | 'party_view' | null>(() => {
    const visibleUsers = Object.entries(draft).filter(([, v]) => v).map(([k]) => k);
    if (visibleUsers.length === 0) return 'gm_only';
    if (matrixMembers.length === 0) return null;
    const allShared = matrixMembers.every((m) => draft[m.user_id]);
    return allShared ? 'party_view' : null;
  }, [draft, matrixMembers]);

  const gmMember = members.find((m) => m.role === 'gm');
  const canManage = myRole === 'gm';

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-40 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-3 text-xs"
    >
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
        <Share2 size={11} /> Share NPC
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 gap-1 mb-3">
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
      </div>

      {/* GM always-on row */}
      <div className="border border-slate-800 rounded mb-2 divide-y divide-slate-800">
        {gmMember && (
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center px-2 py-1">
            <span className="text-slate-300 truncate flex items-center gap-1.5">
              <UserCheck size={11} className="text-amber-400" />
              {gmMember.display_name}
              {gmMember.user_id === myUserId && <span className="text-[9px] text-slate-500">(you)</span>}
            </span>
            <span className="text-[9px] uppercase tracking-wider text-slate-500">GM · full</span>
          </div>
        )}
      </div>

      {/* Per-user matrix */}
      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_auto] gap-2 text-[10px] uppercase tracking-wider text-slate-500 px-2">
          <span>Players</span>
          <span className="w-10 text-center">View</span>
        </div>
        {loading && (
          <div className="px-2 py-2 text-slate-500 italic">Loading…</div>
        )}
        {!loading && matrixMembers.length === 0 && (
          <div className="px-2 py-2 text-slate-500 italic">No players in this campaign.</div>
        )}
        {matrixMembers.map((m) => (
          <div
            key={m.user_id}
            className="grid grid-cols-[1fr_auto] gap-2 items-center px-2 py-1 rounded hover:bg-slate-800/40"
          >
            <span className="text-slate-200 truncate">{m.display_name}</span>
            <Checkbox
              checked={!!draft[m.user_id]}
              onChange={() => toggle(m.user_id)}
              disabled={!canManage}
            />
          </div>
        ))}
      </div>

      {/* Stat block visibility */}
      <div className="mt-3 pt-2 border-t border-slate-800">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Stat block</div>
        <button
          onClick={() => onStatBlockVisibilityChange(!npc.statBlockVisible)}
          disabled={!canManage}
          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border transition-colors ${
            npc.statBlockVisible
              ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
          } ${!canManage ? 'opacity-40 cursor-not-allowed' : ''}`}
          title={npc.statBlockVisible ? 'Hide stat block from players' : 'Show stat block to players who can view this NPC'}
        >
          <span className="flex items-center gap-1.5 text-[11px]">
            <BookOpen size={11} />
            {npc.statBlockVisible ? 'Stat block visible' : 'Stat block hidden'}
          </span>
          {npc.statBlockVisible ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-500 leading-relaxed">
        The GM always has access. Players you share with can see the NPC card; they also see the stat block when it's visible.
      </div>
    </div>
  );
}

function PresetButton({
  icon, label, active, onClick, disabled,
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

function Checkbox({
  checked, onChange, disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      title="View"
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
