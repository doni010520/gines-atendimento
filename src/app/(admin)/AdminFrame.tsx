"use client";

import { usePathname } from "next/navigation";

/**
 * Casca do painel. O Inbox é uma tela de atendimento (3 colunas, altura cheia,
 * rolagem só dentro de cada coluna); as outras telas continuam como documento
 * centralizado de largura máxima.
 */
export function AdminFrame({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname.startsWith("/inbox");

  if (fullBleed) {
    return (
      <div className="flex h-dvh flex-col bg-canvas">
        {header}
        <main className="min-h-0 flex-1 pb-14 md:pb-0">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {header}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 md:pb-8">{children}</main>
    </div>
  );
}
