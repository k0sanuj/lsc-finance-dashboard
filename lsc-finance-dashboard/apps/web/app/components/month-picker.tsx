"use client";

import { useRouter } from "next/navigation";

export function MonthPicker({ value, basePath = "/payroll-invoices" }: { value: string; basePath?: string }) {
  const router = useRouter();

  return (
    <input
      type="month"
      defaultValue={value}
      aria-label="Invoice month"
      onChange={(e) => {
        const month = e.target.value;
        if (month) router.push(`${basePath}?month=${month}`);
      }}
    />
  );
}
