import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { Swords, NotebookPen, Map as MapIcon, BookOpen, Sparkles, Coins, Package, ScrollText, Users, FlaskConical, Dices, LogOut, ArrowLeftRight, Copy, Mic, Eye, EyeOff, Settings, BookMarked, Sun, Moon, PanelLeftClose, PanelLeftOpen, Radio, LayoutDashboard } from 'lucide-react';
import { QuickDice } from './features/dice/QuickDice';
import { useQuickDice } from './features/dice/quickDiceStore';
import ChatPanel from './features/chat/ChatPanel';
import Initiative from './features/initiative/Initiative';
import Notes from './features/notes/Notes';
import MapBoard from './features/map/MapBoard';
import Spells from './features/spells/Spells';
import Items from './features/items/Items';
import Shop from './features/shop/Shop';
import StatBlocks from './features/statblocks/StatBlocks';
import Rules from './features/rules/Rules';
import Party from './features/party/Party';
import Homebrew from './features/homebrew/Homebrew';
import Transcription from './features/transcription/Transcription';
import NPCs from './features/npcs/NPCs';
import Dashboard from './features/dashboard/Dashboard';
import CampaignPicker from './features/session/CampaignPicker';
import { useSession } from './features/session/sessionStore';
import { useCampaignSettings } from './features/notes/campaignSettingsStore';
import { useTheme } from './features/session/themeStore';
import { useRecording } from './features/transcription/recordingStore';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Swords;
  gmOnly?: boolean;
};

const nav: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/initiative', label: 'Initiative', icon: Swords },
  { to: '/party', label: 'Party', icon: Users },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/npcs',  label: 'NPCs',  icon: BookMarked },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/spells', label: 'Spells', icon: Sparkles },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/shop', label: 'Shop', icon: Coins },
  { to: '/statblocks', label: 'Stat Blocks', icon: ScrollText, gmOnly: true },
  { to: '/homebrew', label: 'Homebrew', icon: FlaskConical, gmOnly: true },
  { to: '/record', label: 'Record', icon: Mic, gmOnly: true },
  { to: '/rules', label: 'Rules', icon: BookOpen },
];

export default function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  const loading = useSession((s) => s.loading);
  const userId = useSession((s) => s.userId);
  const campaignId = useSession((s) => s.campaignId);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!userId) return <CampaignPicker />;
  if (!campaignId) return <CampaignPicker />;

  return <AppShell />;
}

// Sidebar collapse state — persisted across reloads. Header/footer collapse
// to icon-only, so the nav can fit on narrow displays without losing access
// to any tool.
const COLLAPSED_KEY = 'grimoire:sidebar-collapsed';
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const update = (v: boolean) => {
    localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
    setCollapsed(v);
  };
  return [collapsed, update] as const;
}

