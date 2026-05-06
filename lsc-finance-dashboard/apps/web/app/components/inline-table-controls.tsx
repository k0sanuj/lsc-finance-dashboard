"use client";

import { useId } from "react";

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
