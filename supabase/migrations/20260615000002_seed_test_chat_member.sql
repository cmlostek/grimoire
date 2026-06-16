-- =============================================
-- TEMP: seed a fake second campaign_member into Test Campaign (join_code ATR8Y6)
-- so the @-mention picker has someone to show during dev.
-- Remove with the cleanup snippet in the chat README when done testing.
-- =============================================

insert into campaign_members (campaign_id, user_id, display_name, role, color)
select id, '00000000-0000-0000-0000-000000000001'::uuid, 'Test Bot', 'player', '#a78bfa'
from campaigns
where join_code = 'ATR8Y6'
on conflict (campaign_id, user_id) do nothing;
