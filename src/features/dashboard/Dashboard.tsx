import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Check, X, UserPlus, MessageCircle, Camera, Trash2, User as UserIcon, Dice6, Shield, UserMinus, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../session/sessionStore';
import { useParty } from '../party/partyStore';
import { CharCard } from '../party/Party';
import ChatPanel from '../chat/ChatPanel';
import { useChat, type ChatMember } from '../chat/chatStore';
import { useChatPanel } from '../chat/chatPanelStore';
import { useProfiles, avatarPublicUrl } from '../profiles/profilesStore';
import { supabase } from '../../lib/supabase';
import DiceRoller from '../dice/DiceRoller';

type DashboardTab = 'profile' | 'dice' | 'manage';

/**
 * Player dashboard — landing page after entering a campaign. Phase 1: display
 * name editor, bio, per-campaign color, and embedded chat. Phases 2 & 3 will
 * add the character sheet (party_members row) and avatars + favorites.
 */
export default function Dashboard() {
  const userId = useSession((s) => s.userId);
  const campaignId = useSession((s) => s.campaignId);
  const displayName = useSession((s) => s.displayName);
  const myColor = useSession((s) => s.myColor);
  const role = useSession((s) => s.role);
  const myBio = useSession((s) => s.myBio);
  const updateMyDisplayName = useSession((s) => s.updateMyDisplayName);
  const updateMyColor = useSession((s) => s.updateMyColor);
  const updateMyBio = useSession((s) => s.updateMyBio);
  const myAvatarPath = useSession((s) => s.myAvatarPath);
  const loadMyProfile = useSession((s) => s.loadMyProfile);
  const uploadMyAvatar = useSession((s) => s.uploadMyAvatar);
  const removeMyAvatar = useSession((s) => s.removeMyAvatar);

  // Hydrate the global profile (avatar) for this user on mount.
  useEffect(() => {
    void loadMyProfile();
  }, [userId, loadMyProfile]);

  const party = useParty((s) => s.party);
  const partyLoaded = useParty((s) => s.loaded);
  const loadParty = useParty((s) => s.loadForCampaign);
  const subscribeParty = useParty((s) => s.subscribe);
  const updateMember = useParty((s) => s.updatePartyMember);
  const removeMember = useParty((s) => s.removePartyMember);
  const claimMember = useParty((s) => s.claim);
  const unclaimMember = useParty((s) => s.unclaim);

  // Dashboard is often the first page visited, so the Party feature may not
  // have loaded yet. Loading here is cheap (idempotent server fetch).
  useEffect(() => {
    if (!campaignId) return;
    loadParty(campaignId);
    return subscribeParty(campaignId);
  }, [campaignId, loadParty, subscribeParty]);

  // The player can own at most one character per campaign by design.
  const myCharacter = useMemo(
    () => (userId ? party.find((p) => p.owner_user_id === userId) ?? null : null),
    [party, userId]
  );

  const isGM = role === 'gm';
  const [tab, setTab] = useState<DashboardTab>('profile');
  // If the user was on Manage when their role changed, snap them back.
  useEffect(() => {
    if (tab === 'manage' && !isGM) setTab('profile');
  }, [tab, isGM]);

  return (
    <div className="h-full overflow-hidden flex flex-col lg:flex-row">
      {/* ── Main column (profile header + tabs + tab content) ──────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex items-center gap-4">
          <AvatarUpload
            color={myColor ?? '#94a3b8'}
            initial={(displayName ?? '?').slice(0, 1).toUpperCase()}
            path={myAvatarPath}
            onUpload={uploadMyAvatar}
            onRemove={removeMyAvatar}
          />
          <div className="min-w-0 flex-1">
            <DisplayNameEditor value={displayName ?? ''} onSave={updateMyDisplayName} />
            <div className="text-xs text-slate-500 mt-1">
              <span className={isGM ? 'text-emerald-400' : 'text-sky-400'}>
                {isGM ? 'Game Master' : 'Player'}
              </span>
            </div>
          </div>
        </div>

        <TabBar tab={tab} setTab={setTab} isGM={isGM} />

        <div className="flex-1 overflow-y-auto">
          {tab === 'profile' && (
            <div className="px-6 py-6 space-y-6">
              <Section title="Chat color">
                <ColorPicker value={myColor ?? '#94a3b8'} onChange={updateMyColor} />
              </Section>

              <Section title="About">
                <BioEditor value={myBio ?? ''} onSave={updateMyBio} />
              </Section>

              <Section title="Character sheet">
                {!partyLoaded ? (
                  <div className="text-sm text-slate-500">Loading…</div>
                ) : myCharacter ? (
                  <CharCard
                    m={myCharacter}
                    userId={userId}
                    isGM={isGM}
                    editable={true}
                    memberNames={{}}
                    onUpdate={(patch) => updateMember(myCharacter.id, patch)}
                    onRemove={() => removeMember(myCharacter.id)}
                    onClaim={() => claimMember(myCharacter.id)}
                    onUnclaim={() => unclaimMember(myCharacter.id)}
                  />
                ) : (
                  <NoCharacterCTA party={party} role={role} onClaim={claimMember} />
                )}
              </Section>

              <Section title="Campaign members">
                <CampaignMembersPanel selfId={userId} />
              </Section>

              <div className="pt-6 border-t border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-rose-400 mb-2">Danger zone</div>
                <LeaveCampaignRow />
              </div>
            </div>
          )}

          {tab === 'dice' && (
            // DiceRoller already renders its own PageHeader, padding, etc.
            <DiceRoller />
          )}

          {tab === 'manage' && isGM && (
            <div className="px-6 py-6">
              <CampaignManagementPanel selfId={userId} campaignId={campaignId ?? ''} />
            </div>
          )}
        </div>
      </div>

      {/* ── Embedded chat column / row ─────────────────────────────────── */}
      <div className="lg:w-96 shrink-0 h-[28rem] lg:h-auto border-t lg:border-t-0 lg:border-l border-slate-800 p-3">
        <ChatPanel variant="embedded" />
      </div>
    </div>
  );
}

