import "server-only";

import crypto from "node:crypto";

/**
 * QuickBooks Online (QBO) REST client + OAuth 2.0 flow.
 *
 * Why not the community MCP server: we run on Vercel; serverless functions
 * can't host a long-lived stdio MCP process. This module calls the Intuit
 * REST API directly — the same thing the MCP server does under the hood —
 * and stores per-realm encrypted tokens in our Neon DB so we support
 * multiple QBO companies from day one.
 *
 * Tokens are AES-256-GCM encrypted using QUICKBOOKS_TOKEN_ENCRYPTION_KEY
 * (32-byte key, base64 encoded). We store ciphertext + IV + auth tag in
 * separate columns so the DB never sees plaintext.
 */

export type QbEnvironment = "sandbox" | "production";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`${name} is not set`);
  }
  return v.trim();
}

export function qbEnvironment(): QbEnvironment {
  const v = (process.env.QUICKBOOKS_ENVIRONMENT ?? "sandbox").toLowerCase();
  return v === "production" ? "production" : "sandbox";
}

function authBaseUrl(): string {
  // OAuth endpoints are the same for sandbox and production — Intuit
  // decides which environment a token belongs to based on the credentials.
  return "https://appcenter.intuit.com/connect/oauth2";
}

function tokenBaseUrl(): string {
  return "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
}

