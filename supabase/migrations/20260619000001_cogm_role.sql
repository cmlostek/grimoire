-- =============================================
-- Co-GM role — full GM permissions except deleting the campaign.
-- =============================================
-- Existing 'gm' rows are the primary GM (campaign owner). 'cogm' inherits
-- every is_gm()-gated permission but the campaigns delete policy is
-- narrowed to role = 'gm' only so a co-GM cannot drop the campaign.

alter table campaign_members drop constraint if exists campaign_members_role_check;
alter table campaign_members
  add constraint campaign_members_role_check check (role in ('gm','cogm','player'));

create or replace function public.is_gm(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign and user_id = auth.uid() and role in ('gm','cogm')
  );
$func$;

-- Delete remains restricted to the primary GM only.
drop policy if exists campaigns_delete on campaigns;
create policy campaigns_delete on campaigns for delete to authenticated using (
  exists (
    select 1 from campaign_members
    where campaign_id = id and user_id = auth.uid() and role = 'gm'
  )
);
