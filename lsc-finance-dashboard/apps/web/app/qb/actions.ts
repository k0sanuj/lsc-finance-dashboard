"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireSession } from "../../lib/auth";
import {
  deleteQbAccountMapping,
  disconnectQbConnection,
  getQbConnectionByRealm,
  markQbConnectionSynced,
  upsertQbAccountMapping,
  upsertQbAccounts,
  upsertQbConnection,
} from "@lsc/db";
import {
  decryptToken,
  encryptToken,
  listAccounts,
  refreshAccessToken,
  qbEnvironment,
} from "@lsc/skills/shared/quickbooks";
import { cascadeUpdate } from "@lsc/skills/shared/cascade-update";

function redirectBack(status: "success" | "error", message: string) {
  const params = new URLSearchParams({ status, message });
  redirect(`/qb?${params.toString()}`);
}

/**
 * Ensure we have a usable access token. Refreshes if <2 minutes left.
 * Returns the plaintext access token.
 */
async function ensureAccessToken(realmId: string): Promise<string> {
  const conn = await getQbConnectionByRealm(realmId);
  if (!conn) throw new Error(`No active QuickBooks connection for realm ${realmId}`);

  const expiresMs = new Date(conn.accessTokenExpiresAt).getTime();
  if (expiresMs - Date.now() > 2 * 60 * 1000) {
    // Still fresh — decrypt and return
    return decryptToken({
      ciphertext: conn.accessTokenCiphertext,
      iv: conn.accessTokenIv,
      authTag: conn.accessTokenAuthTag,
    });
  }

  // Refresh
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

export async function syncChartOfAccountsAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const realmId = String(formData.get("realmId") ?? "").trim();
  if (!realmId) redirectBack("error", "Missing realmId.");

  const conn = await getQbConnectionByRealm(realmId);
  if (!conn) redirectBack("error", "No active QuickBooks connection.");

  try {
    const accessToken = await ensureAccessToken(realmId);
    const accounts = await listAccounts(accessToken, realmId);
    await upsertQbAccounts(
      accounts.map((a) => ({
        connectionId: conn!.id,
        qbAccountId: a.Id,
        qbSyncToken: a.SyncToken ?? null,
        accountName: a.Name,
        accountType: a.AccountType,
        accountSubType: a.AccountSubType ?? null,
        accountNumber: a.AcctNum ?? null,
        classification: a.Classification ?? null,
        fullyQualifiedName: a.FullyQualifiedName ?? null,
        description: a.Description ?? null,
        currentBalance: typeof a.CurrentBalance === "number" ? a.CurrentBalance : null,
        currencyCode: a.CurrencyRef?.value ?? null,
        isActive: a.Active !== false,
        parentQbAccountId: a.ParentRef?.value ?? null,
      }))
    );
    await markQbConnectionSynced(conn!.id);

    try {
      await cascadeUpdate({
        trigger: "qb-accounts:synced",
        entityType: "qb_connection",
        entityId: conn!.id,
        action: "sync-accounts",
        after: { realmId, accountCount: accounts.length },
        performedBy: session.id,
        agentId: "quickbooks-agent",
      });
    } catch {
      // Audit is best-effort
    }

    revalidatePath("/qb");
    redirectBack(
      "success",
      `Synced ${accounts.length} account${accounts.length === 1 ? "" : "s"} from QuickBooks.`
    );
  } catch (err) {
    // `redirect()` throws NEXT_REDIRECT internally — don't swallow it.
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const message = err instanceof Error ? err.message : String(err);
    redirectBack("error", `Sync failed: ${message}`);
  }
}

export async function disconnectQbAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const connectionId = String(formData.get("connectionId") ?? "").trim();
  if (!connectionId) redirectBack("error", "Missing connection id.");

  await disconnectQbConnection(connectionId);

  try {
    await cascadeUpdate({
      trigger: "qb-connection:disconnected",
      entityType: "qb_connection",
      entityId: connectionId,
      action: "disconnect",
      after: { disconnected: true },
      performedBy: session.id,
      agentId: "quickbooks-agent",
    });
  } catch {
    // best-effort
  }

  revalidatePath("/qb");
  redirectBack("success", "Disconnected from QuickBooks.");
}

// ──────────────────────────────────────────────────────────────
// Account-mapping actions (Phase 3)
// ──────────────────────────────────────────────────────────────

export async function saveQbAccountMappingAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();

  const connectionId = String(formData.get("connectionId") ?? "").trim();
  const costCategoryId = String(formData.get("costCategoryId") ?? "").trim();
  const debitQbAccountId = String(formData.get("debitQbAccountId") ?? "").trim();
  const creditRaw = String(formData.get("creditQbAccountId") ?? "").trim();
  const creditQbAccountId = creditRaw.length > 0 ? creditRaw : null;
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const notes = notesRaw.length > 0 ? notesRaw : null;

  if (!connectionId || !costCategoryId) {
    redirectBack("error", "Missing connection or cost category.");
  }

  if (!debitQbAccountId) {
    // Empty debit means "remove mapping"
    await deleteQbAccountMapping(connectionId, costCategoryId);
    revalidatePath("/qb");
    redirectBack("success", "Mapping removed.");
    return;
  }

  await upsertQbAccountMapping({
    connectionId,
    costCategoryId,
    debitQbAccountId,
    creditQbAccountId,
    notes,
    createdByUserId: session.id,
  });

  try {
    await cascadeUpdate({
      trigger: "qb-connection:connected",
      entityType: "qb_account_mapping",
      entityId: `${connectionId}:${costCategoryId}`,
      action: "upsert-mapping",
      after: { debitQbAccountId, creditQbAccountId },
      performedBy: session.id,
      agentId: "quickbooks-agent",
    });
  } catch {
    // best-effort audit
  }

  revalidatePath("/qb");
  redirectBack("success", "Mapping saved.");
}
