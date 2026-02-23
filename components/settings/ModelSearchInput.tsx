"use client";

import { useId, useMemo } from "react";
import { Input } from "@/components/ui/input";

interface ModelSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  listId?: string;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function ModelSearchInput({
  value,
  onChange,
  options = [],
  placeholder,
  className,
  disabled,
  listId,
}: ModelSearchInputProps) {
  const localId = useId().replace(/[:]/g, "");
  const datalistId = listId || `model-options-${localId}`;

  const normalizedOptions = useMemo(() => {
    const out = new Set<string>();
    for (const item of options) {
      const next = clean(item);
      if (next) out.add(next);
    }
    const current = clean(value);
    if (current) out.add(current);
    return Array.from(out).sort((a, b) => a.localeCompare(b));
  }, [options, value]);

  return (
    <>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        list={datalistId}
      />
      <datalist id={datalistId}>
        {normalizedOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

