"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button className="solid-link modal-trigger" onClick={() => setOpen(true)} type="button">
        {triggerLabel}
      </button>
      {open ? (
        <div className="modal-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            aria-modal="true"
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
              <button className="modal-close" onClick={() => setOpen(false)} type="button">
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
