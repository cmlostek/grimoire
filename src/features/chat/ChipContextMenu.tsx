import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

type MenuState = { x: number; y: number; id: string } | null;

type Props = {
  /** The id to copy. Anything string-like — uuid for users, `kind:identifier`
   *  for catalog refs. */
  id: string;
  /** Wrapped chip content. */
  children: ReactNode;
  /** Optional click handler for left-click (e.g., navigate). */
  onClick?: () => void;
};

/**
 * Wraps a chip with a right-click context menu. v1 has one item: Copy ID.
 * Designed to be reusable later for "Copy as mention", "Open", etc.
 */
export default function ChipContextMenu({ id, children, onClick }: Props) {
  const [menu, setMenu] = useState<MenuState>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, id });
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.warn('[chat] clipboard write failed', err);
    } finally {
      setMenu(null);
    }
  };

  return (
    <>
      <span onContextMenu={onContextMenu} onClick={onClick} className={onClick ? 'cursor-pointer' : undefined}>
        {children}
      </span>
      {menu && (
        <div
          className="fixed z-50 bg-slate-900 border border-slate-700 rounded-md shadow-xl py-1 min-w-[140px]"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={copyId}
            className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 flex items-center gap-2"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy ID'}
          </button>
        </div>
      )}
    </>
  );
}
