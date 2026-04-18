import { useState } from 'react';
import { useSession, rememberedDisplayName } from './sessionStore';
import { Swords, LogIn, Plus } from 'lucide-react';

type Mode = 'choose' | 'create' | 'join';

export default function CampaignPicker() {
  const [mode, setMode] = useState<Mode>('choose');
  const error = useSession((s) => s.error);
  const loading = useSession((s) => s.loading);

  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <div className="font-serif text-3xl tracking-wide flex items-center justify-center gap-3">
            <Swords className="text-sky-400" size={28} /> GM Screen
          </div>
          <div className="text-sm text-slate-500">D&amp;D 5e campaign companion</div>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full px-4 py-3 rounded-lg bg-sky-700 hover:bg-sky-600 text-slate-950 font-semibold flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Create a new campaign
            </button>
            <button
              onClick={() => setMode('join')}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2"
            >
              <LogIn size={16} /> Join an existing campaign
            </button>
          </div>
        )}

        {mode === 'create' && <CreateForm onBack={() => setMode('choose')} />}
        {mode === 'join' && <JoinForm onBack={() => setMode('choose')} />}

        {error && (
          <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-900 rounded p-3">
            {error}
          </div>
        )}
        {loading && <div className="text-xs text-slate-500 text-center">Working…</div>}
      </div>
    </div>
  );
}

function CreateForm({ onBack }: { onBack: () => void }) {
  const create = useSession((s) => s.createCampaign);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(rememberedDisplayName());

  const submit = () => {
    if (!name.trim() || !displayName.trim()) return;
    create(name.trim(), displayName.trim());
  };

  return (
    <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">Create campaign (you'll be GM)</div>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Campaign name</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Curse of Strahd"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Your name (shown to players)</div>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="DM"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onBack}
          className="flex-1 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
        >
          Back
        </button>
        <button
          onClick={submit}
          disabled={!name.trim() || !displayName.trim()}
          className="flex-1 px-3 py-2 rounded bg-sky-700 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-semibold text-sm"
        >
          Create
        </button>
      </div>
    </div>
  );
}

function JoinForm({ onBack }: { onBack: () => void }) {
  const join = useSession((s) => s.joinCampaign);
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState(rememberedDisplayName());

  const submit = () => {
    if (!code.trim() || !displayName.trim()) return;
    join(code.trim(), displayName.trim());
  };

  return (
    <div className="space-y-3 bg-slate-900 border border-slate-800 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">Join campaign (as player)</div>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Join code</div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC234"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono tracking-widest uppercase"
        />
      </label>
      <label className="block">
        <div className="text-xs text-slate-400 mb-1">Your character / display name</div>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Thorin"
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
        />
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onBack}
          className="flex-1 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
        >
          Back
        </button>
        <button
          onClick={submit}
          disabled={!code.trim() || !displayName.trim()}
          className="flex-1 px-3 py-2 rounded bg-sky-700 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-semibold text-sm"
        >
          Join
        </button>
      </div>
    </div>
  );
}
