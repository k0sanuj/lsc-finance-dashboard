import "server-only";

import { queryRows } from "../query";
import { getBackend } from "./shared";

export type MediaChannel = "non_linear" | "linear";

export type MediaRevenueRow = {
  id: string | null;
  sportId: string;
  channel: MediaChannel;
  impressionsY1: number;
  impressionsY2: number;
  impressionsY3: number;
  cpmY1: number;
  cpmY2: number;
  cpmY3: number;
  avgViewership: number;
  notes: string | null;
  revenueY1: number;
  revenueY2: number;
  revenueY3: number;
};

export async function getSportMediaRevenue(sportId: string): Promise<MediaRevenueRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    channel: string;
    impressions_y1: string;
    impressions_y2: string;
    impressions_y3: string;
    cpm_y1: string;
    cpm_y2: string;
    cpm_y3: string;
    avg_viewership: string;
    notes: string | null;
  }>(
    `select id::text, channel, impressions_y1::text, impressions_y2::text, impressions_y3::text,
            cpm_y1::text, cpm_y2::text, cpm_y3::text,
            avg_viewership::text, notes
     from fsp_media_revenue_cpm
     where sport_id = $1
     order by channel`,
    [sportId]
  );

  const byChannel = new Map(rows.map((r) => [r.channel, r]));

  return (["non_linear", "linear"] as MediaChannel[]).map((ch) => {
    const row = byChannel.get(ch);
    if (!row) {
      return {
        id: null,
        sportId,
        channel: ch,
        impressionsY1: 0, impressionsY2: 0, impressionsY3: 0,
        cpmY1: 0, cpmY2: 0, cpmY3: 0,
        avgViewership: 0, notes: null,
        revenueY1: 0, revenueY2: 0, revenueY3: 0,
      };
    }
    const iY1 = Number(row.impressions_y1);
    const iY2 = Number(row.impressions_y2);
    const iY3 = Number(row.impressions_y3);
    const cY1 = Number(row.cpm_y1);
    const cY2 = Number(row.cpm_y2);
    const cY3 = Number(row.cpm_y3);
    return {
      id: row.id,
      sportId,
      channel: row.channel as MediaChannel,
      impressionsY1: iY1, impressionsY2: iY2, impressionsY3: iY3,
      cpmY1: cY1, cpmY2: cY2, cpmY3: cY3,
      avgViewership: Number(row.avg_viewership),
      notes: row.notes,
      revenueY1: Number(((iY1 / 1000) * cY1).toFixed(2)),
      revenueY2: Number(((iY2 / 1000) * cY2).toFixed(2)),
      revenueY3: Number(((iY3 / 1000) * cY3).toFixed(2)),
    };
  });
}

export type InfluencerTier = "nano" | "micro" | "mid" | "macro" | "mega";

export type InfluencerRow = {
  id: string;
  creatorTier: InfluencerTier;
  creatorsCount: number;
  avgFollowers: number;
  postsPerYear: number;
  costPerPostUsd: number;
  engagementRatePct: number;
  brandDealSplitPct: number;
  notes: string | null;
  annualCost: number;
  estAnnualValue: number; // creators × posts × cost × split factor
};

export async function getSportInfluencerEconomics(
  sportId: string
): Promise<InfluencerRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    creator_tier: string;
    creators_count: number;
    avg_followers: number;
    posts_per_year: number;
    cost_per_post_usd: string;
    engagement_rate_pct: string;
    brand_deal_split_pct: string;
    notes: string | null;
  }>(
    `select id::text, creator_tier, creators_count, avg_followers, posts_per_year,
            cost_per_post_usd::text, engagement_rate_pct::text, brand_deal_split_pct::text, notes
     from fsp_influencer_economics
     where sport_id = $1
     order by case creator_tier
       when 'mega' then 5
       when 'macro' then 4
       when 'mid' then 3
       when 'micro' then 2
       when 'nano' then 1
     end desc`,
    [sportId]
  );

  return rows.map((r) => {
    const cost = Number(r.cost_per_post_usd);
    const split = Number(r.brand_deal_split_pct) / 100;
    const annualCost = Number(
      (r.creators_count * r.posts_per_year * cost).toFixed(2)
    );
    // Simple value proxy: annualCost × split (brand-deal share going to LSC)
    const estAnnualValue = Number((annualCost * split).toFixed(2));
    return {
      id: r.id,
      creatorTier: r.creator_tier as InfluencerTier,
      creatorsCount: r.creators_count,
      avgFollowers: r.avg_followers,
      postsPerYear: r.posts_per_year,
      costPerPostUsd: cost,
      engagementRatePct: Number(r.engagement_rate_pct),
      brandDealSplitPct: Number(r.brand_deal_split_pct),
      notes: r.notes,
      annualCost,
      estAnnualValue,
    };
  });
}
