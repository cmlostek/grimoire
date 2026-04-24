import { useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { Dices, Trash2 } from 'lucide-react';

function playDiceSound() {
  try {
    const ctx = new AudioContext();
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const t = ctx.currentTime + i * 0.055 + Math.random() * 0.02;
      const bufLen = Math.floor(ctx.sampleRate * 0.028);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const d = buf.getChannelData(0);
      const vol = (1 - i / count) * 0.45;
      for (let j = 0; j < bufLen; j++) {
        d[j] = (Math.random() * 2 - 1) * vol * Math.pow(1 - j / bufLen, 2);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      src.connect(hp);
      hp.connect(ctx.destination);
      src.start(t);
    }
    setTimeout(() => { try { ctx.close(); } catch (_) { /* ignore */ } }, 600);
  } catch (_) { /* audio unavailable */ }
}

type Die = 4 | 6 | 8 | 10 | 12 | 20 | 100;
const DICE: Die[] = [4, 6, 8, 10, 12, 20, 100];

type RollEntry = {
  id: string;
  formula: string;
  rolls: { die: Die; value: number; dropped?: boolean }[];
  modifier: number;
  total: number;
  label?: string;
  ts: number;
  crit?: 'hit' | 'miss';
};

function rollDie(sides: Die) {
  return Math.floor(Math.random() * sides) + 1;
}

export default function DiceRoller() {
  const [pool, setPool] = useState<Record<Die, number>>({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
  const [modifier, setModifier] = useState(0);
  const [advantage, setAdvantage] = useState<'none' | 'adv' | 'dis'>('none');
  const [label, setLabel] = useState('');
  const [history, setHistory] = useState<RollEntry[]>([]);

  const add = (d: Die, n = 1) => setPool((p) => ({ ...p, [d]: Math.max(0, p[d] + n) }));

  const totalDiceCount = DICE.reduce((s, d) => s + pool[d], 0);

  const buildFormula = (effectiveD20: number) => {
    const parts = DICE.filter((d) => (d === 20 ? effectiveD20 : pool[d]) > 0).map((d) =>
      d === 20 ? `${effectiveD20}d20${advantage === 'adv' ? ' adv' : advantage === 'dis' ? ' dis' : ''}` : `${pool[d]}d${d}`
    );
    let f = parts.join(' + ') || '—';
    if (modifier) f += ` ${modifier >= 0 ? '+' : '−'} ${Math.abs(modifier)}`;
    return f;
  };

  const canRoll = totalDiceCount > 0 || modifier !== 0 || advantage !== 'none';

  const doRoll = () => {
    if (!canRoll) return;
    const rolls: { die: Die; value: number; dropped?: boolean }[] = [];

    const effD20 = advantage !== 'none' && pool[20] === 0 ? 1 : pool[20];
    let critFromPick: RollEntry['crit'];

    for (const d of DICE) {
      if (d === 20) {
        for (let i = 0; i < effD20; i++) {
          if (i === 0 && advantage !== 'none') {
            const a = rollDie(20);
            const b = rollDie(20);
            const pick = advantage === 'adv' ? Math.max(a, b) : Math.min(a, b);
            rolls.push({ die: 20, value: pick });
            rolls.push({ die: 20, value: pick === a ? b : a, dropped: true });
            if (pick === 20) critFromPick = 'hit';
            else if (pick === 1) critFromPick = 'miss';
          } else {
            rolls.push({ die: 20, value: rollDie(20) });
          }
        }
      } else {
        for (let i = 0; i < pool[d]; i++) rolls.push({ die: d, value: rollDie(d) });
      }
    }

    const sum =
      rolls.filter((r) => !r.dropped).reduce((s, r) => s + r.value, 0) + modifier;

    let crit = critFromPick;
    if (!crit && effD20 === 1 && advantage === 'none') {
      const single = rolls.find((r) => r.die === 20 && !r.dropped);
      if (single?.value === 20) crit = 'hit';
      else if (single?.value === 1) crit = 'miss';
    }

    const entry: RollEntry = {
      id: crypto.randomUUID(),
      formula: buildFormula(effD20),
      rolls,
      modifier,
      total: sum,
      label: label || undefined,
      ts: Date.now(),
      crit,
    };
    playDiceSound();
    setHistory((h) => [entry, ...h].slice(0, 50));
  };

  const quickRoll = (d: Die) => {
    const value = rollDie(d);
    const crit: RollEntry['crit'] =
      d === 20 ? (value === 20 ? 'hit' : value === 1 ? 'miss' : undefined) : undefined;
    const entry: RollEntry = {
      id: crypto.randomUUID(),
      formula: `1d${d}`,
      rolls: [{ die: d, value }],
      modifier: 0,
      total: value,
      ts: Date.now(),
      crit,
    };
    playDiceSound();
    setHistory((h) => [entry, ...h].slice(0, 50));
  };

  const clearPool = () => {
    setPool({ 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 });
    setModifier(0);
    setAdvantage('none');
    setLabel('');
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Dice">
        <button
          onClick={() => setHistory([])}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
        >
          <Trash2 size={14} /> Clear history
        </button>
      </PageHeader>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Quick roll</div>
            <div className="flex flex-wrap gap-2">
              {DICE.map((d) => (
                <button
                  key={d}
                  onClick={() => quickRoll(d)}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg font-mono text-sm"
                >
                  d{d}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Build a roll</div>
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              {DICE.map((d) => (
                <div key={d} className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
                  <div className="font-mono text-sm text-slate-400">d{d}</div>
                  <div className="my-2 text-2xl font-serif text-sky-200">{pool[d]}</div>
                  <div className="flex justify-center gap-1">
                    <button
                      onClick={() => add(d, -1)}
                      className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      −
                    </button>
                    <button
                      onClick={() => add(d, 1)}
                      className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <div className="text-xs text-slate-500 mb-1">Modifier</div>
                <input
                  type="number"
                  value={modifier}
                  onChange={(e) => setModifier(parseInt(e.target.value || '0', 10))}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 font-mono"
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-500 mb-1">Label (optional)</div>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Sneak Attack"
                  className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2"
                />
              </label>
              <div>
                <div className="text-xs text-slate-500 mb-1">d20 mode</div>
                <div className="flex gap-1">
                  {(['none', 'adv', 'dis'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setAdvantage(m)}
                      className={`flex-1 py-2 text-xs rounded border ${
                        advantage === m
                          ? 'bg-sky-900/40 border-sky-700 text-sky-200'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {m === 'none' ? 'Normal' : m === 'adv' ? 'Advantage' : 'Disadvantage'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 px-4 py-3 bg-slate-900 border border-slate-800 rounded font-mono text-slate-300">
                {buildFormula(advantage !== 'none' && pool[20] === 0 ? 1 : pool[20])}
              </div>
              <button
                onClick={doRoll}
                disabled={!canRoll}
                className="px-5 py-3 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 rounded font-semibold flex items-center gap-2"
              >
                <Dices size={18} /> Roll
              </button>
              <button
                onClick={clearPool}
                className="px-3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm"
              >
                Reset
              </button>
            </div>
          </section>
        </div>

        <section className="min-h-0 flex flex-col">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">History</div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {history.length === 0 && (
              <div className="text-sm text-slate-600 italic">No rolls yet.</div>
            )}
            {history.map((h) => (
              <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs text-slate-500 font-mono truncate">{h.formula}</div>
                  <div
                    className={`font-serif text-2xl ${
                      h.crit === 'hit'
                        ? 'text-emerald-300'
                        : h.crit === 'miss'
                          ? 'text-rose-400'
                          : 'text-sky-200'
                    }`}
                  >
                    {h.total}
                  </div>
                </div>
                {h.label && <div className="text-xs text-slate-400 mt-1">{h.label}</div>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {h.rolls.map((r, i) => (
                    <span
                      key={i}
                      className={`px-1.5 py-0.5 bg-slate-800 rounded text-[11px] font-mono ${
                        r.dropped ? 'text-slate-600 line-through' : 'text-slate-300'
                      }`}
                    >
                      d{r.die}: {r.value}
                    </span>
                  ))}
                  {h.modifier !== 0 && (
                    <span className="px-1.5 py-0.5 bg-slate-800 rounded text-[11px] font-mono text-slate-300">
                      {h.modifier >= 0 ? '+' : ''}
                      {h.modifier}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
