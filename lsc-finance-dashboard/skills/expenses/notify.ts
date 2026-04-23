import "server-only";

import {
  getExpenseNotificationContext,
  getFinanceAdminEmails,
  type ExpenseNotificationContext,
} from "@lsc/db";
import { sendEmail, type SendEmailResult } from "../shared/email";

export type ExpenseEventKind =
  | "submitted"
  | "approved"
  | "rejected"
  | "needs_clarification";

/**
 * Derive the canonical app URL for building links inside email bodies.
 * Preference: PUBLIC_APP_URL env (stable) → VERCEL_URL (per-deploy) → fallback.
 * Used only for cosmetic deep-links; emails still make sense without it.
 */
function appUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "https://lsc-finance-dashboard.vercel.app";
}

function fmtUsd(v: number): string {
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function submissionLink(submissionId: string): string {
  return `${appUrl()}/tbr/expense-management/${submissionId}`;
}

type Template = {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
};

function templateFor(
  event: ExpenseEventKind,
  ctx: ExpenseNotificationContext,
  financeAdminEmails: string[]
): Template | null {
  const raceLine = ctx.raceName ? ` · ${ctx.raceName}` : "";
  const amount = fmtUsd(ctx.totalAmountUsd);
  const link = submissionLink(ctx.submissionId);

  if (event === "submitted") {
    // Notify finance admins. Submitter replies go to themselves.
    if (financeAdminEmails.length === 0) return null;
    return {
      to: financeAdminEmails,
      subject: `[Expense] New submission: ${ctx.title} (${amount})`,
      text: [
        `${ctx.submitterName} submitted a new expense for review.`,
        ``,
        `Title: ${ctx.title}${raceLine}`,
        `Amount: ${amount}`,
        `Submitted by: ${ctx.submitterName}${ctx.submitterEmail ? ` <${ctx.submitterEmail}>` : ""}`,
        ``,
        `Review: ${link}`,
      ].join("\n"),
      replyTo: ctx.submitterEmail ?? undefined,
    };
  }

  // All review events go back to the submitter.
  if (!ctx.submitterEmail) return null;

  if (event === "approved") {
    return {
      to: [ctx.submitterEmail],
      subject: `[Expense] Approved: ${ctx.title} (${amount})`,
      text: [
        `Your expense submission was approved and is now invoice-ready.`,
        ``,
        `Title: ${ctx.title}${raceLine}`,
        `Amount: ${amount}`,
        ctx.reviewNote ? `Finance note: ${ctx.reviewNote}` : null,
        ``,
        `Details: ${link}`,
      ]
        .filter((x): x is string => x !== null)
        .join("\n"),
    };
  }

  if (event === "rejected") {
    return {
      to: [ctx.submitterEmail],
      subject: `[Expense] Rejected: ${ctx.title}`,
      text: [
        `Your expense submission was rejected.`,
        ``,
        `Title: ${ctx.title}${raceLine}`,
        `Amount: ${amount}`,
        ctx.reviewNote ? `Reason: ${ctx.reviewNote}` : null,
        ``,
        `Details: ${link}`,
      ]
        .filter((x): x is string => x !== null)
        .join("\n"),
    };
  }

  if (event === "needs_clarification") {
    return {
      to: [ctx.submitterEmail],
      subject: `[Expense] Clarification needed: ${ctx.title}`,
      text: [
        `Finance needs more information on your expense submission before they can approve it.`,
        ``,
        `Title: ${ctx.title}${raceLine}`,
        `Amount: ${amount}`,
        ctx.reviewNote ? `What's needed: ${ctx.reviewNote}` : null,
        ``,
        `Open submission: ${link}`,
      ]
        .filter((x): x is string => x !== null)
        .join("\n"),
    };
  }

  return null;
}

/**
 * Send the appropriate email for a status change. Never throws — failures
 * are logged but don't roll back the caller's DB write.
 */
export async function notifyExpenseEvent(
  event: ExpenseEventKind,
  submissionId: string
): Promise<SendEmailResult | null> {
  try {
    const ctx = await getExpenseNotificationContext(submissionId);
    if (!ctx) {
      console.warn(`[notifyExpenseEvent] no context for submission ${submissionId}`);
      return null;
    }
    const adminEmails =
      event === "submitted" ? await getFinanceAdminEmails() : [];
    const tpl = templateFor(event, ctx, adminEmails);
    if (!tpl) {
      console.warn(
        `[notifyExpenseEvent] no template produced for event=${event} submission=${submissionId}`
      );
      return null;
    }
    const result = await sendEmail({
      to: tpl.to,
      subject: tpl.subject,
      text: tpl.text,
      replyTo: tpl.replyTo,
      purpose: `expense-${event}`,
    });
    if (!result.ok) {
      console.warn(
        `[notifyExpenseEvent] send failed event=${event} submission=${submissionId} error=${result.error}`
      );
    }
    return result;
  } catch (err) {
    console.warn(
      `[notifyExpenseEvent] threw event=${event} submission=${submissionId} error=${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}
