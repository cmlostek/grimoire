import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, Eye, EyeOff, User, Crown, Skull, Shield, Swords,
  BookOpen, Coins, Sparkles, Search, Save, Share2, Lock, Users,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useSession } from '../session/sessionStore';
import { useNpcStore, STATUS_COLORS, FACTION_COLORS, type NPC, type NPCStatus, type NpcStatBlock } from './npcStore';
import { NpcSharePopover } from './NpcSharePopover';

const NPC_ICONS = {
  user:     User,
  crown:    Crown,
  skull:    Skull,
  shield:   Shield,
  swords:   Swords,
  book:     BookOpen,
  coins:    Coins,
  sparkles: Sparkles,
} as const;
type NpcIconKey = keyof typeof NPC_ICONS;

const STATUS_LABELS: Record<NPCStatus, string> = {
  alive: 'Alive', dead: 'Dead', captured: 'Captured', unknown: 'Unknown', missing: 'Missing',
};

export default function NPCs() {
  const campaignId = useSession((s) => s.campaignId);
  const role       = useSession((s) => s.role);
  const isGM       = role === 'gm' || role === 'cogm';

  const { npcs, activeNpcId, loaded, loadForCampaign, subscribe, clear, create, update, remove, setActive } = useNpcStore();

  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    const unsub = subscribe(campaignId);
    return () => { unsub(); clear(); };
  }, [campaignId]);

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<NPCStatus | 'all'>('all');

  const visible = npcs.filter((n) => {
    if (statusFilter !== 'all' && n.status !== statusFilter) return false;
    if (search && !n.name.toLowerCase().includes(search.toLowerCase()) &&
        !n.faction.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeNpc = npcs.find((n) => n.id === activeNpcId) ?? null;

  const handleCreate = async () => {
    if (!campaignId || !isGM) return;
    await create(campaignId, {});
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="NPCs">
        {isGM && (
          <button onClick={handleCreate} className="ac-btn px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1">
            <Plus size={14} /> Add NPC
          </button>
        )}
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        {/* Sidebar list */}
        <aside className={`${activeNpc ? 'hidden md:flex' : 'flex'} w-full md:w-64 shrink-0 border-r border-slate-800 flex-col`}>
          <div className="p-2 border-b border-slate-800">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Status filter pills */}
          <div className="px-2 py-1.5 border-b border-slate-800 flex flex-wrap gap-1">
            {(['all', 'alive', 'dead', 'captured', 'unknown', 'missing'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-[10px] px-2 py-0.5 rounded-full capitalize transition-colors ${
                  statusFilter === s ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {!loaded && <p className="p-4 text-xs text-slate-500">Loading…</p>}
            {loaded && visible.length === 0 && (
              <p className="p-4 text-xs text-slate-600 italic">
                {isGM ? 'No NPCs yet — click "Add NPC" to start.' : 'No NPCs have been revealed yet.'}
              </p>
            )}
            {visible.map((npc) => (
              <NpcListItem
                key={npc.id}
                npc={npc}
                isActive={npc.id === activeNpcId}
                isGM={isGM}
                onClick={() => setActive(npc.id === activeNpcId ? null : npc.id)}
              />
            ))}
          </div>

          {isGM && (
            <div className="border-t border-slate-800 px-3 py-2 text-[10px] text-slate-600">
              {npcs.filter((n) => n.visibleToPlayers).length}/{npcs.length} revealed to players
            </div>
          )}
        </aside>

        {/* Detail panel */}
        <main className={`${activeNpc ? 'flex' : 'hidden md:flex'} flex-col flex-1 overflow-y-auto`}>
          {activeNpc && (
            <button
              onClick={() => setActive(null)}
              className="md:hidden flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 border-b border-slate-800"
            >
              ← Back to list
            </button>
          )}
          {!activeNpc ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-slate-600 italic">Select an NPC to view details.</p>
            </div>
          ) : (
            <NpcDetail
              npc={activeNpc}
              isGM={isGM}
              onUpdate={(patch) => update(activeNpc.id, patch)}
              onDelete={() => remove(activeNpc.id)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ─── List item ─────────────────────────────────────────────────────────── */

function NpcListItem({
  npc, isActive, isGM, onClick,
}: { npc: NPC; isActive: boolean; isGM: boolean; onClick: () => void }) {
  const Icon = NPC_ICONS[(npc.icon as NpcIconKey)] ?? User;
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors border-l-2 ${
        isActive ? 'bg-slate-800 border-l-[color:var(--ac-400)]' : 'border-transparent hover:bg-slate-900'
      } ${isGM && !npc.visibleToPlayers ? 'opacity-60' : ''}`}
    >
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5"
        style={{ background: npc.factionColor + '28', color: npc.factionColor }}
      >
        <Icon size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm truncate ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>{npc.name}</span>
          <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[npc.status] }} />
          {isGM && (
            npc.visibleToPlayers
              ? <Eye size={10} className="text-emerald-400 shrink-0" />
              : <EyeOff size={10} className="text-slate-600 shrink-0" />
          )}
        </div>
        {(npc.faction || npc.location) && (
          <div className="text-[10px] text-slate-500 truncate">
            {[npc.faction, npc.location].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </button>
  );
}

/* ─── Detail panel ──────────────────────────────────────────────────────── */

function NpcDetail({
  npc, isGM, onUpdate, onDelete,
}: { npc: NPC; isGM: boolean; onUpdate: (patch: Partial<NPC>) => void; onDelete: () => void }) {
  const [local, setLocal] = useState(npc);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const npcPerms = useNpcStore((s) => s.permissions[npc.id]);
  const shareSummary = useMemo(() => {
    const sharedCount = (npcPerms ?? []).filter((p) => p.can_view).length;
    if (npc.visibleToPlayers) return { label: 'Party', icon: 'party' as const };
    if (sharedCount > 0) return { label: `${sharedCount} shared`, icon: 'shared' as const };
    return { label: 'GM only', icon: 'gm' as const };
  }, [npcPerms, npc.visibleToPlayers]);

  // Keep latest dirty + local in refs so we can flush on NPC switch / unmount
  // without re-running the reset effect on every keystroke.
  const dirtyRef = useRef(dirty);
  const localRef = useRef(local);
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { localRef.current = local; }, [local]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  const flush = () => {
    if (!dirtyRef.current) return;
    const { id: _id, campaignId: _c, ...rest } = localRef.current;
    onUpdateRef.current(rest);
    setDirty(false);
    dirtyRef.current = false;
  };

  // Debounced auto-save: any time the user edits, persist 600ms after they
  // stop. Guarantees writes go out even if unmount cleanup misses them.
  useEffect(() => {
    if (!dirty) return;
    const handle = setTimeout(() => { flush(); }, 600);
    return () => clearTimeout(handle);
  }, [local, dirty]);

  // When switching NPCs or leaving the tab, persist any pending edits before
  // the component tears down.
  useEffect(() => {
    return () => { flush(); };
  }, [npc.id]);

  useEffect(() => { setLocal(npc); setDirty(false); }, [npc.id]);

  // Warn on tab/window close if there are unsaved edits.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const applyLocal = (patch: Partial<NPC>) => {
    setLocal((p) => ({ ...p, ...patch }));
    setDirty(true);
  };

  const save = (patch: Partial<NPC>) => {
    setLocal((p) => ({ ...p, ...patch }));
    setDirty(false);
    onUpdate(patch);
  };

  const saveAll = async () => {
    setSaving(true);
    const { id: _id, campaignId: _c, ...rest } = local;
    await onUpdate(rest);
    setDirty(false);
    setSaving(false);
  };

  const Icon = NPC_ICONS[(local.icon as NpcIconKey)] ?? User;
  const statusColor = STATUS_COLORS[local.status];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header row */}
      <div className="flex items-start gap-4">
        {/* Icon + picker */}
        <div className="space-y-2 shrink-0">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: local.factionColor + '28', color: local.factionColor }}
          >
            <Icon size={22} />
          </div>
          {isGM && (
            <div className="flex flex-wrap gap-1 w-14">
              {(Object.entries(NPC_ICONS) as [NpcIconKey, typeof User][]).map(([key, Ico]) => (
                <button
                  key={key}
                  onClick={() => save({ icon: key })}
                  className={`w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 transition-colors ${
                    local.icon === key ? 'bg-slate-700 text-slate-100' : 'hover:bg-slate-800'
                  }`}
                  title={key}
                >
                  <Ico size={12} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          {isGM ? (
            <input
              value={local.name}
              onChange={(e) => applyLocal({ name: e.target.value })}
              className="font-serif text-2xl w-full bg-transparent outline-none focus:bg-slate-800/40 rounded px-1 -mx-1 text-slate-100"
              placeholder="NPC Name"
            />
          ) : (
            <h1 className="font-serif text-2xl text-slate-100">{npc.name}</h1>
          )}

          {isGM ? (
            <select
              value={local.status}
              onChange={(e) => save({ status: e.target.value as NPCStatus })}
              className="mt-1.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
              style={{ color: statusColor }}
            >
              {(Object.keys(STATUS_LABELS) as NPCStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          ) : (
            <div className="mt-1 flex items-center gap-1.5 text-sm">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
              <span style={{ color: statusColor }}>{STATUS_LABELS[npc.status]}</span>
            </div>
          )}
        </div>

        {/* GM controls */}
        {isGM && (
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <button
              onClick={saveAll}
              disabled={!dirty || saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                dirty
                  ? 'bg-amber-700 hover:bg-amber-600 text-white'
                  : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-default'
              } disabled:opacity-60`}
              title={dirty ? 'Save changes' : 'No unsaved changes'}
            >
              <Save size={12} /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </button>
            <div className="relative">
              <button
                onClick={() => setShareOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  shareSummary.icon === 'party'
                    ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
                    : shareSummary.icon === 'shared'
                      ? 'bg-sky-900/30 border-sky-700/40 text-sky-300'
                      : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}
                title="Manage who can see this NPC"
              >
                {shareSummary.icon === 'gm'
                  ? <Lock size={12} />
                  : shareSummary.icon === 'party'
                    ? <Users size={12} />
                    : <Share2 size={12} />}
                {shareSummary.label}
              </button>
              {shareOpen && (
                <NpcSharePopover
                  npc={npc}
                  onClose={() => setShareOpen(false)}
                  onStatBlockVisibilityChange={(v) => save({ statBlockVisible: v })}
                />
              )}
            </div>
            <button
              onClick={() => { if (confirm(`Delete "${npc.name}"?`)) onDelete(); }}
              className="text-slate-600 hover:text-rose-400 p-1.5 rounded hover:bg-slate-800 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Faction + Location */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Faction</div>
          {isGM ? (
            <div className="space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                {FACTION_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => applyLocal({ factionColor: color })}
                    className="w-5 h-5 rounded-full transition-all"
                    style={{
                      backgroundColor: color,
                      boxShadow: local.factionColor === color ? `0 0 0 2px #0f172a, 0 0 0 3.5px ${color}` : 'none',
                    }}
                  />
                ))}
              </div>
              <input
                value={local.faction}
                onChange={(e) => applyLocal({ faction: e.target.value })}
                placeholder="Faction name"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
              />
            </div>
          ) : (
            <div className="text-sm flex items-center gap-2">
              {npc.faction ? (
                <><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: npc.factionColor }} />{npc.faction}</>
              ) : (
                <span className="text-slate-600 italic">Unknown</span>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Location</div>
          {isGM ? (
            <input
              value={local.location}
              onChange={(e) => applyLocal({ location: e.target.value })}
              placeholder="Current location"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
          ) : (
            <div className="text-sm">
              {npc.location || <span className="text-slate-600 italic">Unknown</span>}
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="text-xs uppercase tracking-wider text-slate-500 mb-1.5">Notes</div>
        {isGM ? (
          <textarea
            value={local.notes}
            onChange={(e) => applyLocal({ notes: e.target.value })}
            placeholder="Background, motivations, secrets, current plans…"
            rows={10}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm resize-none leading-relaxed"
          />
        ) : (
          <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
            {npc.notes || <span className="text-slate-600 italic">No notes.</span>}
          </div>
        )}
      </div>

      {/* Stat block */}
      <StatBlockSection
        statBlock={local.statBlock}
        visible={local.statBlockVisible}
        isGM={isGM}
        showToPlayers={local.statBlockVisible}
        onStatBlockChange={(sb) => applyLocal({ statBlock: sb })}
      />

      {/* GM-only hint */}
      {isGM && shareSummary.icon === 'gm' && (
        <div className="flex items-center gap-2 text-xs text-slate-600 border border-slate-800 rounded-lg p-3">
          <EyeOff size={12} className="shrink-0" />
          This NPC is hidden from players. Use the <strong className="text-slate-500">Share</strong> button above to reveal them.
        </div>
      )}
    </div>
  );
}

/* ─── Stat block section ────────────────────────────────────────────────── */

/**
 * Renders a 5e-style stat block. GM gets an editable form; players see a
 * read-only formatted card. If the GM hasn't toggled stat_block_visible,
 * players don't see this section at all.
 */
function StatBlockSection({
  statBlock,
  visible,
  isGM,
  showToPlayers,
  onStatBlockChange,
}: {
  statBlock: NpcStatBlock;
  visible: boolean;
  isGM: boolean;
  showToPlayers: boolean;
  onStatBlockChange: (sb: NpcStatBlock) => void;
}) {
  // Players see nothing if the GM hasn't revealed the stat block.
  if (!isGM && !showToPlayers) return null;

  const local = statBlock;
  const setField = <K extends keyof NpcStatBlock>(k: K, v: NpcStatBlock[K]) => {
    onStatBlockChange({ ...local, [k]: v });
  };

  if (!isGM) {
    // Player read-only view
    return <StatBlockDisplay statBlock={statBlock} />;
  }

  // GM editor
  return (
    <div className="border border-slate-800 rounded-lg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <div className="text-xs uppercase tracking-wider text-slate-500">Stat block</div>
        <span
          className={`flex items-center gap-1.5 px-2 py-1 text-[11px] rounded border ${
            visible
              ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}
          title="Toggle visibility from the Share menu in the header"
        >
          {visible ? <Eye size={11} /> : <EyeOff size={11} />}
          {visible ? 'Visible' : 'Hidden'}
        </span>
      </div>

      <div className="p-4 space-y-3 text-sm">
        <FormRow label="Creature type">
          <input
            value={local.creatureType ?? ''}
            onChange={(e) => setField('creatureType', e.target.value)}

            placeholder="Medium humanoid (elf), neutral good"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
          />
        </FormRow>

        <div className="grid grid-cols-4 gap-2">
          <FormRow label="AC">
            <input
              type="number"
              value={local.ac ?? ''}
              onChange={(e) => setField('ac', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}

              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
          <FormRow label="HP">
            <input
              type="number"
              value={local.hpCurrent ?? ''}
              onChange={(e) => setField('hpCurrent', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}

              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
          <FormRow label="Max HP">
            <input
              type="number"
              value={local.hpMax ?? ''}
              onChange={(e) => setField('hpMax', e.target.value === '' ? undefined : parseInt(e.target.value, 10))}

              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
          <FormRow label="CR">
            <input
              value={local.cr ?? ''}
              onChange={(e) => setField('cr', e.target.value || undefined)}

              placeholder="1/4"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FormRow label="Hit dice">
            <input
              value={local.hitDice ?? ''}
              onChange={(e) => setField('hitDice', e.target.value || undefined)}

              placeholder="3d8 + 3"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
          <FormRow label="Speed">
            <input
              value={local.speed ?? ''}
              onChange={(e) => setField('speed', e.target.value || undefined)}

              placeholder="30 ft., fly 60 ft."
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Ability scores</div>
          <div className="grid grid-cols-6 gap-2">
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
              <div key={a}>
                <div className="text-[10px] uppercase text-center text-slate-500">{a}</div>
                <input
                  type="number"
                  value={local[a] ?? ''}
                  onChange={(e) => setField(a, e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
    
                  className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-1 text-center"
                  placeholder="10"
                />
              </div>
            ))}
          </div>
        </div>

        <FormRow label="Skills">
          <input
            value={local.skills ?? ''}
            onChange={(e) => setField('skills', e.target.value || undefined)}

            placeholder="Perception +5, Stealth +6"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
          />
        </FormRow>

        <FormRow label="Senses">
          <input
            value={local.senses ?? ''}
            onChange={(e) => setField('senses', e.target.value || undefined)}

            placeholder="Darkvision 60 ft., passive Perception 15"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
          />
        </FormRow>

        <FormRow label="Languages">
          <input
            value={local.languages ?? ''}
            onChange={(e) => setField('languages', e.target.value || undefined)}

            placeholder="Common, Elvish"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
          />
        </FormRow>

        <div className="grid grid-cols-3 gap-2">
          <FormRow label="Damage resistances">
            <input
              value={local.damageResistances ?? ''}
              onChange={(e) => setField('damageResistances', e.target.value || undefined)}

              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
          <FormRow label="Damage immunities">
            <input
              value={local.damageImmunities ?? ''}
              onChange={(e) => setField('damageImmunities', e.target.value || undefined)}

              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
          <FormRow label="Condition immunities">
            <input
              value={local.conditionImmunities ?? ''}
              onChange={(e) => setField('conditionImmunities', e.target.value || undefined)}

              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1"
            />
          </FormRow>
        </div>

        <FormRow label="Traits">
          <textarea
            value={local.traits ?? ''}
            onChange={(e) => setField('traits', e.target.value || undefined)}

            placeholder="Pack Tactics. The NPC has advantage on attack rolls…"
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm resize-none leading-relaxed"
          />
        </FormRow>

        <FormRow label="Actions">
          <textarea
            value={local.actions ?? ''}
            onChange={(e) => setField('actions', e.target.value || undefined)}

            placeholder="Longsword. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage."
            rows={4}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm resize-none leading-relaxed"
          />
        </FormRow>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

/**
 * Read-only player view of an NPC stat block. Empty fields are skipped so
 * the card stays compact.
 */
function StatBlockDisplay({ statBlock: sb }: { statBlock: NpcStatBlock }) {
  const abilityMod = (n: number | undefined) => {
    if (n === undefined) return '';
    const m = Math.floor((n - 10) / 2);
    return `${n} (${m >= 0 ? '+' : ''}${m})`;
  };
  const hasAbilities = sb.str || sb.dex || sb.con || sb.int || sb.wis || sb.cha;
  return (
    <div className="border border-slate-800 rounded-lg p-4 space-y-2 text-sm bg-slate-900/40">
      {sb.creatureType && <div className="italic text-slate-400">{sb.creatureType}</div>}
      <div className="border-t border-slate-800 pt-2 space-y-1 text-slate-300">
        {sb.ac !== undefined && <div><span className="font-semibold text-slate-200">Armor Class</span> {sb.ac}</div>}
        {(sb.hpMax !== undefined || sb.hpCurrent !== undefined || sb.hitDice) && (
          <div>
            <span className="font-semibold text-slate-200">Hit Points</span>{' '}
            {sb.hpCurrent !== undefined ? sb.hpCurrent : sb.hpMax ?? ''}
            {sb.hpMax !== undefined && sb.hpCurrent !== undefined && sb.hpCurrent !== sb.hpMax ? ` / ${sb.hpMax}` : ''}
            {sb.hitDice ? ` (${sb.hitDice})` : ''}
          </div>
        )}
        {sb.speed && <div><span className="font-semibold text-slate-200">Speed</span> {sb.speed}</div>}
      </div>
      {hasAbilities && (
        <div className="border-t border-slate-800 pt-2 grid grid-cols-6 gap-2 text-center text-xs">
          {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
            <div key={a}>
              <div className="text-[10px] uppercase text-slate-500">{a}</div>
              <div className="text-slate-200">{abilityMod(sb[a])}</div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-slate-800 pt-2 space-y-1 text-slate-300 text-[13px]">
        {sb.skills && <div><span className="font-semibold text-slate-200">Skills</span> {sb.skills}</div>}
        {sb.damageResistances && <div><span className="font-semibold text-slate-200">Damage Resistances</span> {sb.damageResistances}</div>}
        {sb.damageImmunities && <div><span className="font-semibold text-slate-200">Damage Immunities</span> {sb.damageImmunities}</div>}
        {sb.conditionImmunities && <div><span className="font-semibold text-slate-200">Condition Immunities</span> {sb.conditionImmunities}</div>}
        {sb.senses && <div><span className="font-semibold text-slate-200">Senses</span> {sb.senses}</div>}
        {sb.languages && <div><span className="font-semibold text-slate-200">Languages</span> {sb.languages}</div>}
        {sb.cr && <div><span className="font-semibold text-slate-200">Challenge</span> {sb.cr}</div>}
      </div>
      {sb.traits && (
        <div className="border-t border-slate-800 pt-2 whitespace-pre-wrap text-slate-300 text-[13px] leading-relaxed">
          {sb.traits}
        </div>
      )}
      {sb.actions && (
        <div className="pt-1">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Actions</div>
          <div className="whitespace-pre-wrap text-slate-300 text-[13px] leading-relaxed">{sb.actions}</div>
        </div>
      )}
    </div>
  );
}
