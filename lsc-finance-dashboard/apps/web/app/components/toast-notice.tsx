"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";

type ToastStatus = "success" | "error" | "info";

export function ToastNotice() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = (searchParams.get("status") ?? null) as ToastStatus | null;
  const message = searchParams.get("message");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!message) return;
    // Auto-dismiss success toasts after 5s; errors stay until dismissed
    if (status === "success" || status === "info") {
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    }
  }, [message, status]);

  if (!message || !visible) return null;

  function dismiss() {
    setVisible(false);
    // Strip status/message from URL so refreshing doesn't re-show
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("message");
    const q = params.toString();
    router.replace(`${pathname}${q ? `?${q}` : ""}`);
  }

  const icon = status === "error" ? "!" : status === "info" ? "i" : "✓";
  const title =
    status === "error"
      ? "Something went wrong"
      : status === "info"
        ? "Heads up"
        : "Done";

  return (
    <div className={`toast-notice toast-${status ?? "info"}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="toast-body">
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="toast-dismiss" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
