import { useEffect, useRef, useState } from 'react';
import { Save, Printer, BedDouble, Coffee, Heart, Dices, HeartPulse, Skull, Eye, Search, Brain } from 'lucide-react';
import {
  DEFAULT_DEATH_SAVES,
  DEFAULT_GOLD,
  type PartyMember,
} from '../party/partyStore';
import { useQuickDice } from '../dice/quickDiceStore';

// ── Skill / save definitions ──────────────────────────────────────────────

type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const SKILLS: { key: string; label: string; ability: Ability }[] = [
  { key: 'acrobatics',       label: 'Acrobatics',       ability: 'dex' },
  { key: 'animal-handling',  label: 'Animal Handling',  ability: 'wis' },
  { key: 'arcana',           label: 'Arcana',           ability: 'int' },
  { key: 'athletics',        label: 'Athletics',        ability: 'str' },
  { key: 'deception',        label: 'Deception',        ability: 'cha' },
  { key: 'history',          label: 'History',          ability: 'int' },
  { key: 'insight',          label: 'Insight',          ability: 'wis' },
  { key: 'intimidation',     label: 'Intimidation',     ability: 'cha' },
  { key: 'investigation',    label: 'Investigation',    ability: 'int' },
  { key: 'medicine',         label: 'Medicine',         ability: 'wis' },
  { key: 'nature',           label: 'Nature',           ability: 'int' },
  { key: 'perception',       label: 'Perception',       ability: 'wis' },
  { key: 'performance',      label: 'Performance',      ability: 'cha' },
  { key: 'persuasion',       label: 'Persuasion',       ability: 'cha' },
  { key: 'religion',         label: 'Religion',         ability: 'int' },
  { key: 'sleight-of-hand',  label: 'Sleight of Hand',  ability: 'dex' },
  { key: 'stealth',          label: 'Stealth',          ability: 'dex' },
  { key: 'survival',         label: 'Survival',         ability: 'wis' },
];

const ABILITY_LABEL: Record<Ability, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

const abilityMod = (score: number) => Math.floor((score - 10) / 2);
const profBonus = (level: number) =>
  2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Full editable character sheet for the player's claimed party_members row.
 * Phase A: identity, vitals, stats, passives, gold, XP, death saves,
 * short/long rest actions, notes. Phase B adds inventory + spells.
 */
