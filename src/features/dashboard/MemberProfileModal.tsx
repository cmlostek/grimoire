import { useEffect, useState } from 'react';
import { X, MessageCircle, ChevronRight, Eye } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { avatarPublicUrl, fetchUserCampaigns } from '../profiles/profilesStore';
import { useRoleColors, roleColor } from '../session/roleColorsStore';
import type { ChatMember } from '../chat/chatStore';
import type { PartyMember } from '../party/partyStore';
import { CharCard } from '../party/Party';
import type { CampaignSummary } from '../session/sessionStore';

/**
 * Profile popover for another campaign member — avatar, bio, their claimed
 * character in the current campaign, and every other campaign they belong
 * to (subject to RLS's spectator grant, see supabase/schema.sql
 * shares_campaign_with/is_spectator). Replaces the old whisper-on-click
 * behavior on the Dashboard's "Campaign members" row; Whisper is now a
 * button inside this modal instead.
 */
export default function MemberProfileModal({
  member,
  party,
  currentCampaignId,
  avatarPath,
  onClose,
  onWhisper,
  onSpectate,
}: {
  member: ChatMember;
  party: PartyMember[];
  currentCampaignId: string;
  avatarPath: string | null;
  onClose: () => void;
  onWhisper: (userId: string) => void;
  onSpectate: (campaignId: string) => void;
}) {
  const gm = useRoleColors((s) => s.gm);
  const cogm = useRoleColors((s) => s.cogm);
  const player = useRoleColors((s) => s.player);
  const [bio, setBio] = useState<string | null>(null);
  const [bioLoading, setBioLoading] = useState(true);
  const [otherCampaigns, setOtherCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBioLoading(true);
    supabase
      .from('campaign_members')
      .select('bio')
      .eq('campaign_id', currentCampaignId)
      .eq('user_id', member.userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[MemberProfileModal] bio fetch failed', error);
        setBio((data?.bio as string | null) ?? '');
        setBioLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCampaignId, member.userId]);

  useEffect(() => {
    let cancelled = false;
    setCampaignsLoading(true);
    fetchUserCampaigns(member.userId).then((list) => {
      if (cancelled) return;
      setOtherCampaigns(list.filter((c) => c.id !== currentCampaignId));
      setCampaignsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [member.userId, currentCampaignId]);

  const claimedCharacter = party.find((p) => p.owner_user_id === member.userId) ?? null;
  const url = avatarPublicUrl(avatarPath);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex sm:items-start sm:justify-center sm:overflow-y-auto sm:py-12 sm:px-4">
      <div className="w-full max-w-lg bg-slate-900 sm:border border-slate-800 sm:rounded-lg shadow-2xl flex flex-col h-full sm:h-auto sm:max-h-[calc(100vh-6rem)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
          <div className="text-sm uppercase tracking-wider text-slate-500">Profile</div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6 flex-1 overflow-y-auto">
          <div className="flex items-center gap-3">
            <div
              className="h-16 w-16 rounded-full border-2 overflow-hidden shrink-0 flex items-center justify-center text-2xl font-serif"
              style={{
                borderColor: member.color,
                backgroundColor: url ? '#020617' : `color-mix(in srgb, ${member.color} 22%, transparent)`,
                color: member.color,
              }}
            >
              {url ? (
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                (member.displayName || '?').slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xl font-serif text-slate-100 truncate">{member.displayName}</div>
              <div className="text-xs uppercase tracking-wider" style={{ color: roleColor(member.role, { gm, cogm, player }) }}>
                {member.role === 'gm' ? 'Game Master' : member.role === 'cogm' ? 'Co-GM' : 'Player'}
              </div>
            </div>
            <button
              onClick={() => onWhisper(member.userId)}
              className="ml-auto px-2.5 py-1.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1.5 shrink-0"
            >
              <MessageCircle size={12} /> Whisper
            </button>
          </div>

          <Section title="About">
            {bioLoading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : bio ? (
              <div className="text-sm text-slate-300 whitespace-pre-wrap">{bio}</div>
            ) : (
              <div className="text-sm text-slate-500 italic">No bio yet.</div>
            )}
          </Section>

          <Section title="Character">
            {claimedCharacter ? (
              <CharCard
                m={claimedCharacter}
                userId={null}
                isGM={false}
                editable={false}
                memberNames={{}}
                onUpdate={async () => {}}
                onRemove={() => {}}
                onClaim={() => {}}
                onUnclaim={() => {}}
              />
            ) : (
              <div className="text-sm text-slate-500 italic">No claimed character in this campaign.</div>
            )}
          </Section>

          <Section title="Other campaigns">
            {campaignsLoading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : otherCampaigns.length === 0 ? (
              <div className="text-sm text-slate-500 italic">Not in any other campaigns.</div>
            ) : (
              <div className="space-y-1.5">
                {otherCampaigns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSpectate(c.id)}
                    className="group w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-left transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-serif text-slate-100 truncate">{c.name}</div>
                      <div className="text-[11px] flex items-center gap-1">
                        <span style={{ color: roleColor(c.role, { gm, cogm, player }) }}>
                          {c.role === 'gm' ? 'Game Master' : c.role === 'cogm' ? 'Co-GM' : 'Player'}
                        </span>
                        <span className="opacity-50 text-slate-500">·</span>
                        <span className="text-slate-500 truncate">{c.display_name}</span>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-600 group-hover:text-sky-300 shrink-0">
                      <Eye size={12} /> View <ChevronRight size={14} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">{title}</div>
      {children}
    </section>
  );
}
