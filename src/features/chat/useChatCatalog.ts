import { useEffect } from 'react';
import { useNotes } from '../notes/notesStore';
import { useNpcStore } from '../npcs/npcStore';
import { useSharedHomebrew } from '../homebrew/sharedHomebrewStore';

/**
 * The chat panel can be opened from any page, but `#` references draw from
 * stores those pages own. This hook ensures the catalog stores are populated
 * for the active campaign, even if the user never visited those pages.
 */
export function useChatCatalog(campaignId: string | null) {
  const loadNotes = useNotes((s) => s.loadForCampaign);
  const loadNpcs = useNpcStore((s) => s.loadForCampaign);
  const loadHomebrew = useSharedHomebrew((s) => s.loadForCampaign);

  useEffect(() => {
    if (!campaignId) return;
    void loadNotes(campaignId);
    void loadNpcs(campaignId);
    void loadHomebrew(campaignId);
  }, [campaignId, loadNotes, loadNpcs, loadHomebrew]);
}
