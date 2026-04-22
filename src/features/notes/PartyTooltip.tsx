import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Shield, Heart } from 'lucide-react';
import type { PartyMember } from '../party/partyStore';
import { modifier } from '../../data/srd';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export function PartyRefSpan({
  member,
  children,
  className,
}: {
  member: PartyMember;
  children: ReactNode;
  className: string;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 150);
  };
  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const handleMouseEnter = () => {
    cancelHide();
    if (spanRef.current) {
      const rect = spanRef.current.getBoundingClientRect();
      const tooltipW = 264;
      const tooltipH = 190;
      const above = rect.bottom + tooltipH + 10 > window.innerHeight;
      setStyle({
        position: 'fixed',
        top: above ? rect.top - tooltipH - 6 : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - tooltipW - 8)),
        zIndex: 9999,
        width: tooltipW,
      });
    }
    setVisible(true);
  };

  const m = member;
  const hpPct = m.maxHp > 0 ? Math.min(100, (m.hp / m.maxHp) * 100) : 0;
  const hpColor = hpPct > 50 ? '#10b981' : hpPct > 25 ? '#38bdf8' : '#f87171';

  const tooltip = (
    <div
      className="party-tooltip"
      style={style}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <div className="party-tooltip-name">{m.name}</div>
      <div className="party-tooltip-sub">
        {m.classSummary} · {m.race}
        {m.owner_user_id && (
          <span className="party-tooltip-owned"> · Lv {m.level}</span>
        )}
      </div>

      <div className="party-tooltip-stats">
        <span><Shield size={11} /> AC {m.ac}</span>
        <span><Heart size={11} className="text-rose-400" /> {m.hp}/{m.maxHp}</span>
        <span>Init {m.initiativeBonus >= 0 ? '+' : ''}{m.initiativeBonus}</span>
      </div>

      <div className="party-tooltip-hp-bar">
        <div style={{ width: `${hpPct}%`, background: hpColor }} />
      </div>

      <div className="party-tooltip-abilities">
        {ABILITIES.map((a) => (
          <div key={a} className="party-tooltip-ability">
            <div className="party-tooltip-ability-label">{a.toUpperCase()}</div>
            <div className="party-tooltip-ability-score">{m[a]}</div>
            <div className="party-tooltip-ability-mod">{modifier(m[a])}</div>
          </div>
        ))}
      </div>

      {(m.passivePerception || m.passiveInvestigation || m.passiveInsight) ? (
        <div className="party-tooltip-passives">
          <span>Perc {m.passivePerception}</span>
          <span>Inv {m.passiveInvestigation}</span>
          <span>Ins {m.passiveInsight}</span>
        </div>
      ) : null}
    </div>
  );

  return (
    <span
      ref={spanRef}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={scheduleHide}
    >
      {children}
      {visible && createPortal(tooltip, document.body)}
    </span>
  );
}
