import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useStore, StatBlock, StatBlockAction } from '../../store';
import { MONSTERS } from '../../data/srd';
import { modifier } from '../../data/srd';
import { Plus, Trash2, Copy, Download, Search, X, BookOpenCheck, Save } from 'lucide-react';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type Ability = (typeof ABILITIES)[number];
const ABILITY_LABEL: Record<Ability, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

const CR_XP: Record<string, number> = {
  '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100,
  '5': 1800, '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200,
  '12': 8400, '13': 10000, '14': 11500, '15': 13000, '16': 15000, '17': 18000,
  '18': 20000, '19': 22000, '20': 25000, '21': 33000, '22': 41000, '23': 50000,
  '24': 62000, '25': 75000, '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};

const uid = () => crypto.randomUUID();

export default function StatBlocks() {
  const {
    statBlocks,
    activeStatBlockId,
    createStatBlock,
    updateStatBlock,
    deleteStatBlock,
    setActiveStatBlock,
  } = useStore();

  const [importOpen, setImportOpen] = useState(false);
  const [draft, setDraft] = useState<StatBlock | null>(null);
  const [dirty, setDirty] = useState(false);

  const active = statBlocks.find((s) => s.id === activeStatBlockId) ?? null;

  // Reset draft when switching stat blocks
  useEffect(() => {
    setDraft(active);
    setDirty(false);
  }, [activeStatBlockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = draft ?? active;

  const updateField = <K extends keyof StatBlock>(key: K, value: StatBlock[K]) => {
    if (!current) return;
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setDirty(true);
  };

  const updateList = (
    list: 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions',
    next: StatBlockAction[]
  ) => {
    if (!current) return;
    setDraft((d) => (d ? { ...d, [list]: next } : d));
    setDirty(true);
  };

  const addRow = (list: 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions') => {
    if (!current) return;
    updateList(list, [...current[list], { id: uid(), name: '', desc: '' }]);
  };

  const saveDraft = () => {
    if (!draft) return;
    updateStatBlock(draft.id, draft);
    setDirty(false);
  };

  const cloneActive = () => {
    if (!current) return;
    const id = uid();
    const copy: StatBlock = { ...current, id, name: `${current.name} (copy)` };
    useStore.setState((s) => ({
      statBlocks: [...s.statBlocks, copy],
      activeStatBlockId: id,
    }));
  };

  const exportJson = () => {
    if (!current) return;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${current.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCrChange = (cr: string) => {
    if (!current) return;
    setDraft((d) => (d ? { ...d, cr, ...(CR_XP[cr] ? { xp: CR_XP[cr] } : {}) } : d));
    setDirty(true);
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Stat Blocks">
        <button
          onClick={() => setImportOpen(true)}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
        >
          <BookOpenCheck size={14} /> Import from SRD
        </button>
        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          <button
            onClick={() => createStatBlock('2014')}
            className="px-3 py-1.5 text-xs bg-slate-900 hover:bg-slate-800"
          >
            + New 2014
          </button>
          <button
            onClick={() => createStatBlock('2024')}
            className="px-3 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 border-l border-slate-800"
          >
            + New 2024
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 border-r border-slate-800 overflow-y-auto">
          {statBlocks.length === 0 && (
            <div className="p-4 text-xs text-slate-600 italic">No stat blocks yet.</div>
          )}
          {statBlocks.map((sb) => (
            <button
              key={sb.id}
              onClick={() => setActiveStatBlock(sb.id)}
              className={`w-full text-left px-3 py-2 border-b border-slate-900 ${
                sb.id === activeStatBlockId ? 'bg-slate-800' : 'hover:bg-slate-900'
              }`}
            >
              <div className="text-sm font-medium truncate">{sb.name}</div>
              <div className="text-[11px] text-slate-500">
                {sb.edition} · CR {sb.cr}
              </div>
            </button>
          ))}
        </aside>

        <section className="flex-1 min-w-0 overflow-y-auto">
          {!current ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-center px-8">
              Create a 2014 or 2024 stat block to begin, or import one from the SRD.
            </div>
          ) : (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 px-6 py-6">
              <StatBlockEditor
                sb={current}
                dirty={dirty}
                updateField={updateField}
                updateList={updateList}
                addRow={addRow}
                onClone={cloneActive}
                onExport={exportJson}
                onSave={saveDraft}
                onDelete={() => {
                  if (confirm('Delete this stat block?')) deleteStatBlock(current.id);
                }}
                onCr={handleCrChange}
              />
              <StatBlockPreview sb={current} />
            </div>
          )}
        </section>
      </div>

      {importOpen && (
        <SrdImport
          onImport={(m) => {
            const id = uid();
            const sb: StatBlock = monsterToStatBlock(m);
            sb.id = id;
            useStore.setState((s) => ({
              statBlocks: [...s.statBlocks, sb],
              activeStatBlockId: id,
            }));
            setImportOpen(false);
          }}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function monsterToStatBlock(m: (typeof MONSTERS)[number]): StatBlock {
  const ac = m.armor_class?.[0];
  const saves = (m.proficiencies ?? [])
    .filter((p) => p.proficiency.name.startsWith('Saving Throw: '))
    .map((p) => `${p.proficiency.name.replace('Saving Throw: ', '')} +${p.value}`)
    .join(', ');
  const skills = (m.proficiencies ?? [])
    .filter((p) => p.proficiency.name.startsWith('Skill: '))
    .map((p) => `${p.proficiency.name.replace('Skill: ', '')} +${p.value}`)
    .join(', ');
  const speed = Object.entries(m.speed ?? {})
    .map(([k, v]) => (k === 'walk' ? String(v) : `${k} ${v}`))
    .join(', ');
  const senses = Object.entries(m.senses ?? {})
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`)
    .join(', ');

  return {
    id: '',
    edition: '2014',
    name: m.name,
    size: m.size,
    type: m.type + (m.subtype ? ` (${m.subtype})` : ''),
    alignment: m.alignment,
    ac: ac?.value ?? 10,
    acNote: ac?.type ? `(${ac.type})` : '',
    hp: m.hit_points,
    hitDice: m.hit_points_roll ?? m.hit_dice,
    speed,
    str: m.strength,
    dex: m.dexterity,
    con: m.constitution,
    int: m.intelligence,
    wis: m.wisdom,
    cha: m.charisma,
    saves,
    skills,
    damageVulnerabilities: (m.damage_vulnerabilities ?? []).join(', '),
    damageResistances: (m.damage_resistances ?? []).join(', '),
    damageImmunities: (m.damage_immunities ?? []).join(', '),
    conditionImmunities: (m.condition_immunities ?? []).map((c) => c.name).join(', '),
    senses,
    languages: m.languages || '—',
    cr: String(m.challenge_rating),
    xp: m.xp,
    pb: m.proficiency_bonus ?? 2,
    traits: (m.special_abilities ?? []).map((a) => ({ id: uid(), name: a.name, desc: a.desc })),
    actions: (m.actions ?? []).map((a) => ({ id: uid(), name: a.name, desc: a.desc })),
    bonusActions: [],
    reactions: [],
    legendaryActions: (m.legendary_actions ?? []).map((a) => ({ id: uid(), name: a.name, desc: a.desc })),
    legendaryDesc: '',
  };
}

function SrdImport({
  onImport,
  onClose,
}: {
  onImport: (m: (typeof MONSTERS)[number]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return MONSTERS.filter((m) => !ql || m.name.toLowerCase().includes(ql)).slice(0, 300);
  }, [q]);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-950 border border-slate-800 rounded-lg w-full max-w-xl max-h-[80vh] flex flex-col"
      >
        <div className="p-3 border-b border-slate-800 flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search SRD monsters..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.map((m) => (
            <button
              key={m.index}
              onClick={() => onImport(m)}
              className="w-full text-left px-3 py-2 border-b border-slate-900 hover:bg-slate-900"
            >
              <div className="text-sm">{m.name}</div>
              <div className="text-[11px] text-slate-500">
                {m.size} {m.type} · CR {m.challenge_rating}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatBlockEditor({
  sb,
  dirty,
  updateField,
  updateList,
  addRow,
  onClone,
  onExport,
  onSave,
  onDelete,
  onCr,
}: {
  sb: StatBlock;
  dirty: boolean;
  updateField: <K extends keyof StatBlock>(k: K, v: StatBlock[K]) => void;
  updateList: (
    list: 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions',
    next: StatBlockAction[]
  ) => void;
  addRow: (list: 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions') => void;
  onClone: () => void;
  onExport: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCr: (cr: string) => void;
}) {
  const listKeys = [
    { key: 'traits', label: 'Traits' },
    { key: 'actions', label: 'Actions' },
    { key: 'bonusActions', label: 'Bonus Actions' },
    { key: 'reactions', label: 'Reactions' },
    { key: 'legendaryActions', label: 'Legendary Actions' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-500">Editor · {sb.edition}</div>
        <div className="flex gap-1">
          {dirty && (
            <button
              onClick={onSave}
              className="px-2 py-1 text-xs bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded flex items-center gap-1"
              title="Save changes"
            >
              <Save size={13} /> Save
            </button>
          )}
          <button
            onClick={onClone}
            className="p-1.5 text-xs bg-slate-900 hover:bg-slate-800 rounded"
            title="Clone"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={onExport}
            className="p-1.5 text-xs bg-slate-900 hover:bg-slate-800 rounded"
            title="Export JSON"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-xs bg-slate-900 hover:bg-rose-900 rounded text-slate-400 hover:text-rose-300"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Row label="Name">
          <input
            value={sb.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <div className="grid grid-cols-3 gap-2">
          <Row label="Size">
            <input
              value={sb.size}
              onChange={(e) => updateField('size', e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
            />
          </Row>
          <Row label="Type">
            <input
              value={sb.type}
              onChange={(e) => updateField('type', e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
            />
          </Row>
          <Row label="Alignment">
            <input
              value={sb.alignment}
              onChange={(e) => updateField('alignment', e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
            />
          </Row>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Row label="AC">
            <input
              type="number"
              value={sb.ac}
              onChange={(e) => updateField('ac', parseInt(e.target.value) || 0)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm font-mono"
            />
          </Row>
          <Row label="AC note">
            <input
              value={sb.acNote}
              onChange={(e) => updateField('acNote', e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
            />
          </Row>
          <Row label="HP">
            <input
              type="number"
              value={sb.hp}
              onChange={(e) => updateField('hp', parseInt(e.target.value) || 0)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm font-mono"
            />
          </Row>
          <Row label="Hit dice">
            <input
              value={sb.hitDice}
              onChange={(e) => updateField('hitDice', e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm font-mono"
            />
          </Row>
        </div>
        <Row label="Speed">
          <input
            value={sb.speed}
            onChange={(e) => updateField('speed', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>

        <div className="grid grid-cols-6 gap-2">
          {ABILITIES.map((a) => (
            <div key={a}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 text-center">
                {ABILITY_LABEL[a]}
              </div>
              <input
                type="number"
                value={sb[a]}
                onChange={(e) => updateField(a, parseInt(e.target.value) || 0)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-1 py-1 text-sm font-mono text-center"
              />
              <div className="text-center text-xs text-sky-300 font-mono">{modifier(sb[a])}</div>
            </div>
          ))}
        </div>

        <Row label="Saves">
          <input
            value={sb.saves}
            onChange={(e) => updateField('saves', e.target.value)}
            placeholder="STR +4, CON +6"
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Skills">
          <input
            value={sb.skills}
            onChange={(e) => updateField('skills', e.target.value)}
            placeholder="Perception +5, Stealth +7"
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Damage vulnerabilities">
          <input
            value={sb.damageVulnerabilities}
            onChange={(e) => updateField('damageVulnerabilities', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Damage resistances">
          <input
            value={sb.damageResistances}
            onChange={(e) => updateField('damageResistances', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Damage immunities">
          <input
            value={sb.damageImmunities}
            onChange={(e) => updateField('damageImmunities', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Condition immunities">
          <input
            value={sb.conditionImmunities}
            onChange={(e) => updateField('conditionImmunities', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Senses">
          <input
            value={sb.senses}
            onChange={(e) => updateField('senses', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <Row label="Languages">
          <input
            value={sb.languages}
            onChange={(e) => updateField('languages', e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
          />
        </Row>
        <div className="grid grid-cols-3 gap-2">
          <Row label="CR">
            <input
              value={sb.cr}
              onChange={(e) => onCr(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm font-mono"
            />
          </Row>
          <Row label="XP">
            <input
              type="number"
              value={sb.xp}
              onChange={(e) => updateField('xp', parseInt(e.target.value) || 0)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm font-mono"
            />
          </Row>
          <Row label="Prof bonus">
            <input
              type="number"
              value={sb.pb}
              onChange={(e) => updateField('pb', parseInt(e.target.value) || 0)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm font-mono"
            />
          </Row>
        </div>
      </div>

      {listKeys.map(({ key, label }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
            <button
              onClick={() => addRow(key)}
              className="text-xs text-sky-400/80 hover:text-sky-300 flex items-center gap-1"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          {key === 'legendaryActions' && sb.legendaryActions.length > 0 && (
            <textarea
              value={sb.legendaryDesc}
              onChange={(e) => updateField('legendaryDesc', e.target.value)}
              placeholder="Legendary action preamble (3 actions per turn)..."
              rows={2}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs mb-1 resize-none"
            />
          )}
          <div className="space-y-1">
            {sb[key].map((a, idx) => (
              <div key={a.id} className="flex gap-1 items-start">
                <div className="flex-1">
                  <input
                    value={a.name}
                    onChange={(e) => {
                      const next = [...sb[key]];
                      next[idx] = { ...a, name: e.target.value };
                      updateList(key, next);
                    }}
                    placeholder="Name"
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-sm"
                  />
                  <textarea
                    value={a.desc}
                    onChange={(e) => {
                      const next = [...sb[key]];
                      next[idx] = { ...a, desc: e.target.value };
                      updateList(key, next);
                    }}
                    placeholder="Description"
                    rows={2}
                    className="mt-1 w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs resize-none"
                  />
                </div>
                <button
                  onClick={() => {
                    updateList(
                      key,
                      sb[key].filter((x) => x.id !== a.id)
                    );
                  }}
                  className="text-slate-600 hover:text-rose-400 p-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </label>
  );
}

function StatBlockPreview({ sb }: { sb: StatBlock }) {
  const is2024 = sb.edition === '2024';
  return (
    <div className="bg-[#fbf1d8] text-[#4a2a20] rounded-md shadow-xl p-5 font-serif self-start">
      <h2 className="text-2xl text-[#7c2d12] border-b-2 border-[#7c2d12] pb-1">{sb.name}</h2>
      <div className="text-sm italic mt-0.5">
        {sb.size} {sb.type}, {sb.alignment}
      </div>

      <div className="mt-2 border-y border-[#7c2d12]/40 py-1.5 space-y-0.5 text-sm">
        <Line k="Armor Class" v={`${sb.ac}${sb.acNote ? ' ' + sb.acNote : ''}`} />
        <Line k="Hit Points" v={`${sb.hp}${sb.hitDice ? ` (${sb.hitDice})` : ''}`} />
        <Line k="Speed" v={sb.speed} />
      </div>

      <div className="mt-2 grid grid-cols-6 gap-1 text-center text-xs">
        {ABILITIES.map((a) => (
          <div key={a}>
            <div className="font-bold text-[#7c2d12]">{ABILITY_LABEL[a]}</div>
            <div className="font-mono">
              {sb[a]} ({modifier(sb[a])})
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 border-y border-[#7c2d12]/40 py-1.5 space-y-0.5 text-sm">
        {sb.saves && <Line k="Saving Throws" v={sb.saves} />}
        {sb.skills && <Line k="Skills" v={sb.skills} />}
        {sb.damageVulnerabilities && <Line k="Damage Vulnerabilities" v={sb.damageVulnerabilities} />}
        {sb.damageResistances && <Line k="Damage Resistances" v={sb.damageResistances} />}
        {sb.damageImmunities && <Line k="Damage Immunities" v={sb.damageImmunities} />}
        {sb.conditionImmunities && <Line k="Condition Immunities" v={sb.conditionImmunities} />}
        <Line k="Senses" v={sb.senses || '—'} />
        <Line k="Languages" v={sb.languages} />
        <Line
          k={is2024 ? 'CR' : 'Challenge'}
          v={`${sb.cr} (${sb.xp.toLocaleString()} XP)${is2024 ? `; PB +${sb.pb}` : ''}`}
        />
        {!is2024 && <Line k="Proficiency Bonus" v={`+${sb.pb}`} />}
      </div>

      {renderList(sb.traits, '')}
      {renderList(sb.actions, 'Actions')}
      {renderList(sb.bonusActions, 'Bonus Actions')}
      {renderList(sb.reactions, 'Reactions')}
      {sb.legendaryActions.length > 0 && (
        <div className="mt-3">
          <h3 className="text-lg text-[#7c2d12] border-b border-[#7c2d12]/60">Legendary Actions</h3>
          {sb.legendaryDesc && <p className="text-sm italic my-1">{sb.legendaryDesc}</p>}
          {sb.legendaryActions.map((a) => (
            <p key={a.id} className="text-sm my-1">
              <strong className="italic">{a.name}.</strong> {a.desc}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-1">
      <span className="font-bold">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function renderList(list: StatBlockAction[], header: string) {
  if (list.length === 0) return null;
  return (
    <div className="mt-3">
      {header && <h3 className="text-lg text-[#7c2d12] border-b border-[#7c2d12]/60 mb-1">{header}</h3>}
      {list.map((a) => (
        <p key={a.id} className="text-sm my-1">
          <strong className="italic">{a.name}.</strong> {a.desc}
        </p>
      ))}
    </div>
  );
}
