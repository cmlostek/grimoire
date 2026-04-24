import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Shuffle, RotateCcw, Plus, Trash2, Heart, Shield, Swords, Activity, X } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { QuickDiceButton } from '../dice/QuickDice';
import { useSession } from '../session/sessionStore';
import { useInitiativeStore, CONDITIONS, type Condition, type InitiativeCombatant } from './initiativeStore';

export default function Initiative() {
  const campaignId = useSession((s) => s.campaignId);
  const role = useSession((s) => s.role);
  const isGM = role === 'gm';

  const {
    combatants, round, turnIndex, loaded,
    loadForCampaign, subscribe, clear,
    add, update, remove, next, reset, sort,
    addCondition, removeCondition,
  } = useInitiativeStore();

  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    const unsub = subscribe(campaignId);
    return () => { unsub(); clear(); };
  }, [campaignId]);

  const [name, setName]   = useState('');
  const [init, setInit]   = useState('');
  const [hp, setHp]       = useState('');
  const [ac, setAc]       = useState('');
  const [isPC, setIsPC]   = useState(false);

  // Condition picker state
  const [pickerFor, setPickerFor]     = useState<string | null>(null);
  const [pickerRounds, setPickerRounds] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerFor(null);
        setPickerRounds('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const active = combatants[turnIndex] ?? null;

  const submit = () => {
    if (!name.trim() || !campaignId) return;
    const hpNum = parseInt(hp || '0', 10) || 0;
    add({ name: name.trim(), initiative: parseInt(init || '0', 10) || 0, hp: hpNum, maxHp: hpNum, ac: parseInt(ac || '10', 10) || 10, isPC });
    setName(''); setInit(''); setHp(''); setAc('');
  };

  const adjustHp = (id: string, delta: number) => {
    const c = combatants.find((x) => x.id === id);
    if (!c) return;
    update(id, { hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) });
  };

  const handleAddCondition = async (combatantId: string, condName: string) => {
    const rounds = pickerRounds.trim() ? (parseInt(pickerRounds, 10) || null) : null;
    await addCondition(combatantId, { name: condName, rounds });
    setPickerFor(null);
    setPickerRounds('');
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Initiative">
        <QuickDiceButton compact />
        <div className="text-sm text-slate-400 font-mono mr-4">Round {round}</div>
        {isGM && (
          <>
            <button onClick={sort} className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1">
              <Shuffle size={14} /> Sort
            </button>
            <button onClick={() => reset()} className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1">
              <RotateCcw size={14} /> Reset
            </button>
          </>
        )}
        <button
          onClick={next}
          disabled={combatants.length === 0 || !isGM}
          className="ac-btn px-4 py-1.5 text-xs font-semibold rounded flex items-center gap-1 disabled:bg-slate-800 disabled:text-slate-600"
        >
          Next <ChevronRight size={14} />
        </button>
      </PageHeader>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto">
        <div className="lg:col-span-2 space-y-2">
          {!loaded && <div className="text-sm text-slate-600 italic">Loading…</div>}
          {loaded && combatants.length === 0 && (
            <div className="text-sm text-slate-600 italic">No combatants yet.{isGM ? ' Add one on the right.' : ''}</div>
          )}

          {combatants.map((c, i) => (
            <CombatantRow
              key={c.id}
              combatant={c}
              isActive={i === turnIndex}
              isGM={isGM}
              pickerFor={pickerFor}
              pickerRounds={pickerRounds}
              pickerRef={pickerRef}
              onPickerOpen={(id) => { setPickerFor(pickerFor === id ? null : id); setPickerRounds(''); }}
              onPickerRoundsChange={setPickerRounds}
              onUpdate={update}
              onRemove={remove}
              onAdjustHp={adjustHp}
              onAddCondition={handleAddCondition}
              onRemoveCondition={removeCondition}
            />
          ))}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Active combatant panel */}
          {active && (
            <div
              className="border rounded-lg p-4 space-y-2"
              style={{
                background: 'color-mix(in srgb, var(--ac-900) 20%, #0f172a)',
                borderColor: 'var(--ac-700)',
              }}
            >
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--ac-400)', opacity: 0.7 }}>
                Now acting
              </div>
              <div className="font-serif text-2xl" style={{ color: 'var(--ac-200)' }}>{active.name}</div>
              <div className="text-xs text-slate-400">
                Initiative {active.initiative} · AC {active.ac} · HP {active.hp}/{active.maxHp}
              </div>
              {active.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {active.conditions.map((cond) => {
                    const color = CONDITIONS.find((x) => x.name === cond.name)?.color ?? '#64748b';
                    return (
                      <span
                        key={cond.name}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: color + '22', color, border: `1px solid ${color}55` }}
                      >
                        {cond.name}{cond.rounds !== null && ` (${cond.rounds})`}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add combatant form — GM only */}
          {isGM && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="text-xs uppercase tracking-wider text-slate-500">Add combatant</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="Name"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input value={init} onChange={(e) => setInit(e.target.value)} placeholder="Init" type="number"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono" />
                <input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="HP" type="number"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono" />
                <input value={ac} onChange={(e) => setAc(e.target.value)} placeholder="AC" type="number"
                  className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" checked={isPC} onChange={(e) => setIsPC(e.target.checked)} />
                Player character
              </label>
              <button
                onClick={submit}
                className="ac-btn w-full px-3 py-2 font-semibold rounded flex items-center justify-center gap-1 text-sm"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Combatant row ──────────────────────────────────────────────────────── */

type CombatantRowProps = {
  combatant: InitiativeCombatant;
  isActive: boolean;
  isGM: boolean;
  pickerFor: string | null;
  pickerRounds: string;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  onPickerOpen: (id: string) => void;
  onPickerRoundsChange: (v: string) => void;
  onUpdate: (id: string, patch: Partial<Pick<InitiativeCombatant, 'name' | 'initiative' | 'hp' | 'maxHp' | 'ac' | 'conditions'>>) => void;
  onRemove: (id: string) => void;
  onAdjustHp: (id: string, delta: number) => void;
  onAddCondition: (id: string, name: string) => void;
  onRemoveCondition: (id: string, name: string) => void;
};

function CombatantRow({
  combatant: c, isActive, isGM,
  pickerFor, pickerRounds, pickerRef,
  onPickerOpen, onPickerRoundsChange,
  onUpdate, onRemove, onAdjustHp, onAddCondition, onRemoveCondition,
}: CombatantRowProps) {
  const [hp, setHp]       = useState(String(c.hp));
  const [maxHp, setMaxHp] = useState(String(c.maxHp));
  const [ac, setAc]       = useState(String(c.ac));

  useEffect(() => { setHp(String(c.hp)); }, [c.hp]);
  useEffect(() => { setMaxHp(String(c.maxHp)); }, [c.maxHp]);
  useEffect(() => { setAc(String(c.ac)); }, [c.ac]);

  const dead   = c.hp <= 0 && c.maxHp > 0;
  const hpPct  = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0;

  return (
    <div
      className={`rounded-lg border p-3 transition-all relative ${
        isActive
          ? 'border-[color:var(--ac-700)] shadow-lg'
          : dead
            ? 'bg-slate-900/40 border-slate-800 opacity-60'
            : 'bg-slate-900 border-slate-800'
      }`}
      style={isActive ? { background: 'color-mix(in srgb, var(--ac-900) 30%, #0f172a)' } : undefined}
    >
      <div className="flex items-start gap-3">
        {/* Initiative badge */}
        <div className={`w-12 h-12 rounded shrink-0 flex flex-col items-center justify-center font-mono ${
          c.isPC ? 'bg-emerald-900/60 text-emerald-200' : 'bg-rose-900/60 text-rose-200'
        }`}>
          <div className="text-[9px] uppercase tracking-wider opacity-70">Init</div>
          <div className="text-lg leading-none">{c.initiative}</div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-2">
            {isGM ? (
              <input
                value={c.name}
                onChange={(e) => onUpdate(c.id, { name: e.target.value })}
                className="bg-transparent font-serif text-lg text-slate-100 outline-none focus:bg-slate-800/50 rounded px-1 -mx-1 min-w-0"
              />
            ) : (
              <span className="font-serif text-lg text-slate-100">{c.name}</span>
            )}
            {c.isPC && <span className="text-[10px] uppercase tracking-wider text-emerald-400/80">PC</span>}
            {dead   && <span className="text-[10px] uppercase tracking-wider text-rose-400/80">Down</span>}
          </div>

          {/* Conditions row */}
          {c.conditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {c.conditions.map((cond) => {
                const color = CONDITIONS.find((x) => x.name === cond.name)?.color ?? '#64748b';
                return (
                  <button
                    key={cond.name}
                    onClick={() => isGM && onRemoveCondition(c.id, cond.name)}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"
                    style={{ background: color + '22', color, border: `1px solid ${color}55` }}
                    title={
                      cond.rounds !== null
                        ? `${cond.rounds} round(s) remaining${isGM ? ' — click to remove' : ''}`
                        : `Indefinite${isGM ? ' — click to remove' : ''}`
                    }
                  >
                    {cond.name}
                    {cond.rounds !== null && <span className="opacity-70">({cond.rounds})</span>}
                    {isGM && <X size={8} className="opacity-50" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* AC + roll initiative row */}
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <label className="flex items-center gap-1">
              <Shield size={12} /> AC
              {isGM ? (
                <input
                  type="number"
                  value={ac}
                  onChange={(e) => setAc(e.target.value)}
                  onBlur={() => onUpdate(c.id, { ac: parseInt(ac, 10) || 0 })}
                  className="w-12 bg-slate-800 rounded px-1 font-mono"
                />
              ) : (
                <span className="font-mono">{c.ac}</span>
              )}
            </label>
            {isGM && (
              <button
                onClick={() => onUpdate(c.id, { initiative: Math.floor(Math.random() * 20) + 1 })}
                className="flex items-center gap-1 hover:text-slate-200"
                style={{ color: 'var(--ac-400)' }}
              >
                <Swords size={12} /> Roll init
              </button>
            )}
          </div>

          {/* HP row */}
          <div className="mt-2 flex items-center gap-2">
            <Heart size={12} className="text-rose-400 shrink-0" />
            <div className="flex items-center gap-1 font-mono text-sm">
              {isGM ? (
                <>
                  <input
                    type="number"
                    value={hp}
                    onChange={(e) => setHp(e.target.value)}
                    onBlur={() => onUpdate(c.id, { hp: Math.max(0, parseInt(hp, 10) || 0) })}
                    className="w-14 bg-slate-800 rounded px-1 text-right"
                  />
                  <span className="text-slate-500">/</span>
                  <input
                    type="number"
                    value={maxHp}
                    onChange={(e) => setMaxHp(e.target.value)}
                    onBlur={() => onUpdate(c.id, { maxHp: parseInt(maxHp, 10) || 0 })}
                    className="w-14 bg-slate-800 rounded px-1"
                  />
                </>
              ) : (
                <span>{c.hp}<span className="text-slate-500">/{c.maxHp}</span></span>
              )}
            </div>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${hpPct > 50 ? 'bg-emerald-600' : hpPct > 25 ? 'bg-amber-500' : 'bg-rose-600'}`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
            {isGM && (
              <div className="flex gap-1 shrink-0">
                {[-5, -1, +1, +5].map((d) => (
                  <button
                    key={d}
                    onClick={() => onAdjustHp(c.id, d)}
                    className={`w-7 h-6 text-xs rounded ${d < 0 ? 'bg-slate-800 hover:bg-rose-900' : 'bg-slate-800 hover:bg-emerald-900'}`}
                  >
                    {d > 0 ? `+${d}` : d}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {isGM && (
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => onRemove(c.id)} className="text-slate-600 hover:text-rose-400 p-1">
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => onPickerOpen(c.id)}
              className="text-slate-600 hover:text-slate-300 p-1"
              title="Add condition"
            >
              <Activity size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Condition picker dropdown */}
      {isGM && pickerFor === c.id && (
        <div
          ref={pickerRef}
          className="absolute right-10 top-0 z-20 bg-slate-900 border border-slate-700 rounded-lg p-3 w-72 shadow-2xl"
        >
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Add condition</div>
          <div className="grid grid-cols-3 gap-1 mb-3">
            {CONDITIONS.map((cond) => {
              const already = c.conditions.some((x) => x.name === cond.name);
              return (
                <button
                  key={cond.name}
                  disabled={already}
                  onClick={() => onAddCondition(c.id, cond.name)}
                  className="text-[10px] px-1 py-1.5 rounded text-center transition-opacity disabled:opacity-30"
                  style={{ background: cond.color + '22', color: cond.color, border: `1px solid ${cond.color}44` }}
                >
                  {cond.name}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <span className="text-[11px] text-slate-400 whitespace-nowrap">Rounds (blank = ∞):</span>
            <input
              type="number"
              value={pickerRounds}
              onChange={(e) => onPickerRoundsChange(e.target.value)}
              placeholder="∞"
              min={1}
              className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
