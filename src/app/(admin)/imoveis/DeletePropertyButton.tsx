"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/icons";
import { deleteProperty } from "./actions";

/** Exclui o imóvel depois de confirmar. Pra só tirar de circulação, basta mudar o status. */
export function DeletePropertyButton({ id, titulo, block = false }: { id: string; titulo: string; block?: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      block={block}
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Excluir "${titulo}" de vez?\n\nApaga os dados, o vídeo, o PDF e as fotos. Não dá pra desfazer.\nSe for só tirar de circulação, use o status "Inativo" ou "Vendido".`
          )
        )
          return;
        startTransition(() => deleteProperty(id));
      }}
    >
      <IconTrash className="h-4 w-4" />
      {pending ? "Excluindo..." : "Excluir"}
    </Button>
  );
}
