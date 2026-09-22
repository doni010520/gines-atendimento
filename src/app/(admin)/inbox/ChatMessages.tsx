"use client";

import { useEffect, useRef } from "react";
import { IconClip } from "@/components/icons";
import { chaveDia, ehMarcadorDeMidia, hora, rotuloDia } from "@/lib/ui/format";

export type ChatMessage = {
  id: string;
  body: string | null;
  direction: string;
  isInternal: boolean;
  createdAt: string;
  mediaType: string | null;
  mediaUrl: string | null;
};

/**
 * Histórico em balões estilo WhatsApp. Rola até o fim ao abrir e quando chega
 * mensagem nova — mas só se o corretor já estava perto do fim (não arranca ele
 * de onde estava lendo o histórico).
 */
export function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const colado = useRef(true);
  const ultimoId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const el = ref.current;
    if (el && colado.current) el.scrollTop = el.scrollHeight;
  }, [ultimoId]);


  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="chat-wallpaper min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-8"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
        {messages.map((m, i) => {
          const dia = chaveDia(m.createdAt);
          const separador = i === 0 || dia !== chaveDia(messages[i - 1].createdAt);
          const saida = m.direction === "out";

          let conteudo: React.ReactNode;
          if (m.isInternal) {
            conteudo = (
              <div className="mx-auto my-1 w-fit max-w-[85%] rounded-lg border border-dashed border-warn-edge/60 bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
                <p className="mb-0.5 text-[10px] font-bold tracking-[0.08em] uppercase">Nota interna</p>
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
                <p className="tabular mt-1 text-right text-[10px] opacity-70">{hora(m.createdAt)}</p>
              </div>
            );
          } else if (ehMarcadorDeMidia(m.body) || (!m.body && m.mediaType)) {
            const rotulo = m.body ? m.body.trim().slice(1, -1) : `${m.mediaType} enviado`;
            conteudo = (
              <div className={`flex ${saida ? "justify-end" : "justify-start"}`}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-3 py-1 text-xs text-ink-muted shadow-card">
                  <IconClip className="h-3.5 w-3.5 shrink-0" />
                  {m.mediaUrl ? (
                    <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      {rotulo}
                    </a>
                  ) : (
                    rotulo
                  )}
                  <span className="tabular text-[10px] text-ink-subtle">{hora(m.createdAt)}</span>
                </span>
              </div>
            );
          } else {
            conteudo = (
              <div
                className={`relative w-fit max-w-[85%] px-3 pt-1.5 pb-1 text-sm shadow-card sm:max-w-[70%] ${
                  saida
                    ? "ml-auto rounded-lg rounded-tr-none bg-bubble-out text-bubble-out-ink"
                    : "rounded-lg rounded-tl-none bg-surface text-ink"
                }`}
              >
                <p className="break-words whitespace-pre-wrap">{m.body}</p>
                <p className="tabular -mt-0.5 text-right text-[10px] text-ink-subtle">{hora(m.createdAt)}</p>
              </div>
            );
          }

          return (
            <div key={m.id}>
              {separador && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-md bg-surface/90 px-2.5 py-0.5 text-[11px] font-medium text-ink-muted shadow-card">
                    {rotuloDia(m.createdAt)}
                  </span>
                </div>
              )}
              {conteudo}
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="mx-auto mt-10 rounded-md bg-surface/90 px-3 py-1.5 text-sm text-ink-subtle">
            Sem mensagens ainda.
          </p>
        )}
      </div>
    </div>
  );
}
