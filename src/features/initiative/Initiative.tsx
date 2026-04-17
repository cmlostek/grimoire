import { useState } from 'react';
import { useStore } from '../../store';
import PageHeader from '../../components/PageHeader';
import { ChevronRight, Shuffle, RotateCcw, Plus, Trash2, Heart, Shield, Swords } from 'lucide-react';
import { QuickDiceButton } from '../dice/QuickDice';

export default function Initiative() {
  const {
    combatants,
    round,
    turnIndex,
    addCombatant,
    updateCombatant,
    removeCombatant,
    nextTurn,
    resetInitiative,
    sortInitiative,
  } = useStore();

  const [name, setName] = useState('');
  const [init, setInit] = useState('');
  const [hp, setHp] = useState('');
  const [ac, setAc] = useState('');
  const [isPC, setIsPC] = useState(false);

  const active = combatants[turnIndex];

  const submit = () => {
    if (!name.trim()) return;
    const hpNum = parseInt(hp || '0', 10) || 0;
    addCombatant({
      name: name.trim(),
      initiative: parseInt(init || '0', 10) || 0,
      hp: hpNum,
      maxHp: hpNum,
      ac: parseInt(ac || '10', 10) || 10,
      isPC,
    });
    setName('');
    setInit('');
    setHp('');
    setAc('');
  };

  const rollInitiative = (id: string) => {
    const roll = Math.floor(Math.random() * 20) + 1;
    updateCombatant(id, { initiative: roll });
  };

  const adjustHp = (id: string, delta: number) => {
    const c = combatants.find((x) => x.id === id);
    if (!c) return;
    updateCombatant(id, { hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) });
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Initiative">
        <QuickDiceButton compact />
        <div className="text-sm text-slate-400 font-mono mr-4">Round {round}</div>
        <button
          onClick={sortInitiative}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
        >
          <Shuffle size={14} /> Sort
        </button>
        <button
          onClick={resetInitiative}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <button
          onClick={nextTurn}
          disabled={combatants.length === 0}
          className="px-4 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-semibold rounded flex items-center gap-1"
        >
          Next <ChevronRight size={14} />
        </button>
      </PageHeader>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto">
        <div className="lg:col-span-2 space-y-2">
          {combatants.length === 0 && (
            <div className="text-sm text-slate-600 italic">No combatants yet. Add one on the right.</div>
          )}
          {combatants.map((c, i) => {
            const isActive = i === turnIndex;
            const dead = c.hp <= 0;
            const hpPct = c.maxHp > 0 ? (c.hp / c.maxHp) * 100 : 0;
            return (
              <div
                key={c.id}
                className={`rounded-lg border p-3 transition-all ${
                  isActive
                    ? 'bg-sky-950/30 border-sky-700 shadow-lg shadow-sky-900/20'
                    : dead
                      ? 'bg-slate-900/40 border-slate-800 opacity-60'
                      : 'bg-slate-900 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded flex flex-col items-center justify-center font-mono ${
                      c.isPC ? 'bg-emerald-900/60 text-emerald-200' : 'bg-rose-900/60 text-rose-200'
                    }`}
                  >
                    <div className="text-[9px] uppercase tracking-wider opacity-70">Init</div>
                    <div className="text-lg leading-none">{c.initiative}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        value={c.name}
                        onChange={(e) => updateCombatant(c.id, { name: e.target.value })}
                        className="bg-transparent font-serif text-lg text-slate-100 outline-none focus:bg-slate-800/50 rounded px-1 -mx-1 min-w-0"
                      />
                      {c.isPC && (
                        <span className="text-[10px] uppercase tracking-wider text-emerald-400/80">PC</span>
                      )}
                      {dead && (
                        <span className="text-[10px] uppercase tracking-wider text-rose-400/80">Down</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <label className="flex items-center gap-1">
                        <Shield size={12} /> AC
                        <input
                          type="number"
                          value={c.ac}
                          onChange={(e) =>
                            updateCombatant(c.id, { ac: parseInt(e.target.value || '0', 10) || 0 })
                          }
                          className="w-12 bg-slate-800 rounded px-1 font-mono"
                        />
                      </label>
                      <button
                        onClick={() => rollInitiative(c.id)}
                        className="flex items-center gap-1 hover:text-sky-300"
                      >
                        <Swords size={12} /> Roll init
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Heart size={12} className="text-rose-400" />
                      <div className="flex items-center gap-1 font-mono text-sm">
                        <input
                          type="number"
                          value={c.hp}
                          onChange={(e) =>
                            updateCombatant(c.id, {
                              hp: Math.max(0, Math.min(c.maxHp, parseInt(e.target.value || '0', 10) || 0)),
                            })
                          }
                          className="w-14 bg-slate-800 rounded px-1 text-right"
                        />
                        <span className="text-slate-500">/</span>
                        <input
                          type="number"
                          value={c.maxHp}
                          onChange={(e) =>
                            updateCombatant(c.id, { maxHp: parseInt(e.target.value || '0', 10) || 0 })
                          }
                          className="w-14 bg-slate-800 rounded px-1"
                        />
                      </div>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            hpPct > 50 ? 'bg-emerald-600' : hpPct > 25 ? 'bg-sky-500' : 'bg-rose-600'
                          }`}
                          style={{ width: `${hpPct}%` }}
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => adjustHp(c.id, -1)}
                          className="w-6 h-6 text-xs bg-slate-800 hover:bg-rose-900 rounded"
                        >
                          −
                        </button>
                        <button
                          onClick={() => adjustHp(c.id, -5)}
                          className="w-6 h-6 text-xs bg-slate-800 hover:bg-rose-900 rounded"
                        >
                          −5
                        </button>
                        <button
                          onClick={() => adjustHp(c.id, +1)}
                          className="w-6 h-6 text-xs bg-slate-800 hover:bg-emerald-900 rounded"
                        >
                          +
                        </button>
                        <button
                          onClick={() => adjustHp(c.id, +5)}
                          className="w-6 h-6 text-xs bg-slate-800 hover:bg-emerald-900 rounded"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeCombatant(c.id)}
                    className="text-slate-600 hover:text-rose-400 p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-4">
          {active && (
            <div className="bg-sky-950/20 border border-sky-900 rounded-lg p-4">
              <div className="text-xs uppercase tracking-wider text-sky-400/70 mb-1">Now acting</div>
              <div className="font-serif text-2xl text-sky-200">{active.name}</div>
              <div className="text-xs text-slate-400 mt-1">
                Initiative {active.initiative} · AC {active.ac} · HP {active.hp}/{active.maxHp}
              </div>
            </div>
          )}

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
              <input
                value={init}
                onChange={(e) => setInit(e.target.value)}
                placeholder="Init"
                type="number"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono"
              />
              <input
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                placeholder="HP"
                type="number"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono"
              />
              <input
                value={ac}
                onChange={(e) => setAc(e.target.value)}
                placeholder="AC"
                type="number"
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={isPC} onChange={(e) => setIsPC(e.target.checked)} />
              Player character
            </label>
            <button
              onClick={submit}
              className="w-full px-3 py-2 bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold rounded flex items-center justify-center gap-1 text-sm"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
