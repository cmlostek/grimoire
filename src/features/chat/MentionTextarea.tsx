import { useMemo, type KeyboardEvent } from 'react';
import { MentionsInput, Mention, type SuggestionDataItem } from 'react-mentions';
import type { ChatMember } from './chatStore';
import { searchCatalog, type CatalogEntry } from './catalog';
import { KIND_PILL_BG, KIND_ICON_CHAR } from './chips';

/**
 * react-mentions sets some critical styles inline (color, padding, font),
 * which beat any CSS class we write. The `style` prop is the only reliable
 * place to set typography — and it MUST match between input and highlighter
 * or characters drift by subpixels and the pill backgrounds mis-align with
 * the visible text.
 */
const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const SHARED_TEXT = {
  fontFamily: FONT_STACK,
  fontSize: 14,
  fontWeight: 400,
  lineHeight: 1.4,
  letterSpacing: 0,
  wordSpacing: 0,
} as const;

const MENTIONS_STYLE = {
  control: { ...SHARED_TEXT, width: '100%' },
  '&multiLine': {
    control: { minHeight: 32 },
    // The library hides plain-text segments inside the highlighter
    // (visibility: hidden span) and only renders the mention pills on top.
    // So the textarea is the layer that actually shows plain text — leave
    // its color alone. Typography must match the highlighter or pill text
    // mis-aligns by a subpixel.
    highlighter: {
      ...SHARED_TEXT,
      padding: '6px 8px',
      border: '1px solid transparent',
    },
    input: {
      ...SHARED_TEXT,
      padding: '6px 8px',
      border: '1px solid var(--chat-input-border)',
      borderRadius: 6,
      background: 'var(--chat-input-bg)',
      color: 'var(--chat-input-fg)',
      outline: 'none',
      resize: 'none',
      maxHeight: 128,
      overflow: 'auto' as const,
      width: '100%',
      boxSizing: 'border-box' as const,
    },
  },
  suggestions: {
    zIndex: 50,
    backgroundColor: 'transparent',
    list: {
      backgroundColor: 'var(--chat-suggest-bg)',
      border: '1px solid var(--chat-suggest-border)',
      borderRadius: 6,
      boxShadow: '0 10px 25px rgba(0,0,0,0.45)',
      maxHeight: 240,
      overflowY: 'auto' as const,
      padding: '4px 0',
      minWidth: 220,
      fontSize: 13,
    },
    item: {
      padding: '4px 8px',
      color: 'var(--chat-suggest-fg)',
      cursor: 'pointer',
      '&focused': { backgroundColor: 'var(--chat-suggest-hover-bg)' },
    },
  },
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  members: ChatMember[];
  selfId: string;
  catalog: CatalogEntry[];
  onSubmit?: () => void;
  onEscape?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
};

type MemberItem = SuggestionDataItem & { color: string; role: 'gm' | 'player' };
type CatalogItem = SuggestionDataItem & { kind: CatalogEntry['kind']; hint?: string };

/**
 * Composer/edit input with Discord-style inline pills. Two triggers:
 *  - `@` mentions a campaign member (player or GM). Token: `@[Name](uuid)`.
 *  - `#` references game content (note/npc/item/spell, system or homebrew).
 *    Token: `#[Name](kind:identifier)`.
 *
 * Built on react-mentions so caret/paste/IME behave correctly inside a
 * single-element pill renderer.
 */