function TabBar({
  tab,
  setTab,
  isGM,
}: {
  tab: DashboardTab;
  setTab: (t: DashboardTab) => void;
  isGM: boolean;
}) {
  const tabs: { id: DashboardTab; label: string; icon: typeof UserIcon; gmOnly?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'dice', label: 'Dice', icon: Dice6 },
    { id: 'manage', label: 'Campaign Management', icon: Shield, gmOnly: true },
  ];
  return (
    <div className="border-b border-slate-800 px-4 flex gap-1 overflow-x-auto">
      {tabs
        .filter((t) => !t.gmOnly || isGM)
        .map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-wider border-b-2 -mb-px transition-colors ${
                active
                  ? 'text-slate-100 border-sky-500'
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          );
        })}
    </div>
  );
}

/**
 * GM-only Campaign Management panel — lists every member with a Remove
 * button. Removal cascades party_members rows the player owned via the
 * existing campaign_members ON DELETE CASCADE chain (set via the schema).
 * RLS allows is_gm() to delete.
 */
function CampaignManagementPanel({
  selfId,
  campaignId,
}: {
  selfId: string | null;
  campaignId: string;
}) {
  const membersMap = useChat((s) => s.members);
  const profiles = useProfiles((s) => s.profiles);
  const loadProfiles = useProfiles((s) => s.loadFor);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(() => {
    return Object.values(membersMap).sort((a, b) => {
      // Self first (read-only), then GMs, then players by name.
      if (a.userId === selfId) return -1;
      if (b.userId === selfId) return 1;
      if (a.role !== b.role) return a.role === 'gm' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [membersMap, selfId]);

  useEffect(() => {
    if (members.length === 0) return;
    void loadProfiles(members.map((m) => m.userId));
  }, [members, loadProfiles]);

  const remove = async (m: ChatMember) => {
    if (m.userId === selfId) return;
    setBusyId(m.userId);
    setError(null);
    const { error: err } = await supabase
      .from('campaign_members')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', m.userId);
    setBusyId(null);
    setConfirmingId(null);
    if (err) {
      setError(`Couldn't remove ${m.displayName}: ${err.message}`);
      return;
    }
    // The realtime sub on chat_messages / members updates the list.
  };

  return (
    <Section title="Campaign management">
      <div className="text-[12px] text-slate-500 mb-3">
        Remove members from the campaign. They lose access immediately and any
        characters they owned become unclaimed. Your own row can't be removed
        here — use Switch campaign in the sidebar to leave.
      </div>
      {error && (
        <div className="text-[12px] text-rose-300 mb-3 px-3 py-2 bg-rose-950/40 border border-rose-900 rounded">
          {error}
        </div>
      )}
      <div className="space-y-1.5">
        {members.map((m) => {
          const isSelf = m.userId === selfId;
          const url = avatarPublicUrl(profiles[m.userId]?.avatarPath ?? null);
          const confirming = confirmingId === m.userId;
          return (
            <div
              key={m.userId}
              className="flex items-center gap-3 px-3 py-2 rounded bg-slate-900 border border-slate-800"
            >
              <MemberAvatar color={m.color} name={m.displayName} url={url} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate" style={{ color: m.color }}>
                  {m.displayName}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  {m.role === 'gm' ? 'Game Master' : 'Player'}
                  {isSelf && ' · you'}
                </div>
              </div>
              {!isSelf && (
                confirming ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => remove(m)}
                      disabled={busyId === m.userId}
                      className="px-2 py-1 text-[11px] bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white rounded"
                    >
                      {busyId === m.userId ? 'Removing…' : 'Remove'}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(m.userId)}
                    title={`Remove ${m.displayName}`}
                    className="p-1.5 text-slate-500 hover:text-rose-300 hover:bg-slate-800 rounded flex items-center gap-1 text-[11px]"
                  >
                    <UserMinus size={13} /> Remove
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 pt-6 border-t border-slate-800 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-rose-400 mb-2">Danger zone</div>
        <ClearChatRow campaignId={campaignId} />
        <DeleteCampaignRow />
      </div>
    </Section>
  );
}

/**
 * Shared shell for a Danger-zone row — title, blurb, two-step confirm
 * pattern. Keeps Clear chat / Leave / Delete visually identical.
 */
function DangerRow({
  title,
  blurb,
  ctaLabel,
  ctaIcon,
  confirmLabel,
  onConfirm,
}: {
  title: string;
  blurb: string;
  ctaLabel: string;
  ctaIcon: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fire = async () => {
    setBusy(true);
    setError(null);
    const res = await onConfirm();
    setBusy(false);
    setConfirming(false);
    if (!res.ok) setError(res.error);
  };
  return (
    <div className="bg-rose-950/20 border border-rose-900/50 rounded p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-slate-200">{title}</div>
          <div className="text-[11px] text-slate-500">{blurb}</div>
        </div>
        {confirming ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={fire}
              disabled={busy}
              className="px-2 py-1 text-[11px] bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white rounded"
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950/40 border border-rose-900/50 rounded flex items-center gap-1 shrink-0"
          >
            {ctaIcon} {ctaLabel}
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-rose-300 mt-2">{error}</div>}
    </div>
  );
}

function ClearChatRow({ campaignId }: { campaignId: string }) {
  const clearAll = useChat((s) => s.clearAll);
  return (
    <DangerRow
      title="Clear chat history"
      blurb="Permanently deletes every chat message in this campaign for every player. This cannot be undone."
      ctaLabel="Clear chat"
      ctaIcon={<Trash2 size={11} />}
      confirmLabel="Confirm clear"
      onConfirm={() => clearAll(campaignId)}
    />
  );
}

function LeaveCampaignRow() {
  const leaveCampaign = useSession((s) => s.leaveCampaign);
  const campaignName = useSession((s) => s.campaignName);
  return (
    <DangerRow
      title="Leave campaign"
      blurb={`You'll lose access to ${campaignName ?? 'this campaign'} until a GM invites you back with the join code. Any characters you owned become unclaimed.`}
      ctaLabel="Leave"
      ctaIcon={<LogOut size={11} />}
      confirmLabel="Confirm leave"
      onConfirm={leaveCampaign}
    />
  );
}

function DeleteCampaignRow() {
  const deleteCampaign = useSession((s) => s.deleteCampaign);
  const campaignName = useSession((s) => s.campaignName);
  return (
    <DangerRow
      title="Delete campaign"
      blurb={`Permanently deletes ${campaignName ?? 'this campaign'} and everything inside it — notes, NPCs, party, map, chat, all of it. Every player loses access immediately. This cannot be undone.`}
      ctaLabel="Delete"
      ctaIcon={<Trash2 size={11} />}
      confirmLabel="Confirm delete"
      onConfirm={deleteCampaign}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      {children}
    </section>
  );
}

function AvatarUpload({
  color,
  initial,
  path,
  onUpload,
  onRemove,
}: {
  color: string;
  initial: string;
  path: string | null;
  onUpload: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
  onRemove: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = avatarPublicUrl(path);
  const has = url != null;

  const pick = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same filename
    if (!file) return;
    setBusy(true);
    setErr(null);
    const res = await onUpload(file);
    setBusy(false);
    if (!res.ok) setErr(res.error);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={onFile}
      />
      <button
        onClick={pick}
        disabled={busy}
        title={has ? 'Change avatar' : 'Upload avatar'}
        className="relative h-16 w-16 rounded-full border-2 overflow-hidden shrink-0 group disabled:opacity-60"
        style={{
          borderColor: color,
          backgroundColor: has ? '#020617' : `color-mix(in srgb, ${color} 22%, transparent)`,
          color,
        }}
      >
        {has ? (
          <img src={url!} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex items-center justify-center h-full w-full text-xl font-serif">{initial}</span>
        )}
        <span className="absolute inset-0 bg-slate-950/70 text-slate-100 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera size={12} /> {has ? 'Change' : 'Upload'}
        </span>
      </button>
      {has && (
        <button
          onClick={() => { void onRemove(); }}
          title="Remove avatar"
          disabled={busy}
          className="p-1.5 rounded text-slate-500 hover:text-rose-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      )}
      {err && <span className="text-[11px] text-rose-300">{err}</span>}
    </div>
  );
}

function DisplayNameEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      cancel();
      return;
    }
    await onSave(next);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex items-center gap-2 text-2xl font-serif text-slate-100 hover:text-slate-200"
        title="Edit name"
      >
        <span className="truncate">{value || 'Unnamed'}</span>
        <Pencil size={14} className="text-slate-600 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xl font-serif text-slate-100 focus:outline-none focus:border-sky-700 min-w-0 flex-1"
        maxLength={48}
      />
      <button onClick={commit} className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200" title="Save (Enter)">
        <Check size={14} />
      </button>
      <button onClick={cancel} className="p-1 rounded text-slate-500 hover:text-slate-300" title="Cancel (Esc)">
        <X size={14} />
      </button>
    </div>
  );
}

function BioEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [value]);

  const onChange = (next: string) => {
    setDraft(next);
    setDirty(next !== value);
  };
  const save = async () => {
    if (!dirty) return;
    await onSave(draft);
    setDirty(false);
  };
  const cancel = () => {
    setDraft(value);
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Who is this character? Backstory hooks, quirks, anything the rest of the party should know."
        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-700 resize-y"
        maxLength={2000}
      />
      {dirty && (
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={save}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
          >
            <Check size={11} /> Save
          </button>
          <button onClick={cancel} className="text-slate-500 hover:text-slate-300">
            Discard
          </button>
          <span className="ml-auto text-slate-600">{draft.length}/2000</span>
        </div>
      )}
    </div>
  );
}

const COLOR_PRESETS = [
  '#94a3b8', '#f87171', '#fb923c', '#fbbf24', '#4ade80',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#e879f9',
];

/**
 * Lists every other campaign member with their color, role, and an at-a-glance
 * Whisper affordance. Click a row → sets them as the chat whisper recipient.
 * Avatars are currently a colored initial; real image upload comes later.
 */
function CampaignMembersPanel({ selfId }: { selfId: string | null }) {
  const membersMap = useChat((s) => s.members);
  const setWhisperTarget = useChatPanel((s) => s.setWhisperTarget);
  const profiles = useProfiles((s) => s.profiles);
  const loadProfiles = useProfiles((s) => s.loadFor);

  const others = useMemo<ChatMember[]>(() => {
    const list = Object.values(membersMap).filter((m) => m.userId !== selfId);
    return list.sort((a, b) => {
      // GMs first, then by display name.
      if (a.role !== b.role) return a.role === 'gm' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [membersMap, selfId]);

  useEffect(() => {
    if (others.length === 0) return;
    void loadProfiles(others.map((m) => m.userId));
  }, [others, loadProfiles]);

  if (others.length === 0) {
    return (
      <div className="text-sm text-slate-500 italic">
        You're the only one here so far. Share the campaign join code to invite players.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {others.map((m) => (
        <button
          key={m.userId}
          onClick={() => setWhisperTarget(m.userId)}
          title={`Whisper @${m.displayName}`}
          className="w-full flex items-center gap-3 px-3 py-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors group"
        >
          <MemberAvatar color={m.color} name={m.displayName} url={avatarPublicUrl(profiles[m.userId]?.avatarPath ?? null)} />
          <div className="min-w-0 flex-1 text-left">
            <div className="text-sm font-medium truncate" style={{ color: m.color }}>
              {m.displayName}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              {m.role === 'gm' ? 'Game Master' : 'Player'}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-slate-600 group-hover:text-sky-300 flex items-center gap-1">
            <MessageCircle size={11} /> Whisper
          </span>
        </button>
      ))}
    </div>
  );
}

function MemberAvatar({ color, name, url }: { color: string; name: string; url: string | null }) {
  const initial = (name || '?').slice(0, 1).toUpperCase();
  return (
    <div
      className="h-9 w-9 rounded-full border overflow-hidden flex items-center justify-center text-sm font-serif shrink-0"
      style={{
        borderColor: color,
        backgroundColor: url ? '#020617' : `color-mix(in srgb, ${color} 22%, transparent)`,
        color,
      }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initial}
    </div>
  );
}

/**
 * Shown on the dashboard when the player doesn't own a character yet.
 * Lists unclaimed party_members so they can pick one in a single click;
 * otherwise points them at the Party page to add one (GM-only insert today).
 */
function NoCharacterCTA({
  party,
  role,
  onClaim,
}: {
  party: import('../party/partyStore').PartyMember[];
  role: 'gm' | 'player' | null;
  onClaim: (id: string) => Promise<void>;
}) {
  const unclaimed = party.filter((p) => p.owner_user_id === null);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="text-sm text-slate-300">
        You haven't claimed a character in this campaign yet.
      </div>
      {unclaimed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Unclaimed characters</div>
          <div className="space-y-1">
            {unclaimed.map((p) => (
              <button
                key={p.id}
                onClick={() => onClaim(p.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 group"
              >
                <span className="flex items-center gap-2">
                  <UserPlus size={13} className="text-slate-500 group-hover:text-emerald-400" />
                  <span className="font-serif">{p.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {p.classSummary} {p.race && `· ${p.race}`}
                  </span>
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 group-hover:text-emerald-400">
                  Claim
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <Link
        to="/party"
        className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
      >
        {role === 'gm' ? 'Add or manage characters on the Party page' : 'See all characters on the Party page'} →
      </Link>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => Promise<void> }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5 flex-wrap">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className="h-7 w-7 rounded-full border border-slate-700 hover:scale-110 transition-transform"
            style={{
              backgroundColor: c,
              boxShadow: c === value ? '0 0 0 2px var(--ac-400)' : undefined,
            }}
            title={c}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-400 ml-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-10 bg-transparent border border-slate-700 rounded cursor-pointer"
        />
        Custom
      </label>
    </div>
  );
}
