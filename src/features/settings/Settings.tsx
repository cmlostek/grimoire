import { useState } from 'react';
import {
  Sun,
  Moon,
  Eye,
  EyeOff,
  ArrowLeftRight,
  LogOut,
  RotateCcw,
  GripVertical,
  LayoutDashboard,
  Swords,
  Users,
  NotebookPen,
  BookMarked,
  Map as MapIcon,
  Sparkles,
  Package,
  ScrollText,
  FlaskConical,
  Mic,
  BookOpen,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import { useSession } from '../session/sessionStore';
import { useCampaignSettings } from '../notes/campaignSettingsStore';
import { useTheme } from '../session/themeStore';
import { useSidebar } from '../session/sidebarStore';
import { useNavCustomization } from '../../hooks/useNavCustomization';

// Mirrors the nav array in App.tsx — kept here so the Customize-nav panel can
// list / reorder the same items the sidebar shows. Keep these in sync.
type NavItem = { to: string; label: string; icon: React.ComponentType<{ size?: number }>; gmOnly?: boolean };
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/initiative', label: 'Initiative', icon: Swords },
  { to: '/party', label: 'Party', icon: Users },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/npcs', label: 'NPCs', icon: BookMarked },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/spells', label: 'Spells', icon: Sparkles },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/statblocks', label: 'Stat Blocks', icon: ScrollText, gmOnly: true },
  { to: '/homebrew', label: 'Homebrew', icon: FlaskConical, gmOnly: true },
  { to: '/record', label: 'Record', icon: Mic, gmOnly: true },
  { to: '/rules', label: 'Rules', icon: BookOpen },
];

