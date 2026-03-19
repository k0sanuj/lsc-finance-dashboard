"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ModalLauncherProps = {
  triggerLabel: string;
  title: string;
  description?: string;
  eyebrow?: string;
  children: React.ReactNode;
};

export function ModalLauncher({
  triggerLabel,
  title,
  description,
  eyebrow = "Quick action",
  children
}: ModalLauncherProps) {
  const [open, setOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Focus trap + escape key
  useEffect(() => {
    if (!open || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusFirst = () => {
      const first = modal.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    };

    // Auto-focus first focusable element
    requestAnimationFrame(focusFirst);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }

      if (e.key !== "Tab") return;

      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        className="solid-link modal-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="modal-overlay" onClick={close} role="presentation">
          <div
            ref={modalRef}
            aria-modal="true"
            aria-label={title}
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-head">
              <div>
                <span className="section-kicker">{eyebrow}</span>
                <h3>{title}</h3>
                {description ? <p>{description}</p> : null}
              </div>
              <button className="modal-close" onClick={close} type="button">
                Close
              </button>
            </div>
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
