"use client";

type AutoSubmitSelectProps = {
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  label: string;
  hiddenFields?: Record<string, string>;
  action: string | ((formData: FormData) => void | Promise<void>);
};

export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  label,
  hiddenFields,
  action
}: AutoSubmitSelectProps) {
  return (
    <form
      action={action as (formData: FormData) => void}
      ref={(form) => {
        if (!form) return;
        const select = form.querySelector("select");
        if (!select) return;
        select.addEventListener("change", () => form.requestSubmit());
      }}
    >
      {hiddenFields
        ? Object.entries(hiddenFields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))
        : null}
      <select name={name} defaultValue={defaultValue} aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