export default function MentionTextarea({
  value,
  onChange,
  members,
  selfId,
  catalog,
  onSubmit,
  onEscape,
  placeholder,
  autoFocus,
}: Props) {
  const memberItems = useMemo<MemberItem[]>(
    () =>
      members
        .filter((m) => m.userId !== selfId)
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((m) => ({ id: m.userId, display: m.displayName, color: m.color, role: m.role })),
    [members, selfId]
  );

  const onKeyDown = (e: KeyboardEvent) => {
    // react-mentions swallows Enter/Esc only when the suggestions list is open.
    // For other cases we want our handlers.
    // The library exposes whether the dropdown is open via a private aria
    // attribute; simpler heuristic: detect a visible suggestions popup.
    const dropdownOpen = !!document.querySelector('.mentions__suggestions__list');
    if (dropdownOpen) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onEscape?.();
    }
  };

  return (
    <MentionsInput
      value={value}
      onChange={(_e, newValue) => onChange(newValue)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      allowSuggestionsAboveCursor
      forceSuggestionsAboveCursor
      a11ySuggestionsListLabel="Mention suggestions"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={MENTIONS_STYLE as any}
      classNames={{
        mentions: 'mentions',
        mentions__input: 'mentions__input',
        mentions__highlighter: 'mentions__highlighter',
      }}
    >
      <Mention
        trigger="@"
        markup="@[__display__](__id__)"
        data={memberItems}
        appendSpaceOnAdd
        displayTransform={(_id, display) => `@${display}`}
        renderSuggestion={(s, _q, _hd, _i, focused) => {
          const m = s as MemberItem;
          return (
            <div className={`mention-row ${focused ? 'is-focused' : ''}`}>
              <span className="mention-row__dot" style={{ backgroundColor: m.color }} />
              <span className="mention-row__name" style={{ color: m.color }}>{m.display}</span>
              <span className="mention-row__hint">{m.role}</span>
            </div>
          );
        }}
        className="mentions__mention mentions__mention--user"
        style={{ backgroundColor: 'color-mix(in srgb, var(--ac-400) 22%, transparent)' }}
      />
      <Mention
        trigger="#"
        markup="#[__display__](__id__)"
        appendSpaceOnAdd
        displayTransform={(_id, display) => `#${display}`}
        data={(query, callback) => {
          // `#` covers notes / NPCs / items / spells. Rules are handled by
          // the separate `!` trigger below.
          const pool = catalog.filter((e) => e.kind !== 'rule');
          const results = searchCatalog(pool, query, 8).map<CatalogItem>((e) => ({
            id: e.id,
            display: e.name,
            kind: e.kind,
            hint: e.hint,
          }));
          callback(results);
        }}
        renderSuggestion={(s, _q, _hd, _i, focused) => {
          const c = s as CatalogItem;
          return (
            <div className={`mention-row ${focused ? 'is-focused' : ''}`}>
              <span
                className="mention-row__kind"
                style={{ background: KIND_PILL_BG[c.kind], color: 'var(--ac-200)' }}
              >
                {KIND_ICON_CHAR[c.kind]}
              </span>
              <span className="mention-row__name">{c.display}</span>
              {c.hint && <span className="mention-row__hint">{c.hint}</span>}
            </div>
          );
        }}
        className="mentions__mention mentions__mention--ref"
        style={{ backgroundColor: 'color-mix(in srgb, #a78bfa 22%, transparent)' }}
      />
      <Mention
        trigger="!"
        markup="![__display__](__id__)"
        appendSpaceOnAdd
        displayTransform={(_id, display) => `!${display}`}
        data={(query, callback) => {
          const pool = catalog.filter((e) => e.kind === 'rule');
          const results = searchCatalog(pool, query, 8).map<CatalogItem>((e) => ({
            id: e.id,
            display: e.name,
            kind: e.kind,
            hint: e.hint,
          }));
          callback(results);
        }}
        renderSuggestion={(s, _q, _hd, _i, focused) => {
          const c = s as CatalogItem;
          return (
            <div className={`mention-row ${focused ? 'is-focused' : ''}`}>
              <span
                className="mention-row__kind"
                style={{ background: KIND_PILL_BG.rule, color: 'var(--ac-200)' }}
              >
                {KIND_ICON_CHAR.rule}
              </span>
              <span className="mention-row__name">{c.display}</span>
              <span className="mention-row__hint">rule</span>
            </div>
          );
        }}
        className="mentions__mention mentions__mention--rule"
        style={{ backgroundColor: 'color-mix(in srgb, #f472b6 22%, transparent)' }}
      />
    </MentionsInput>
  );
}