function AppShell() {
  const toggleQuickDice = useQuickDice((s) => s.toggle);
  const quickDiceOpen = useQuickDice((s) => s.open);
  const role = useSession((s) => s.role);
  const campaignId = useSession((s) => s.campaignId);
  const campaignName = useSession((s) => s.campaignName);
  const joinCode = useSession((s) => s.joinCode);
  const displayName = useSession((s) => s.displayName);
  const leaveCurrent = useSession((s) => s.leaveCurrent);
  const signOut = useSession((s) => s.signOut);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const { mode, toggle: toggleMode } = useTheme();
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const viewAsPlayer = useSession((s) => s.viewAsPlayer);
  const setViewAsPlayer = useSession((s) => s.setViewAsPlayer);
  const trueIsGM = role === 'gm';
  // Effective GM for UI gating. View-as-player downgrades the GM's UI to a
  // player's view; server-side RLS is unaffected, so they can still
  // technically edit anything they could before — this is purely so they can
  // preview what the players see.
  const isGM = trueIsGM && !viewAsPlayer;

  // ── Page title ────────────────────────────────────────────────────────────
  const location = useLocation();
  useEffect(() => {
    const page = nav.find((n) => location.pathname.startsWith(n.to));
    const pageName = page?.label ?? 'Grimoire';
    document.title = campaignName ? `${pageName} · ${campaignName}` : `${pageName} · Grimoire`;
  }, [location.pathname, campaignName]);

  const loadSettings = useCampaignSettings((s) => s.load);
  const subscribeSettings = useCampaignSettings((s) => s.subscribe);
  const togglePage = useCampaignSettings((s) => s.togglePage);
  const toggleGmPage = useCampaignSettings((s) => s.toggleGmPage);
  const hideAll = useCampaignSettings((s) => s.hideAll);
  const showAll = useCampaignSettings((s) => s.showAll);
  const hiddenPages = useCampaignSettings((s) => s.settings.hiddenPages);
  const allowedGmPages = useCampaignSettings((s) => s.settings.allowedGmPages ?? []);

  const isRecording = useRecording((s) => s.isRecording);
  const startRecording = useRecording((s) => s.start);
  const stopRecording = useRecording((s) => s.stop);
  const recordingSupported = useRecording((s) => s.supported);

  useEffect(() => {
    if (!campaignId) return;
    loadSettings(campaignId);
    const unsub = subscribeSettings(campaignId);
    return unsub;
  }, [campaignId, loadSettings, subscribeSettings]);

  // Players see non-gmOnly pages the GM hasn't hidden, plus gmOnly pages the GM has shared
  const visibleNav = nav.filter((n) => {
    const slug = n.to.replace('/', '');
    if (isGM) return true;
    if (n.gmOnly) return allowedGmPages.includes(slug);
    return !hiddenPages.includes(slug);
  });

  const copyJoinCode = () => {
    if (joinCode) navigator.clipboard.writeText(joinCode);
  };

  return (
    <div className="h-full flex flex-col text-slate-100 bg-slate-950">
      {trueIsGM && viewAsPlayer && (
        <button
          onClick={() => setViewAsPlayer(false)}
          className="shrink-0 w-full px-4 py-1.5 text-xs flex items-center justify-center gap-2 border-b print:hidden"
          style={{
            backgroundColor: 'color-mix(in srgb, #fbbf24 18%, transparent)',
            borderColor: 'color-mix(in srgb, #fbbf24 40%, transparent)',
            color: '#fcd34d',
          }}
        >
          <Eye size={12} />
          <span className="font-medium">Viewing as player</span>
          <span className="opacity-70">— click to return to GM view</span>
        </button>
      )}
      <div className="flex-1 flex min-h-0">
      <aside
        className={`${collapsed ? 'w-14' : 'w-56'} shrink-0 border-r border-slate-800 flex flex-col transition-[width] duration-150`}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        {collapsed ? (
          <div className="px-2 py-3 border-b border-slate-800 flex flex-col items-center gap-2">
            <button
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
            >
              <PanelLeftOpen size={14} />
            </button>
            <button
              onClick={toggleQuickDice}
              title="Quick dice roller"
              className={`p-1.5 rounded border ${
                quickDiceOpen
                  ? 'bg-slate-900'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
              }`}
              style={quickDiceOpen ? { color: 'var(--ac-200)', borderColor: 'var(--ac-700)' } : undefined}
            >
              <Dices size={14} />
            </button>
            {isGM && recordingSupported && (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? 'Stop recording' : 'Start recording'}
                className={`p-1.5 rounded border ${
                  isRecording
                    ? 'bg-rose-900/60 border-rose-700 text-rose-300'
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {isRecording ? <Radio size={14} className="animate-pulse" /> : <Mic size={14} />}
              </button>
            )}
          </div>
        ) : (
          <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-serif text-lg tracking-wide truncate" title={campaignName ?? ''}>
                {campaignName ?? 'Grimoire'}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                <span className={isGM ? 'text-emerald-400' : 'text-sky-400'}>
                  {isGM ? 'GM' : 'Player'}
                </span>
                <span className="opacity-50">·</span>
                <span className="truncate">{displayName}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="p-1 rounded hover:bg-slate-800 text-slate-500"
              >
                <PanelLeftClose size={13} />
              </button>
              <div className="flex gap-1">
                {isGM && recordingSupported && (
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    title={isRecording ? 'Stop recording' : 'Start recording'}
                    className={`p-1.5 rounded border ${
                      isRecording
                        ? 'bg-rose-900/60 border-rose-700 text-rose-300'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {isRecording ? <Radio size={14} className="animate-pulse" /> : <Mic size={14} />}
                  </button>
                )}
                <button
                  onClick={toggleQuickDice}
                  title="Quick dice roller"
                  className={`p-1.5 rounded border ${
                    quickDiceOpen
                      ? 'bg-slate-900'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                  style={quickDiceOpen ? { color: 'var(--ac-200)', borderColor: 'var(--ac-700)' } : undefined}
                >
                  <Dices size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Join code (GM only, hidden when collapsed) ───────────────────── */}
        {!collapsed && isGM && joinCode && (
          <button
            onClick={copyJoinCode}
            title="Copy join code"
            className="px-4 py-2 text-[11px] flex items-center justify-between border-b border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
          >
            <span className="uppercase tracking-wider">Join code</span>
            <span className="font-mono tracking-widest text-slate-200 flex items-center gap-1">
              {joinCode}
              <Copy size={10} />
            </span>
          </button>
        )}

        {/* ── Nav ──────────────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2 text-sm transition-colors border-l-2 ${
                  isActive
                    ? ''
                    : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100 border-transparent'
                }`
              }
              style={({ isActive }) => isActive ? { color: 'var(--nav-active-fg)', background: 'var(--nav-active-bg)', borderLeftColor: 'var(--ac-400)' } : undefined}
            >
              <Icon size={16} />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div className="border-t border-slate-800">
          {/* GM page-visibility — only rendered when expanded */}
          {!collapsed && isGM && showPagePicker && (
            <div className="px-4 py-2 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">
                  Player Visibility
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => hideAll(nav.filter((n) => !n.gmOnly).map((n) => n.to.replace('/', '')))}
                    className="text-[9px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400"
                    title="Hide all pages from players"
                  >
                    Hide all
                  </button>
                  <button
                    onClick={showAll}
                    className="text-[9px] px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-400"
                    title="Show all pages to players"
                  >
                    Show all
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {nav.filter((n) => !n.gmOnly).map((item) => {
                  const slug = item.to.replace('/', '');
                  const hidden = hiddenPages.includes(slug);
                  return (
                    <button
                      key={item.to}
                      onClick={() => togglePage(slug)}
                      className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                        hidden
                          ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <item.icon size={11} />
                        {item.label}
                      </span>
                      {hidden ? (
                        <EyeOff size={11} className="text-amber-500" />
                      ) : (
                        <Eye size={11} className="text-emerald-500" />
                      )}
                    </button>
                  );
                })}
                {nav.filter((n) => n.gmOnly).length > 0 && (
                  <>
                    <div className="text-[9px] uppercase tracking-wider text-slate-600 mt-2 mb-1 px-2">GM-only pages</div>
                    {nav.filter((n) => n.gmOnly).map((item) => {
                      const slug = item.to.replace('/', '');
                      const shared = allowedGmPages.includes(slug);
                      return (
                        <button
                          key={item.to}
                          onClick={() => toggleGmPage(slug)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                            shared
                              ? 'text-slate-200 hover:bg-slate-800'
                              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <item.icon size={11} />
                            {item.label}
                          </span>
                          {shared ? (
                            <Eye size={11} className="text-sky-400" />
                          ) : (
                            <EyeOff size={11} className="text-slate-600" />
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
          {isGM && (
            <FooterButton
              icon={<Settings size={12} />}
              label="Player visibility"
              collapsed={collapsed}
              onClick={() => setShowPagePicker((v) => !v)}
            />
          )}
          {trueIsGM && (
            <FooterButton
              icon={<Eye size={12} />}
              label={viewAsPlayer ? 'Exit player view' : 'View as player'}
              collapsed={collapsed}
              onClick={() => setViewAsPlayer(!viewAsPlayer)}
            />
          )}
          <FooterButton
            icon={mode === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            label={mode === 'dark' ? 'Light mode' : 'Dark mode'}
            collapsed={collapsed}
            onClick={toggleMode}
          />
          <FooterButton
            icon={<ArrowLeftRight size={12} />}
            label="Switch campaign"
            collapsed={collapsed}
            onClick={leaveCurrent}
          />
          <FooterButton
            icon={<LogOut size={12} />}
            label="Sign out"
            collapsed={collapsed}
            onClick={signOut}
            danger
          />
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {/* /dice is now a tab inside /dashboard — keep the URL working as a redirect. */}
          <Route path="/dice" element={<Navigate to="/dashboard" replace />} />
          <Route path="/initiative" element={<Initiative />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/npcs" element={<NPCs />} />
          <Route path="/map" element={<MapBoard />} />
          <Route path="/party" element={<Party />} />
          <Route path="/spells" element={<Spells />} />
          <Route path="/items" element={<Items />} />
          <Route path="/shop" element={<Shop />} />
          {isGM && <Route path="/statblocks" element={<StatBlocks />} />}
          {isGM && <Route path="/homebrew" element={<Homebrew />} />}
          {isGM && <Route path="/record" element={<Transcription />} />}
          <Route path="/rules" element={<Rules />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      </div>
      <QuickDice />
      {/* Dashboard embeds its own chat surface, so hide the floating one there. */}
      {location.pathname !== '/dashboard' && <ChatPanel />}
    </div>
  );
}

/**
 * Sidebar footer row. Collapsed mode shows an icon-only square button with a
 * tooltip; expanded mode shows icon + label. `danger` switches the hover tint
 * from sky to rose for destructive actions (Switch campaign, Sign out).
 */
function FooterButton({
  icon,
  label,
  collapsed,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  const hover = danger ? 'hover:text-rose-300' : 'hover:text-slate-300';
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={`w-full py-2 text-xs text-slate-500 ${hover} hover:bg-slate-900 flex items-center justify-center`}
      >
        {icon}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2 text-xs text-slate-500 ${hover} hover:bg-slate-900 flex items-center gap-2`}
    >
      {icon} {label}
    </button>
  );
}
