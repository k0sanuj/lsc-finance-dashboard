"use client";

import { useId, useRef, useState, type ChangeEvent, type Ref } from "react";

const FILE_INPUT_TYPE = "file";

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

type FileAttachFieldProps = {
  name: string;
  label: string;
  ariaLabel?: string;
  accept?: string;
  capture?: "environment" | "user";
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  multiple?: boolean;
  required?: boolean;
  helperText?: string;
  onFilesSelected?: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function FileAttachField({
  name,
  label,
  ariaLabel,
  accept,
  capture,
  disabled,
  inputRef,
  multiple,
  required,
  helperText,
  onFilesSelected
}: FileAttachFieldProps) {
  const inputId = useId();
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const selectedFileLabel =
    selectedFileNames.length === 0
      ? null
      : selectedFileNames.length === 1
        ? selectedFileNames[0]
        : `${selectedFileNames.length} documents selected`;

  return (
    <div className="file-attach-field">
      <label className="document-attach-control" htmlFor={inputId}>
        {label}
      </label>
      {helperText ? <span className="muted text-xs">{helperText}</span> : null}
      <input
        accept={accept}
        capture={capture}
        disabled={disabled}
        aria-label={ariaLabel}
        className="visually-hidden"
        id={inputId}
        multiple={multiple}
        name={name}
        onChange={(event) => {
          setSelectedFileNames(
            Array.from(event.currentTarget.files ?? []).map((file) => file.name)
          );
          onFilesSelected?.(event);
        }}
        ref={inputRef}
        required={required}
        type={FILE_INPUT_TYPE}
      />
      {selectedFileLabel ? (
        <div aria-live="polite" className="selected-file-list">
          <span className="selected-file-label">Selected</span>
          <span className="selected-file-name">{selectedFileLabel}</span>
          {selectedFileNames.length > 1 ? (
            <span className="selected-file-detail">
              {selectedFileNames.slice(0, 3).join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AutoSubmitFileInput(props: AutoSubmitFileInputProps) {
  return (
    <FileAttachField
      {...props}
      onFilesSelected={(event) => {
        if (event.currentTarget.files?.length) {
          event.currentTarget.form?.requestSubmit();
        }
      }}
    />
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
