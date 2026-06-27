-- =============================================
-- Map scenes — multi-scene support for the map view.
-- =============================================
-- One campaign now has many scenes. A scene owns its own grid, shapes,
-- and image layers (multiple positioned images composing the visible map).
-- map_state keeps the per-campaign active/preview pointers so the GM can
-- stage a scene without flipping the player view yet.
-- map_tokens gain scene_id so each scene has its own roster.

create table if not exists map_scenes (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  name         text not null default 'Scene',
  order_idx    int not null default 0,
  grid_size    int not null default 50,
  show_grid    boolean not null default true,
  width        int not null default 2000,
  height       int not null default 1500,
  -- data shape: { shapes: MapShape[], layers: ImageLayer[] }
  -- ImageLayer: { id, url, x, y, w, h, rotation, hidden, name }
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists map_scenes_campaign_idx on map_scenes(campaign_id);

alter table map_state
  add column if not exists active_scene_id      uuid references map_scenes(id) on delete set null,
  add column if not exists gm_preview_scene_id  uuid references map_scenes(id) on delete set null;

alter table map_tokens
  add column if not exists scene_id uuid references map_scenes(id) on delete cascade;
create index if not exists map_tokens_scene_idx on map_tokens(scene_id);

-- Backfill: every campaign with map_state or map_tokens gets one scene
-- carrying its current settings. The existing background_url becomes a
-- single full-canvas image layer so nothing visually changes after the
-- migration. Tokens get pointed at that scene.
do $$
declare
  c          record;
  new_scene  uuid;
  bg_layer   jsonb;
  existing   jsonb;
begin
  for c in
    select s.campaign_id, s.background_url, s.grid_size, s.width, s.height, s.data
      from map_state s
     where not exists (select 1 from map_scenes z where z.campaign_id = s.campaign_id)
  loop
    existing := coalesce(c.data, '{}'::jsonb);
    if c.background_url is not null and length(c.background_url) > 0 then
      bg_layer := jsonb_build_array(jsonb_build_object(
        'id',       gen_random_uuid()::text,
        'url',      c.background_url,
        'name',     'Background',
        'x',        0,
        'y',        0,
        'w',        c.width,
        'h',        c.height,
        'rotation', 0,
        'hidden',   false
      ));
    else
      bg_layer := '[]'::jsonb;
    end if;

    insert into map_scenes (campaign_id, name, order_idx, grid_size, show_grid, width, height, data)
    values (
      c.campaign_id,
      'Scene 1',
      0,
      coalesce(c.grid_size, 50),
      coalesce((existing->>'show_grid')::boolean, true),
      coalesce(c.width, 2000),
      coalesce(c.height, 1500),
      jsonb_build_object(
        'shapes', coalesce(existing->'shapes', '[]'::jsonb),
        'layers', bg_layer
      )
    )
    returning id into new_scene;

    update map_state
       set active_scene_id = new_scene
     where campaign_id = c.campaign_id and active_scene_id is null;

    update map_tokens
       set scene_id = new_scene
     where campaign_id = c.campaign_id and scene_id is null;
  end loop;

  -- Campaigns that have tokens but no map_state row still need a scene
  -- so the tokens stay reachable.
  for c in
    select distinct t.campaign_id
      from map_tokens t
     where t.scene_id is null
       and not exists (select 1 from map_scenes z where z.campaign_id = t.campaign_id)
  loop
    insert into map_scenes (campaign_id, name, order_idx, data)
    values (c.campaign_id, 'Scene 1', 0, jsonb_build_object('shapes', '[]'::jsonb, 'layers', '[]'::jsonb))
    returning id into new_scene;

    update map_tokens set scene_id = new_scene where campaign_id = c.campaign_id and scene_id is null;
  end loop;
end $$;

alter table map_scenes enable row level security;

drop policy if exists map_scenes_select on map_scenes;
create policy map_scenes_select on map_scenes
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists map_scenes_all on map_scenes;
create policy map_scenes_all on map_scenes
  for all to authenticated
  using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop trigger if exists map_scenes_touch on map_scenes;
create trigger map_scenes_touch before update on map_scenes
  for each row execute function touch_updated_at();

alter publication supabase_realtime add table map_scenes;
