import "server-only";

import { queryRows } from "../query";
import { formatDateLabel, getBackend } from "./shared";

export type IngestionQueueRow = {
  id: string;
  sourceType: string;
  sourceName: string;
  targetModule: string;
  status: string;
  recordsCreated: number;
  extractedDataPreview: string;
  submittedAt: string;
  processedAt: string;
};

export type IngestionSummary = {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
};

export async function getIngestionQueue(): Promise<IngestionQueueRow[]> {
  if (getBackend() !== "database") {
    return [];
  }

  const rows = await queryRows<{
    id: string;
    source_type: string;
    source_name: string;
    target_module: string;
    status: string;
    records_created: string;
    extracted_data: string | null;
    created_at: string;
    processed_at: string | null;
  }>(
    `select
       id,
       source_type,
       coalesce(source_name, 'Untitled') as source_name,
       coalesce(target_module, 'unclassified') as target_module,
       coalesce(status, 'queued') as status,
       coalesce(records_created, 0)::text as records_created,
       extracted_data::text as extracted_data,
       created_at::text as created_at,
       processed_at::text as processed_at
     from ai_ingestion_queue
     where deleted_at is null
     order by created_at desc
     limit 100`
  );

  return rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    targetModule: row.target_module,
    status: row.status,
    recordsCreated: Number(row.records_created),
    extractedDataPreview: row.extracted_data
      ? String(row.extracted_data).slice(0, 200)
      : "",
    submittedAt: formatDateLabel(row.created_at),
    processedAt: formatDateLabel(row.processed_at)
  }));
}

export async function getIngestionSummary(): Promise<IngestionSummary> {
  if (getBackend() !== "database") {
    return { total: 0, queued: 0, processing: 0, completed: 0, failed: 0 };
  }

  const rows = await queryRows<{
    status: string;
    count: string;
  }>(
    `select
       coalesce(status, 'queued') as status,
       count(*)::text as count
     from ai_ingestion_queue
     where deleted_at is null
     group by status`
  );

  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const n = Number(row.count);
    counts[row.status] = n;
    total += n;
  }

  return {
    total,
    queued: counts["queued"] ?? 0,
    processing: counts["processing"] ?? 0,
    completed: counts["completed"] ?? 0,
    failed: counts["failed"] ?? 0
  };
}
