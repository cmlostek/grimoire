import { create } from 'zustand';
import { supabase } from '../../lib/supabase';
import type { ShopItem } from '../../store';

type CampaignShop = {
  id: string;
  name: string;
  description: string;
  items: ShopItem[];
  visibleToPlayers: boolean;
};

type ShopRow = {
  id: string;
  campaign_id: string;
  name: string;
  description: string;
  visible_to_players: boolean;
  items: ShopItem[];
};

function rowToShop(r: ShopRow): CampaignShop {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? '',
    items: (r.items as ShopItem[]) ?? [],
    visibleToPlayers: r.visible_to_players,
  };
}

type ShopStore = {
  shops: CampaignShop[];
  activeShopId: string | null;
  loaded: boolean;

  loadForCampaign(cid: string): Promise<void>;
  subscribe(cid: string): () => void;
  clear(): void;

  createShop(cid: string, name: string): Promise<void>;
  updateShop(id: string, patch: Partial<CampaignShop>): Promise<void>;
  deleteShop(id: string): Promise<void>;
  setActiveShop(id: string | null): void;

  addShopItem(shopId: string, item: Omit<ShopItem, 'id'>): Promise<void>;
  updateShopItem(shopId: string, itemId: string, patch: Partial<ShopItem>): Promise<void>;
  removeShopItem(shopId: string, itemId: string): Promise<void>;
};

const uid = () => crypto.randomUUID();

export const useShopStore = create<ShopStore>((set, get) => ({
  shops: [],
  activeShopId: null,
  loaded: false,

  loadForCampaign: async (cid) => {
    const { data } = await supabase
      .from('shops')
      .select('*')
      .eq('campaign_id', cid)
      .order('created_at');
    set({ shops: (data ?? []).map(rowToShop), loaded: true });
  },

  subscribe: (cid) => {
    const ch = supabase
      .channel(`shops:${cid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops', filter: `campaign_id=eq.${cid}` },
        ({ eventType, new: r, old }) => {
          if (eventType === 'INSERT')
            set((s) => s.shops.some((sh) => sh.id === (r as ShopRow).id)
              ? s
              : { shops: [...s.shops, rowToShop(r as ShopRow)] });
          else if (eventType === 'UPDATE')
            set((s) => ({ shops: s.shops.map((sh) => sh.id === (r as ShopRow).id ? rowToShop(r as ShopRow) : sh) }));
          else if (eventType === 'DELETE')
            set((s) => ({
              shops: s.shops.filter((sh) => sh.id !== (old as ShopRow).id),
              activeShopId: s.activeShopId === (old as ShopRow).id ? null : s.activeShopId,
            }));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  clear: () => set({ shops: [], loaded: false, activeShopId: null }),

  createShop: async (cid, name) => {
    const { data } = await supabase
      .from('shops')
      .insert({ campaign_id: cid, name, description: '', visible_to_players: false, items: [] })
      .select()
      .single();
    if (data) {
      const shop = rowToShop(data as ShopRow);
      set((s) => ({ shops: [...s.shops, shop], activeShopId: shop.id }));
    }
  },

  updateShop: async (id, patch) => {
    const shop = get().shops.find((s) => s.id === id);
    if (!shop) return;
    const updated = { ...shop, ...patch };
    set((s) => ({ shops: s.shops.map((sh) => sh.id === id ? updated : sh) }));
    const dbPatch: Record<string, unknown> = {};
    if ('name' in patch) dbPatch.name = patch.name;
    if ('description' in patch) dbPatch.description = patch.description;
    if ('visibleToPlayers' in patch) dbPatch.visible_to_players = patch.visibleToPlayers;
    if ('items' in patch) dbPatch.items = patch.items;
    await supabase.from('shops').update(dbPatch).eq('id', id);
  },

  deleteShop: async (id) => {
    set((s) => ({
      shops: s.shops.filter((sh) => sh.id !== id),
      activeShopId: s.activeShopId === id ? null : s.activeShopId,
    }));
    await supabase.from('shops').delete().eq('id', id);
  },

  setActiveShop: (id) => set({ activeShopId: id }),

  addShopItem: async (shopId, item) => {
    const shop = get().shops.find((s) => s.id === shopId);
    if (!shop) return;
    const newItem = { ...item, id: uid() } as ShopItem;
    await get().updateShop(shopId, { items: [...shop.items, newItem] });
  },

  updateShopItem: async (shopId, itemId, patch) => {
    const shop = get().shops.find((s) => s.id === shopId);
    if (!shop) return;
    const items = shop.items.map((i) => i.id === itemId ? { ...i, ...patch } : i);
    await get().updateShop(shopId, { items });
  },

  removeShopItem: async (shopId, itemId) => {
    const shop = get().shops.find((s) => s.id === shopId);
    if (!shop) return;
    await get().updateShop(shopId, { items: shop.items.filter((i) => i.id !== itemId) });
  },
}));

export type { CampaignShop };
