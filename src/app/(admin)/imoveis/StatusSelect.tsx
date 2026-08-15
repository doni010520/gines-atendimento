"use client";

import { useTransition } from "react";
import { setPropertyStatus } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  reservado: "Reservado",
  vendido: "Vendido",
  inativo: "Inativo",
};

export function StatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => startTransition(() => setPropertyStatus(id, e.target.value))}
      className="min-h-9 rounded border px-2 py-1 text-xs disabled:opacity-50"
    >
      {Object.entries(STATUS_LABEL).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
