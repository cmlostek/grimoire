import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { Dice6, Swords, NotebookPen, Map as MapIcon, BookOpen, Sparkles, Coins, Package, ScrollText, Users, FlaskConical, Dices } from 'lucide-react';
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

const nav = [
  { to: '/dice', label: 'Dice', icon: Dice6 },
  { to: '/initiative', label: 'Initiative', icon: Swords },
  { to: '/party', label: 'Party', icon: Users },
  { to: '/notes', label: 'Notes', icon: NotebookPen },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/spells', label: 'Spells', icon: Sparkles },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/shop', label: 'Shop', icon: Coins },
  { to: '/statblocks', label: 'Stat Blocks', icon: ScrollText },
  { to: '/homebrew', label: 'Homebrew', icon: FlaskConical },
  { to: '/rules', label: 'Rules', icon: BookOpen },
];

export default function App() {
  const toggleQuickDice = useQuickDice((s) => s.toggle);
  const quickDiceOpen = useQuickDice((s) => s.open);
  return (
    <div className="h-full flex bg-slate-950 text-slate-100">
      <aside className="w-56 shrink-0 border-r border-slate-800 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-800 flex items-start justify-between gap-2">
          <div>
            <div className="font-serif text-xl tracking-wide">GM Screen</div>
            <div className="text-xs text-slate-500">D&amp;D 5e companion</div>
          </div>
          <button
            onClick={toggleQuickDice}
            title="Quick dice roller"
            className={`p-1.5 rounded border ${
              quickDiceOpen
                ? 'bg-sky-900/50 border-sky-700 text-sky-200'
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <Dices size={14} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map(({ to, label, icon: Icon }) => (
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
        <div className="px-4 py-2 text-[10px] text-slate-600 border-t border-slate-800">
          SRD 5.1 content only · local storage
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<Navigate to="/dice" replace />} />
          <Route path="/dice" element={<DiceRoller />} />
          <Route path="/initiative" element={<Initiative />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/map" element={<MapBoard />} />
          <Route path="/party" element={<Party />} />
          <Route path="/spells" element={<Spells />} />
          <Route path="/items" element={<Items />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/statblocks" element={<StatBlocks />} />
          <Route path="/homebrew" element={<Homebrew />} />
          <Route path="/rules" element={<Rules />} />
        </Routes>
      </main>
      <QuickDice />
    </div>
  );
}
