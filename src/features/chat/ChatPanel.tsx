import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, Pencil, Trash2, Check, Palette, HelpCircle } from 'lucide-react';
import { useChat, type ChatMember, type ChatMessage } from './chatStore';
import { useChatPanel } from './chatPanelStore';
import { useSession } from '../session/sessionStore';
import MentionTextarea from './MentionTextarea';
import { extractMentionIds, parseSegments, filterMembers } from './mentions';
import { useCatalog, type CatalogKind } from './catalog';
import { useChatCatalog } from './useChatCatalog';
import { KIND_FG, KIND_PILL_BG, KIND_ICON_CHAR } from './chips';
import ChipContextMenu from './ChipContextMenu';
import {
  WhisperBar,
  WhisperPicker,
  detectWhisperCommand,
  readLastWhisper,
  writeLastWhisper,
  useWhisperKeyboard,
} from './WhisperUI';
import { useNotes } from '../notes/notesStore';
import { useNpcStore } from '../npcs/npcStore';
import { useProfiles, avatarPublicUrl } from '../profiles/profilesStore';

/**
 * Chat. Two render modes:
 *  - `variant="floating"` (default): bottom-right floating button → panel.
 *    Used on every page that doesn't have its own chat surface.
 *  - `variant="embedded"`: fills its parent, no close X, ignores open/close
 *    state. Used by the player dashboard.
 */
export default function ChatPanel({ variant = 'floating' }: { variant?: 'floating' | 'embedded' } = {}) {
  const embedded = variant === 'embedded';
  const open = useChatPanel((s) => s.open);
  const openPanel = useChatPanel((s) => s.openPanel);
  const close = useChatPanel((s) => s.close);
  const campaignId = useSession((s) => s.campaignId);
  const userId = useSession((s) => s.userId);

  const messages = useChat((s) => s.messages);
  const members = useChat((s) => s.members);
  const loaded = useChat((s) => s.loaded);
  const loadForCampaign = useChat((s) => s.loadForCampaign);
  const subscribe = useChat((s) => s.subscribe);
  const clear = useChat((s) => s.clear);
  const send = useChat((s) => s.send);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const catalog = useCatalog();
  useChatCatalog(campaignId);

  // Pull avatars for every member so message rows can render their picture.
  const profiles = useProfiles((s) => s.profiles);
  const loadProfiles = useProfiles((s) => s.loadFor);
  useEffect(() => {
    const ids = Object.keys(members);
    if (ids.length > 0) void loadProfiles(ids);
  }, [members, loadProfiles]);

  // Load + subscribe once per campaign; clear on unmount.
  useEffect(() => {
    if (!campaignId) return;
    loadForCampaign(campaignId);
    const unsub = subscribe(campaignId);
    return () => {
      unsub();
      clear();
    };
  }, [campaignId, loadForCampaign, subscribe, clear]);

  // Embedded mode is always "open" — only the floating variant has a panel state.
  const isOpen = embedded || open;

  // Auto-scroll to bottom when new messages arrive or the panel becomes visible.
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [isOpen, messages.length]);

  // Esc closes the floating panel (no-op when embedded).
  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, embedded, close]);

  if (!campaignId || !userId) return null;

  if (!embedded && !open) {
    return (
      <button
        onClick={openPanel}
        title="Party chat"
        className="fixed bottom-4 right-4 z-40 h-12 w-12 rounded-full bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 shadow-lg flex items-center justify-center"
        style={{ color: 'var(--ac-200)' }}
      >
        <MessageCircle size={20} />
      </button>
    );
  }

  const containerClass = embedded
    ? 'h-full w-full bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col'
    : 'fixed bottom-4 right-4 z-40 w-96 h-[32rem] bg-slate-950 border border-slate-700 rounded-lg shadow-2xl overflow-hidden flex flex-col';

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <MessageCircle size={14} style={{ color: 'var(--ac-400)' }} />
          <span className="font-medium">Party Chat</span>
        </div>
        <div className="flex items-center gap-1">
          <SyntaxHelp />
          {!embedded && <MyColorSwatch />}
          {!embedded && (
            <button
              onClick={close}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              title="Close (Esc)"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {!loaded && (
          <div className="text-xs text-slate-500 text-center py-6">Loading messages…</div>
        )}
        {loaded && messages.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-6">
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            msg={m}
            mine={m.senderId === userId}
            mentionsMe={m.mentions.includes(userId)}
            senderName={members[m.senderId]?.displayName ?? 'Unknown'}
            senderColor={members[m.senderId]?.color ?? '#94a3b8'}
            senderAvatarUrl={avatarPublicUrl(profiles[m.senderId]?.avatarPath ?? null)}
            members={members}
            selfId={userId}
          />
        ))}
      </div>

      <Composer
        campaignId={campaignId}
        members={Object.values(members)}
        selfId={userId}
        catalog={catalog}
        onSend={(body, opts) =>
          send(campaignId, body, {
            mentions: extractMentionIds(body),
            whisperTo: opts?.whisperTo,
          })
        }
      />
    </div>
  );
}

