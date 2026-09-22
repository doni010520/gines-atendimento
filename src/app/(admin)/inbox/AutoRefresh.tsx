"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Atualização "quase ao vivo": a cada 5 s pede ao servidor os dados de novo
 * (lista + conversa aberta). Para quando a aba está em segundo plano e
 * atualiza na hora em que o corretor volta pra ela.
 */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
