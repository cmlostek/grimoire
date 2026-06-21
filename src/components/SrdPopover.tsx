import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Spell, Feat } from '../data/types';

/**
 * Hover-driven popover for SRD entries. Mirrors the PartyTooltip pattern —
 * fixed-position portal, soft fade hide, repositions when it would clip the
 * viewport. Used in the character builder + level-up modal so spells and feats
 * surface their full description without a navigation.
 */

const HIDE_DELAY = 150;
const POPOVER_W = 360;
const POPOVER_MAX_H = 480;

function useHoverPopover(width = POPOVER_W) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY);
  };

  const show = () => {
    cancelHide();
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      // Prefer right-of, fall back to below, clamp inside the viewport.
      const fitsRight = rect.right + width + 12 < window.innerWidth;
      const fitsLeft = rect.left - width - 12 > 0;
      let left: number;
      let top: number;
      if (fitsRight) {
        left = rect.right + 8;
        top = Math.max(8, Math.min(rect.top, window.innerHeight - POPOVER_MAX_H - 8));
      } else if (fitsLeft) {
        left = rect.left - width - 8;
        top = Math.max(8, Math.min(rect.top, window.innerHeight - POPOVER_MAX_H - 8));
      } else {
        // Stack below the trigger
        left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        top = rect.bottom + 6;
      }
      setStyle({ position: 'fixed', top, left, zIndex: 9999, width });
    }
    setVisible(true);
  };

  return { ref, visible, style, show, scheduleHide, cancelHide };
}

const LEVEL_LABEL = (n: number) => (n === 0 ? 'Cantrip' : `Level ${n}`);

export function SpellPopoverTrigger({ spell, children, className }: { spell: Spell; children: ReactNode; className?: string }) {
  const pop = useHoverPopover();
  return (
    <span
      ref={pop.ref}
      className={className}
      onMouseEnter={pop.show}
      onMouseLeave={pop.scheduleHide}
      onFocus={pop.show}
      onBlur={pop.scheduleHide}
    >
      {children}
      {pop.visible &&
        createPortal(
          <div
            className="srd-popover"
            style={pop.style}
            onMouseEnter={pop.cancelHide}
            onMouseLeave={pop.scheduleHide}
          >
            <SpellBody spell={spell} />
          </div>,
          document.body,
        )}
    </span>
  );
}

export function FeatPopoverTrigger({ feat, children, className }: { feat: Feat; children: ReactNode; className?: string }) {
  const pop = useHoverPopover();
  return (
    <span
      ref={pop.ref}
      className={className}
      onMouseEnter={pop.show}
      onMouseLeave={pop.scheduleHide}
      onFocus={pop.show}
      onBlur={pop.scheduleHide}
    >
      {children}
      {pop.visible &&
        createPortal(
          <div
            className="srd-popover"
            style={pop.style}
            onMouseEnter={pop.cancelHide}
            onMouseLeave={pop.scheduleHide}
          >
            <FeatBody feat={feat} />
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Standalone spell card body — also reused outside popover contexts when
 *  a static "themed description" panel is wanted. */
export function SpellBody({ spell }: { spell: Spell }) {
  return (
    <div className="srd-popover-inner">
      <div className="srd-popover-header">
        <div className="srd-popover-name">{spell.name}</div>
        <div className="srd-popover-sub">
          {LEVEL_LABEL(spell.level)} {spell.school.name.toLowerCase()}
          {spell.ritual && ' (ritual)'}
        </div>
      </div>
      <div className="srd-popover-stats">
        <div><span className="srd-popover-stat-label">Cast</span>{spell.casting_time}</div>
        <div><span className="srd-popover-stat-label">Range</span>{spell.range}</div>
        <div>
          <span className="srd-popover-stat-label">Comp</span>
          {spell.components.join(', ')}
          {spell.material ? ` (${spell.material.length > 40 ? spell.material.slice(0, 40) + '…' : spell.material})` : ''}
        </div>
        <div>
          <span className="srd-popover-stat-label">Dur</span>
          {spell.concentration ? 'Concentration, ' : ''}{spell.duration}
        </div>
      </div>
      <div className="srd-popover-body markdown-body">
        {spell.desc.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {spell.higher_level && spell.higher_level.length > 0 && (
          <div className="srd-popover-divider">
            <div className="srd-popover-section-label">At higher levels</div>
            {spell.higher_level.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FeatBody({ feat }: { feat: Feat }) {
  return (
    <div className="srd-popover-inner">
      <div className="srd-popover-header">
        <div className="srd-popover-name">{feat.name}</div>
        <div className="srd-popover-sub">
          {feat.category} Feat{feat.prerequisite ? ` · ${feat.prerequisite}` : ''}
        </div>
      </div>
      <div className="srd-popover-body markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{feat.desc}</ReactMarkdown>
        {feat.repeatable && (
          <div className="srd-popover-divider">
            <div className="srd-popover-section-label">Repeatable</div>
            <p className="text-xs text-slate-400">You can take this feat more than once.</p>
          </div>
        )}
      </div>
    </div>
  );
}
