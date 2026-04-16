"use client";

import { useRef } from "react";

type Props = {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  label: string;
};

export function AutoFormSelect({ name, defaultValue, options, label }: Props) {
  const ref = useRef<HTMLSelectElement>(null);

  return (
    <select
      ref={ref}
      name={name}
      defaultValue={defaultValue}
      aria-label={label}
      onChange={() => {
        const form = ref.current?.closest("form");
        if (form) form.requestSubmit();
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
