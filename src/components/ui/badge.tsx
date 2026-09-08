import { TONE_CLASS, type Tone } from "@/lib/ui/status";

/** Pill de status. O tom vem de `lib/ui/status`, nunca escrito à mão na tela. */
export function Badge({
  tone,
  children,
  className = "",
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
