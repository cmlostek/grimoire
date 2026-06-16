import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Check, X, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSession } from '../session/sessionStore';
import { useParty } from '../party/partyStore';
import { CharCard } from '../party/Party';
import ChatPanel from '../chat/ChatPanel';

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

  return (
    <div className="h-full overflow-hidden flex flex-col lg:flex-row">
      {/* ── Profile column ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Avatar color={myColor ?? '#94a3b8'} initial={(displayName ?? '?').slice(0, 1).toUpperCase()} />
          <div className="min-w-0 flex-1">
            <DisplayNameEditor value={displayName ?? ''} onSave={updateMyDisplayName} />
            <div className="text-xs text-slate-500 mt-1">
              <span className={role === 'gm' ? 'text-emerald-400' : 'text-sky-400'}>
                {role === 'gm' ? 'Game Master' : 'Player'}
              </span>
            </div>
          </div>
        </div>

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
              isGM={role === 'gm'}
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

        <Section title="Friends in this campaign">
          <div className="text-sm text-slate-500 italic">
            Coming in Phase 3 — star party members for quick whispers and mentions.
          </div>
        </Section>
      </div>

      {/* ── Embedded chat column / row ─────────────────────────────────── */}
      <div className="lg:w-96 shrink-0 h-[28rem] lg:h-auto border-t lg:border-t-0 lg:border-l border-slate-800 p-3">
        <ChatPanel variant="embedded" />
      </div>
    </div>
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

function Avatar({ color, initial }: { color: string; initial: string }) {
  return (
    <div
      className="h-16 w-16 rounded-full border-2 flex items-center justify-center text-xl font-serif text-slate-100 shrink-0"
      style={{
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`,
        color,
      }}
      title="Avatar (upload coming in Phase 3)"
    >
      {initial}
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
