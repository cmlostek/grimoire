-- Allow players to unclaim their own character (set owner_user_id = null).
-- The original WITH CHECK required owner_user_id = auth.uid(), which blocked
-- setting it to null. Now WITH CHECK matches the USING clause — players may
-- leave the result owned by themselves OR unowned.
drop policy if exists party_update on party_members;
create policy party_update on party_members for update to authenticated
  using  (is_gm(campaign_id) or (is_member(campaign_id) and (owner_user_id is null or owner_user_id = auth.uid())))
  with check (is_gm(campaign_id) or (is_member(campaign_id) and (owner_user_id is null or owner_user_id = auth.uid())));
