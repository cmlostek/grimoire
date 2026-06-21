import { useEffect, useMemo, useState } from 'react';
import { X as XIcon, Dices, Sparkles, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CLASSES_2024 } from '../../data/srd';
import type { Class, ClassSubclass } from '../../data/types';
import {
  type CharacterFeature,
  type PartyMember,
  type SpellSlots,
} from '../party/partyStore';
import {
  type HpRollingMethod,
  useCampaignSettings,
} from '../notes/campaignSettingsStore';
import { useQuickDice } from '../dice/quickDiceStore';

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/** Parse the numeric value from a class-table cell ("4", "+2", "—", ""). */
function num(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Extract the per-level spell-slot vector (length 10, index 0 unused) from a
 *  class-table row's columns. Matches our generic "Spell Slots per Spell Level N"
 *  column key from the parser. Returns null when the row has no slot columns. */
function slotsFromRow(cols: Record<string, string>): number[] | null {
  let touched = false;
  const out = Array.from({ length: 10 }, () => 0);
  for (let i = 1; i <= 9; i += 1) {
    const v = num(cols[`Spell Slots per Spell Level ${i}`]);
    if (v !== null) {
      out[i] = v;
      touched = true;
    }
  }
  return touched ? out : null;
}

/** Try to resolve the character's class. Order: explicit classId → first
 *  word of classSummary → null (caller shows a picker). */
function resolveClass(member: PartyMember): Class | null {
  if (member.classId) {
    return CLASSES_2024.find((c) => c.index === member.classId) ?? null;
  }
  const word = (member.classSummary ?? '').trim().split(/\s+/)[0]?.toLowerCase();
  if (!word) return null;
  return CLASSES_2024.find((c) => c.index === word || c.name.toLowerCase() === word) ?? null;
}

/** Subclass-choice level for a class — the level where the level table says
 *  "<Class> Subclass". Returns null if we can't find it. */
function subclassLevel(cls: Class): number | null {
  for (const row of cls.levelTable) {
    if (row.features.some((f) => /Subclass$/i.test(f))) return row.level;
  }
  return null;
}

export type LevelUpResult = {
  level: number;
  maxHp: number;
  hp: number;
  spellSlots?: SpellSlots;
  features: CharacterFeature[];
  classId?: string;
  subclassId?: string;
};

export default function LevelUpModal({
  member,
  onConfirm,
  onClose,
}: {
  member: PartyMember;
  onConfirm: (patch: LevelUpResult) => void;
  onClose: () => void;
}) {
  const campaignHpMethod = useCampaignSettings((s) => s.settings.hpRollingMethod);
  const rollFormula = useQuickDice((s) => s.rollFormula);

  // Step 0: class resolution (skip if already resolved).
  const initialClass = useMemo(() => resolveClass(member), [member]);
  const [pickedClassId, setPickedClassId] = useState<string | null>(initialClass?.index ?? null);
  const cls = pickedClassId ? CLASSES_2024.find((c) => c.index === pickedClassId) ?? null : null;

  const newLevel = member.level + 1;
  // The level table is indexed by level → row.level (1..20). Find by value, not by array index,
  // in case the parser ever skipped a row.
  const newRow = useMemo(
    () => (cls ? cls.levelTable.find((r) => r.level === newLevel) ?? null : null),
    [cls, newLevel],
  );
  const prevRow = useMemo(
    () => (cls ? cls.levelTable.find((r) => r.level === member.level) ?? null : null),
    [cls, member.level],
  );

  // ── HP gain ────────────────────────────────────────────────────────────
  const [hpMethod, setHpMethod] = useState<HpRollingMethod>(campaignHpMethod);
  const conMod = abilityMod(member.con);
  const avgGain = cls ? Math.max(1, Math.floor(cls.hitDie / 2) + 1 + conMod) : 0;
  const [rolledHp, setRolledHp] = useState<number | null>(null);
  const [manualHp, setManualHp] = useState<number>(Math.max(1, conMod + 1));

  const rolledGain = rolledHp !== null ? Math.max(1, rolledHp + conMod) : null;
  const hpGain =
    hpMethod === 'avg'
      ? avgGain
      : hpMethod === 'roll'
        ? rolledGain
        : Math.max(0, manualHp);

  const newMaxHp = member.maxHp + (hpGain ?? 0);

  const rollHitDie = () => {
    if (!cls) return;
    const die = cls.hitDie;
    // Roll inline; also fire through QuickDice for the history panel.
    const v = Math.floor(Math.random() * die) + 1;
    setRolledHp(v);
    rollFormula(`1d${die}`, `${cls.name} L${newLevel} HP roll`);
  };

  // ── Spell slots ────────────────────────────────────────────────────────
  const newSlots = useMemo(() => (newRow ? slotsFromRow(newRow.classColumns) : null), [newRow]);
  const prevSlots = useMemo(
    () => (prevRow ? slotsFromRow(prevRow.classColumns) : null),
    [prevRow],
  );
  const slotDiffs = useMemo(() => {
    if (!newSlots) return [];
    const diffs: { level: number; from: number; to: number }[] = [];
    for (let i = 1; i <= 9; i += 1) {
      const from = prevSlots?.[i] ?? 0;
      const to = newSlots[i] ?? 0;
      if (from !== to) diffs.push({ level: i, from, to });
    }
    return diffs;
  }, [newSlots, prevSlots]);

  // ── Features ───────────────────────────────────────────────────────────
  const newFeatureNames = useMemo(() => {
    if (!newRow) return [];
    // Filter out "Ability Score Improvement" because that's a player choice
    // separate from an unlocked feature, and "<Class> Subclass" which we
    // surface through the subclass picker instead.
    return newRow.features.filter(
      (f) => !/Ability Score Improvement/i.test(f) && !/Subclass$/i.test(f),
    );
  }, [newRow]);

  // ── Subclass picker ────────────────────────────────────────────────────
  const isSubclassLevel = cls && subclassLevel(cls) === newLevel && !member.subclassId;
  const [pickedSubclassId, setPickedSubclassId] = useState<string | null>(null);

  // ── Reset rolled HP when method changes ────────────────────────────────
  useEffect(() => {
    if (hpMethod !== 'roll') setRolledHp(null);
  }, [hpMethod]);

  const canConfirm =
    !!cls &&
    hpGain !== null &&
    hpGain >= 0 &&
    (!isSubclassLevel || !!pickedSubclassId);

  const handleConfirm = () => {
    if (!canConfirm || !cls) return;
    // Build the patch.
    const features: CharacterFeature[] = newFeatureNames.map((name) => ({
      id: crypto.randomUUID(),
      name,
      source: 'Class',
      desc: cls.features[name] ?? undefined,
    }));
    if (isSubclassLevel && pickedSubclassId) {
      const sc = cls.subclasses.find((s) => s.index === pickedSubclassId);
      if (sc) {
        for (const f of sc.features.filter((sf) => sf.level === newLevel)) {
          features.push({
            id: crypto.randomUUID(),
            name: `${sc.name}: ${f.name}`,
            source: 'Class',
            desc: f.desc,
          });
        }
      }
    }
    const spellSlots: SpellSlots | undefined = newSlots
      ? newSlots.map((max, i) => ({
          max,
          // Restore to full when slot count increases; otherwise preserve the
          // current count (clamped). Players just leveled up so this matches
          // the typical "you also gained a Long Rest as part of leveling" tone.
          current: Math.min(max, (member.spellSlots?.[i]?.current ?? 0) + Math.max(0, max - (member.spellSlots?.[i]?.max ?? 0))),
        }))
      : undefined;
    onConfirm({
      level: newLevel,
      maxHp: newMaxHp,
      hp: member.hp + (hpGain ?? 0),
      spellSlots,
      features,
      ...(initialClass ? {} : { classId: cls.index }),
      ...(isSubclassLevel && pickedSubclassId ? { subclassId: pickedSubclassId } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-12 px-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-amber-200">
            <ChevronUp size={18} />
            <h2 className="font-serif text-xl">
              Level up to {newLevel}
              {cls && <span className="text-slate-400 text-sm font-sans ml-2">· {cls.name}</span>}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Class picker if we couldn't resolve from classId/classSummary */}
          {!cls && (
            <Section title="Class">
              <p className="text-sm text-slate-400 mb-2">
                We couldn't tell which class you're playing from your sheet. Pick one to continue.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {CLASSES_2024.map((c) => (
                  <button
                    key={c.index}
                    onClick={() => setPickedClassId(c.index)}
                    className={`px-3 py-2 text-sm border rounded ${
                      pickedClassId === c.index
                        ? 'border-sky-500 bg-sky-900/30 text-sky-100'
                        : 'border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {cls && (
            <>
              {/* HP gain */}
              <Section title="Hit points">
                <div className="flex gap-1 mb-3">
                  {(['avg', 'roll', 'manual'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setHpMethod(m)}
                      className={`flex-1 px-2 py-1 text-xs rounded ${
                        hpMethod === m
                          ? 'bg-sky-900/40 text-sky-200 border border-sky-700'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {m === 'avg' ? 'Average' : m === 'roll' ? 'Roll' : 'Manual'}
                      {campaignHpMethod === m && <span className="ml-1 text-[9px] opacity-60">·default</span>}
                    </button>
                  ))}
                </div>

                {hpMethod === 'avg' && (
                  <div className="text-sm text-slate-300">
                    Take the average for a d{cls.hitDie}: <span className="font-mono">{Math.floor(cls.hitDie / 2) + 1}</span>{' '}
                    + Con mod (<span className="font-mono">{conMod >= 0 ? '+' : ''}{conMod}</span>) ={' '}
                    <span className="font-mono text-emerald-300">+{avgGain}</span> HP
                  </div>
                )}

                {hpMethod === 'roll' && (
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      onClick={rollHitDie}
                      className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-white text-xs flex items-center gap-1"
                    >
                      <Dices size={13} /> Roll 1d{cls.hitDie}
                    </button>
                    {rolledHp !== null && (
                      <div className="text-slate-300">
                        Rolled <span className="font-mono text-slate-100">{rolledHp}</span> + Con mod{' '}
                        <span className="font-mono">({conMod >= 0 ? '+' : ''}{conMod})</span> ={' '}
                        <span className="font-mono text-emerald-300">+{rolledGain}</span> HP
                      </div>
                    )}
                    {rolledHp === null && (
                      <div className="text-slate-500 text-xs italic">Click to roll your hit die.</div>
                    )}
                  </div>
                )}

                {hpMethod === 'manual' && (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-400">HP to add:</span>
                    <input
                      type="number"
                      value={manualHp}
                      onChange={(e) => setManualHp(Math.max(0, parseInt(e.target.value || '0', 10)))}
                      className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-center text-slate-100 font-mono focus:outline-none focus:border-sky-700"
                    />
                  </label>
                )}

                {hpGain !== null && (
                  <div className="mt-3 pt-3 border-t border-slate-800 text-sm flex items-baseline gap-2">
                    <span className="text-slate-500 text-xs uppercase tracking-wider">Max HP:</span>
                    <span className="font-mono text-slate-100">{member.maxHp}</span>
                    <span className="text-slate-600">→</span>
                    <span className="font-mono text-emerald-300">{newMaxHp}</span>
                  </div>
                )}
              </Section>

              {/* Features */}
              {newFeatureNames.length > 0 && (
                <Section title="New features">
                  <div className="space-y-3">
                    {newFeatureNames.map((name) => (
                      <div key={name} className="bg-slate-950 border border-slate-800 rounded p-3">
                        <div className="font-medium text-sky-200 mb-1">{name}</div>
                        {cls.features[name] && (
                          <div className="text-xs text-slate-300 leading-relaxed markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{cls.features[name]}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Subclass picker */}
              {isSubclassLevel && (
                <Section title={`Choose your ${cls.name} subclass`}>
                  <div className="space-y-2">
                    {cls.subclasses.map((sc) => (
                      <SubclassChoice
                        key={sc.index}
                        sc={sc}
                        selected={pickedSubclassId === sc.index}
                        atLevel={newLevel}
                        onSelect={() => setPickedSubclassId(sc.index)}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {/* Spell slot diff */}
              {slotDiffs.length > 0 && (
                <Section title="Spell slots">
                  <div className="space-y-1.5">
                    {slotDiffs.map((d) => (
                      <div key={d.level} className="flex items-center gap-3 text-sm">
                        <Sparkles size={12} className="text-violet-300" />
                        <span className="font-mono text-slate-300 w-12">Lv {d.level}:</span>
                        <span className="font-mono text-slate-400">{d.from}</span>
                        <span className="text-slate-600">→</span>
                        <span className="font-mono text-emerald-300">{d.to}</span>
                        {d.to > d.from && (
                          <span className="text-[10px] text-emerald-400">+{d.to - d.from}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Always-on level-up notes */}
              {newRow && newRow.features.some((f) => /Ability Score Improvement/i.test(f)) && (
                <div className="text-xs text-amber-200/70 bg-amber-950/30 border border-amber-900/40 rounded p-3">
                  This level grants an <strong>Ability Score Improvement</strong> (or you may choose a
                  feat). Apply it in the ability scores card after closing this dialog.
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-800">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-300 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="px-4 py-1.5 text-sm rounded bg-amber-700 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-medium"
            title={
              !cls
                ? 'Pick your class to continue'
                : isSubclassLevel && !pickedSubclassId
                  ? 'Pick your subclass to continue'
                  : 'Apply this level-up'
            }
          >
            Confirm level {newLevel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[11px] uppercase tracking-wider text-amber-200/70 mb-2">{title}</div>
      <div>{children}</div>
    </section>
  );
}

function SubclassChoice({
  sc,
  selected,
  atLevel,
  onSelect,
}: {
  sc: ClassSubclass;
  selected: boolean;
  atLevel: number;
  onSelect: () => void;
}) {
  const features = sc.features.filter((f) => f.level === atLevel);
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded border ${
        selected
          ? 'border-sky-500 bg-sky-900/30'
          : 'border-slate-800 bg-slate-950 hover:bg-slate-800/60'
      }`}
    >
      <div className={`font-medium ${selected ? 'text-sky-100' : 'text-slate-200'}`}>{sc.name}</div>
      {features.map((f) => (
        <div key={f.name} className="mt-2 text-xs text-slate-400">
          <span className="text-slate-300 font-medium">{f.name}.</span>{' '}
          <span>{f.desc.slice(0, 200)}{f.desc.length > 200 ? '…' : ''}</span>
        </div>
      ))}
    </button>
  );
}
