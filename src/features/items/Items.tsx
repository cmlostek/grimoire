import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { EQUIPMENT, MAGIC_ITEMS, EQUIPMENT_CATEGORIES, MAGIC_ITEM_RARITIES, formatCost } from '../../data/srd';
import { Search, X, FlaskConical } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { EquipmentItem, MagicItem } from '../../data/types';
import { useStore } from '../../store';
import type { HomebrewItem } from '../../store';

type Tab = 'gear' | 'magic' | 'custom';

export default function Items() {
  const [tab, setTab] = useState<Tab>('gear');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | 'all'>('all');
  const [rarity, setRarity] = useState<string | 'all'>('all');
  const [selected, setSelected] = useState<EquipmentItem | MagicItem | HomebrewItem | null>(null);
  const homebrewItems = useStore((s) => s.homebrewItems);
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return;
    if (hash.startsWith('custom-')) {
      const id = hash.slice('custom-'.length);
      const hit = homebrewItems.find((i) => i.id === id);
      if (hit) {
        setTab('custom');
        setSelected(hit);
      }
      return;
    }
    const magic = MAGIC_ITEMS.find((m) => m.index === hash);
    if (magic) {
      setTab('magic');
      setSelected(magic);
      return;
    }
    const gear = EQUIPMENT.find((e) => e.index === hash);
    if (gear) {
      setTab('gear');
      setSelected(gear);
    }
  }, [location.hash, homebrewItems]);

  const filteredGear = useMemo(() => {
    const q = query.toLowerCase().trim();
    return EQUIPMENT.filter((e) => {
      if (category !== 'all' && e.equipment_category.name !== category) return false;
      if (!q) return true;
      return e.name.toLowerCase().includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [query, category]);

  const filteredMagic = useMemo(() => {
    const q = query.toLowerCase().trim();
    return MAGIC_ITEMS.filter((m) => {
      if (rarity !== 'all' && m.rarity.name !== rarity) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.desc.join(' ').toLowerCase().includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [query, rarity]);

  const filteredCustom = useMemo(() => {
    const q = query.toLowerCase().trim();
    return homebrewItems
      .filter((i) => {
        if (rarity !== 'all' && i.rarity !== rarity) return false;
        if (!q) return true;
        return i.name.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, rarity, homebrewItems]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Items">
        <div className="flex rounded-lg overflow-hidden border border-slate-800">
          <button
            onClick={() => {
              setTab('gear');
              setSelected(null);
            }}
            className={`px-3 py-1.5 text-xs ${tab === 'gear' ? 'bg-sky-900/40 text-sky-200' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          >
            Gear ({EQUIPMENT.length})
          </button>
          <button
            onClick={() => {
              setTab('magic');
              setSelected(null);
            }}
            className={`px-3 py-1.5 text-xs ${tab === 'magic' ? 'bg-sky-900/40 text-sky-200' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          >
            Magic ({MAGIC_ITEMS.length})
          </button>
          <button
            onClick={() => {
              setTab('custom');
              setSelected(null);
            }}
            className={`px-3 py-1.5 text-xs ${tab === 'custom' ? 'bg-sky-900/40 text-sky-200' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
          >
            Custom ({homebrewItems.length})
          </button>
        </div>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-80 border-r border-slate-800 flex flex-col">
          <div className="p-3 space-y-2 border-b border-slate-800">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === 'gear' ? 'Search gear' : 'Search magic items'}
                className="w-full bg-slate-900 border border-slate-800 rounded pl-7 pr-2 py-1.5 text-sm"
              />
            </div>
            {tab === 'gear' ? (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              >
                <option value="all">All categories</option>
                {EQUIPMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
              >
                <option value="all">All rarities</option>
                {MAGIC_ITEM_RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {tab === 'custom' && (
              <Link
                to="/homebrew"
                className="block text-center px-2 py-1 text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300"
              >
                <FlaskConical size={11} className="inline mr-1" />
                Manage homebrew
              </Link>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === 'gear' &&
              filteredGear.map((e) => (
                <button
                  key={e.index}
                  onClick={() => setSelected(e)}
                  className={`w-full text-left px-3 py-2 border-b border-slate-900 ${
                    (selected as EquipmentItem | null)?.index === e.index ? 'bg-slate-800' : 'hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-medium truncate">{e.name}</div>
                    <div className="text-xs text-slate-500 shrink-0 font-mono">{formatCost(e.cost)}</div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {e.equipment_category.name}
                    {e.weapon_category ? ` · ${e.weapon_category}` : ''}
                    {e.armor_category ? ` · ${e.armor_category}` : ''}
                  </div>
                </button>
              ))}
            {tab === 'magic' &&
              filteredMagic.map((m) => (
                <button
                  key={m.index}
                  onClick={() => setSelected(m)}
                  className={`w-full text-left px-3 py-2 border-b border-slate-900 ${
                    (selected as MagicItem | null)?.index === m.index ? 'bg-slate-800' : 'hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-medium truncate">{m.name}</div>
                    <div className={`text-[10px] shrink-0 ${rarityColor(m.rarity.name)}`}>
                      {m.rarity.name}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">{m.equipment_category.name}</div>
                </button>
              ))}
            {tab === 'custom' &&
              filteredCustom.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left px-3 py-2 border-b border-slate-900 ${
                    (selected as HomebrewItem | null)?.id === c.id ? 'bg-slate-800' : 'hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <div className="text-sm font-medium truncate">{c.name || 'Unnamed'}</div>
                    {c.rarity && (
                      <div className={`text-[10px] shrink-0 ${rarityColor(c.rarity)}`}>{c.rarity}</div>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {c.category}
                    {c.campaign ? ` · ${c.campaign}` : ''}
                  </div>
                </button>
              ))}
            {((tab === 'gear' && filteredGear.length === 0) ||
              (tab === 'magic' && filteredMagic.length === 0) ||
              (tab === 'custom' && filteredCustom.length === 0)) && (
              <div className="p-4 text-xs text-slate-600 italic">
                {tab === 'custom' ? (
                  <>
                    No custom items.{' '}
                    <Link to="/homebrew" className="text-sky-400 hover:underline">
                      Create one →
                    </Link>
                  </>
                ) : (
                  'No matches.'
                )}
              </div>
            )}
          </div>
        </aside>

        <section className="flex-1 min-w-0 overflow-y-auto">
          {!selected ? (
            <div className="h-full flex items-center justify-center text-slate-500">Select an item.</div>
          ) : isHomebrew(selected) ? (
            <CustomDetail item={selected} onClose={() => setSelected(null)} />
          ) : 'rarity' in selected ? (
            <MagicDetail item={selected} onClose={() => setSelected(null)} />
          ) : (
            <GearDetail item={selected} onClose={() => setSelected(null)} />
          )}
        </section>
      </div>
    </div>
  );
}

function rarityColor(r: string) {
  switch (r) {
    case 'Common':
      return 'text-slate-300';
    case 'Uncommon':
      return 'text-emerald-400';
    case 'Rare':
      return 'text-sky-400';
    case 'Very Rare':
      return 'text-violet-400';
    case 'Legendary':
      return 'text-yellow-400';
    case 'Artifact':
      return 'text-rose-400';
    default:
      return 'text-slate-400';
  }
}

function GearDetail({ item, onClose }: { item: EquipmentItem; onClose: () => void }) {
  return (
    <div className="max-w-2xl px-8 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-serif text-3xl text-sky-200">{item.name}</h2>
          <div className="text-sm italic text-slate-400">{item.equipment_category.name}</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <Field label="Cost" value={formatCost(item.cost)} />
        {item.weight !== undefined && <Field label="Weight" value={`${item.weight} lb`} />}
        {item.weapon_category && <Field label="Weapon" value={`${item.weapon_category} ${item.weapon_range ?? ''}`} />}
        {item.damage && (
          <Field
            label="Damage"
            value={`${item.damage.damage_dice} ${item.damage.damage_type.name.toLowerCase()}`}
          />
        )}
        {item.two_handed_damage && (
          <Field
            label="Two-handed"
            value={`${item.two_handed_damage.damage_dice} ${item.two_handed_damage.damage_type.name.toLowerCase()}`}
          />
        )}
        {item.range && (item.range.normal || item.range.long) && (
          <Field label="Range" value={`${item.range.normal ?? '-'}${item.range.long ? `/${item.range.long}` : ''} ft`} />
        )}
        {item.armor_class && (
          <Field
            label="AC"
            value={`${item.armor_class.base}${item.armor_class.dex_bonus ? ' + Dex' : ''}${
              item.armor_class.max_bonus ? ` (max +${item.armor_class.max_bonus})` : ''
            }`}
          />
        )}
        {item.str_minimum !== undefined && item.str_minimum > 0 && (
          <Field label="Str Min" value={`${item.str_minimum}`} />
        )}
        {item.stealth_disadvantage && <Field label="Stealth" value="Disadvantage" />}
      </div>

      {item.properties && item.properties.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1">
          {item.properties.map((p) => (
            <span key={p.name} className="px-2 py-0.5 text-xs bg-slate-800 rounded">
              {p.name}
            </span>
          ))}
        </div>
      )}

      {item.desc && item.desc.length > 0 && (
        <div className="mt-6 space-y-3 text-slate-200 leading-relaxed">
          {item.desc.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function MagicDetail({ item, onClose }: { item: MagicItem; onClose: () => void }) {
  return (
    <div className="max-w-2xl px-8 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-serif text-3xl text-sky-200">{item.name}</h2>
          <div className={`text-sm italic ${rarityColor(item.rarity.name)}`}>
            {item.equipment_category.name} · {item.rarity.name}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
          <X size={18} />
        </button>
      </div>
      <div className="mt-6 space-y-3 text-slate-200 leading-relaxed">
        {item.desc.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
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

function isHomebrew(x: EquipmentItem | MagicItem | HomebrewItem): x is HomebrewItem {
  return (x as HomebrewItem).updatedAt !== undefined;
}

function CustomDetail({ item, onClose }: { item: HomebrewItem; onClose: () => void }) {
  return (
    <div className="max-w-2xl px-8 py-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-serif text-3xl text-sky-200">{item.name || 'Unnamed'}</h2>
          <div className={`text-sm italic ${item.rarity ? rarityColor(item.rarity) : 'text-slate-400'}`}>
            {item.category}
            {item.rarity ? ` · ${item.rarity}` : ''}
            {item.campaign ? ` · ${item.campaign}` : ''}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
          <X size={18} />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {item.priceGp !== undefined && <Field label="Price" value={`${item.priceGp} gp`} />}
        {item.weight !== undefined && <Field label="Weight" value={`${item.weight} lb`} />}
      </div>
      {item.properties && (
        <div className="mt-4 text-sm text-slate-300">
          <span className="text-slate-500 text-xs uppercase tracking-wider mr-2">Properties:</span>
          {item.properties}
        </div>
      )}
      {item.desc && (
        <div className="mt-6 text-slate-200 leading-relaxed whitespace-pre-wrap">{item.desc}</div>
      )}
      <div className="mt-6 pt-4 border-t border-slate-800 text-xs">
        <Link to="/homebrew" className="text-sky-400 hover:underline">
          Edit in Homebrew →
        </Link>
      </div>
    </div>
  );
}
