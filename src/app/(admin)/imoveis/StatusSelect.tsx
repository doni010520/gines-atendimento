"use client";

import { useTransition } from "react";
import { setPropertyStatus } from "./actions";
import { PROPERTY_STATUS, TONE_CLASS } from "@/lib/ui/status";

/**
 * Status do imóvel, editável direto na lista. O fundo acompanha o tom do status,
 * pra dar pra varrer a coluna com o olho sem ler palavra por palavra.
 */
export function StatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const tom = (PROPERTY_STATUS[status] ?? PROPERTY_STATUS.ativo).tone;

  return (
    <select
      defaultValue={status}
      disabled={pending}
      aria-label="Status do imóvel"
      onChange={(e) => startTransition(() => setPropertyStatus(id, e.target.value))}
      className={`min-h-9 shrink-0 cursor-pointer rounded-lg border-0 px-2.5 text-xs font-semibold transition-opacity disabled:opacity-50 ${TONE_CLASS[tom]}`}
    >
      {Object.entries(PROPERTY_STATUS).map(([value, { label }]) => (
        <option key={value} value={value} className="bg-surface text-ink">
          {label}
        </option>
      ))}
    </select>
  );
}
