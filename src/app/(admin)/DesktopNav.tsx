"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

/**
 * Navegação do desktop. A aba ativa é marcada só por cor + traço embaixo,
 * encostado na borda do cabeçalho — sem caixa, sem fundo, igual em todas as abas.
 * O foco de teclado usa contorno interno para não "encaixotar" a aba no clique.
 */
export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden h-full gap-1 md:flex">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-full items-center gap-2 border-b-2 px-3 pt-0.5 text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-ink-muted hover:border-border-strong hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
