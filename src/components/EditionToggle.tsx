import { useCampaignSettings, type SrdEdition } from '../features/notes/campaignSettingsStore';
import { useIsGM } from '../features/session/sessionStore';

const OPTIONS: { value: SrdEdition; label: string }[] = [
  { value: '2014', label: '2014' },
  { value: '2024', label: '2024' },
  { value: 'both', label: 'Both' },
];

/**
 * Edition selector for SRD content. GMs can toggle; players see the current
 * choice as static text.
 */
export default function EditionToggle() {
  const edition = useCampaignSettings((s) => s.settings.srdEdition);
  const setEdition = useCampaignSettings((s) => s.setSrdEdition);
  const isGM = useIsGM();

  if (!isGM) {
    return (
      <div className="text-[11px] text-slate-500 uppercase tracking-wider">
        SRD {edition === 'both' ? '2014 + 2024' : edition}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">SRD</span>
      <div className="flex rounded-md overflow-hidden border border-slate-800">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setEdition(opt.value)}
            className={`px-2 py-0.5 text-[11px] ${
              edition === opt.value
                ? 'bg-sky-900/40 text-sky-200'
                : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
