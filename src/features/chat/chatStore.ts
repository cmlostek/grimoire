import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type ChatMember = {
  userId: string;
  displayName: string;
  role: 'gm' | 'player';
  color: string;
};

export type ChatMessage = {
  id: string;
  campaignId: string;
  senderId: string;
  body: string;
  mentions: string[];
  whisperTo: string[] | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

type Row = Record<string, unknown>;

function rowToMessage(r: Row): ChatMessage {
  return {
    id: r.id as string,
    campaignId: r.campaign_id as string,
    senderId: r.sender_id as string,
    body: r.body as string,
    mentions: (r.mentions as string[] | null) ?? [],
    whisperTo: (r.whisper_to as string[] | null) ?? null,
    editedAt: (r.edited_at as string | null) ?? null,
    deletedAt: (r.deleted_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToMember(r: Row): ChatMember {
  return {
    userId: r.user_id as string,
    displayName: r.display_name as string,
    role: r.role as 'gm' | 'player',
    color: (r.color as string | null) ?? '#94a3b8',
  };
}

interface ChatState {
  /** Sorted oldest → newest. */
  messages: ChatMessage[];
  /** Members of the current campaign, keyed by user_id. */
  members: Record<string, ChatMember>;
  loaded: boolean;
  /** Ids of optimistic messages we inserted locally before realtime echo. */
  pendingIds: Set<string>;

  loadForCampaign(id: string): Promise<void>;
  subscribe(id: string): () => void;
  clear(): void;

  send(campaignId: string, body: string, opts?: { whisperTo?: string[]; mentions?: string[] }): Promise<void>;
  edit(id: string, body: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: [],
  members: {},
  loaded: false,
  pendingIds: new Set(),

  loadForCampaign: async (id) => {
    const [msgRes, memRes] = await Promise.all([
      supabase
        .from('chat_messages')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: true })
        .limit(500),
      supabase
        .from('campaign_members')
        .select('user_id, display_name, role, color')
        .eq('campaign_id', id),
    ]);

    const messages = (msgRes.data ?? []).map((r) => rowToMessage(r as Row));
    const members: Record<string, ChatMember> = {};
    for (const r of memRes.data ?? []) {
      const m = rowToMember(r as Row);
      members[m.userId] = m;
    }

    set({ messages, members, loaded: true });
  },

  subscribe: (id) => {
    const ch = supabase
      .channel(`chat:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `campaign_id=eq.${id}` },
        ({ eventType, new: r, old }) => {
          if (eventType === 'INSERT') {
            const msg = rowToMessage(r as Row);
            set((s) => {
              // Skip if optimistic insert already added this id locally.
              if (s.pendingIds.has(msg.id)) {
                const next = new Set(s.pendingIds);
                next.delete(msg.id);
                return {
                  pendingIds: next,
                  messages: s.messages.map((m) => (m.id === msg.id ? msg : m)),
                };
              }
              return { messages: [...s.messages, msg] };
            });
          } else if (eventType === 'UPDATE') {
            const msg = rowToMessage(r as Row);
            set((s) => ({ messages: s.messages.map((m) => (m.id === msg.id ? msg : m)) }));
          } else if (eventType === 'DELETE') {
            const oldId = (old as Row).id as string;
            set((s) => ({ messages: s.messages.filter((m) => m.id !== oldId) }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${id}` },
        ({ eventType, new: r, old }) => {
          if (eventType === 'DELETE') {
            const uid = (old as Row).user_id as string;
            set((s) => {
              const next = { ...s.members };
              delete next[uid];
              return { members: next };
            });
          } else {
            const m = rowToMember(r as Row);
            set((s) => ({ members: { ...s.members, [m.userId]: m } }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  },

  clear: () => set({ messages: [], members: {}, loaded: false, pendingIds: new Set() }),

  send: async (campaignId, body, opts) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Optimistic insert with client-generated id; reconciled by realtime echo.
    const tempId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: tempId,
      campaignId,
      senderId: user.id,
      body: trimmed,
      mentions: opts?.mentions ?? [],
      whisperTo: opts?.whisperTo ?? null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    set((s) => {
      const next = new Set(s.pendingIds);
      next.add(tempId);
      return { messages: [...s.messages, optimistic], pendingIds: next };
    });

    const { error } = await supabase.from('chat_messages').insert({
      id: tempId,
      campaign_id: campaignId,
      sender_id: user.id,
      body: trimmed,
      mentions: opts?.mentions ?? [],
      whisper_to: opts?.whisperTo ?? null,
    });

    if (error) {
      // Roll back the optimistic row.
      set((s) => {
        const next = new Set(s.pendingIds);
        next.delete(tempId);
        return { messages: s.messages.filter((m) => m.id !== tempId), pendingIds: next };
      });
      console.error('[chat] send failed', error);
    }
  },

  edit: async (id, body) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, body: trimmed, editedAt: new Date().toISOString() } : m
      ),
    }));
    const { error } = await supabase
      .from('chat_messages')
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('[chat] edit failed', error);
  },

  remove: async (id) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, deletedAt: new Date().toISOString() } : m
      ),
    }));
    const { error } = await supabase
      .from('chat_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('[chat] delete failed', error);
  },
}));
