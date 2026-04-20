import { useEffect } from 'react';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Dice6, Swords, NotebookPen, Map as MapIcon, BookOpen, Sparkles, Coins, Package, ScrollText, Users, FlaskConical, Dices, LogOut, Copy, Mic } from 'lucide-react';
import DiceRoller from './features/dice/DiceRoller';
import { QuickDice } from './features/dice/QuickDice';
import { useQuickDice } from './features/dice/quickDiceStore';
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
import CampaignPicker from './features/session/CampaignPicker';
import { useSession } from './features/session/sessionStore';

type NavItem = {
  to: string;
  label: string;
  icon: typeof Dice6;
  gmOnly?: boolean;
};

const nav: NavItem[] = [
  { to: '/dice', label: 'Dice', icon: Dice6 },
  { to: '/initiative', label: 'Initiative', icon: Swords, gmOnly: true },
  { to: '/party', label: 'Party', icon: Users },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
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
  const campaignId = useSession((s) => s.campaignId);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (loading && !campaignId) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!campaignId) return <CampaignPicker />;

  return <AppShell />;
}

function AppShell() {
  const toggleQuickDice = useQuickDice((s) => s.toggle);
  const quickDiceOpen = useQuickDice((s) => s.open);
  const role = useSession((s) => s.role);
  const campaignName = useSession((s) => s.campaignName);
  const joinCode = useSession((s) => s.joinCode);
  const displayName = useSession((s) => s.displayName);
  const leaveCurrent = useSession((s) => s.leaveCurrent);

  const visibleNav = nav.filter((n) => !n.gmOnly || role === 'gm');

  const copyJoinCode = () => {
    if (joinCode) navigator.clipboard.writeText(joinCode);
  };

  return (
    <div className="h-full flex bg-slate-950 text-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-serif text-lg tracking-wide truncate" title={campaignName ?? ''}>
              {campaignName ?? 'GM Screen'}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
              <span className={role === 'gm' ? 'text-emerald-400' : 'text-sky-400'}>
                {role === 'gm' ? 'GM' : 'Player'}
              </span>
              <span className="opacity-50">·</span>
              <span className="truncate">{displayName}</span>
            </div>
          </div>
          <button
            onClick={toggleQuickDice}
            title="Quick dice roller"
            className={`p-1.5 rounded border shrink-0 ${
              quickDiceOpen
                ? 'bg-sky-900/50 border-sky-700 text-sky-200'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Dices size={14} />
          </button>
        </div>
        {role === 'gm' && joinCode && (
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
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-sky-200 border-l-2 border-sky-400'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-slate-100 border-l-2 border-transparent'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={leaveCurrent}
          className="px-4 py-2 text-xs text-slate-500 hover:text-rose-300 hover:bg-slate-900 border-t border-slate-800 flex items-center gap-2"
          title="Leave campaign on this device (doesn't delete it)"
        >
          <LogOut size={12} /> Switch campaign
        </button>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/dice" replace />} />
          <Route path="/dice" element={<DiceRoller />} />
          {role === 'gm' && <Route path="/initiative" element={<Initiative />} />}
          <Route path="/notes" element={<Notes />} />
          <Route path="/map" element={<MapBoard />} />
          <Route path="/party" element={<Party />} />
          <Route path="/spells" element={<Spells />} />
          <Route path="/items" element={<Items />} />
          <Route path="/shop" element={<Shop />} />
          {role === 'gm' && <Route path="/statblocks" element={<StatBlocks />} />}
          {role === 'gm' && <Route path="/homebrew" element={<Homebrew />} />}
          {role === 'gm' && <Route path="/record" element={<Transcription />} />}
          <Route path="/rules" element={<Rules />} />
          <Route path="*" element={<Navigate to="/dice" replace />} />
        </Routes>
      </main>
      <QuickDice />
    </div>
  );
}
