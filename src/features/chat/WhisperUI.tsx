import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ChatMember } from './chatStore';

/**
 * Detects `/w` slash command at the start of a composer value.
 * Matches: `/w`, `/w `, `/w <query>`. Does not match `/who`, `/whisper`.
 */
const WHISPER_RE = /^\/w(?:\s+(.*))?$/;

export function detectWhisperCommand(value: string): { query: string } | null {
  const m = value.match(WHISPER_RE);
  if (!m) return null;
  return { query: (m[1] ?? '').trim() };
}

/** Per-campaign "last person I whispered to" — Minecraft `/r`-style memory. */
const LAST_WHISPER_KEY = (campaignId: string) => `grimoire:chat:lastWhisper:${campaignId}`;
export function readLastWhisper(campaignId: string): string | null {
  try {
    return localStorage.getItem(LAST_WHISPER_KEY(campaignId));
  } catch {
    return null;
  }
}
export function writeLastWhisper(campaignId: string, userId: string) {
  try {
    localStorage.setItem(LAST_WHISPER_KEY(campaignId), userId);
  } catch {
    /* ignore quota / private-mode errors */
  }
}

export function WhisperBar({
  member,
  onCancel,
}: {
  member: ChatMember;
  onCancel: () => void;
}) {
  return (
    <div
      className="border-t border-b border-slate-800 px-3 py-1.5 flex items-center gap-2 text-[11px]"
      style={{ background: 'color-mix(in srgb, #a78bfa 10%, transparent)' }}
    >
      <span className="uppercase tracking-wider text-slate-500">Whispering to</span>
      <span
        className="font-medium px-1.5 py-0.5 rounded text-[12px]"
        style={{
          color: member.color,
          backgroundColor: `color-mix(in srgb, ${member.color} 22%, transparent)`,
        }}
      >
        @{member.displayName}
      </span>
      <span className="text-slate-500 ml-auto">Esc to cancel</span>
      <button
        onClick={onCancel}
        title="Cancel whisper"
        className="p-0.5 rounded text-slate-500 hover:text-rose-300 hover:bg-slate-800"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function WhisperPicker({
  candidates,
  active,
  lastRecipientId,
  onPick,
  onHover,
}: {
  candidates: ChatMember[];
  active: number;
  /** If set, the matching row is decorated with an "↩ last" hint. */
  lastRecipientId?: string | null;
  onPick: (m: ChatMember) => void;
  onHover: (i: number) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 z-40 bg-slate-900 border border-slate-700 rounded-md shadow-xl py-2 px-3 text-xs text-slate-500">
        No matching player.
      </div>
    );
  }
  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-40 bg-slate-900 border border-slate-700 rounded-md shadow-xl py-1 max-h-56 overflow-y-auto">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">
        Whisper to…
      </div>
      {candidates.map((m, i) => (
        <button
          key={m.userId}
          type="button"
          onMouseDown={(e) => {
            // mousedown so focus stays on the composer (click would blur it first)
            e.preventDefault();
            onPick(m);
          }}
          onMouseEnter={() => onHover(i)}
          className={`w-full text-left px-2 py-1 text-sm flex items-center gap-2 ${
            i === active ? 'bg-slate-800' : 'hover:bg-slate-800'
          }`}
        >
          <span
            className="h-2.5 w-2.5 rounded-full border border-slate-700 shrink-0"
            style={{ backgroundColor: m.color }}
          />
          <span className="truncate" style={{ color: m.color }}>
            {m.displayName}
          </span>
          {m.userId === lastRecipientId && (
            <span
              className="text-[9px] uppercase tracking-wider shrink-0"
              style={{ color: 'var(--ac-400)' }}
              title="Last person you whispered to"
            >
              ↩ last
            </span>
          )}
          <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-500">
            {m.role}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Mounts a global keydown listener while the picker is active. */
export function useWhisperKeyboard({
  active,
  candidates,
  highlight,
  setHighlight,
  pick,
  cancel,
}: {
  active: boolean;
  candidates: ChatMember[];
  highlight: number;
  setHighlight: (i: number | ((prev: number) => number)) => void;
  pick: (m: ChatMember) => void;
  cancel: () => void;
}) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (candidates.length === 0 ? 0 : (i + 1) % candidates.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) =>
          candidates.length === 0 ? 0 : (i - 1 + candidates.length) % candidates.length
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const m = candidates[highlight];
        if (m) pick(m);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    // Capture so we beat MentionTextarea's onSubmit handler on Enter.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [active, candidates, highlight, setHighlight, pick, cancel]);
}
