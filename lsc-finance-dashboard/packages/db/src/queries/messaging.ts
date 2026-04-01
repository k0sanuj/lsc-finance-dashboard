import "server-only";

import { queryRows } from "../query";
import { formatDateLabel, getBackend } from "./shared";

export type CrossDashboardMessageRow = {
  id: string;
  fromSystem: string;
  toSystem: string;
  intent: string;
  priority: string;
  requiresResponse: boolean;
  isProcessed: boolean;
  processedAt: string;
  createdAt: string;
  payloadPreview: string;
};

export type MessagingSummary = {
  totalInbound: number;
  totalOutbound: number;
  unprocessed: number;
  critical: number;
};

export async function getInboundMessages(): Promise<CrossDashboardMessageRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    from_system: string;
    to_system: string;
    intent: string;
    priority: string;
    requires_response: boolean;
    is_processed: boolean;
    processed_at: string | null;
    created_at: string;
    payload: string;
  }>(
    `select id, from_system, to_system, intent, priority,
            requires_response, is_processed, processed_at::text,
            created_at::text, payload::text
     from cross_dashboard_messages
     where to_system = 'finance'
     order by created_at desc
     limit 100`
  );

  return rows.map((r) => ({
    id: r.id,
    fromSystem: r.from_system,
    toSystem: r.to_system,
    intent: r.intent,
    priority: r.priority,
    requiresResponse: r.requires_response,
    isProcessed: r.is_processed,
    processedAt: formatDateLabel(r.processed_at),
    createdAt: formatDateLabel(r.created_at),
    payloadPreview: r.payload.length > 120 ? r.payload.slice(0, 117) + "..." : r.payload
  }));
}

export async function getOutboundMessages(): Promise<CrossDashboardMessageRow[]> {
  if (getBackend() !== "database") return [];

  const rows = await queryRows<{
    id: string;
    from_system: string;
    to_system: string;
    intent: string;
    priority: string;
    requires_response: boolean;
    is_processed: boolean;
    processed_at: string | null;
    created_at: string;
    payload: string;
  }>(
    `select id, from_system, to_system, intent, priority,
            requires_response, is_processed, processed_at::text,
            created_at::text, payload::text
     from cross_dashboard_messages
     where from_system = 'finance'
     order by created_at desc
     limit 100`
  );

  return rows.map((r) => ({
    id: r.id,
    fromSystem: r.from_system,
    toSystem: r.to_system,
    intent: r.intent,
    priority: r.priority,
    requiresResponse: r.requires_response,
    isProcessed: r.is_processed,
    processedAt: formatDateLabel(r.processed_at),
    createdAt: formatDateLabel(r.created_at),
    payloadPreview: r.payload.length > 120 ? r.payload.slice(0, 117) + "..." : r.payload
  }));
}

export async function getMessagingSummary(): Promise<MessagingSummary> {
  if (getBackend() !== "database") {
    return { totalInbound: 0, totalOutbound: 0, unprocessed: 0, critical: 0 };
  }

  const rows = await queryRows<{
    inbound: string;
    outbound: string;
    unprocessed: string;
    critical: string;
  }>(
    `select
       count(*) filter (where to_system = 'finance')::text as inbound,
       count(*) filter (where from_system = 'finance')::text as outbound,
       count(*) filter (where to_system = 'finance' and is_processed = false)::text as unprocessed,
       count(*) filter (where to_system = 'finance' and priority = 'critical' and is_processed = false)::text as critical
     from cross_dashboard_messages`
  );

  return {
    totalInbound: Number(rows[0]?.inbound ?? 0),
    totalOutbound: Number(rows[0]?.outbound ?? 0),
    unprocessed: Number(rows[0]?.unprocessed ?? 0),
    critical: Number(rows[0]?.critical ?? 0)
  };
}
