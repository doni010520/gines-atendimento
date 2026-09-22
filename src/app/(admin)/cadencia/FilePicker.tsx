"use client";

import { useId, useState } from "react";

/**
 * Input de arquivo com cara de botão: o `<input type="file">` nativo fica
 * escondido (mas continua no formulário, com o mesmo `name`) e o rótulo mostra
 * o nome do arquivo escolhido.
 */
export function FilePicker({ name, accept, required }: { name: string; accept: string; required?: boolean }) {
  const id = useId();
  const [arquivo, setArquivo] = useState<string | null>(null);

  return (
    <label
      htmlFor={id}
      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-muted px-2 py-1.5 text-xs transition-colors hover:border-primary has-[:focus-visible]:border-primary"
    >
      <span className="shrink-0 rounded-md bg-primary-soft px-2.5 py-1.5 font-semibold text-primary-ink">
        Escolher arquivo
      </span>
      <span className={`min-w-0 truncate ${arquivo ? "text-ink" : "text-ink-subtle"}`}>
        {arquivo ?? "Nenhum arquivo selecionado"}
      </span>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={required}
        onChange={(e) => setArquivo(e.target.files?.[0]?.name ?? null)}
        className="sr-only"
      />
    </label>
  );
}