function MessageRow({
  msg,
  mine,
  mentionsMe,
  senderName,
  senderColor,
  senderAvatarUrl,
  members,
  selfId,
}: {
  msg: ChatMessage;
  mine: boolean;
  mentionsMe: boolean;
  senderName: string;
  senderColor: string;
  senderAvatarUrl: string | null;
  members: Record<string, ChatMember>;
  selfId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.body);
  const editMsg = useChat((s) => s.edit);
  const removeMsg = useChat((s) => s.remove);

  const isWhisper = msg.whisperTo != null;
  const isDeleted = msg.deletedAt != null;

  const time = useMemo(() => {
    const d = new Date(msg.createdAt);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [msg.createdAt]);

  const startEdit = () => {
    setDraft(msg.body);
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setDraft(msg.body);
  };
  const saveEdit = async () => {
    const next = draft.trim();
    if (!next || next === msg.body) {
      cancelEdit();
      return;
    }
    await editMsg(msg.id, next);
    setEditing(false);
  };

  if (isDeleted) {
    return (
      <div className="text-[11px] italic text-slate-600 pl-10">
        <span style={{ color: senderColor }}>{senderName}</span> deleted a message
      </div>
    );
  }

  return (
    <div
      className={`group text-sm leading-snug flex gap-2 ${
        mentionsMe ? 'border-l-2 pl-2 -ml-2' : ''
      }`}
      style={mentionsMe ? { borderColor: 'var(--ac-400)', background: 'color-mix(in srgb, var(--ac-900) 12%, transparent)' } : undefined}
    >
      <ChatAvatar url={senderAvatarUrl} color={senderColor} name={senderName} />
      <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="font-medium text-[12px]" style={{ color: senderColor }}>
          {senderName}
        </span>
        <span className="text-[10px] text-slate-600">{time}</span>
        {msg.editedAt && (
          <span className="text-[10px] text-slate-600" title={`Edited ${new Date(msg.editedAt).toLocaleString()}`}>
            (edited)
          </span>
        )}
        {isWhisper && msg.whisperTo && (
          <span className="text-[10px] text-slate-500 italic flex items-baseline gap-0.5">
            <span>whisper →</span>
            {msg.whisperTo.map((uid, i) => {
              const m = members[uid];
              const name = m?.displayName ?? 'unknown';
              const color = m?.color ?? '#94a3b8';
              return (
                <span key={uid} className="not-italic">
                  {i > 0 && <span className="text-slate-600">,</span>}
                  <span style={{ color }}>@{name}</span>
                </span>
              );
            })}
          </span>
        )}
        {mine && !editing && (
          <span className="ml-auto opacity-0 group-hover:opacity-100 flex gap-1">
            <button
              onClick={startEdit}
              className="text-slate-500 hover:text-slate-200 p-0.5"
              title="Edit"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={() => removeMsg(msg.id)}
              className="text-slate-500 hover:text-rose-300 p-0.5"
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <EditRow
          draft={draft}
          setDraft={setDraft}
          members={Object.values(members)}
          selfId={selfId}
          onSave={saveEdit}
          onCancel={cancelEdit}
        />
      ) : (
        <MessageBody body={msg.body} members={members} whisper={isWhisper} selfId={selfId} />
      )}
      </div>
    </div>
  );
}

/** Small (28px) avatar shown next to each message — image or colored initial. */
function ChatAvatar({
  url,
  color,
  name,
}: {
  url: string | null;
  color: string;
  name: string;
}) {
  const initial = (name || '?').slice(0, 1).toUpperCase();
  return (
    <div
      className="h-7 w-7 rounded-full border overflow-hidden flex items-center justify-center text-[11px] font-serif shrink-0 mt-0.5"
      style={{
        borderColor: color,
        backgroundColor: url ? '#020617' : `color-mix(in srgb, ${color} 22%, transparent)`,
        color,
      }}
      title={name}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initial}
    </div>
  );
}

