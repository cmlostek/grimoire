import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { SPELLS, SPELL_SCHOOLS, SPELL_LEVELS } from '../../data/srd';
import { Search, X, FlaskConical } from 'lucide-react';
import type { Spell } from '../../data/types';
import { useStore } from '../../store';
import type { HomebrewSpell } from '../../store';
import { useSession } from '../session/sessionStore';
import { useSharedHomebrew } from '../homebrew/sharedHomebrewStore';

type Source = 'all' | 'srd' | 'custom';

type UnifiedSpell = {
  kind: 'srd' | 'custom';
  id: string;
  name: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  campaign?: string;
  srd?: Spell;
  custom?: HomebrewSpell;
};

const LEVEL_LABEL = (n: number) => (n === 0 ? 'Cantrip' : `${ordinal(n)} level`);
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function Spells() {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | 'all'>('all');
  const [school, setSchool] = useState<string | 'all'>('all');
  const [onlyRitual, setOnlyRitual] = useState(false);
  const [onlyConcentration, setOnlyConcentration] = useState(false);
  const [source, setSource] = useState<Source>('all');
  const [selected, setSelected] = useState<UnifiedSpell | null>(null);

  const localHomebrewSpells = useStore((s) => s.homebrewSpells);
  const role = useSession((s) => s.role);
  const campaignId = useSession((s) => s.campaignId);
  const sharedSpells = useSharedHomebrew((s) => s.spells);
  const loadShared = useSharedHomebrew((s) => s.loadForCampaign);
  const subscribeShared = useSharedHomebrew((s) => s.subscribe);
  const location = useLocation();

  useEffect(() => {
    if (!campaignId) return;
    loadShared(campaignId);
    const unsub = subscribeShared(campaignId);
    return unsub;
  }, [campaignId, loadShared, subscribeShared]);

  const homebrewSpells = useMemo<HomebrewSpell[]>(() => {
    if (role === 'gm') return localHomebrewSpells;
    return sharedSpells.map((r) => {
      const d = r.data as Record<string, unknown>;
      return {
        id: `shared-${r.id}`,
        campaign: (d.campaign as string) ?? '',
        name: r.name,
        level: (d.level as number) ?? 0,
        school: (d.school as string) ?? 'Evocation',
        castingTime: (d.castingTime as string) ?? '1 action',
        range: (d.range as string) ?? '',
        components: (d.components as string) ?? '',
        duration: (d.duration as string) ?? '',
        ritual: Boolean(d.ritual),
        concentration: Boolean(d.concentration),
        classes: (d.classes as string) ?? '',
        desc: (d.desc as string) ?? '',
        higherLevel: d.higherLevel as string | undefined,
        updatedAt: Date.now(),
      };
    });
  }, [role, localHomebrewSpells, sharedSpells]);

  useEffect(() => {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash.startsWith('custom-')) {
      const id = hash.slice('custom-'.length);
      const hit = homebrewSpells.find((sp) => sp.id === id);
      if (hit) {
        setSource('custom');
        setSelected({
          kind: 'custom',
          id: hit.id,
          name: hit.name,
          level: hit.level,
          school: hit.school,
          ritual: hit.ritual,
          concentration: hit.concentration,
          campaign: hit.campaign,
          custom: hit,
        });
      }
      return;
    }
    const srd = SPELLS.find((s) => s.index === hash);
    if (srd) {
      setSource((prev) => (prev === 'custom' ? 'all' : prev));
      setSelected({
        kind: 'srd',
        id: srd.index,
        name: srd.name,
        level: srd.level,
        school: srd.school.name,
        ritual: srd.ritual,
        concentration: srd.concentration,
        srd,
      });
    }
  }, [location.hash, homebrewSpells]);

  const unified = useMemo<UnifiedSpell[]>(() => {
    const srd: UnifiedSpell[] =
      source === 'custom'
        ? []
        : SPELLS.map((s) => ({
            kind: 'srd',
            id: s.index,
            name: s.name,
            level: s.level,
            school: s.school.name,
            ritual: s.ritual,
            concentration: s.concentration,
            srd: s,
          }));
    const custom: UnifiedSpell[] =
      source === 'srd'
        ? []
        : homebrewSpells.map((sp) => ({
            kind: 'custom',
            id: sp.id,
            name: sp.name,
            level: sp.level,
            school: sp.school,
            ritual: sp.ritual,
            concentration: sp.concentration,
            campaign: sp.campaign,
            custom: sp,
          }));
    return [...srd, ...custom];
  }, [source, homebrewSpells]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return unified
      .filter((s) => {
        if (level !== 'all' && s.level !== level) return false;
        if (school !== 'all' && s.school !== school) return false;
        if (onlyRitual && !s.ritual) return false;
        if (onlyConcentration && !s.concentration) return false;
        if (!q) return true;
        const body =
          s.kind === 'srd' ? s.srd!.desc.join(' ') : s.custom!.desc;
        return s.name.toLowerCase().includes(q) || body.toLowerCase().includes(q);
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [unified, query, level, school, onlyRitual, onlyConcentration]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Spells">
        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          {(['all', 'srd', 'custom'] as Source[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSource(s);
                setSelected(null);
              }}
              className={`px-3 py-1.5 text-xs capitalize ${
                source === s
                  ? 'bg-sky-900/40 text-sky-200'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {s === 'all' ? 'All' : s === 'srd' ? `SRD (${SPELLS.length})` : `Custom (${homebrewSpells.length})`}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 font-mono">{filtered.length}</div>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-72 border-r border-slate-800 flex flex-col">
          <div className="p-3 space-y-2 border-b border-slate-800">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search spells"
                className="w-full bg-slate-900 border border-slate-800 rounded pl-7 pr-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              >
                <option value="all">All levels</option>
                {SPELL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL(l)}
                  </option>
                ))}
              </select>
              <select
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              >
                <option value="all">All schools</option>
                {SPELL_SCHOOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 text-xs text-slate-400">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={onlyRitual} onChange={(e) => setOnlyRitual(e.target.checked)} />
                Ritual
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={onlyConcentration}
                  onChange={(e) => setOnlyConcentration(e.target.checked)}
                />
                Concentration
              </label>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={`${s.kind}-${s.id}`}
                onClick={() => setSelected(s)}
                className={`w-full text-left px-3 py-2 border-b border-slate-900 ${
                  selected?.kind === s.kind && selected?.id === s.id
                    ? 'bg-slate-800'
                    : 'hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-1">
                  <div className="text-sm font-medium flex-1">{s.name}</div>
                  {s.kind === 'custom' && (
                    <FlaskConical size={11} className="text-sky-400 shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {LEVEL_LABEL(s.level)} · {s.school}
                  {s.ritual && ' · R'}
                  {s.concentration && ' · C'}
                  {s.campaign && ` · ${s.campaign}`}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-xs text-slate-600 italic">
                {source === 'custom' ? (
                  role === 'gm' ? (
                    <>
                      No custom spells.{' '}
                      <Link to="/homebrew" className="text-sky-400 hover:underline">
                        Create one →
                      </Link>
                    </>
                  ) : (
                    <>No custom spells shared yet.</>
                  )
                ) : (
                  'No matches.'
                )}
              </div>
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              Select a spell to view details.
            </div>
          ) : selected.kind === 'srd' ? (
            <SrdDetail spell={selected.srd!} onClose={() => setSelected(null)} />
          ) : (
            <CustomDetail spell={selected.custom!} onClose={() => setSelected(null)} canEdit={role === 'gm'} />
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500 text-xs uppercase tracking-wider">{label}: </span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

function SrdDetail({ spell, onClose }: { spell: Spell; onClose: () => void }) {
  return (
    <div className="max-w-3xl px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-sky-200">{spell.name}</h2>
          <div className="text-sm italic text-slate-400">
            {LEVEL_LABEL(spell.level)} {spell.school.name.toLowerCase()}
            {spell.ritual && ' (ritual)'}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Casting Time" value={spell.casting_time} />
        <Field label="Range" value={spell.range} />
        <Field
          label="Components"
          value={spell.components.join(', ') + (spell.material ? ` (${spell.material})` : '')}
        />
        <Field
          label="Duration"
          value={(spell.concentration ? 'Concentration, ' : '') + spell.duration}
        />
        {spell.attack_type && <Field label="Attack" value={spell.attack_type} />}
        {spell.dc?.dc_type && (
          <Field
            label="Save"
            value={`${spell.dc.dc_type.name}${spell.dc.dc_success ? ` (${spell.dc.dc_success})` : ''}`}
          />
        )}
      </div>

      <div className="mt-6 space-y-3 text-slate-200 leading-relaxed">
        {spell.desc.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {spell.higher_level && spell.higher_level.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wider text-sky-400/70 mb-2">
            At higher levels
          </div>
          {spell.higher_level.map((p, i) => (
            <p key={i} className="text-slate-200">
              {p}
            </p>
          ))}
        </div>
      )}

      {spell.classes && spell.classes.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-800 text-sm text-slate-400">
          <span className="text-slate-500">Classes: </span>
          {spell.classes.map((c) => c.name).join(', ')}
        </div>
      )}
    </div>
  );
}

function CustomDetail({ spell, onClose, canEdit }: { spell: HomebrewSpell; onClose: () => void; canEdit: boolean }) {
  return (
    <div className="max-w-3xl px-8 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-serif text-3xl text-sky-200">{spell.name || 'Unnamed'}</h2>
            <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wider bg-sky-900/40 text-sky-300 rounded">
              Homebrew
            </span>
          </div>
          <div className="text-sm italic text-slate-400">
            {LEVEL_LABEL(spell.level)} {spell.school.toLowerCase()}
            {spell.ritual && ' (ritual)'}
            {spell.campaign && ` · ${spell.campaign}`}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Field label="Casting Time" value={spell.castingTime} />
        <Field label="Range" value={spell.range} />
        <Field label="Components" value={spell.components} />
        <Field
          label="Duration"
          value={(spell.concentration ? 'Concentration, ' : '') + spell.duration}
        />
      </div>

      {spell.desc && (
        <div className="mt-6 text-slate-200 leading-relaxed whitespace-pre-wrap">{spell.desc}</div>
      )}

      {spell.higherLevel && (
        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wider text-sky-400/70 mb-2">
            At higher levels
          </div>
          <p className="text-slate-200 whitespace-pre-wrap">{spell.higherLevel}</p>
        </div>
      )}

      {spell.classes && (
        <div className="mt-6 pt-4 border-t border-slate-800 text-sm text-slate-400">
          <span className="text-slate-500">Classes: </span>
          {spell.classes}
        </div>
      )}

      {canEdit && (
        <div className="mt-6 pt-4 border-t border-slate-800 text-xs">
          <Link to="/homebrew" className="text-sky-400 hover:underline">
            Edit in Homebrew →
          </Link>
        </div>
      )}
    </div>
  );
}
