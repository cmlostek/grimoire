import { useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useStore, ShopItem } from '../../store';
import { EQUIPMENT, MAGIC_ITEMS, costToGp } from '../../data/srd';
import { Plus, Trash2, Search, Store, X, Shuffle, Swords, FlaskConical, Coins, BookOpen, Shield, Gem, Package, Eye, EyeOff } from 'lucide-react';

const SHOP_ICONS = {
  store:         { Icon: Store,         label: 'General' },
  swords:        { Icon: Swords,        label: 'Weapons' },
  flask:         { Icon: FlaskConical,  label: 'Alchemy' },
  coins:         { Icon: Coins,         label: 'Exchange' },
  book:          { Icon: BookOpen,      label: 'Scrolls' },
  shield:        { Icon: Shield,        label: 'Armor' },
  gem:           { Icon: Gem,           label: 'Jeweler' },
  package:       { Icon: Package,       label: 'Goods' },
} as const;
type ShopIconKey = keyof typeof SHOP_ICONS;

function ShopIcon({ icon, size = 14, className = '' }: { icon: string; size?: number; className?: string }) {
  const def = SHOP_ICONS[(icon as ShopIconKey)] ?? SHOP_ICONS.store;
  return <def.Icon size={size} className={className} />;
}

type PickerKind = 'gear' | 'magic' | null;

