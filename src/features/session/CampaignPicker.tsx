import { useEffect, useState } from 'react';
import { useSession, rememberedDisplayName } from './sessionStore';
import { Swords, LogIn, Plus, ChevronRight, Mail, KeyRound, ArrowLeft } from 'lucide-react';

type Mode = 'choose' | 'create' | 'join';
type AuthMode = 'signin' | 'signup' | 'forgot';

export default function CampaignPicker() {
  const userId = useSession((s) => s.userId);
  const recovery = useSession((s) => s.recovery);

  if (recovery) return <ResetPasswordScreen />;
  if (!userId) return <AuthScreen />;
  return <CampaignScreen />;
}

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const signIn = useSession((s) => s.signIn);
  const signUp = useSession((s) => s.signUp);
  const resetPassword = useSession((s) => s.resetPassword);
  const error = useSession((s) => s.error);
  const loading = useSession((s) => s.loading);

  const submit = () => {
    if (mode === 'forgot') return;
    if (!email.trim() || !password.trim()) return;
    if (mode === 'signin') signIn(email.trim(), password);
    else signUp(email.trim(), password);
  };

  const sendReset = async () => {
    if (!email.trim() || loading) return;
    setNotice(null);
    const res = await resetPassword(email);
    if (res.ok) {
      setNotice('If an account exists for that email, a reset link is on its way.');
    }
  };

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setNotice(null);
    useSession.setState({ error: null });
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="font-serif text-3xl tracking-wide flex items-center justify-center gap-3">
            <Swords style={{ color: 'var(--ac-400)' }} size={28} /> Grimoire
          </div>
          <div className="text-sm text-slate-500">D&amp;D 5e campaign companion</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          {mode === 'forgot' ? (
            <button
              onClick={() => switchMode('signin')}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              <ArrowLeft size={13} /> Back to sign in
            </button>
          ) : (
            <div className="flex gap-1 rounded overflow-hidden border border-slate-800 text-xs">
              <button
                onClick={() => switchMode('signin')}
                className={`flex-1 py-1.5 ${mode !== 'signin' ? 'bg-slate-900 text-slate-400 hover:bg-slate-800' : ''}`}
                style={mode === 'signin' ? { background: 'color-mix(in srgb, var(--ac-900) 40%, transparent)', color: 'var(--auth-tab-active-fg)' } : undefined}
              >
                Sign in
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 py-1.5 ${mode !== 'signup' ? 'bg-slate-900 text-slate-400 hover:bg-slate-800' : ''}`}
                style={mode === 'signup' ? { background: 'color-mix(in srgb, var(--ac-900) 40%, transparent)', color: 'var(--auth-tab-active-fg)' } : undefined}
              >
                Create account
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className="text-xs text-slate-500">
              Enter your account email and we'll send you a link to reset your password.
            </div>
          )}

          <label className="block">
            <div className="text-xs text-slate-400 mb-1">Email</div>
            <div className="relative">
              <Mail size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (mode === 'forgot' ? sendReset() : submit())}
                placeholder="you@example.com"
                className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-sm"
              />
            </div>
          </label>

          {mode !== 'forgot' && (
            <label className="block">
              <div className="text-xs text-slate-400 mb-1">Password</div>
              <div className="relative">
                <KeyRound size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-sm"
                />
              </div>
            </label>
          )}

          {mode === 'forgot' ? (
            <button
              onClick={sendReset}
              disabled={!email.trim() || loading}
              className="ac-btn w-full px-3 py-2 rounded disabled:bg-slate-800 disabled:text-slate-600 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Mail size={14} /> Send reset link
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!email.trim() || !password.trim() || loading}
              className="ac-btn w-full px-3 py-2 rounded disabled:bg-slate-800 disabled:text-slate-600 font-semibold text-sm flex items-center justify-center gap-2"
            >
              <LogIn size={14} />
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          )}

          {mode === 'signin' && (
            <div className="text-center">
              <button
                onClick={() => switchMode('forgot')}
                className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                Forgot password?
              </button>
            </div>
          )}
        </div>

        {notice && (
          <div className="text-sm text-emerald-300 bg-emerald-950/40 border border-emerald-900 rounded p-3">
            {notice}
          </div>
        )}
        {error && (
          <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-900 rounded p-3">
            {error}
          </div>
        )}
        {mode === 'signup' && !error && (
          <div className="text-xs text-slate-500 text-center">
            After signing up you may need to confirm your email before signing in.
          </div>
        )}
      </div>
    </div>
  );
}

function ResetPasswordScreen() {
  const updatePassword = useSession((s) => s.updatePassword);
  const clearRecovery = useSession((s) => s.clearRecovery);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error);
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="font-serif text-3xl tracking-wide flex items-center justify-center gap-3">
            <Swords style={{ color: 'var(--ac-400)' }} size={28} /> Grimoire
          </div>
          <div className="text-sm text-slate-500">Set a new password</div>
        </div>

        {done ? (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3 text-center">
            <div className="text-sm text-emerald-300">Your password has been updated.</div>
            <button
              onClick={clearRecovery}
              className="ac-btn w-full px-3 py-2 rounded font-semibold text-sm"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <label className="block">
              <div className="text-xs text-slate-400 mb-1">New password</div>
              <div className="relative">
                <KeyRound size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-sm"
                />
              </div>
            </label>
            <label className="block">
              <div className="text-xs text-slate-400 mb-1">Confirm password</div>
              <div className="relative">
                <KeyRound size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-2 py-1.5 text-sm"
                />
              </div>
            </label>
            <button
              onClick={submit}
              disabled={!password || !confirm || busy}
              className="ac-btn w-full px-3 py-2 rounded disabled:bg-slate-800 disabled:text-slate-600 font-semibold text-sm"
            >
              Update password
            </button>
          </div>
        )}

        {error && (
          <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-900 rounded p-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignScreen() {
  const [mode, setMode] = useState<Mode>('choose');
  const error = useSession((s) => s.error);
  const loading = useSession((s) => s.loading);
  const refreshMyCampaigns = useSession((s) => s.refreshMyCampaigns);
  const signOut = useSession((s) => s.signOut);

  useEffect(() => {
    refreshMyCampaigns();
  }, [refreshMyCampaigns]);

  return (
    <div className="h-full w-full flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <div className="font-serif text-3xl tracking-wide flex items-center justify-center gap-3">
            <Swords style={{ color: 'var(--ac-400)' }} size={28} /> Grimoire
          </div>
          <div className="text-sm text-slate-500">D&amp;D 5e campaign companion</div>
        </div>

        {mode === 'choose' && (
          <>
            <MyCampaignsList />
            <div className="space-y-3">
              <button
                onClick={() => setMode('create')}
                className="ac-btn w-full px-4 py-3 rounded-lg font-semibold flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Create a new campaign
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center gap-2"
              >
                <LogIn size={16} /> Join with a code
              </button>
            </div>
            <div className="text-center">
              <button
                onClick={() => signOut()}
                className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                Sign out
              </button>
            </div>
          </>
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

function MyCampaignsList() {
  const myCampaigns = useSession((s) => s.myCampaigns);
  const switchToCampaign = useSession((s) => s.switchToCampaign);
  if (myCampaigns.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-slate-500">Your campaigns</div>
      <div className="space-y-2">
        {myCampaigns.map((c) => (
          <button
            key={c.id}
            onClick={() => switchToCampaign(c.id)}
            className="w-full px-3 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-left"
          >
            <div className="min-w-0">
              <div className="text-sm text-slate-100 truncate">{c.name}</div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <span className={c.role === 'gm' ? 'text-emerald-400' : c.role === 'cogm' ? 'text-teal-400' : 'text-sky-400'}>
                  {c.role === 'gm' ? 'GM' : c.role === 'cogm' ? 'Co-GM' : 'Player'}
                </span>
                <span className="opacity-50">·</span>
                <span className="truncate">{c.display_name}</span>
                <span className="opacity-50">·</span>
                <span className="font-mono tracking-widest">{c.join_code}</span>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-600 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateForm({ onBack }: { onBack: () => void }) {
  const create = useSession((s) => s.createCampaign);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(rememberedDisplayName());
  // Default HP-on-level-up method — can be changed later in Settings.
  const [hpMethod, setHpMethod] = useState<'avg' | 'roll' | 'manual'>('avg');

  const submit = () => {
    if (!name.trim() || !displayName.trim()) return;
    create(name.trim(), displayName.trim(), { hpRollingMethod: hpMethod });
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
      <div className="block">
        <div className="text-xs text-slate-400 mb-1">HP on level-up</div>
        <div className="flex rounded overflow-hidden border border-slate-700">
          {(['avg', 'roll', 'manual'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setHpMethod(m)}
              className={`flex-1 px-2 py-1.5 text-xs ${
                hpMethod === m
                  ? 'bg-sky-900/40 text-sky-200'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {m === 'avg' ? 'Average' : m === 'roll' ? 'Roll' : 'Manual'}
            </button>
          ))}
        </div>
        <div className="text-[10px] text-slate-600 mt-1">
          {hpMethod === 'avg' && 'Take the fixed average (5e default). Predictable, fast.'}
          {hpMethod === 'roll' && 'Roll the class hit die at the table. Swingy but fun.'}
          {hpMethod === 'manual' && 'Each player enters whatever the table agreed on.'}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onBack} className="flex-1 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">
          Back
        </button>
        <button
          onClick={submit}
          disabled={!name.trim() || !displayName.trim()}
          className="ac-btn flex-1 px-3 py-2 rounded disabled:bg-slate-800 disabled:text-slate-600 font-semibold text-sm"
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
        <button onClick={onBack} className="flex-1 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm">
          Back
        </button>
        <button
          onClick={submit}
          disabled={!code.trim() || !displayName.trim()}
          className="ac-btn flex-1 px-3 py-2 rounded disabled:bg-slate-800 disabled:text-slate-600 font-semibold text-sm"
        >
          Join
        </button>
      </div>
    </div>
  );
}
