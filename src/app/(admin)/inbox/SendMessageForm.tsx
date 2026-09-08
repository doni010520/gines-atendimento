"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { sendMessageFormAction } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { IconSend } from "@/components/icons";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Enviar mensagem"
      className={buttonClass({ className: "min-w-12 px-3" })}
    >
      {pending ? "..." : <IconSend className="h-4 w-4" />}
    </button>
  );
}

/**
 * Botão desabilita enquanto envia — evita toque duplo em rede ruim mandar a
 * mesma mensagem duas vezes (mesma classe de bug do "botão girando" do Corrêa/MVF).
 */
export function SendMessageForm({ conversationId }: { conversationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    await sendMessageFormAction(conversationId, formData);
    formRef.current?.reset();
  }

  return (
    <form ref={formRef} action={action} className="flex gap-2 border-t border-border p-3">
      <input
        name="text"
        placeholder="Escrever mensagem..."
        autoComplete="off"
        className="min-h-11 flex-1 rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors placeholder:text-ink-subtle hover:border-border-strong focus:border-primary focus:bg-surface"
      />
      <SubmitButton />
    </form>
  );
}
