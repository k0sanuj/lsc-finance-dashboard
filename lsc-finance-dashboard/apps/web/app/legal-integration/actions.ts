"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireSession } from "../../lib/auth";
import {
  insertLegalApiKey,
  revokeLegalApiKey,
} from "@lsc/db";
import { generateLegalApiKey } from "@lsc/skills/legal/webhook";

function redirectBack(params: Record<string, string>): never {
  const qs = new URLSearchParams(params);
  redirect(`/legal-integration?${qs.toString()}`);
}

export async function generateLegalApiKeyAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) redirectBack({ status: "error", message: "Label is required." });

  try {
    const { keyPrefix, plaintextSecret, encryptedSecret } = generateLegalApiKey();
    await insertLegalApiKey({
      keyPrefix,
      secretCiphertext: encryptedSecret.ciphertext,
      secretIv: encryptedSecret.iv,
      secretAuthTag: encryptedSecret.authTag,
      label,
      createdByUserId: session.id,
    });
    revalidatePath("/legal-integration");
    // One-time display: pass the plaintext back in the querystring. This is
    // acceptable because it's only shown to the admin who just created it,
    // on a page behind auth, and it'll be cleared on the next navigation.
    redirectBack({
      status: "success",
      message: `API key created. Copy the secret below — it will not be shown again.`,
      newSecret: plaintextSecret,
      newPrefix: keyPrefix,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const message = err instanceof Error ? err.message : String(err);
    redirectBack({ status: "error", message });
  }
}

export async function revokeLegalApiKeyAction(formData: FormData) {
  await requireRole(["super_admin", "finance_admin"]);
  const session = await requireSession();
  const id = String(formData.get("keyId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!id) redirectBack({ status: "error", message: "Missing key id." });

  await revokeLegalApiKey(id, session.id, reason);
  revalidatePath("/legal-integration");
  redirectBack({ status: "success", message: "API key revoked." });
}