export default function Settings() {
  const role = useSession((s) => s.role);
  const viewAsPlayer = useSession((s) => s.viewAsPlayer);
  const setViewAsPlayer = useSession((s) => s.setViewAsPlayer);
  const leaveCurrent = useSession((s) => s.leaveCurrent);
  const signOut = useSession((s) => s.signOut);
  const { mode, toggle: toggleMode } = useTheme();
  const hoverExpand = useSidebar((s) => s.hoverExpand);
  const setHoverExpand = useSidebar((s) => s.setHoverExpand);

  const togglePage = useCampaignSettings((s) => s.togglePage);
  const toggleGmPage = useCampaignSettings((s) => s.toggleGmPage);
  const hideAll = useCampaignSettings((s) => s.hideAll);
  const showAll = useCampaignSettings((s) => s.showAll);
  const hiddenPages = useCampaignSettings((s) => s.settings.hiddenPages);
  const allowedGmPages = useCampaignSettings((s) => s.settings.allowedGmPages ?? []);
  const hpRollingMethod = useCampaignSettings((s) => s.settings.hpRollingMethod);
  const setHpRollingMethod = useCampaignSettings((s) => s.setHpRollingMethod);

  const trueIsGM = role === 'gm' || role === 'cogm';
  const isGM = trueIsGM && !viewAsPlayer;

  // Role-aware nav list for customization (matches what App.tsx renders).
  const customNav = useNavCustomization();
  const visibleByRole = NAV.filter((n) => {
    const slug = n.to.replace('/', '');
    if (isGM) return true;
    if (n.gmOnly) return allowedGmPages.includes(slug);
    return !hiddenPages.includes(slug);
  });
  const editableNav = customNav.apply(visibleByRole, { includeHidden: true });

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title="Settings" />
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-8">
        <Section title="Display">
          <Row
            icon={mode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleMode}
          />
          <SwitchRow
            label="Auto-expand sidebar"
            hint={
              hoverExpand
                ? 'Sidebar grows to full width when you hover or focus it.'
                : 'Sidebar stays as a narrow icon rail; hover over icons for labels.'
            }
            checked={hoverExpand}
            onChange={setHoverExpand}
          />
        </Section>

        <Section title="Navigation">
          <p className="text-xs text-slate-500 mb-3">
            Reorder or hide pages in your sidebar. Personal — doesn't affect other players.
          </p>
          <CustomizeNavBody
            items={editableNav}
            hidden={customNav.hidden}
            onReorder={(next) => customNav.setOrder(next.map((i) => i.to))}
            onToggleHidden={(path) => customNav.toggleHidden(path)}
            onReset={customNav.reset}
          />
        </Section>

        {isGM && (
          <Section title="Player visibility">
            <p className="text-xs text-slate-500 mb-3">
              Show or hide pages from players in this campaign. GM-only pages can be shared with players.
            </p>
            <PlayerVisibilityBody
              nav={NAV}
              hiddenPages={hiddenPages}
              allowedGmPages={allowedGmPages}
              onTogglePage={togglePage}
              onToggleGmPage={toggleGmPage}
              onHideAll={() => hideAll(NAV.filter((n) => !n.gmOnly).map((n) => n.to.replace('/', '')))}
              onShowAll={showAll}
            />
          </Section>
        )}

        {isGM && (
          <Section title="House rules">
            <div className="px-4 py-3 border-b border-slate-800 last:border-b-0">
              <div className="text-sm text-slate-200">HP on level-up</div>
              <div className="text-[11px] text-slate-500 font-normal mb-2">
                How characters gain HP when leveling. Level-up modal defaults to this; players can still override per-level.
              </div>
              <div className="flex rounded overflow-hidden border border-slate-700 w-fit">
                {(['avg', 'roll', 'manual'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setHpRollingMethod(m)}
                    className={`px-3 py-1 text-xs ${
                      hpRollingMethod === m
                        ? 'bg-sky-900/40 text-sky-200'
                        : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {m === 'avg' ? 'Take average' : m === 'roll' ? 'Roll the die' : 'Manual entry'}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        )}

        {trueIsGM && (
          <Section title="GM tools">
            <Row
              icon={<Eye size={14} />}
              label={viewAsPlayer ? 'Exit player view' : 'View as player'}
              hint={
                viewAsPlayer
                  ? 'Currently previewing what players see.'
                  : 'Preview the campaign as a regular player.'
              }
              onClick={() => setViewAsPlayer(!viewAsPlayer)}
            />
          </Section>
        )}

        <Section title="Account">
          <Row icon={<ArrowLeftRight size={14} />} label="Switch campaign" onClick={leaveCurrent} />
          <Row icon={<LogOut size={14} />} label="Sign out" onClick={signOut} danger />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{title}</h2>
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  // Track 40px wide, thumb 16px, 2px padding each side: off=left:2, on=left:22
  // (40 - 16 - 2 = 22). Using fixed offsets so the thumb stays fully inside
  // the pill in both states without relying on arbitrary translate values.
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800/40 border-b border-slate-800 last:border-b-0"
    >
      <span className="flex-1 text-left">
        {label}
        {hint && <span className="block text-[11px] text-slate-500 font-normal">{hint}</span>}
      </span>
      <span
        className={`relative inline-block h-5 w-10 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-sky-600' : 'bg-slate-700'
        }`}
        aria-hidden
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </span>
    </button>
  );
}

function Row({
  icon,
  label,
  hint,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm border-b border-slate-800 last:border-b-0 ${
        danger ? 'text-rose-300 hover:bg-rose-950/30' : 'text-slate-200 hover:bg-slate-800/40'
      }`}
    >
      <span className={danger ? 'text-rose-400' : 'text-slate-400'}>{icon}</span>
      <span className="flex-1 text-left">
        {label}
        {hint && <span className="block text-[11px] text-slate-500 font-normal">{hint}</span>}
      </span>
    </button>
  );
}

// ── Customize nav (drag to reorder, click to hide) ────────────────────────

function CustomizeNavBody({
  items,
  hidden,
  onReorder,
  onToggleHidden,
  onReset,
}: {
  items: { to: string; label: string; icon: React.ComponentType<{ size?: number }> }[];
  hidden: string[];
  onReorder: (next: { to: string; label: string; icon: React.ComponentType<{ size?: number }> }[]) => void;
  onToggleHidden: (path: string) => void;
  onReset: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  };
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(i);
  };
  const onDrop = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragFrom === null || dragFrom === i) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    const next = items.slice();
    const [moved] = next.splice(dragFrom, 1);
    next.splice(i, 0, moved);
    onReorder(next);
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <div>
      <div className="px-4 py-2 border-b border-slate-800 flex justify-end">
        <button
          onClick={onReset}
          title="Restore default order and unhide all"
          className="px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded flex items-center gap-1"
        >
          <RotateCcw size={11} /> Reset
        </button>
      </div>
      <div>
        {items.map((item, i) => {
          const isHidden = hidden.includes(item.to);
          return (
            <div
              key={item.to}
              draggable
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDragLeave={() => setDragOver(null)}
              onDrop={onDrop(i)}
              className={`flex items-center gap-3 px-4 py-2 border-b border-slate-800 last:border-b-0 text-sm cursor-grab active:cursor-grabbing transition-colors ${
                dragOver === i && dragFrom !== i
                  ? 'bg-sky-900/30'
                  : isHidden
                    ? 'text-slate-600'
                    : 'text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <GripVertical size={14} className="text-slate-600 shrink-0" />
              <item.icon size={13} />
              <span className="flex-1 truncate">{item.label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHidden(item.to);
                }}
                title={isHidden ? 'Show in sidebar' : 'Hide from sidebar'}
                className="p-1 text-slate-500 hover:text-slate-200"
              >
                {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Player visibility (GM-only page gating) ───────────────────────────────

function PlayerVisibilityBody({
  nav,
  hiddenPages,
  allowedGmPages,
  onTogglePage,
  onToggleGmPage,
  onHideAll,
  onShowAll,
}: {
  nav: NavItem[];
  hiddenPages: string[];
  allowedGmPages: string[];
  onTogglePage: (slug: string) => void;
  onToggleGmPage: (slug: string) => void;
  onHideAll: () => void;
  onShowAll: () => void;
}) {
  const regular = nav.filter((n) => !n.gmOnly);
  const gmOnly = nav.filter((n) => n.gmOnly);
  return (
    <div>
      <div className="px-4 py-2 border-b border-slate-800 flex justify-end gap-1">
        <button
          onClick={onHideAll}
          className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
        >
          Hide all
        </button>
        <button
          onClick={onShowAll}
          className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
        >
          Show all
        </button>
      </div>
      <div>
        {regular.map((item) => {
          const slug = item.to.replace('/', '');
          const hidden = hiddenPages.includes(slug);
          return (
            <button
              key={item.to}
              onClick={() => onTogglePage(slug)}
              className={`w-full flex items-center gap-3 px-4 py-2 border-b border-slate-800 last:border-b-0 text-sm ${
                hidden ? 'text-slate-500 hover:bg-slate-800/40' : 'text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <item.icon size={13} />
              <span className="flex-1 text-left">{item.label}</span>
              {hidden ? (
                <EyeOff size={13} className="text-amber-500" />
              ) : (
                <Eye size={13} className="text-emerald-500" />
              )}
            </button>
          );
        })}
        {gmOnly.length > 0 && (
          <>
            <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-slate-600 bg-slate-900/40 border-y border-slate-800">
              GM-only pages
            </div>
            {gmOnly.map((item) => {
              const slug = item.to.replace('/', '');
              const shared = allowedGmPages.includes(slug);
              return (
                <button
                  key={item.to}
                  onClick={() => onToggleGmPage(slug)}
                  className={`w-full flex items-center gap-3 px-4 py-2 border-b border-slate-800 last:border-b-0 text-sm ${
                    shared ? 'text-slate-200 hover:bg-slate-800/40' : 'text-slate-500 hover:bg-slate-800/40'
                  }`}
                >
                  <item.icon size={13} />
                  <span className="flex-1 text-left">
                    {item.label}
                    <span className="block text-[11px] text-slate-500 font-normal">
                      {shared ? 'Shared with players' : 'GM only'}
                    </span>
                  </span>
                  {shared ? (
                    <Eye size={13} className="text-sky-400" />
                  ) : (
                    <EyeOff size={13} className="text-slate-600" />
                  )}
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
