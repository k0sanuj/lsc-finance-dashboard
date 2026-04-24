import "server-only";

import {
  createJournalEntry,
  decryptToken,
  encryptToken,
  qbEnvironment,
  refreshAccessToken,
  type QbJournalLineInput,
} from "../shared/quickbooks";
import {
  getActiveQbConnections,
  getQbConnectionByRealm,
  getQbMappingForCategory,
  insertQbJournalEntryLog,
  upsertQbConnection,
  queryRowsAdmin,
} from "@lsc/db";

/**
 * Phase 3 — post a single journal entry to QuickBooks for an approved
 * expense submission. Wraps every failure mode so callers never see an
 * exception; we always return { ok, ...details } and log the attempt
 * to qb_journal_entries so the /qb page (and the expense detail page)
 * can show posting history.
 *
 * Status semantics on the returned + logged row:
 *   - "posted":  JE created in QBO; qbJournalEntryId is set
 *   - "failed":  we tried but QBO rejected the payload (auth, unbalanced,
 *                closed period, account deactivated, etc.); errorMessage set
 *   - "skipped": preconditions not met (no connection, no mapping for at
 *                least one line, amount == 0); errorMessage explains which
 */

export type PostExpenseJournalInput = {
  submissionId: string;
  initiatedByUserId: string | null;
};

export type PostExpenseJournalResult = {
  ok: boolean;
  status: "posted" | "failed" | "skipped";
  journalEntryId?: string;
  errorMessage?: string;
  logId?: string;
};

type ExpenseItemRow = {
  id: string;
  cost_category_id: string | null;
  amount: string;
  description: string | null;
  merchant_name: string | null;
  expense_date: string | null;
};

async function ensureAccessToken(realmId: string): Promise<string> {
  const conn = await getQbConnectionByRealm(realmId);
  if (!conn) throw new Error(`No active QuickBooks connection for realm ${realmId}`);

  const expiresMs = new Date(conn.accessTokenExpiresAt).getTime();
  // Refresh if <2 minutes remaining on the access token.
  if (expiresMs - Date.now() > 2 * 60 * 1000) {
    return decryptToken({
      ciphertext: conn.accessTokenCiphertext,
      iv: conn.accessTokenIv,
      authTag: conn.accessTokenAuthTag,
    });
  }

  const refreshToken = decryptToken({
    ciphertext: conn.refreshTokenCiphertext,
    iv: conn.refreshTokenIv,
    authTag: conn.refreshTokenAuthTag,
  });
  const refreshed = await refreshAccessToken(refreshToken);
  const accessEnc = encryptToken(refreshed.access_token);
  const refreshEnc = encryptToken(refreshed.refresh_token);
  const now = Date.now();
  await upsertQbConnection({
    realmId,
    environment: qbEnvironment(),
    companyName: conn.companyName,
    appId: conn.appId,
    connectedByUserId: conn.connectedByUserId,
    accessToken: {
      ciphertext: accessEnc.ciphertext,
      iv: accessEnc.iv,
      authTag: accessEnc.authTag,
      expiresAtIso: new Date(now + refreshed.expires_in * 1000).toISOString(),
    },
    refreshToken: {
      ciphertext: refreshEnc.ciphertext,
      iv: refreshEnc.iv,
      authTag: refreshEnc.authTag,
      expiresAtIso: new Date(
        now + refreshed.x_refresh_token_expires_in * 1000
      ).toISOString(),
    },
  });
  return refreshed.access_token;
}

