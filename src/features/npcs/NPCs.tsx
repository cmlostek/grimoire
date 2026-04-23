import { useEffect, useState } from 'react';
import {
  Plus, Trash2, Eye, EyeOff, User, Crown, Skull, Shield, Swords,
  BookOpen, Coins, Sparkles, Search,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useSession } from '../session/sessionStore';
import { useNpcStore, STATUS_COLORS, FACTION_COLORS, type NPC, type NPCStatus } from './npcStore';

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
  const isGM       = role === 'gm';

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
        <aside className="w-64 shrink-0 border-r border-slate-800 flex flex-col">
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
        <main className="flex-1 overflow-y-auto">
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
  useEffect(() => setLocal(npc), [npc.id]);

  const save = (patch: Partial<NPC>) => {
    setLocal((p) => ({ ...p, ...patch }));
    onUpdate(patch);
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
              onChange={(e) => setLocal((p) => ({ ...p, name: e.target.value }))}
              onBlur={() => onUpdate({ name: local.name })}
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
              onClick={() => save({ visibleToPlayers: !npc.visibleToPlayers })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                npc.visibleToPlayers
                  ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
              title={npc.visibleToPlayers ? 'Visible to players — click to hide' : 'GM only — click to reveal to players'}
            >
              {npc.visibleToPlayers ? <Eye size={12} /> : <EyeOff size={12} />}
              {npc.visibleToPlayers ? 'Revealed' : 'GM only'}
            </button>
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
                    onClick={() => save({ factionColor: color })}
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
                onChange={(e) => setLocal((p) => ({ ...p, faction: e.target.value }))}
                onBlur={() => onUpdate({ faction: local.faction })}
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
              onChange={(e) => setLocal((p) => ({ ...p, location: e.target.value }))}
              onBlur={() => onUpdate({ location: local.location })}
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
            onChange={(e) => setLocal((p) => ({ ...p, notes: e.target.value }))}
            onBlur={() => onUpdate({ notes: local.notes })}
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

      {/* GM-only hint */}
      {isGM && !npc.visibleToPlayers && (
        <div className="flex items-center gap-2 text-xs text-slate-600 border border-slate-800 rounded-lg p-3">
          <EyeOff size={12} className="shrink-0" />
          This NPC is hidden from players. Click <strong className="text-slate-500">"GM only"</strong> above to reveal them.
        </div>
      )}
    </div>
  );
}
