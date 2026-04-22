"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  pendingLabel?: string;
  confirmMessage?: string;
};

export function SubmitButton({
  children,
  variant = "primary",
  pendingLabel,
  confirmMessage,
}: Props) {
  const { pending } = useFormStatus();

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (pending) return;
    if (confirmMessage && !confirm(confirmMessage)) {
      e.preventDefault();
    }
  }

  return (
    <button
      type="submit"
      className={`action-button ${variant}`}
      disabled={pending}
      onClick={handleClick}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span>{pendingLabel ?? "Saving…"}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
