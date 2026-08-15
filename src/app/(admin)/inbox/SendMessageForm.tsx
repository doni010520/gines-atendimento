"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { sendMessageFormAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 min-w-20 rounded bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50"
    >
      {pending ? "..." : "Enviar"}
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
    <form ref={formRef} action={action} className="flex gap-2 border-t p-3">
      <input
        name="text"
        placeholder="Escrever mensagem..."
        className="min-h-11 flex-1 rounded border px-3 text-sm"
        autoComplete="off"
      />
      <SubmitButton />
    </form>
  );
}
