-- Allow GMs to hard-delete chat messages in their campaign.
-- Players still can't hard-delete — soft-delete via UPDATE is their only path.
drop policy if exists chat_messages_delete on chat_messages;
create policy chat_messages_delete on chat_messages for delete to authenticated
  using (is_gm(campaign_id));
