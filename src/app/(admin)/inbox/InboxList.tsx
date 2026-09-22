"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { conversationStatus } from "@/lib/ui/status";
import { iniciais, quando } from "@/lib/ui/format";

export type InboxItem = {
  id: string;
  status: string;
  lastMessageAt: string | null;
  tags: string[];
  name: string | null;
  phone: string | null;
  propertyTitle: string | null;
  preview: string | null;
};

const FILTROS = [
  { key: "todas", label: "Todas", statuses: null },
  { key: "queued", label: "Precisam de mim", statuses: ["queued"] },
  { key: "bot", label: "Com o robô", statuses: ["bot"] },
  { key: "open", label: "Em atendimento", statuses: ["open"] },
  { key: "closed", label: "Encerradas", statuses: ["closed"] },
] as const;

type FiltroKey = (typeof FILTROS)[number]["key"];

const AVATAR_TONE: Record<string, string> = {
  queued: "bg-warn-soft text-warn-ink",
  open: "bg-ok-soft text-ok-ink",
  bot: "bg-primary-soft text-primary-ink",
  closed: "bg-mute-soft text-ink-muted",
};

function digitos(s: string) {
  return s.replace(/\D/g, "");
}

function doFiltro(items: InboxItem[], statuses: readonly string[] | null) {
  return statuses ? items.filter((c) => statuses.includes(c.status)) : items;
}

export function InboxList({ items }: { items: InboxItem[] }) {
  // Segmento abaixo de /inbox = id da conversa aberta (null na tela vazia).
  const selectedId = useSelectedLayoutSegment();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroKey>("todas");

  const buscados = useMemo(() => {
    const ordenados = [...items].sort(
      (a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime()
    );
    const q = busca.trim().toLowerCase();
    if (!q) return ordenados;
    const qd = digitos(q);
    return ordenados.filter(
      (c) => (c.name ?? "").toLowerCase().includes(q) || (qd.length > 0 && digitos(c.phone ?? "").includes(qd))
    );
  }, [items, busca]);

  const ativo = FILTROS.find((f) => f.key === filtro) ?? FILTROS[0];
  const visiveis = doFiltro(buscados, ativo.statuses);

  return (
    <aside
      className={`min-h-0 w-full shrink-0 flex-col border-r border-border bg-surface md:flex md:w-[340px] ${
        selectedId ? "hidden" : "flex"
      }`}
    >
      <div className="space-y-2.5 border-b border-border px-3 pt-3 pb-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          aria-label="Buscar conversa"
          className="min-h-10 w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors placeholder:text-ink-subtle hover:border-border-strong focus:border-primary focus:bg-surface"
        />
        <div role="tablist" aria-label="Filtrar conversas" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {FILTROS.map((f) => {
            const on = f.key === filtro;
            const n = doFiltro(buscados, f.statuses).length;
            const urgente = f.key === "queued" && n > 0;
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFiltro(f.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
                  on ? "bg-primary font-semibold text-white" : "bg-mute-soft text-ink-muted hover:text-ink"
                }`}
              >
                {f.label}
                <span
                  className={`tabular rounded-full px-1.5 text-[10px] ${
                    on ? "bg-white/20" : urgente ? "bg-warn-edge text-white" : "bg-surface"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {visiveis.map((c) => {
          const status = conversationStatus(c.status);
          const selecionado = c.id === selectedId;
          const queued = c.status === "queued";
          return (
            <li key={c.id}>
              <Link
                href={`/inbox/${c.id}`}
                aria-current={selecionado ? "page" : undefined}
                className={`flex gap-3 border-b border-border/70 px-3 py-2.5 transition-colors ${
                  selecionado ? "bg-primary-soft" : "hover:bg-canvas"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    AVATAR_TONE[c.status] ?? AVATAR_TONE.bot
                  }`}
                >
                  {iniciais(c.name, c.phone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm text-ink ${queued ? "font-bold" : "font-semibold"}`}>
                      {c.name || c.phone || "—"}
                    </span>
                    <span
                      className={`tabular shrink-0 text-[11px] ${queued ? "font-semibold text-warn-ink" : "text-ink-subtle"}`}
                    >
                      {quando(c.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-ink-muted">
                      {c.preview ?? <span className="text-ink-subtle italic">Sem mensagens</span>}
                    </span>
                    <Badge tone={status.tone} className="!px-1.5 !py-0.5 !text-[10px]">
                      {status.label}
                    </Badge>
                  </span>
                  {(c.propertyTitle || c.tags.length > 0) && (
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px]">
                      {c.propertyTitle && <span className="truncate text-primary-ink">{c.propertyTitle}</span>}
                      {c.tags.map((tag) => (
                        <span
                          key={tag}
                          className="shrink-0 rounded bg-warn-soft px-1.5 py-px text-[10px] font-medium whitespace-nowrap text-warn-ink"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        {visiveis.length === 0 && (
          <li className="px-6 py-12 text-center text-sm text-ink-subtle">
            {items.length === 0
              ? "Nenhuma conversa ainda. Assim que alguém escrever no WhatsApp, ela aparece aqui."
              : busca
                ? "Nada encontrado para essa busca."
                : "Nenhuma conversa neste filtro."}
          </li>
        )}
      </ul>
    </aside>
  );
}
