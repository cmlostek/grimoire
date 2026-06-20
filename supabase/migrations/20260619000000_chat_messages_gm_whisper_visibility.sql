-- =============================================
-- Chat whispers: GMs see every whisper in their campaign.
-- =============================================
-- The original SELECT policy hid whispers from anyone outside sender/recipient.
-- For session moderation and "no secrets from the GM" play, GMs now see all
-- whispers in campaigns they run. Player whisper privacy from peers is
-- preserved — non-GMs still only see whispers they sent or were on.
drop policy if exists chat_messages_select on chat_messages;
create policy chat_messages_select on chat_messages for select to authenticated
  using (
    is_member(campaign_id)
    and (
      whisper_to is null
      or sender_id = auth.uid()
      or auth.uid() = any(whisper_to)
      or is_gm(campaign_id)
    )
  );
