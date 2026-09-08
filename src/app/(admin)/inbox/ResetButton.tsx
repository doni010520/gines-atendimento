"use client";

import { useTransition } from "react";
import { resetConversation } from "./actions";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/icons";

export function ResetButton({ conversationId }: { conversationId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      block
      disabled={pending}
      onClick={() => {
        if (!confirm("Zerar essa conversa? Apaga mensagens, conversa e contato — não dá pra desfazer.")) return;
        startTransition(() => resetConversation(conversationId));
      }}
    >
      <IconTrash className="h-4 w-4" />
      {pending ? "Zerando..." : "Zerar conversa (teste)"}
    </Button>
  );
}
