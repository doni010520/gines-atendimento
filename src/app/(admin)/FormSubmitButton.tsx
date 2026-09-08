"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

/**
 * Botão de submit que mostra o progresso da server action. Usa `buttonClass`
 * para ter exatamente o mesmo estilo do `Button` — sem duplicar a string.
 */
export function FormSubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass({ variant, size, block, className })}>
      {pending ? pendingLabel : children}
    </button>
  );
}
