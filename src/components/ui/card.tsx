/** Superfície padrão: borda suave, raio de 12px, sombra mínima. */
export function Card({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={`rounded-xl border border-border bg-surface shadow-card ${className}`}>
      {children}
    </Tag>
  );
}

/** Título de página, com ação opcional à direita. */
export function PageHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Cabeçalho de grupo dentro de uma lista (Inbox). O contador fica ao lado do
 * título porque a pergunta do corretor é "quantos me esperam?", não "quais".
 */
export function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline gap-2 px-1 pb-2">
      <h2 className="text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">
        {title}
      </h2>
      <span className="tabular text-[10px] text-ink-subtle">{count}</span>
    </div>
  );
}
