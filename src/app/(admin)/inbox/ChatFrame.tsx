"use client";

import { useState } from "react";

/**
 * Coluna do chat + ficha do lead. Em telas largas (xl) a ficha fica fixa à
 * direita; abaixo disso ela vira uma gaveta aberta pelo botão "Ficha".
 */
export function ChatFrame({
  header,
  actions,
  children,
  sheet,
}: {
  header: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
  sheet: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);

  const toggle = (
    <button
      type="button"
      onClick={() => setAberta((v) => !v)}
      aria-expanded={aberta}
      className="min-h-9 rounded-lg border border-border px-3 text-xs font-medium text-ink-muted transition-colors hover:border-border-strong hover:text-ink xl:hidden"
    >
      Ficha
    </button>
  );

  return (
    <div className="relative flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center gap-3 border-b border-border bg-surface px-3 py-2 sm:px-4">
          {header}
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {toggle}
          </div>
        </header>
        {children}
      </div>

      {aberta && (
        <button
          type="button"
          aria-label="Fechar ficha"
          onClick={() => setAberta(false)}
          className="absolute inset-0 z-10 bg-ink/20 xl:hidden"
        />
      )}
      <aside
        className={`absolute inset-y-0 right-0 z-20 w-[300px] max-w-[90%] overflow-y-auto border-l border-border bg-surface shadow-float xl:static xl:z-auto xl:block xl:shadow-none ${
          aberta ? "block" : "hidden"
        }`}
      >
        {sheet}
      </aside>
    </div>
  );
}
