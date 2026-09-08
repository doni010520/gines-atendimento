/**
 * Bloco de formulário com rótulo e dica. É o que transforma a parede de 18
 * campos do cadastro de imóvel em seis grupos com significado.
 */
export function FormSection({
  title,
  hint,
  children,
  first = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section
      className={first ? "" : "mt-7 border-t border-border pt-7"}
      aria-label={title}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h2 className="text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">
          {title}
        </h2>
        {hint && <p className="text-[11px] text-ink-subtle">{hint}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