function EditRow({
  draft,
  setDraft,
  members,
  selfId,
  onSave,
  onCancel,
}: {
  draft: string;
  setDraft: (v: string) => void;
  members: ChatMember[];
  selfId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const catalog = useCatalog();
  return (
    <div className="flex items-end gap-1">
      <div className="flex-1">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          members={members}
          selfId={selfId}
          catalog={catalog}
          onSubmit={onSave}
          onEscape={onCancel}
          autoFocus
        />
      </div>
      <button
        onClick={onSave}
        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
        title="Save (Enter)"
      >
        <Check size={12} />
      </button>
      <button
        onClick={onCancel}
        className="p-1 rounded text-slate-500 hover:text-slate-300"
        title="Cancel (Esc)"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function MessageBody({
  body,
  members,
  whisper,
  selfId,
}: {
  body: string;
  members: Record<string, ChatMember>;
  whisper: boolean;
  selfId: string;
}) {
  const segs = useMemo(() => parseSegments(body), [body]);
  const navigate = useNavigate();
  const setActiveNote = useNotes((s) => s.setActiveNote);
  const setActiveNpc = useNpcStore((s) => s.setActive);

  const onOpenRef = (refKind: CatalogKind, identifier: string) => {
    switch (refKind) {
      case 'note':
        setActiveNote(identifier);
        navigate('/notes');
        break;
      case 'npc':
        setActiveNpc(identifier);
        navigate('/npcs');
        break;
      case 'item':
      case 'srd-item':
        navigate('/items');
        break;
      case 'spell':
      case 'srd-spell':
        navigate('/spells');
        break;
    }
  };

  return (
    <div
      className={whisper ? 'italic text-slate-400' : 'text-slate-200'}
      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {segs.map((s, i) => {
        if (s.kind === 'text') return <span key={i}>{s.text}</span>;
        if (s.kind === 'mention') {
          const m = members[s.userId];
          const color = m?.color ?? '#94a3b8';
          const name = m?.displayName ?? s.name;
          const isSelf = s.userId === selfId;
          return (
            <ChipContextMenu key={i} id={s.userId}>
              <span
                className="inline-block rounded px-1 py-px text-[12px] font-medium align-baseline"
                style={{
                  color,
                  backgroundColor: `color-mix(in srgb, ${color} ${isSelf ? '28%' : '18%'}, transparent)`,
                }}
              >
                @{name}
              </span>
            </ChipContextMenu>
          );
        }
        // catalog reference chip
        const tokenId = `${s.refKind}:${s.identifier}`;
        return (
          <ChipContextMenu key={i} id={tokenId} onClick={() => onOpenRef(s.refKind, s.identifier)}>
            <span
              className="inline-flex items-center gap-1 rounded px-1 py-px text-[12px] font-medium align-baseline hover:brightness-125"
              style={{
                color: KIND_FG[s.refKind],
                backgroundColor: KIND_PILL_BG[s.refKind],
              }}
            >
              <span className="text-[10px]">{KIND_ICON_CHAR[s.refKind]}</span>
              {s.name}
            </span>
          </ChipContextMenu>
        );
      })}
    </div>
  );
}

function Composer({
  campaignId,
  onSend,
  members,
  selfId,
  catalog,
}: {
  campaignId: string;
  onSend: (body: string, opts?: { whisperTo?: string[] }) => void | Promise<void>;
  members: ChatMember[];
  selfId: string;
  catalog: import('./catalog').CatalogEntry[];
}) {
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [lastWhisperId, setLastWhisperId] = useState<string | null>(null);

  // Whisper target now lives in the panel store so other surfaces (e.g. the
  // dashboard Campaign Members panel) can imperatively start a whisper.
  const whisperTargetId = useChatPanel((s) => s.whisperTargetId);
  const setWhisperTargetId = useChatPanel((s) => s.setWhisperTarget);
  const whisperTo = useMemo(
    () => (whisperTargetId ? members.find((m) => m.userId === whisperTargetId) ?? null : null),
    [whisperTargetId, members]
  );

  // Hydrate last-whisper memory when switching campaigns.
  useEffect(() => {
    setLastWhisperId(readLastWhisper(campaignId));
  }, [campaignId]);

  // Only detect the slash command before a recipient is locked in. Once we
  // have a recipient, the `/w` prefix would just be ordinary message text.
  const whisperCmd = whisperTo ? null : detectWhisperCommand(value);
  const pickerActive = whisperCmd != null;

  const candidates = useMemo(() => {
    if (!whisperCmd) return [];
    const available = members.filter((m) => m.userId !== selfId);
    const matched = filterMembers(available, whisperCmd.query);
    // When the query is empty and we have a remembered recipient who's still
    // a member, hoist them to the top so Enter re-whispers (like MC's `/r`).
    if (!whisperCmd.query && lastWhisperId) {
      const last = matched.find((m) => m.userId === lastWhisperId);
      if (last) {
        const rest = matched.filter((m) => m.userId !== lastWhisperId);
        return [last, ...rest].slice(0, 8);
      }
    }
    return matched.slice(0, 8);
  }, [members, selfId, whisperCmd, lastWhisperId]);

  useEffect(() => {
    setHighlight(0);
  }, [candidates.length, whisperCmd?.query]);

  const pickWhisper = (m: ChatMember) => {
    setWhisperTargetId(m.userId);
    setLastWhisperId(m.userId);
    writeLastWhisper(campaignId, m.userId);
    setValue('');
  };
  const cancelWhisperCommand = () => {
    setValue('');
  };

  useWhisperKeyboard({
    active: pickerActive,
    candidates,
    highlight,
    setHighlight,
    pick: pickWhisper,
    cancel: cancelWhisperCommand,
  });

  // Esc clears an active whisper recipient (when the picker isn't open).
  useEffect(() => {
    if (!whisperTo || pickerActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !value) {
        e.preventDefault();
        setWhisperTargetId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [whisperTo, pickerActive, value, setWhisperTargetId]);

  const submit = async () => {
    if (pickerActive) return; // Enter is consumed by the picker
    const v = value.trim();
    if (!v) return;
    const target = whisperTo;
    setValue('');
    await onSend(v, target ? { whisperTo: [target.userId] } : undefined);
  };

  const placeholder = whisperTo
    ? `Message @${whisperTo.displayName}`
    : 'Message @party';

  return (
    <div className="border-t border-slate-800 bg-slate-900">
      {whisperTo && (
        <WhisperBar member={whisperTo} onCancel={() => setWhisperTargetId(null)} />
      )}
      <div className="relative px-2 py-2 flex items-end gap-2">
        {pickerActive && (
          <WhisperPicker
            candidates={candidates}
            active={highlight}
            lastRecipientId={lastWhisperId}
            onPick={pickWhisper}
            onHover={setHighlight}
          />
        )}
        <div className="flex-1">
          <MentionTextarea
            value={value}
            onChange={setValue}
            members={members}
            selfId={selfId}
            catalog={catalog}
            onSubmit={submit}
            placeholder={placeholder}
          />
        </div>
        <button
          onClick={submit}
          disabled={!value.trim() || pickerActive}
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200"
          title="Send (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

const COLOR_PRESETS = [
  '#94a3b8', '#f87171', '#fb923c', '#fbbf24', '#4ade80',
  '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#e879f9',
];

/**
 * Player-color swatch in the chat header. Click to open a small popover with
 * presets and a native hex picker. Stays inside the chat panel so it never
 * gets clipped by sidebar overflow. Will move to a Profile page in a future
 * pass; this is the v1.1 home.
 */
function MyColorSwatch() {
  const myColor = useSession((s) => s.myColor);
  const updateMyColor = useSession((s) => s.updateMyColor);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClickAway);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickAway);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!myColor) return null;

  const pick = (c: string) => {
    void updateMyColor(c);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Your chat color"
        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center gap-1"
      >
        <Palette size={13} />
        <span
          className="h-3 w-3 rounded-full border border-slate-700 shrink-0"
          style={{ backgroundColor: myColor }}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-slate-900 border border-slate-700 rounded-md shadow-xl p-2 w-48">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Your chat color</div>
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => pick(c)}
                className="h-6 w-6 rounded-full border border-slate-700 hover:scale-110 transition-transform"
                style={{
                  backgroundColor: c,
                  boxShadow: c === myColor ? '0 0 0 2px var(--ac-400)' : undefined,
                }}
                title={c}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400">
            <input
              type="color"
              value={myColor}
              onChange={(e) => updateMyColor(e.target.value)}
              className="h-5 w-8 bg-transparent border border-slate-700 rounded cursor-pointer"
            />
            Custom hex
          </label>
        </div>
      )}
    </div>
  );
}

/** Small "?" button in the chat header. Click reveals a syntax cheatsheet. */
function SyntaxHelp() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClickAway);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onClickAway);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Chat syntax"
        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 bg-slate-900 border border-slate-700 rounded-md shadow-xl p-3 w-60 text-[12px]">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            Chat syntax
          </div>
          <ul className="space-y-1.5 text-slate-300">
            <li>
              <span className="font-mono text-slate-100">@</span>
              <span className="text-slate-500"> — mention a player</span>
            </li>
            <li>
              <span className="font-mono text-slate-100">#</span>
              <span className="text-slate-500"> — link a note, NPC, item, spell</span>
            </li>
            <li>
              <span className="font-mono text-slate-100">/w</span>
              <span className="text-slate-500"> — whisper to a player</span>
            </li>
            <li>
              <span className="font-mono text-slate-100">/w</span>
              <span className="text-slate-500"> alone — repeat last whisper</span>
            </li>
            <li>
              <span className="font-mono text-slate-100">Right-click</span>
              <span className="text-slate-500"> a chip — copy ID</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
