"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

/**
 * Navegação do desktop. Antes Inbox e Imóveis eram indistinguíveis — não dava
 * pra saber em qual você estava. Agora a aba ativa tem cor e um traço embaixo.
 */
export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden gap-1 md:flex">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm transition-colors ${
              active ? "font-semibold text-primary" : "text-ink-muted hover:bg-mute-soft hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {active && (
              <span className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
