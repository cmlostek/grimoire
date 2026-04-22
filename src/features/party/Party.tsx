import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useParty, type PartyMember } from './partyStore';
import { useSession } from '../session/sessionStore';
import { parseDdb, parseGenericJson, isLikelyDdb, isDdbWrapper } from './ddb';
import { modifier } from '../../data/srd';
import {
  Plus, Trash2, UserPlus, FileJson, ExternalLink, X, Shield, Heart,
  Eye, Search, Brain, UserCheck, User as UserIcon, Save,
} from 'lucide-react';

type AddMode = null | 'manual' | 'json';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

const blankMember = (): Omit<PartyMember, 'id' | 'owner_user_id'> => ({
  name: 'New Character',
  race: 'Human',
  classSummary: 'Fighter 1',
  level: 1,
  ac: 15,
  hp: 10,
  maxHp: 10,
  tempHp: 0,
  speed: '30 ft.',
  initiativeBonus: 0,
  passivePerception: 10,
  passiveInvestigation: 10,
  passiveInsight: 10,
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  saves: '',
  skills: '',
  languages: 'Common',
  source: 'manual',
});

export default function Party() {
  const campaignId = useSession((s) => s.campaignId);
  const userId = useSession((s) => s.userId);
  const role = useSession((s) => s.role);
  const isGM = role === 'gm';

  const party = useParty((s) => s.party);
  const loadForCampaign = useParty((s) => s.loadForCampaign);
  const subscribe = useParty((s) => s.subscribe);
  const addPartyMember = useParty((s) => s.addPartyMember);
  const updatePartyMember = useParty((s) => s.updatePartyMember);
  const removePartyMember = useParty((s) => s.removePartyMember);
  const claim = useParty((s) => s.claim);
  const unclaim = useParty((s) => s.unclaim);

  const [addMode, setAddMode] = useState<AddMode>(null);

  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    const unsub = subscribe(campaignId);
    return unsub;
  }, [campaignId, loadForCampaign, subscribe]);

  const canEdit = (m: PartyMember) => isGM || m.owner_user_id === userId;

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Party">
        {isGM && (
          <>
            <button
              onClick={() => setAddMode('json')}
              className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
            >
              <FileJson size={14} /> Import JSON
            </button>
            <button
              onClick={() => {
                if (campaignId) addPartyMember(campaignId, blankMember());
              }}
              className="px-3 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold rounded flex items-center gap-1"
            >
              <UserPlus size={14} /> Add manual
            </button>
          </>
        )}
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {party.length === 0 && (
          <div className="text-center max-w-xl mx-auto mt-12">
            <div className="font-serif text-2xl text-sky-200 mb-2">No party yet</div>
            <div className="text-sm text-slate-400 leading-relaxed">
              {isGM
                ? 'Add a character manually, or paste JSON exported from D&D Beyond or the generic schema. The party shows at-a-glance stats you\'ll want during play: AC, HP, passives, and initiative.'
                : 'Your GM hasn\'t added any characters yet.'}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {party.map((m) => (
            <CharCard
              key={m.id}
              m={m}
              userId={userId}
              isGM={isGM}
              editable={canEdit(m)}
              onUpdate={(p) => updatePartyMember(m.id, p) as Promise<void>}
              onRemove={() => removePartyMember(m.id)}
              onClaim={() => claim(m.id)}
              onUnclaim={() => unclaim(m.id)}
            />
          ))}
        </div>
      </div>

      {isGM && addMode === 'json' && (
        <JsonImportModal
          onClose={() => setAddMode(null)}
          onImport={(p) => {
            if (campaignId) addPartyMember(campaignId, p);
            setAddMode(null);
          }}
        />
      )}
    </div>
  );
}

