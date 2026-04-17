import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useStore, PartyMember } from '../../store';
import { parseDdb, parseGenericJson, isLikelyDdb, isDdbWrapper } from './ddb';
import { modifier } from '../../data/srd';
import { Plus, Trash2, UserPlus, FileJson, ExternalLink, X, Shield, Heart, Eye, Search, Brain } from 'lucide-react';

type AddMode = null | 'manual' | 'json';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export default function Party() {
  const { party, addPartyMember, updatePartyMember, removePartyMember } = useStore();
  const [addMode, setAddMode] = useState<AddMode>(null);

  const blankMember = (): Omit<PartyMember, 'id'> => ({
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

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Party">
        <button
          onClick={() => setAddMode('json')}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
        >
          <FileJson size={14} /> Import JSON
        </button>
        <button
          onClick={() => {
            addPartyMember(blankMember());
          }}
          className="px-3 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold rounded flex items-center gap-1"
        >
          <UserPlus size={14} /> Add manual
        </button>
      </PageHeader>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {party.length === 0 && (
          <div className="text-center max-w-xl mx-auto mt-12">
            <div className="font-serif text-2xl text-sky-200 mb-2">No party yet</div>
            <div className="text-sm text-slate-400 leading-relaxed">
              Add a character manually, or paste JSON exported from D&amp;D Beyond or the generic
              schema. The party shows at-a-glance stats you'll want during play: AC, HP, passives,
              and initiative.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {party.map((m) => (
            <CharCard key={m.id} m={m} onUpdate={(p) => updatePartyMember(m.id, p)} onRemove={() => removePartyMember(m.id)} />
          ))}
        </div>
      </div>

      {addMode === 'json' && (
        <JsonImportModal
          onClose={() => setAddMode(null)}
          onImport={(p) => {
            addPartyMember(p);
            setAddMode(null);
          }}
        />
      )}
    </div>
  );
}

function CharCard({
  m,
  onUpdate,
  onRemove,
}: {
  m: PartyMember;
  onUpdate: (p: Partial<PartyMember>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hpPct = m.maxHp > 0 ? (m.hp / m.maxHp) * 100 : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={m.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="w-full bg-transparent font-serif text-xl text-sky-200 outline-none truncate"
          />
          <input
            value={m.classSummary}
            onChange={(e) => onUpdate({ classSummary: e.target.value })}
            className="w-full bg-transparent text-xs text-slate-400 outline-none truncate"
          />
          <input
            value={m.race}
            onChange={(e) => onUpdate({ race: e.target.value })}
            className="w-full bg-transparent text-[11px] text-slate-500 outline-none truncate"
          />
        </div>
        <div className="flex gap-1">
          {m.ddbUrl && (
            <a
              href={m.ddbUrl}
              target="_blank"
              rel="noreferrer"
              title="Open on D&D Beyond"
              className="p-1.5 text-slate-500 hover:text-sky-300 rounded"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {confirming ? (
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
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat icon={<Shield size={12} />} label="AC" value={m.ac} onChange={(v) => onUpdate({ ac: v })} />
        <Stat icon={null} label="Init" value={m.initiativeBonus} onChange={(v) => onUpdate({ initiativeBonus: v })} signed />
        <Stat icon={null} label="Lvl" value={m.level} onChange={(v) => onUpdate({ level: v })} />
      </div>

      <div>
        <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1">
          <Heart size={12} className="text-rose-400" /> HP
          <input
            type="number"
            value={m.hp}
            onChange={(e) => onUpdate({ hp: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-14 bg-slate-800 rounded px-1 text-right font-mono"
          />
          <span className="text-slate-500">/</span>
          <input
            type="number"
            value={m.maxHp}
            onChange={(e) => onUpdate({ maxHp: Math.max(0, parseInt(e.target.value) || 0) })}
            className="w-14 bg-slate-800 rounded px-1 font-mono"
          />
          {m.tempHp > 0 && (
            <span className="ml-1 text-sky-300">
              +
              <input
                type="number"
                value={m.tempHp}
                onChange={(e) => onUpdate({ tempHp: Math.max(0, parseInt(e.target.value) || 0) })}
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
        <Passive icon={<Eye size={11} />} label="Perception" value={m.passivePerception} onChange={(v) => onUpdate({ passivePerception: v })} />
        <Passive icon={<Search size={11} />} label="Investigation" value={m.passiveInvestigation} onChange={(v) => onUpdate({ passiveInvestigation: v })} />
        <Passive icon={<Brain size={11} />} label="Insight" value={m.passiveInsight} onChange={(v) => onUpdate({ passiveInsight: v })} />
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
                  value={m[a]}
                  onChange={(e) => onUpdate({ [a]: parseInt(e.target.value) || 0 } as Partial<PartyMember>)}
                  className="w-full bg-transparent text-center font-mono outline-none"
                />
                <div className="text-center text-[10px] text-sky-300">{modifier(m[a])}</div>
              </div>
            ))}
          </div>
          <Detail label="Speed" value={m.speed} onChange={(v) => onUpdate({ speed: v })} />
          <Detail label="Saves" value={m.saves} onChange={(v) => onUpdate({ saves: v })} />
          <Detail label="Skills" value={m.skills} onChange={(v) => onUpdate({ skills: v })} />
          <Detail label="Languages" value={m.languages} onChange={(v) => onUpdate({ languages: v })} />
          {m.player && <Detail label="Player" value={m.player} onChange={(v) => onUpdate({ player: v })} />}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Notes</div>
            <textarea
              value={m.notes ?? ''}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              rows={2}
              className="w-full mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 resize-none"
            />
          </div>
          <input
            value={m.ddbUrl ?? ''}
            onChange={(e) => onUpdate({ ddbUrl: e.target.value })}
            placeholder="D&D Beyond URL (optional)"
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  onChange,
  signed,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  signed?: boolean;
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
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
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
        className="w-full bg-transparent text-center font-mono text-sm text-slate-200 outline-none"
      />
    </div>
  );
}

function Detail({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
  onImport: (p: Omit<PartyMember, 'id'>) => void;
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
