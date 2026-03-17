"use client";

import { useFormStatus } from "react-dom";

export function FormButton(props: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button className={`action-button ${props.variant ?? "primary"}`} type="submit" disabled={pending}>
      {pending ? props.pendingLabel : props.label}
    </button>
  );
}
