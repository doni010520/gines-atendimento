/**
 * Campos de formulário. Vieram dos helpers privados do `PropertyForm` — aqui
 * ficam compartilhados, e o rótulo passa a ser ligado ao controle por
 * `htmlFor`/`id` (antes eram um `<label>` solto, que não move o foco no clique
 * nem é anunciado por leitor de tela).
 *
 * O atributo `name` é o contrato com as server actions: não pode mudar.
 */

const CONTROL =
  "w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink " +
  "transition-colors placeholder:text-ink-subtle hover:border-border-strong " +
  "focus:bg-surface focus:border-primary";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-muted">
      {children}
    </label>
  );
}

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  className,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  className?: string;
  hint?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      {hint && <p className="text-[11px] leading-snug text-ink-subtle">{hint}</p>}
      <input
        id={name}
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        defaultValue={defaultValue ?? undefined}
        required={required}
        className={`min-h-11 ${CONTROL} ${type === "number" ? "tabular" : ""}`}
      />
    </div>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} defaultValue={defaultValue} className={`min-h-11 ${CONTROL}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  rows = 6,
  required,
  hint,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      {hint && <p className="text-[11px] leading-snug text-ink-subtle">{hint}</p>}
      <textarea
        id={name}
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue ?? undefined}
        className={`py-2.5 leading-relaxed ${CONTROL}`}
      />
    </div>
  );
}

export function FileField({
  label,
  name,
  accept,
  multiple,
  current,
}: {
  label: string;
  name: string;
  accept: string;
  multiple?: boolean;
  current?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <input
        id={name}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        className="w-full rounded-lg border border-dashed border-border-strong bg-surface-muted p-2.5 text-xs text-ink-muted transition-colors hover:border-primary file:mr-3 file:rounded-md file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary-ink"
      />
      {current && (
        <p className="truncate text-[11px] text-ink-subtle">
          atual: <span className="text-ink-muted">{current}</span>
        </p>
      )}
    </div>
  );
}