export default function Shop() {
  const {
    shops,
    activeShopId,
    createShop,
    updateShop,
    deleteShop,
    setActiveShop,
    addShopItem,
    updateShopItem,
    removeShopItem,
  } = useStore();

  const [picker, setPicker] = useState<PickerKind>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [shopQuery, setShopQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState<string | null>(null);

  const active = shops.find((s) => s.id === activeShopId) ?? null;

  const filteredItems = useMemo(() => {
    if (!active) return [];
    const q = shopQuery.toLowerCase().trim();
    if (!q) return active.items;
    return active.items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.notes ?? '').toLowerCase().includes(q)
    );
  }, [active, shopQuery]);

  const addFromPicker = (kind: 'gear' | 'magic', sourceIndex: string, name: string, priceGp: number) => {
    if (!active) return;
    addShopItem(active.id, { source: kind, sourceIndex, name, priceGp, stock: 1 });
  };

  const randomStock = () => {
    if (!active) return;
    const count = 8 + Math.floor(Math.random() * 8);
    const pool = [...EQUIPMENT].sort(() => Math.random() - 0.5).slice(0, count);
    for (const p of pool) {
      addShopItem(active.id, {
        source: 'gear',
        sourceIndex: p.index,
        name: p.name,
        priceGp: costToGp(p.cost),
        stock: 1 + Math.floor(Math.random() * 5),
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader title="Shops">
        {active && (
          <button
            onClick={randomStock}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1"
          >
            <Shuffle size={14} /> Random stock
          </button>
        )}
        <button
          onClick={() => createShop('New Shop')}
          className="px-3 py-1.5 text-xs bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold rounded flex items-center gap-1"
        >
          <Plus size={14} /> New shop
        </button>
      </PageHeader>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 border-r border-slate-800 flex flex-col">
          <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Shops</span>
            <button
              onClick={() => setShowHidden((v) => !v)}
              title={showHidden ? 'Hiding archived shops' : 'Showing archived shops'}
              className="p-0.5 text-slate-600 hover:text-slate-300"
            >
              {showHidden ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {shops.length === 0 && <div className="p-4 text-xs text-slate-600 italic">No shops yet.</div>}
            {shops.filter((s) => showHidden || !s.hidden).map((s) => (
              <div key={s.id} className={`group relative border-b border-slate-900 ${s.id === activeShopId ? 'bg-slate-800' : 'hover:bg-slate-900'}`}>
                <button
                  onClick={() => setActiveShop(s.id)}
                  className="w-full text-left px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <ShopIcon icon={s.icon ?? 'store'} size={14} className={`${s.hidden ? 'text-slate-600' : 'text-sky-400/70'}`} />
                    <div className={`text-sm font-medium truncate ${s.hidden ? 'text-slate-500 italic' : ''}`}>{s.name}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{s.items.length} items</div>
                </button>
                {/* Icon picker (shown for active shop) */}
                {s.id === activeShopId && showIconPicker === s.id && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowIconPicker(null)} />
                    <div className="absolute left-full top-0 ml-1 z-30 bg-slate-900 border border-slate-700 rounded-lg p-2 grid grid-cols-4 gap-1 shadow-xl">
                      {(Object.entries(SHOP_ICONS) as [ShopIconKey, typeof SHOP_ICONS[ShopIconKey]][]).map(([key, { Icon, label }]) => (
                        <button
                          key={key}
                          onClick={() => { updateShop(s.id, { icon: key }); setShowIconPicker(null); }}
                          title={label}
                          className={`flex flex-col items-center gap-0.5 p-1.5 rounded transition-colors hover:bg-slate-800 ${(s.icon ?? 'store') === key ? 'bg-slate-700' : ''}`}
                        >
                          <Icon size={14} className="text-sky-400" />
                          <span className="text-[8px] text-slate-500">{label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {/* Hover actions */}
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowIconPicker(showIconPicker === s.id ? null : s.id); }}
                    title="Change icon"
                    className="p-1 text-slate-600 hover:text-slate-300 hover:bg-slate-800 rounded"
                  >
                    <ShopIcon icon={s.icon ?? 'store'} size={10} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); updateShop(s.id, { hidden: !s.hidden }); }}
                    title={s.hidden ? 'Restore shop' : 'Archive shop'}
                    className="p-1 text-slate-600 hover:text-amber-400 hover:bg-slate-800 rounded"
                  >
                    {s.hidden ? <Eye size={10} /> : <EyeOff size={10} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 min-w-0 overflow-y-auto">
          {!active ? (
            <div className="h-full flex items-center justify-center text-slate-500">
              Create or select a shop.
            </div>
          ) : (
            <div className="px-8 py-6 max-w-4xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <input
                    value={active.name}
                    onChange={(e) => updateShop(active.id, { name: e.target.value })}
                    className="font-serif text-3xl text-sky-200 bg-transparent outline-none w-full"
                  />
                  <textarea
                    value={active.description}
                    onChange={(e) => updateShop(active.id, { description: e.target.value })}
                    placeholder="Description, proprietor, flavor..."
                    rows={2}
                    className="mt-2 w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm resize-none"
                  />
                </div>
                <button
                  onClick={() => {
                    if (confirm('Delete this shop?')) deleteShop(active.id);
                  }}
                  className="text-slate-500 hover:text-rose-400 p-1"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  onClick={() => setPicker('gear')}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded"
                >
                  + Add gear from SRD
                </button>
                <button
                  onClick={() => setPicker('magic')}
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded"
                >
                  + Add magic item
                </button>
                <button
                  onClick={() =>
                    addShopItem(active.id, {
                      source: 'custom',
                      name: 'Custom item',
                      priceGp: 1,
                      stock: 1,
                    })
                  }
                  className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded"
                >
                  + Custom
                </button>
              </div>

              <div className="mt-4 relative">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  value={shopQuery}
                  onChange={(e) => setShopQuery(e.target.value)}
                  placeholder="Search items in this shop"
                  className="w-full bg-slate-900 border border-slate-800 rounded pl-7 pr-8 py-1.5 text-sm"
                />
                {shopQuery && (
                  <button
                    onClick={() => setShopQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="mt-3 border border-slate-800 rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
                  <div>Item</div>
                  <div className="w-36 text-right">Price (gp)</div>
                  <div className="w-28 text-right">Stock</div>
                  <div className="w-32">Notes</div>
                  <div className="w-8" />
                </div>
                {active.items.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-600 italic">
                    Shop is empty.
                  </div>
                )}
                {active.items.length > 0 && filteredItems.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-600 italic">
                    No items match “{shopQuery}”.
                  </div>
                )}
                {filteredItems.map((i) => (
                  <div
                    key={i.id}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-2 border-t border-slate-900 items-center"
                  >
                    <input
                      value={i.name}
                      onChange={(e) => updateShopItem(active.id, i.id, { name: e.target.value })}
                      className="bg-transparent outline-none text-sm"
                    />
                    <Stepper
                      value={i.priceGp}
                      step={1}
                      min={0}
                      width="w-16"
                      decimal
                      onChange={(v) => updateShopItem(active.id, i.id, { priceGp: v })}
                    />
                    <Stepper
                      value={i.stock}
                      step={1}
                      min={0}
                      width="w-12"
                      onChange={(v) => updateShopItem(active.id, i.id, { stock: v })}
                    />
                    <input
                      value={i.notes ?? ''}
                      onChange={(e) => updateShopItem(active.id, i.id, { notes: e.target.value })}
                      placeholder="—"
                      className="w-32 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => removeShopItem(active.id, i.id)}
                      className="text-slate-600 hover:text-rose-400 p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {active.items.length > 0 && (
                  <div className="px-3 py-2 bg-slate-900/50 text-xs font-mono text-slate-400 border-t border-slate-800 flex justify-between">
                    <span>
                      {shopQuery
                        ? `${filteredItems.length} of ${active.items.length} items`
                        : `${active.items.length} items`}
                    </span>
                    <span>
                      Total value:{' '}
                      {active.items.reduce((s, i) => s + i.priceGp * i.stock, 0).toFixed(2)} gp
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {picker && active && (
        <ItemPicker
          kind={picker}
          query={pickerQuery}
          setQuery={setPickerQuery}
          onPick={(kind, idx, name, priceGp) => {
            addFromPicker(kind, idx, name, priceGp);
          }}
          onClose={() => {
            setPicker(null);
            setPickerQuery('');
          }}
        />
      )}
    </div>
  );
}

function Stepper({
  value,
  step,
  min,
  width,
  decimal,
  onChange,
}: {
  value: number;
  step: number;
  min?: number;
  width: string;
  decimal?: boolean;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => (min !== undefined ? Math.max(min, n) : n);
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => onChange(clamp(value - step))}
        className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
      >
        −
      </button>
      <input
        type="number"
        step={decimal ? '0.01' : '1'}
        value={value}
        onChange={(e) =>
          onChange(clamp(decimal ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0))
        }
        className={`${width} bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-right font-mono text-xs`}
      />
      <button
        onClick={() => onChange(clamp(value + step))}
        className="w-6 h-6 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
      >
        +
      </button>
    </div>
  );
}

function ItemPicker({
  kind,
  query,
  setQuery,
  onPick,
  onClose,
}: {
  kind: 'gear' | 'magic';
  query: string;
  setQuery: (s: string) => void;
  onPick: (kind: 'gear' | 'magic', idx: string, name: string, priceGp: number) => void;
  onClose: () => void;
}) {
  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (kind === 'gear') {
      return EQUIPMENT.filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 300);
    }
    return MAGIC_ITEMS.filter((m) => !q || m.name.toLowerCase().includes(q)).slice(0, 300);
  }, [kind, query]);

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-950 border border-slate-800 rounded-lg w-full max-w-xl max-h-[80vh] flex flex-col"
      >
        <div className="p-3 border-b border-slate-800 flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${kind === 'gear' ? 'gear' : 'magic items'}...`}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {results.map((r: any) => {
            const price = kind === 'gear' ? costToGp(r.cost) : 0;
            return (
              <button
                key={r.index}
                onClick={() => {
                  onPick(kind, r.index, r.name, price);
                }}
                className="w-full text-left px-3 py-2 border-b border-slate-900 hover:bg-slate-900 flex items-center justify-between gap-2"
              >
                <div>
                  <div className="text-sm">{r.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {kind === 'gear' ? r.equipment_category?.name : r.rarity?.name}
                  </div>
                </div>
                {kind === 'gear' && (
                  <div className="text-xs font-mono text-slate-400">{price} gp</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