function CharCard({
  m,
  userId,
  isGM,
  editable,
  onUpdate,
  onRemove,
  onClaim,
  onUnclaim,
}: {
  m: PartyMember;
  userId: string | null;
  isGM: boolean;
  editable: boolean;
  onUpdate: (p: Partial<PartyMember>) => Promise<void>;
  onRemove: () => void;
  onClaim: () => void;
  onUnclaim: () => void;
}) {
  const [draft, setDraft] = useState<PartyMember>(m);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Sync from server when not being locally edited
  useEffect(() => {
    if (!dirty) setDraft(m);
  }, [m]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (p: Partial<PartyMember>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { id: _id, owner_user_id: _o, ...rest } = draft;
      await onUpdate(rest);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const hpPct = draft.maxHp > 0 ? (draft.hp / draft.maxHp) * 100 : 0;
  const ownedByMe = m.owner_user_id === userId && userId !== null;
  const owned = m.owner_user_id !== null;

  return (
    <div className={`bg-slate-900 border rounded-lg p-4 flex flex-col gap-3 transition-colors ${dirty ? 'border-amber-700/50' : 'border-slate-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={draft.name}
            onChange={(e) => apply({ name: e.target.value })}
            readOnly={!editable}
            className="w-full bg-transparent font-serif text-xl text-sky-200 outline-none truncate"
          />
          <input
            value={draft.classSummary}
            onChange={(e) => apply({ classSummary: e.target.value })}
            readOnly={!editable}
            className="w-full bg-transparent text-xs text-slate-400 outline-none truncate"
          />
          <input
            value={draft.race}
            onChange={(e) => apply({ race: e.target.value })}
            readOnly={!editable}
            className="w-full bg-transparent text-[11px] text-slate-500 outline-none truncate"
          />
        </div>
        <div className="flex gap-1 items-start shrink-0">
          {editable && dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="px-2 py-1 text-[11px] bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded flex items-center gap-1"
            >
              <Save size={11} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          {draft.ddbUrl && (
            <a
              href={draft.ddbUrl}
              target="_blank"
              rel="noreferrer"
              title="Open on D&D Beyond"
              className="p-1.5 text-slate-500 hover:text-sky-300 rounded"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {isGM && (confirming ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onRemove}
                className="px-2 py-1 text-[11px] bg-rose-700 hover:bg-rose-600 text-white rounded"
              >
                Delete
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
              title={`Remove ${m.name}`}
              className="p-1.5 text-slate-500 hover:text-rose-400 rounded"
            >
              <Trash2 size={14} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] -mt-1">
        {ownedByMe ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <UserCheck size={11} /> Yours
          </span>
        ) : owned ? (
          <span className="flex items-center gap-1 text-slate-500">
            <UserIcon size={11} /> Claimed
          </span>
        ) : (
          <span className="flex items-center gap-1 text-slate-600 italic">
            Unclaimed
          </span>
        )}
        {!isGM && !owned && (
          <button
            onClick={onClaim}
            className="px-2 py-0.5 text-[10px] bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold rounded"
          >
            Claim
          </button>
        )}
        {ownedByMe && !isGM && (
          <button
            onClick={onUnclaim}
            className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 rounded"
          >
            Release
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={<Shield size={12} />} label="AC" value={draft.ac} onChange={(v) => apply({ ac: v })} readOnly={!editable} />
        <Stat icon={null} label="Init" value={draft.initiativeBonus} onChange={(v) => apply({ initiativeBonus: v })} signed readOnly={!editable} />
        <Stat icon={null} label="Lvl" value={draft.level} onChange={(v) => apply({ level: v })} readOnly={!editable} />
      </div>

      <div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
          <Heart size={12} className="text-rose-400" /> HP
          <input
            type="number"
            value={draft.hp}
            onChange={(e) => apply({ hp: Math.max(0, parseInt(e.target.value) || 0) })}
            readOnly={!editable}
            className="w-14 bg-slate-800 rounded px-1 text-right font-mono"
          />
          <span className="text-slate-500">/</span>
          <input
            type="number"
            value={draft.maxHp}
            onChange={(e) => apply({ maxHp: Math.max(0, parseInt(e.target.value) || 0) })}
            readOnly={!editable}
            className="w-14 bg-slate-800 rounded px-1 font-mono"
          />
          {draft.tempHp > 0 && (
            <span className="ml-1 text-sky-300">
              +
              <input
                type="number"
                value={draft.tempHp}
                onChange={(e) => apply({ tempHp: Math.max(0, parseInt(e.target.value) || 0) })}
                readOnly={!editable}
                className="w-10 bg-slate-800 rounded px-1 text-right font-mono"
              />
            </span>
          )}
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              hpPct > 50 ? 'bg-emerald-600' : hpPct > 25 ? 'bg-sky-500' : 'bg-rose-600'
            }`}
            style={{ width: `${Math.min(100, hpPct)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <Passive icon={<Eye size={11} />} label="Perception" value={draft.passivePerception} onChange={(v) => apply({ passivePerception: v })} readOnly={!editable} />
        <Passive icon={<Search size={11} />} label="Investigation" value={draft.passiveInvestigation} onChange={(v) => apply({ passiveInvestigation: v })} readOnly={!editable} />
        <Passive icon={<Brain size={11} />} label="Insight" value={draft.passiveInsight} onChange={(v) => apply({ passiveInsight: v })} readOnly={!editable} />
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[11px] text-slate-500 hover:text-slate-300 text-left"
      >
        {expanded ? '− Hide details' : '+ More'}
      </button>

      {expanded && (
        <div className="text-xs space-y-2 pt-2 border-t border-slate-800">
          <div className="grid grid-cols-6 gap-1">
            {ABILITIES.map((a) => (
              <div key={a} className="bg-slate-950 rounded p-1">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 text-center">{a}</div>
                <input
                  type="number"
                  value={draft[a]}
                  onChange={(e) => apply({ [a]: parseInt(e.target.value) || 0 } as Partial<PartyMember>)}
                  readOnly={!editable}
                  className="w-full bg-transparent text-center font-mono outline-none"
                />
                <div className="text-center text-[10px] text-sky-300">{modifier(draft[a])}</div>
              </div>
            ))}
          </div>
          <Detail label="Speed" value={draft.speed} onChange={(v) => apply({ speed: v })} readOnly={!editable} />
          <Detail label="Saves" value={draft.saves} onChange={(v) => apply({ saves: v })} readOnly={!editable} />
          <Detail label="Skills" value={draft.skills} onChange={(v) => apply({ skills: v })} readOnly={!editable} />
          <Detail label="Languages" value={draft.languages} onChange={(v) => apply({ languages: v })} readOnly={!editable} />
          {draft.player !== undefined && <Detail label="Player" value={draft.player ?? ''} onChange={(v) => apply({ player: v })} readOnly={!editable} />}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Notes</div>
            <textarea
              value={draft.notes ?? ''}
              onChange={(e) => apply({ notes: e.target.value })}
              readOnly={!editable}
              rows={2}
              className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 resize-none"
            />
          </div>
          <input
            value={draft.ddbUrl ?? ''}
            onChange={(e) => apply({ ddbUrl: e.target.value })}
            readOnly={!editable}
            placeholder="D&D Beyond URL (optional)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
          />
          {editable && dirty && (
            <button
              onClick={save}
              disabled={saving}
              className="w-full py-1.5 text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold rounded flex items-center justify-center gap-1.5"
            >
              <Save size={12} />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon, label, value, onChange, signed, readOnly,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  signed?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-md py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1">
        {icon}
        {label}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        readOnly={readOnly}
        className="w-full bg-transparent text-center font-serif text-xl text-sky-200 outline-none"
      />
      {signed && (
        <div className="text-[10px] text-slate-500 -mt-1">
          {value >= 0 ? '+' : ''}
          {value}
        </div>
      )}
    </div>
  );
}

function Passive({
  icon, label, value, onChange, readOnly,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-md py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1">
        {icon}
        {label}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        readOnly={readOnly}
        className="w-full bg-transparent text-center font-mono text-sm text-slate-200 outline-none"
      />
    </div>
  );
}

function Detail({
  label, value, onChange, readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
      />
    </div>
  );
}

function JsonImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (p: Omit<PartyMember, 'id' | 'owner_user_id'>) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<'ddb' | 'generic' | null>(null);

  const tryParse = (raw: string) => {
    setError(null);
    setDetected(null);
    if (!raw.trim()) return;
    try {
      const j = JSON.parse(raw);
      if (isLikelyDdb(j) || isDdbWrapper(j)) setDetected('ddb');
      else setDetected('generic');
    } catch (e) {
      setError('Invalid JSON.');
    }
  };

  const submit = () => {
    setError(null);
    try {
      const j = JSON.parse(text);
      const member =
        isLikelyDdb(j) || isDdbWrapper(j) ? parseDdb(j) : parseGenericJson(j);
      onImport(member);
    } catch (e: any) {
      setError(e?.message || 'Failed to parse.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-950 border border-slate-800 rounded-lg w-full max-w-2xl flex flex-col max-h-[85vh]"
      >
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <div className="font-serif text-xl text-sky-200">Import character JSON</div>
            <div className="text-xs text-slate-400 mt-1 leading-relaxed">
              Paste a D&amp;D Beyond character JSON (from{' '}
              <code className="text-sky-300">character-service.dndbeyond.com/character/v5/character/&lt;id&gt;</code>)
              or a simple generic format with fields like <code className="text-sky-300">name, ac, hp, maxHp, str, dex, ...</code>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 p-4 min-h-0 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              tryParse(e.target.value);
            }}
            placeholder='{ "name": "Alice", "race": "Half-elf", "class": "Bard 5", ... }'
            className="flex-1 min-h-[200px] w-full bg-slate-900 border border-slate-800 rounded p-3 text-xs font-mono resize-none"
          />
          <div className="flex items-center justify-between text-xs">
            <div>
              {detected === 'ddb' && (
                <span className="text-emerald-400">Detected D&D Beyond schema.</span>
              )}
              {detected === 'generic' && <span className="text-sky-300">Detected generic JSON.</span>}
              {error && <span className="text-rose-400">{error}</span>}
            </div>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="px-4 py-2 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-semibold rounded flex items-center gap-1"
            >
              <Plus size={14} /> Add to party
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