export async function postExpenseJournal(
  input: PostExpenseJournalInput
): Promise<PostExpenseJournalResult> {
  const { submissionId, initiatedByUserId } = input;

  // 0. Pick a connection. If none, record "skipped" and bail.
  const connections = await getActiveQbConnections();
  if (connections.length === 0) {
    return {
      ok: false,
      status: "skipped",
      errorMessage: "No active QuickBooks connection — skipping JE post.",
    };
  }
  const connection = connections[0]; // Primary connection (same as /qb page logic)

  // 1. Load the submission + its items
  const itemRows = await queryRowsAdmin<ExpenseItemRow>(
    `select id::text,
            cost_category_id::text,
            amount::text,
            description,
            merchant_name,
            expense_date::text
     from expense_submission_items
     where submission_id = $1
     order by created_at`,
    [submissionId]
  );

  if (itemRows.length === 0) {
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "skipped",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: 0,
      txnDate: null,
      errorMessage: "No expense line items on submission.",
      requestPayload: null,
      responsePayload: null,
      lineItems: [],
    });
    return {
      ok: false,
      status: "skipped",
      errorMessage: "No expense line items on submission.",
      logId,
    };
  }

  // Pull submission metadata for memo + date
  const submissionRows = await queryRowsAdmin<{
    title: string;
    submitter_name: string;
    submitted_at: string;
  }>(
    `select es.submission_title as title,
            au.full_name as submitter_name,
            es.submitted_at::text
     from expense_submissions es
     join app_users au on au.id = es.submitted_by_user_id
     where es.id = $1`,
    [submissionId]
  );
  const submissionMeta = submissionRows[0];

  // 2. Build lines. Each expense item becomes a Debit on its mapped
  //    expense account. We accumulate the total and post a single
  //    Credit to the mapping's credit account (if set) or bail.
  const lines: QbJournalLineInput[] = [];
  type LineMeta = {
    itemId: string;
    amount: number;
    mapping: { debitQbAccountId: string; creditQbAccountId: string | null };
    description: string | null;
  };
  const lineMeta: LineMeta[] = [];
  const unmapped: string[] = [];
  let totalAmount = 0;

  for (const it of itemRows) {
    const amount = Number(it.amount) || 0;
    if (amount <= 0) continue; // skip zero-value rows silently
    if (!it.cost_category_id) {
      unmapped.push(`item ${it.id} has no cost_category_id`);
      continue;
    }
    const mapping = await getQbMappingForCategory(
      connection.id,
      it.cost_category_id
    );
    if (!mapping) {
      unmapped.push(
        `category ${it.cost_category_id} has no QuickBooks mapping`
      );
      continue;
    }
    lineMeta.push({
      itemId: it.id,
      amount,
      mapping,
      description: it.description ?? it.merchant_name ?? null,
    });
    totalAmount += amount;
  }

  if (unmapped.length > 0) {
    const msg = `Skipped JE post: ${unmapped.length} item(s) not mapped. ${unmapped.join("; ")}`;
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "skipped",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: totalAmount,
      txnDate: null,
      errorMessage: msg,
      requestPayload: null,
      responsePayload: null,
      lineItems: lineMeta.map((l) => ({
        itemId: l.itemId,
        amount: l.amount,
        debitQbAccountId: l.mapping.debitQbAccountId,
      })),
    });
    return { ok: false, status: "skipped", errorMessage: msg, logId };
  }

  if (lineMeta.length === 0 || totalAmount <= 0) {
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "skipped",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: 0,
      txnDate: null,
      errorMessage: "Nothing to post (zero-amount or empty line set).",
      requestPayload: null,
      responsePayload: null,
      lineItems: [],
    });
    return {
      ok: false,
      status: "skipped",
      errorMessage: "Nothing to post (zero-amount or empty line set).",
      logId,
    };
  }

  // All lines must share a credit account for a single-JE post. Use the
  // first line's credit account as the canonical one; if any line has
  // a different credit account or none at all, bail.
  const creditQbAccountId = lineMeta[0].mapping.creditQbAccountId;
  if (!creditQbAccountId) {
    const msg =
      "No credit-side account configured. Set a credit account in the first mapping or use per-category credit mappings.";
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "skipped",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: totalAmount,
      txnDate: null,
      errorMessage: msg,
      requestPayload: null,
      responsePayload: null,
      lineItems: lineMeta,
    });
    return { ok: false, status: "skipped", errorMessage: msg, logId };
  }
  if (
    lineMeta.some(
      (l) => (l.mapping.creditQbAccountId ?? creditQbAccountId) !== creditQbAccountId
    )
  ) {
    const msg =
      "Per-line credit accounts diverge. Multi-credit JEs are not yet supported.";
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "skipped",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: totalAmount,
      txnDate: null,
      errorMessage: msg,
      requestPayload: null,
      responsePayload: null,
      lineItems: lineMeta,
    });
    return { ok: false, status: "skipped", errorMessage: msg, logId };
  }

  // Build the debit lines, one per mapped item
  for (const l of lineMeta) {
    lines.push({
      amount: l.amount,
      postingType: "Debit",
      qbAccountId: l.mapping.debitQbAccountId,
      description: l.description,
    });
  }
  // Single credit line for the total
  lines.push({
    amount: totalAmount,
    postingType: "Credit",
    qbAccountId: creditQbAccountId,
    description: submissionMeta?.title ?? `Expense submission ${submissionId}`,
  });

  const txnDate = (() => {
    // Use the earliest expense_date on the submission if available,
    // otherwise today.
    const earliest = itemRows
      .map((it) => it.expense_date)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    return earliest ?? new Date().toISOString().slice(0, 10);
  })();

  const privateNote = submissionMeta
    ? `LSC expense submission: "${submissionMeta.title}" by ${submissionMeta.submitter_name} (${submissionId})`
    : `LSC expense submission ${submissionId}`;

  // 3. Post to QBO
  let accessToken: string;
  try {
    accessToken = await ensureAccessToken(connection.realmId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "failed",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: totalAmount,
      txnDate,
      errorMessage: `Token refresh failed: ${message}`,
      requestPayload: null,
      responsePayload: null,
      lineItems: lineMeta,
    });
    return { ok: false, status: "failed", errorMessage: message, logId };
  }

  const requestPayload = { txnDate, privateNote, lines };
  try {
    const je = await createJournalEntry(accessToken, connection.realmId, {
      txnDate,
      privateNote,
      lines,
    });
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "posted",
      qbJournalEntryId: je.Id,
      qbSyncToken: je.SyncToken,
      totalAmountUsd: totalAmount,
      txnDate,
      errorMessage: null,
      requestPayload,
      responsePayload: je,
      lineItems: lineMeta,
    });
    return { ok: true, status: "posted", journalEntryId: je.Id, logId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const logId = await insertQbJournalEntryLog({
      connectionId: connection.id,
      sourceEntityType: "expense_submission",
      sourceEntityId: submissionId,
      initiatedByUserId,
      status: "failed",
      qbJournalEntryId: null,
      qbSyncToken: null,
      totalAmountUsd: totalAmount,
      txnDate,
      errorMessage: message,
      requestPayload,
      responsePayload: null,
      lineItems: lineMeta,
    });
    return { ok: false, status: "failed", errorMessage: message, logId };
  }
}
