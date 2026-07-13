import { useEffect, useState } from 'react';
import { X, ChevronLeft, Users, BookMarked, NotebookPen, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../../lib/supabase';
import { CharCard } from '../party/Party';
import { rowToMember, type PartyMember, type Row as PartyRow } from '../party/partyStore';
import { STATUS_COLORS, type NPCStatus } from '../npcs/npcStore';

type RosterRow = { user_id: string; display_name: string; role: 'gm' | 'cogm' | 'player'; color: string };
type SpectatorNpc = { id: string; name: string; faction: string; location: string; status: NPCStatus; factionColor: string };
type SpectatorNote = { id: string; title: string; body: string };

/**
 * Read-only "peek" into a campaign the viewer isn't a member of, opened from
 * another member's profile popover (see MemberProfileModal). Fetches
 * directly via Supabase — RLS's spectator grant (is_spectator /
 * shares_campaign_with, supabase/schema.sql) governs what actually comes
 * back — rather than through the app's campaign-scoped zustand stores,
 * which are tied to the viewer's *active* session and would be disturbed by
 * loading a second campaign's data into them. Nothing here writes; there
 * are no onUpdate handlers wired to anything.
 */
export default function CampaignSpectatorView({
  campaignId,
  onClose,
}: {
  campaignId: string;
  onClose: () => void;
}) {
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [party, setParty] = useState<PartyMember[]>([]);
  const [npcs, setNpcs] = useState<SpectatorNpc[]>([]);
  const [notes, setNotes] = useState<SpectatorNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [campaignRes, rosterRes, partyRes, npcsRes, notesRes] = await Promise.all([
        supabase.from('campaigns').select('name').eq('id', campaignId).maybeSingle(),
        supabase.from('campaign_members').select('user_id, display_name, role, color').eq('campaign_id', campaignId),
        supabase.from('party_members').select('*').eq('campaign_id', campaignId),
        supabase
          .from('npcs')
          .select('id, name, faction, faction_color, location, status')
          .eq('campaign_id', campaignId)
          .eq('visible_to_players', true),
        supabase
          .from('notes')
          .select('id, title, body')
          .eq('campaign_id', campaignId)
          .eq('visible_to_players', true),
      ]);
      if (cancelled) return;
      for (const [label, res] of [
        ['campaign', campaignRes],
        ['roster', rosterRes],
        ['party', partyRes],
        ['npcs', npcsRes],
        ['notes', notesRes],
      ] as const) {
        if (res.error) console.error(`[CampaignSpectatorView] ${label} fetch failed`, res.error);
      }
      setCampaignName((campaignRes.data?.name as string | undefined) ?? null);
      setRoster((rosterRes.data ?? []) as RosterRow[]);
      setParty(((partyRes.data ?? []) as PartyRow[]).map(rowToMember));
      setNpcs(
        ((npcsRes.data ?? []) as { id: string; name: string; faction: string; faction_color: string; location: string; status: NPCStatus }[]).map(
          (r) => ({ id: r.id, name: r.name, faction: r.faction, location: r.location, status: r.status, factionColor: r.faction_color }),
        ),
      );
      setNotes((notesRes.data ?? []) as SpectatorNote[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const selectedNote = selectedNoteId ? notes.find((n) => n.id === selectedNoteId) ?? null : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex sm:items-start sm:justify-center sm:overflow-y-auto sm:py-8 sm:px-4">
      <div className="w-full max-w-3xl bg-slate-900 sm:border border-slate-800 sm:rounded-lg shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-amber-950/20">
          <div className="min-w-0 flex items-center gap-2 text-sm">
            <Eye size={14} className="text-amber-400 shrink-0" />
            <span className="text-slate-400">Exploring</span>
            <span className="font-serif text-lg text-amber-200 truncate">{campaignName ?? '…'}</span>
            <span className="text-[10px] uppercase tracking-wider text-amber-500/80 border border-amber-800/60 rounded px-1.5 py-0.5 shrink-0">
              View only
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : (
            <>
              {roster.length > 0 && (
                <Section title="Members" icon={<Users size={12} />}>
                  <div className="flex flex-wrap gap-2">
                    {roster.map((r) => (
                      <div
                        key={r.user_id}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-800 text-xs"
                        style={{ color: r.color }}
                      >
                        {r.display_name}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Party" icon={<Users size={12} />}>
                {party.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">No characters yet.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {party.map((m) => (
                      <CharCard
                        key={m.id}
                        m={m}
                        userId={null}
                        isGM={false}
                        editable={false}
                        memberNames={{}}
                        onUpdate={async () => {}}
                        onRemove={() => {}}
                        onClaim={() => {}}
                        onUnclaim={() => {}}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="NPCs" icon={<BookMarked size={12} />}>
                {npcs.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">Nothing visible here.</div>
                ) : (
                  <div className="space-y-1.5">
                    {npcs.map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded bg-slate-800/60 border border-slate-800"
                      >
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[n.status] }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-200 truncate">{n.name}</div>
                          {(n.faction || n.location) && (
                            <div className="text-[11px] text-slate-500 truncate">
                              {[n.faction, n.location].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Notes" icon={<NotebookPen size={12} />}>
                {notes.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">Nothing visible here.</div>
                ) : selectedNote ? (
                  <div>
                    <button
                      onClick={() => setSelectedNoteId(null)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-2"
                    >
                      <ChevronLeft size={13} /> All notes
                    </button>
                    <div className="bg-slate-800/60 border border-slate-800 rounded p-4 markdown-body">
                      <h3 className="font-serif text-lg text-sky-200 mb-2">{selectedNote.title}</h3>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedNote.body}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {notes.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setSelectedNoteId(n.id)}
                        className="w-full text-left px-3 py-2 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-800 text-sm text-slate-200 truncate"
                      >
                        {n.title}
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-2">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}
