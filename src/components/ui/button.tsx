import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "border border-border bg-surface text-ink hover:bg-canvas hover:border-border-strong",
  ghost: "text-ink-muted hover:text-ink hover:bg-mute-soft",
  danger: "border border-danger-edge bg-surface text-danger-ink hover:bg-danger-soft",
  success: "bg-ok-ink text-white hover:brightness-110",
};

const SIZE: Record<ButtonSize, string> = {
  // 44px: alvo de toque mínimo confortável no celular
  md: "min-h-11 px-4 text-sm",
  sm: "min-h-9 px-3 text-xs",
};

/**
 * Classes do botão, separadas do componente para que `next/link` e o
 * `FormSubmitButton` (que precisa de `useFormStatus`, e portanto é client)
 * usem exatamente o mesmo estilo sem duplicar a string.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
} = {}) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
    "transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none",
    VARIANT[variant],
    SIZE[size],
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

export function Button({ variant, size, block, className, ...props }: ButtonProps) {
  return <button {...props} className={buttonClass({ variant, size, block, className })} />;
}
