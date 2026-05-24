"use server";

import { redirect } from "next/navigation";
import { authenticateWithPassword, requestMagicLink } from "../../lib/auth";

export async function requestMagicLinkAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const result = await requestMagicLink(email);
  const params = new URLSearchParams({ sent: "1" });

  if (result.devMagicLink) {
    params.set("devLink", result.devMagicLink);
  }

  redirect(`/login?${params.toString()}`);
}

export async function passwordLoginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await authenticateWithPassword(email, password);

  if (!result.ok) {
    redirect(`/login?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/");
}
