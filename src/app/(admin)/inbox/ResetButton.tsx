"use client";

import { useTransition } from "react";
import { resetConversation } from "./actions";

export function ResetButton({ conversationId }: { conversationId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Zerar essa conversa? Apaga mensagens, conversa e contato — não dá pra desfazer.")) return;
        startTransition(() => resetConversation(conversationId));
      }}
      className="w-full rounded border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Zerando..." : "🗑 Zerar conversa (teste)"}
    </button>
  );
}
