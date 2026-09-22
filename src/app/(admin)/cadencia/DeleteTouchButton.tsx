"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/icons";
import { deleteTouch } from "./actions";

/** Remove o toque depois de confirmar — some da cadência de quem está no meio dela também. */
export function DeleteTouchButton({ id, rotulo }: { id: string; rotulo: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remover o toque de ${rotulo}? Quem está no meio da cadência pula direto pro próximo.`)) return;
        startTransition(() => deleteTouch(id));
      }}
    >
      <IconTrash className="h-4 w-4" />
      {pending ? "Removendo..." : "Remover toque"}
    </Button>
  );
}
