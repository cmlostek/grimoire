import { useEffect, useState } from 'react';
import { Save, Printer, BedDouble, Coffee, Heart } from 'lucide-react';
import {
  DEFAULT_DEATH_SAVES,
  DEFAULT_GOLD,
  type PartyMember,
} from '../party/partyStore';

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

  const shortRest = () => {
    // Phase A: clear death saves (you're conscious again) but leave HP alone —
    // 5e short rests grant hit-die healing, which we'll wire properly in Phase B.
    apply({ deathSaves: { ...DEFAULT_DEATH_SAVES } });
  };

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
          <VitalsBlock draft={draft} onApply={apply} onShortRest={shortRest} onLongRest={longRest} />
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

        <Card title="Saves, skills & languages">
          <TextFieldsBlock draft={draft} onApply={apply} />
        </Card>

        <Card title="Coin purse">
          <GoldBlock draft={draft} onApply={apply} />
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
  onShortRest,
  onLongRest,
}: {
  draft: PartyMember;
  onApply: (p: Partial<PartyMember>) => void;
  onShortRest: () => void;
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
        <button
          onClick={onShortRest}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
          title="Short rest (clears death saves)"
        >
          <Coffee size={13} /> Short rest
        </button>
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
  return (
    <div className="space-y-3">
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
  return (
    <div className="grid grid-cols-3 gap-2">
      <LabeledNumber
        label="Perception"
        value={draft.passivePerception}
        onChange={(v) => onApply({ passivePerception: v })}
        width="w-full"
      />
      <LabeledNumber
        label="Investigation"
        value={draft.passiveInvestigation}
        onChange={(v) => onApply({ passiveInvestigation: v })}
        width="w-full"
      />
      <LabeledNumber
        label="Insight"
        value={draft.passiveInsight}
        onChange={(v) => onApply({ passiveInsight: v })}
        width="w-full"
      />
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
      <Field label="Save proficiencies">
        <input
          value={draft.saves}
          onChange={(e) => onApply({ saves: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          placeholder="e.g. STR +5, CON +4"
        />
      </Field>
      <Field label="Skill proficiencies">
        <input
          value={draft.skills}
          onChange={(e) => onApply({ skills: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          placeholder="e.g. Athletics +5, Perception +3"
        />
      </Field>
      <Field label="Languages">
        <input
          value={draft.languages}
          onChange={(e) => onApply({ languages: e.target.value })}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-sky-700"
          placeholder="e.g. Common, Elvish, Thieves' Cant"
        />
      </Field>
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
