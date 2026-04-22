-- 030_media_revenue_model.sql
-- Per-sport media revenue configuration: non-linear (OTT/streaming) and
-- linear (traditional TV) projections, plus influencer economics.
-- Single-row-per-sport-channel; revenue is computed on the fly.

create table if not exists fsp_media_revenue (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  channel text not null check (channel in ('non_linear', 'linear')),
  -- Per-year ad impressions and cpm. revenue = impressions / 1000 * cpm.
  impressions_y1 numeric(14, 0) not null default 0,
  impressions_y2 numeric(14, 0) not null default 0,
  impressions_y3 numeric(14, 0) not null default 0,
  cpm_y1 numeric(10, 2) not null default 0,
  cpm_y2 numeric(10, 2) not null default 0,
  cpm_y3 numeric(10, 2) not null default 0,
  avg_viewership numeric(14, 0) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sport_id, channel)
);

create table if not exists fsp_influencer_economics (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references fsp_sports(id) on delete cascade,
  creator_tier text not null check (creator_tier in ('nano', 'micro', 'mid', 'macro', 'mega')),
  creators_count integer not null default 0,
  avg_followers integer not null default 0,
  posts_per_year integer not null default 0,
  cost_per_post_usd numeric(10, 2) not null default 0,
  engagement_rate_pct numeric(5, 2) not null default 0,
  brand_deal_split_pct numeric(5, 2) not null default 50,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fsp_media_revenue_sport on fsp_media_revenue(sport_id);
create index if not exists idx_fsp_influencer_economics_sport on fsp_influencer_economics(sport_id);