export default function CharacterSheet({
  m,
  onUpdate,
}: {
  m: PartyMember;
  onUpdate: (patch: Partial<PartyMember>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PartyMember>(m);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync from server when not locally edited (matches CharCard's pattern).
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

  const longRest = () => {
    // Restore HP to max, clear temp HP, clear death saves.
    apply({
      hp: draft.maxHp,
      tempHp: 0,
      deathSaves: { ...DEFAULT_DEATH_SAVES },
    });
  };

  // Short rest is handled inline via a popover (see ShortRestButton). The
  // popover spends a hit die: rolls 1d<size>+CON, heals up to maxHp, clears
  // death saves. Phase B will track actual hit-dice pools.

  const printSheet = () => {
    // Browser print dialog → user chooses "Save as PDF" or a printer.
    // The @media print stylesheet in index.css hides everything outside
    // .print-character-sheet so the PDF is just the sheet.
    window.print();
  };

  return (
    <div className="px-6 py-6 print-character-sheet">
      <SheetHeader
        draft={draft}
        dirty={dirty}
        saving={saving}
        onApply={apply}
        onSave={save}
        onPrint={printSheet}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <Card title="Vitals">
          <VitalsBlock draft={draft} onApply={apply} onLongRest={longRest} />
        </Card>

        <Card title="Death saves" subtitle="Used when HP hits 0">
          <DeathSavesBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Ability scores">
          <AbilityScoresBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Passive senses">
          <PassivesBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Saving throws" subtitle={`PB ${fmt(profBonus(draft.level))}`}>
          <SavesBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Coin purse">
          <GoldBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Skills" subtitle="Click pip to toggle proficiency · click modifier to roll" className="lg:col-span-2">
          <SkillsBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Languages & notes" subtitle="Free-text" className="lg:col-span-2">
          <TextFieldsBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Notes" className="lg:col-span-2">
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => apply({ notes: e.target.value })}
            rows={5}
            placeholder="Backstory hooks, party secrets, things to remember…"
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-700 resize-y"
          />
        </Card>
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function SheetHeader({
  draft,
  dirty,
  saving,
  onApply,
  onSave,
  onPrint,
}: {
  draft: PartyMember;
  dirty: boolean;
  saving: boolean;
  onApply: (p: Partial<PartyMember>) => void;
  onSave: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[16rem] space-y-1">
          <input
            value={draft.name}
            onChange={(e) => onApply({ name: e.target.value })}
            className="w-full bg-transparent font-serif text-2xl text-sky-200 outline-none"
            placeholder="Character name"
          />
          <div className="flex flex-wrap items-baseline gap-3">
            <input
              value={draft.classSummary}
              onChange={(e) => onApply({ classSummary: e.target.value })}
              className="bg-transparent text-sm text-slate-300 outline-none border-b border-transparent focus:border-slate-700"
              placeholder="Class & level e.g. Fighter 3"
            />
            <span className="text-slate-700">·</span>
            <input
              value={draft.race}
              onChange={(e) => onApply({ race: e.target.value })}
              className="bg-transparent text-sm text-slate-400 outline-none border-b border-transparent focus:border-slate-700"
              placeholder="Race"
            />
          </div>
        </div>

        <div className="flex items-stretch gap-2">
          <LabeledNumber
            label="LVL"
            value={draft.level}
            onChange={(v) => onApply({ level: v })}
            width="w-16"
          />
          <LabeledNumber
            label="XP"
            value={draft.xp ?? 0}
            onChange={(v) => onApply({ xp: v })}
            width="w-24"
          />
          <button
            onClick={onPrint}
            title="Open print dialog (Save as PDF)"
            className="px-3 rounded border border-slate-700 hover:bg-slate-800 text-slate-300 flex items-center gap-1 text-xs print:hidden"
          >
            <Printer size={13} /> PDF
          </button>
          {dirty && (
            <button
              onClick={onSave}
              disabled={saving}
              className="px-3 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1 print:hidden"
            >
              <Save size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Vitals ──────────────────────────────────────────────────────────────

function VitalsBlock({
  draft,
  onApply,
  onLongRest,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
  onLongRest: () => void;
}) {
  const hpPct = draft.maxHp > 0 ? (draft.hp / draft.maxHp) * 100 : 0;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center text-sm text-slate-300">
        <Heart size={14} className="text-rose-400" />
        <NumInput value={draft.hp} onChange={(v) => onApply({ hp: v })} className="w-16" />
        <span className="text-slate-500">/</span>
        <NumInput value={draft.maxHp} onChange={(v) => onApply({ maxHp: v })} className="w-16" />
        <span className="text-slate-500">HP</span>
        <span className="text-slate-500 ml-3">+</span>
        <NumInput value={draft.tempHp} onChange={(v) => onApply({ tempHp: v })} className="w-14" />
        <span className="text-slate-500">temp</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-rose-500/70 transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <LabeledNumber label="AC" value={draft.ac} onChange={(v) => onApply({ ac: v })} width="w-full" />
        <LabeledNumber
          label="INIT"
          value={draft.initiativeBonus}
          onChange={(v) => onApply({ initiativeBonus: v })}
          width="w-full"
          showSign
        />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Speed</div>
          <input
            value={draft.speed}
            onChange={(e) => onApply({ speed: e.target.value })}
            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          />
        </div>
      </div>
      <div className="flex gap-2 print:hidden">
        <ShortRestButton draft={draft} onApply={onApply} />
        <button
          onClick={onLongRest}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
          title="Long rest (full HP, clears temp HP and death saves)"
        >
          <BedDouble size={13} /> Long rest
        </button>
      </div>
    </div>
  );
}

// ── Death saves ─────────────────────────────────────────────────────────

function DeathSavesBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  const ds = draft.deathSaves ?? DEFAULT_DEATH_SAVES;
  const togglePip = (kind: 'successes' | 'failures', i: number) => {
    // Click pip N: if it's already filled, drop count to N-1; otherwise fill up to N.
    const current = ds[kind];
    const next = current === i ? i - 1 : i;
    onApply({ deathSaves: { ...ds, [kind]: Math.max(0, Math.min(3, next)) } });
  };

  // Status reacts to the pip state: dead (3 fails) → stabilized (3 hits) →
  // dying (any rolls) → conscious (clean slate).
  const status = (() => {
    if (ds.failures >= 3)  return { label: 'Unconscious — dead', tone: 'danger',  Icon: Skull };
    if (ds.successes >= 3) return { label: 'Stabilized',          tone: 'success', Icon: HeartPulse };
    if (ds.failures > 0 || ds.successes > 0) return { label: 'Dying', tone: 'warning', Icon: HeartPulse };
    return { label: 'Conscious', tone: 'neutral', Icon: HeartPulse };
  })();

  const tones: Record<typeof status.tone, { color: string; bg: string; pulse?: string }> = {
    neutral: { color: '#64748b', bg: 'color-mix(in srgb, #64748b 12%, transparent)' },
    warning: { color: '#fb923c', bg: 'color-mix(in srgb, #fb923c 14%, transparent)', pulse: 'animate-pulse' },
    success: { color: '#34d399', bg: 'color-mix(in srgb, #34d399 14%, transparent)' },
    danger:  { color: '#f43f5e', bg: 'color-mix(in srgb, #f43f5e 16%, transparent)' },
  };
  const t = tones[status.tone];

  return (
    <div className="flex flex-col gap-4 h-full">
      <PipRow
        label="Successes"
        color="bg-emerald-500"
        filled={ds.successes}
        onClickPip={(i) => togglePip('successes', i)}
      />
      <PipRow
        label="Failures"
        color="bg-rose-500"
        filled={ds.failures}
        onClickPip={(i) => togglePip('failures', i)}
      />
      <div className="flex-1 flex flex-col items-center justify-center gap-2 mt-2 py-3 rounded" style={{ background: t.bg }}>
        <status.Icon
          size={56}
          strokeWidth={1.5}
          className={status.tone === 'warning' ? 'animate-pulse' : undefined}
          style={{ color: t.color }}
        />
        <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: t.color }}>
          {status.label}
        </div>
      </div>
    </div>
  );
}

function PipRow({
  label,
  color,
  filled,
  onClickPip,
}: {
  label: string;
  color: string;
  filled: number;
  onClickPip: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 w-20">{label}</div>
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            onClick={() => onClickPip(i)}
            className={`h-5 w-5 rounded-full border ${
              i <= filled ? `${color} border-transparent` : 'border-slate-700 hover:border-slate-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Ability scores ──────────────────────────────────────────────────────

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

function AbilityScoresBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ABILITIES.map((k) => {
        const score = draft[k];
        const mod = Math.floor((score - 10) / 2);
        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
        return (
          <div key={k} className="bg-slate-950 border border-slate-800 rounded p-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
            <NumInput
              value={score}
              onChange={(v) => onApply({ [k]: v } as Partial<PartyMember>)}
              className="w-full text-center text-lg font-semibold !border-transparent !bg-transparent !p-0"
            />
            <div className="text-[11px] text-slate-400">{modStr}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Passives ────────────────────────────────────────────────────────────

function PassivesBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  const senses = [
    { label: 'Perception',    value: draft.passivePerception,    apply: (v: number) => onApply({ passivePerception: v }),    Icon: Eye,    color: '#7dd3fc' },
    { label: 'Investigation', value: draft.passiveInvestigation, apply: (v: number) => onApply({ passiveInvestigation: v }), Icon: Search, color: '#c4b5fd' },
    { label: 'Insight',       value: draft.passiveInsight,       apply: (v: number) => onApply({ passiveInsight: v }),       Icon: Brain,  color: '#fbbf24' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {senses.map(({ label, value, apply, Icon, color }) => (
        <SenseCell key={label} label={label} value={value} onChange={apply} Icon={Icon} color={color} />
      ))}
    </div>
  );
}

function SenseCell({
  label,
  value,
  onChange,
  Icon,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  Icon: typeof Eye;
  color: string;
}) {
  // Visual sense-strength bar: 0–25 mapped to 0–100% width. Most 5e
  // passives sit 8–22, so this gives a meaningful visual range.
  const pct = Math.max(0, Math.min(100, (value / 25) * 100));
  const descriptor = value >= 18 ? 'Keen' : value >= 14 ? 'Sharp' : value >= 10 ? 'Average' : 'Dull';
  return (
    <div className="flex flex-col items-center bg-slate-950 border border-slate-800 rounded p-2 gap-1.5">
      <Icon size={20} strokeWidth={1.5} style={{ color }} />
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <NumInput
        value={value}
        onChange={onChange}
        className="w-full text-center text-lg font-semibold !border-transparent !bg-transparent !p-0"
      />
      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full transition-[width]"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="text-[10px] text-slate-500">{descriptor}</div>
    </div>
  );
}

// ── Saves / skills / languages (free-text) ──────────────────────────────

function TextFieldsBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  return (
    <div className="space-y-2">
      <Field label="Languages">
        <input
          value={draft.languages}
          onChange={(e) => onApply({ languages: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          placeholder="e.g. Common, Elvish, Thieves' Cant"
        />
      </Field>
      <Field label="Saves (free-text)">
        <input
          value={draft.saves}
          onChange={(e) => onApply({ saves: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          placeholder="Anything extra not covered above"
        />
      </Field>
      <Field label="Skills (free-text)">
        <input
          value={draft.skills}
          onChange={(e) => onApply({ skills: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          placeholder="Expertise, tool proficiencies, situational bonuses…"
        />
      </Field>
    </div>
  );
}

// ── Skills & Saves (structured + dice integration) ────────────────────────

/** A single row in the Skills or Saves panel: pip + label + ability tag + clickable mod. */
function ProfRow({
  label,
  abilityTag,
  mod,
  profOn,
  onTogglePip,
  onRoll,
}: {
  label: string;
  abilityTag: string;
  mod: number;
  profOn: boolean;
  onTogglePip: () => void;
  onRoll: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <button
        onClick={onTogglePip}
        title={profOn ? 'Proficient — click to remove' : 'Not proficient — click to add'}
        className={`h-3 w-3 rounded-full border-2 shrink-0 transition-colors ${
          profOn ? 'border-transparent' : 'border-slate-600 hover:border-slate-400'
        }`}
        style={profOn ? { background: 'var(--ac-400)' } : undefined}
      />
      <span className="text-sm text-slate-200 flex-1 truncate">
        {label}
        <span className="text-[10px] uppercase tracking-wider text-slate-500 ml-1.5">
          {abilityTag}
        </span>
      </span>
      <button
        onClick={onRoll}
        title={`Roll 1d20 ${fmt(mod)}`}
        className="text-sm font-mono font-medium px-2 py-0.5 rounded hover:bg-slate-800 text-slate-100 flex items-center gap-1 print:hover:bg-transparent"
      >
        <Dices size={11} className="text-slate-500 print:hidden" />
        {fmt(mod)}
      </button>
    </div>
  );
}

function SkillsBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  const profs = draft.skillProfs ?? [];
  const pb = profBonus(draft.level);
  const rollFormula = useQuickDice((s) => s.rollFormula);

  const toggle = (key: string) => {
    const set = new Set(profs);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    onApply({ skillProfs: [...set] });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
      {SKILLS.map(({ key, label, ability }) => {
        const prof = profs.includes(key);
        const mod = abilityMod(draft[ability]) + (prof ? pb : 0);
        return (
          <ProfRow
            key={key}
            label={label}
            abilityTag={ability}
            mod={mod}
            profOn={prof}
            onTogglePip={() => toggle(key)}
            onRoll={() => rollFormula(`1d20 ${fmt(mod)}`, label)}
          />
        );
      })}
    </div>
  );
}

function SavesBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  const profs = draft.saveProfs ?? [];
  const pb = profBonus(draft.level);
  const rollFormula = useQuickDice((s) => s.rollFormula);

  const toggle = (a: Ability) => {
    const set = new Set(profs);
    if (set.has(a)) set.delete(a);
    else set.add(a);
    onApply({ saveProfs: [...set] });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
      {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as Ability[]).map((a) => {
        const prof = profs.includes(a);
        const mod = abilityMod(draft[a]) + (prof ? pb : 0);
        return (
          <ProfRow
            key={a}
            label={ABILITY_LABEL[a]}
            abilityTag={a}
            mod={mod}
            profOn={prof}
            onTogglePip={() => toggle(a)}
            onRoll={() => rollFormula(`1d20 ${fmt(mod)}`, `${ABILITY_LABEL[a]} save`)}
          />
        );
      })}
    </div>
  );
}

// ── Short rest popover (spends a hit die) ─────────────────────────────────

function ShortRestButton({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [lastHeal, setLastHeal] = useState<{ amount: number; die: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rollFormula = useQuickDice((s) => s.rollFormula);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClickAway);
    return () => window.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const spend = (sides: number) => {
    const rolled = Math.floor(Math.random() * sides) + 1;
    const conMod = abilityMod(draft.con);
    // Min 1 HP — a Con modifier of -1 with a roll of 1 still heals 1.
    const heal = Math.max(1, rolled + conMod);
    const newHp = Math.min(draft.maxHp, draft.hp + heal);
    onApply({
      hp: newHp,
      deathSaves: { ...DEFAULT_DEATH_SAVES },
    });
    setLastHeal({ amount: newHp - draft.hp, die: sides });
    setOpen(false);
    // Mirror the roll into QuickDice for a visible record.
    rollFormula(`1d${sides} ${fmt(conMod)}`, `Short rest (d${sides})`);
  };

  return (
    <div ref={wrapRef} className="relative flex-1">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Short rest — spend a hit die"
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
      >
        <Coffee size={13} /> Short rest
      </button>
      {lastHeal && !open && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-emerald-300 whitespace-nowrap pointer-events-none">
          +{lastHeal.amount} HP (d{lastHeal.die})
        </div>
      )}
      {open && (
        <div className="absolute bottom-full mb-2 left-0 right-0 z-30 bg-slate-900 border border-slate-700 rounded-md shadow-xl p-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 text-center">
            Spend a hit die
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[6, 8, 10, 12, 4].map((s) => (
              <button
                key={s}
                onClick={() => spend(s)}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
              >
                d{s}
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 mt-1.5 text-center">
            + CON mod ({fmt(abilityMod(draft.con))})
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gold ────────────────────────────────────────────────────────────────

const COIN_LABELS: { key: keyof import('../party/partyStore').Gold; label: string; color: string }[] = [
  { key: 'pp', label: 'PP', color: '#cbd5e1' },
  { key: 'gp', label: 'GP', color: '#fbbf24' },
  { key: 'ep', label: 'EP', color: '#a3e635' },
  { key: 'sp', label: 'SP', color: '#94a3b8' },
  { key: 'cp', label: 'CP', color: '#fb923c' },
];

function GoldBlock({
  draft,
  onApply,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
}) {
  const gold = draft.gold ?? DEFAULT_GOLD;
  return (
    <div className="grid grid-cols-5 gap-2">
      {COIN_LABELS.map(({ key, label, color }) => (
        <div key={key} className="bg-slate-950 border border-slate-800 rounded p-2 text-center">
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>
            {label}
          </div>
          <NumInput
            value={gold[key]}
            onChange={(v) => onApply({ gold: { ...gold, [key]: v } })}
            className="w-full text-center !border-transparent !bg-transparent !p-0 text-sm"
          />
        </div>
      ))}
    </div>
  );
}

// ── Layout primitives ───────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-slate-900 border border-slate-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{title}</h2>
        {subtitle && <span className="text-[10px] text-slate-600">{subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      {children}
    </label>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
  width = 'w-20',
  showSign = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  width?: string;
  showSign?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className={`bg-slate-950 border border-slate-700 rounded px-2 py-1 ${width} flex items-center justify-center text-sm text-slate-100`}>
        {showSign && value >= 0 && <span className="text-slate-500 text-xs mr-0.5">+</span>}
        <NumInput value={value} onChange={onChange} className="w-full text-center !border-transparent !bg-transparent !p-0" />
      </div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
      className={`bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700 ${className}`}
    />
  );
}