function apiBaseUrl(env: QbEnvironment): string {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

// ──────────────────────────────────────────────────────────────
// Token encryption (AES-256-GCM)
// ──────────────────────────────────────────────────────────────

export type EncryptedToken = {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
};

function loadKey(): Buffer {
  const raw = requireEnv("QUICKBOOKS_TOKEN_ENCRYPTION_KEY");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `QUICKBOOKS_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

export function encryptToken(plaintext: string): EncryptedToken {
  const key = loadKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptToken(enc: EncryptedToken): string {
  const key = loadKey();
  const iv = Buffer.from(enc.iv, "base64");
  const authTag = Buffer.from(enc.authTag, "base64");
  const ct = Buffer.from(enc.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

// ──────────────────────────────────────────────────────────────
// OAuth 2.0 — authorization URL, code exchange, refresh
// ──────────────────────────────────────────────────────────────

const DEFAULT_SCOPES = ["com.intuit.quickbooks.accounting"];

/**
 * Build the consent-screen URL. `state` is a CSRF token we later verify
 * in the callback.
 */
export function buildAuthorizeUrl(state: string): string {
  const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
  const redirectUri = requireEnv("QUICKBOOKS_REDIRECT_URI");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: DEFAULT_SCOPES.join(" "),
    redirect_uri: redirectUri,
    state,
  });
  return `${authBaseUrl()}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in: number;
  token_type: string;
};

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
  const clientSecret = requireEnv("QUICKBOOKS_CLIENT_SECRET");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(tokenBaseUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Intuit token exchange failed: HTTP ${res.status} ${text}`);
  }

  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    throw new Error(`Intuit token response was not JSON: ${text.slice(0, 200)}`);
  }
}

/** Exchange an authorization code for an access+refresh token pair. */
export async function exchangeAuthCode(code: string): Promise<TokenResponse> {
  const redirectUri = requireEnv("QUICKBOOKS_REDIRECT_URI");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  return postToken(body);
}

/** Use a refresh token to get a new access+refresh pair. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(body);
}

// ──────────────────────────────────────────────────────────────
// QBO REST API — account + company queries
// ──────────────────────────────────────────────────────────────

export type QbAccount = {
  Id: string;
  SyncToken: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
  AcctNum?: string;
  Classification?: string;
  FullyQualifiedName?: string;
  Description?: string;
  CurrentBalance?: number;
  CurrencyRef?: { value: string; name?: string };
  Active?: boolean;
  ParentRef?: { value: string };
};

export type QbCompanyInfo = {
  Id: string;
  CompanyName?: string;
  LegalName?: string;
  Country?: string;
};

type QbQueryResponse<T> = {
  QueryResponse: {
    [key: string]: T[] | number | undefined;
    maxResults?: number;
    startPosition?: number;
  };
  time?: string;
};

async function qbApiGet<T>(
  accessToken: string,
  realmId: string,
  path: string
): Promise<T> {
  const env = qbEnvironment();
  const url = `${apiBaseUrl(env)}/v3/company/${realmId}/${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`QBO GET ${path} failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`QBO response was not JSON: ${text.slice(0, 200)}`);
  }
}

/** Pull company info (used as a sanity check after OAuth). */
export async function getCompanyInfo(
  accessToken: string,
  realmId: string
): Promise<QbCompanyInfo> {
  const data = await qbApiGet<{ CompanyInfo: QbCompanyInfo }>(
    accessToken,
    realmId,
    `companyinfo/${realmId}?minorversion=70`
  );
  return data.CompanyInfo;
}

/**
 * List all accounts in the Chart of Accounts. Uses the `query` endpoint
 * with paging (QBO caps at 1000 results per page).
 */
export async function listAccounts(
  accessToken: string,
  realmId: string
): Promise<QbAccount[]> {
  const all: QbAccount[] = [];
  const pageSize = 1000;
  let start = 1;

  while (true) {
    const query = encodeURIComponent(
      `SELECT * FROM Account STARTPOSITION ${start} MAXRESULTS ${pageSize}`
    );
    const path = `query?query=${query}&minorversion=70`;
    const data = await qbApiGet<QbQueryResponse<QbAccount>>(accessToken, realmId, path);
    const page = (data.QueryResponse.Account as QbAccount[] | undefined) ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }

  return all;
}

// ──────────────────────────────────────────────────────────────
// Journal entries
// ──────────────────────────────────────────────────────────────

async function qbApiPost<T>(
  accessToken: string,
  realmId: string,
  path: string,
  body: unknown
): Promise<T> {
  const env = qbEnvironment();
  const url = `${apiBaseUrl(env)}/v3/company/${realmId}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`QBO POST ${path} failed: HTTP ${res.status} ${text.slice(0, 800)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`QBO response was not JSON: ${text.slice(0, 200)}`);
  }
}

export type QbJournalLineInput = {
  /** Amount in the company's home currency. Must be positive. */
  amount: number;
  /**
   * Posting direction for this line. Journal entries must balance:
   * the sum of Debit amounts must equal the sum of Credit amounts.
   */
  postingType: "Debit" | "Credit";
  /** QBO account id (string). */
  qbAccountId: string;
  /** Optional short description (shown on the transaction line in QBO). */
  description?: string | null;
};

export type QbJournalEntryInput = {
  /** YYYY-MM-DD. Defaults to today if omitted. */
  txnDate?: string;
  /**
   * Private memo shown on the transaction in QBO (e.g. "Expense LSC-123").
   * Not seen by vendors.
   */
  privateNote?: string | null;
  /** 1+ pairs of debit/credit lines. Must balance. */
  lines: QbJournalLineInput[];
};

export type QbJournalEntryResponse = {
  JournalEntry: {
    Id: string;
    SyncToken: string;
    DocNumber?: string;
    TxnDate?: string;
    TotalAmt?: number;
    PrivateNote?: string;
  };
  time?: string;
};

/**
 * Post a journal entry to QBO. Returns the created entity; throws on
 * API error. The skill wrapper (skills/quickbooks/journal.ts) catches
 * and logs errors so callers never see exceptions.
 */
export async function createJournalEntry(
  accessToken: string,
  realmId: string,
  input: QbJournalEntryInput
): Promise<QbJournalEntryResponse["JournalEntry"]> {
  if (input.lines.length < 2) {
    throw new Error("Journal entry requires at least 2 lines (debit + credit).");
  }
  // Sanity: amounts must balance.
  const debits = input.lines
    .filter((l) => l.postingType === "Debit")
    .reduce((s, l) => s + l.amount, 0);
  const credits = input.lines
    .filter((l) => l.postingType === "Credit")
    .reduce((s, l) => s + l.amount, 0);
  const diff = Math.abs(debits - credits);
  if (diff > 0.01) {
    throw new Error(
      `Journal entry is unbalanced: debits ${debits.toFixed(2)} != credits ${credits.toFixed(2)} (diff ${diff.toFixed(2)}).`
    );
  }

  const txnDate = input.txnDate ?? new Date().toISOString().slice(0, 10);

  const body = {
    TxnDate: txnDate,
    PrivateNote: input.privateNote ?? undefined,
    Line: input.lines.map((line) => ({
      DetailType: "JournalEntryLineDetail",
      Amount: Number(line.amount.toFixed(2)),
      Description: line.description ?? undefined,
      JournalEntryLineDetail: {
        PostingType: line.postingType,
        AccountRef: { value: line.qbAccountId },
      },
    })),
  };

  const response = await qbApiPost<QbJournalEntryResponse>(
    accessToken,
    realmId,
    `journalentry?minorversion=70`,
    body
  );
  return response.JournalEntry;
}
