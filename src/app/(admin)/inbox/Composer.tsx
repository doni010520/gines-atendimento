"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendManualMessage } from "./actions";
import { IconSend } from "@/components/icons";

/**
 * Caixa de resposta. Enter envia, Shift+Enter quebra linha. Enquanto envia, o
 * botão e o Enter ficam travados — evita toque duplo mandar a mesma mensagem
 * duas vezes em rede ruim.
 */
export function Composer({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  function enviar() {
    const valor = text.trim();
    if (!valor || pending) return;
    setErro(null);
    startTransition(async () => {
      try {
        await sendManualMessage(conversationId, valor);
        setText("");
        router.refresh();
        ref.current?.focus();
      } catch {
        setErro("Não foi possível enviar. Tente de novo.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="border-t border-border bg-canvas px-3 py-2.5"
    >
      {erro && <p className="pb-1.5 text-xs text-danger-ink">{erro}</p>}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={1}
          placeholder="Escrever mensagem…  (Shift+Enter quebra linha)"
          aria-label="Mensagem"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm leading-snug text-ink [field-sizing:content] placeholder:text-ink-subtle hover:border-border-strong focus:border-primary"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          aria-label="Enviar mensagem"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <span className="text-xs">…</span> : <IconSend className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );
}
