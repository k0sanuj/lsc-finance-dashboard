"use client";

import { useId, useRef } from "react";

type SelectOption = {
  value: string;
  label: string;
};

type AutoSubmitSelectProps = {
  name: string;
  defaultValue: string;
  options: readonly SelectOption[];
  ariaLabel: string;
  className?: string;
};

export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  ariaLabel,
  className = "table-select"
}: AutoSubmitSelectProps) {
  return (
    <select
      aria-label={ariaLabel}
      className={className}
      defaultValue={defaultValue}
      name={name}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type AutoSubmitFileInputProps = {
  name: string;
  label: string;
  ariaLabel: string;
  accept?: string;
};

export function AutoSubmitFileInput({
  name,
  label,
  ariaLabel,
  accept
}: AutoSubmitFileInputProps) {
  const inputId = useId();

  return (
    <>
      <label className="document-attach-control" htmlFor={inputId}>
        {label}
      </label>
      <input
        accept={accept}
        aria-label={ariaLabel}
        className="visually-hidden"
        id={inputId}
        name={name}
        onChange={(event) => {
          if (event.currentTarget.files?.length) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        type="file"
      />
    </>
  );
}

type DocumentPreviewButtonProps = {
  documentName: string;
  previewDataUrl: string | null;
  previewMimeType: string | null;
};

export function DocumentPreviewButton({
  documentName,
  previewDataUrl,
  previewMimeType
}: DocumentPreviewButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isImage = previewMimeType?.startsWith("image/");
  const canPreview = Boolean(previewDataUrl);

  if (!canPreview) {
    return <span className="document-link document-link-muted">{documentName}</span>;
  }

  return (
    <>
      <button
        className="document-link document-preview-trigger"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        {documentName}
      </button>
      <dialog aria-labelledby={titleId} className="document-preview-dialog" ref={dialogRef}>
        <div className="document-preview-shell">
          <header className="document-preview-header">
            <div>
              <span className="section-kicker">Source document</span>
              <h3 id={titleId}>{documentName}</h3>
            </div>
            <button
              aria-label="Close document preview"
              className="document-preview-close"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              x
            </button>
          </header>
          <div className="document-preview-frame">
            {isImage ? (
              <img alt={documentName} src={previewDataUrl ?? ""} />
            ) : (
              <iframe src={previewDataUrl ?? ""} title={documentName} />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
