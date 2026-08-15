import { saveProperty } from "./actions";
import { FormSubmitButton } from "../FormSubmitButton";
import type { Database } from "@/lib/supabase/database.types";

type Property = Database["public"]["Tables"]["properties"]["Row"];

export function PropertyForm({ property }: { property?: Property }) {
  return (
    <form action={saveProperty} className="space-y-6 rounded-xl border bg-white p-6">
      {property && <input type="hidden" name="id" value={property.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Título do anúncio"
          name="title"
          defaultValue={property?.title}
          required
          className="sm:col-span-2"
        />
        <Field
          label="Tipo de imóvel (casa, apartamento, sobrado...)"
          name="kind"
          defaultValue={property?.kind ?? undefined}
        />
        <Select label="Modalidade" name="type" defaultValue={property?.type ?? "venda"} options={["venda", "locacao"]} />
        <Select
          label="Status"
          name="status"
          defaultValue={property?.status ?? "ativo"}
          options={["ativo", "reservado", "vendido", "inativo"]}
        />
        <Field label="Preço (R$)" name="price" type="number" defaultValue={property?.price ?? undefined} />
        <Field label="Condomínio (R$)" name="condo_fee" type="number" defaultValue={property?.condo_fee ?? undefined} />
        <Field label="IPTU (R$)" name="iptu" type="number" defaultValue={property?.iptu ?? undefined} />
        <Field label="Cidade" name="city" defaultValue={property?.city ?? "São Paulo"} />
        <Field label="Bairro" name="neighborhood" defaultValue={property?.neighborhood ?? undefined} />
        <Field
          label="Endereço"
          name="address"
          defaultValue={property?.address ?? undefined}
          className="sm:col-span-2"
        />
        <Field label="Quartos" name="bedrooms" type="number" defaultValue={property?.bedrooms ?? undefined} />
        <Field label="Suítes" name="suites" type="number" defaultValue={property?.suites ?? undefined} />
        <Field label="Vagas" name="parking_spots" type="number" defaultValue={property?.parking_spots ?? undefined} />
        <Field label="Área construída (m²)" name="area_built" type="number" defaultValue={property?.area_built ?? undefined} />
        <Field label="Área terreno (m²)" name="area_land" type="number" defaultValue={property?.area_land ?? undefined} />
        <Field
          label="Características (separadas por vírgula)"
          name="features"
          defaultValue={property?.features?.join(", ")}
          className="sm:col-span-2"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Copy completa (o que o robô manda/usa pra responder dúvidas)</label>
        <textarea
          name="copy"
          required
          defaultValue={property?.copy}
          rows={10}
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">
          Variações do título do anúncio (1 por linha) — usado pra identificar automaticamente qual imóvel a pessoa
          clicou. Se deixar em branco, usa só o título acima.
        </label>
        <textarea
          name="ad_ref_titles"
          defaultValue={property?.ad_ref_titles?.join("\n")}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FileField label="Vídeo do criativo (.mp4)" name="video" accept="video/*" current={property?.video_url} />
        <FileField label="PDF (fotos + reforma)" name="pdf" accept="application/pdf" current={property?.pdf_url} />
        <FileField
          label="Fotos (várias)"
          name="fotos"
          accept="image/*"
          multiple
          current={property?.photo_urls?.length ? `${property.photo_urls.length} foto(s)` : undefined}
        />
      </div>

      <FormSubmitButton
        pendingLabel="Enviando (pode demorar com vídeo grande)..."
        className="min-h-11 w-full rounded bg-neutral-900 px-4 text-sm font-medium text-white sm:w-auto"
      >
        {property ? "Salvar alterações" : "Cadastrar imóvel"}
      </FormSubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-sm font-medium">{label}</label>
      <input
        name={name}
        type={type}
        step={type === "number" ? "any" : undefined}
        defaultValue={defaultValue ?? undefined}
        required={required}
        className="min-h-11 w-full rounded border px-3 text-sm"
      />
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: string[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <select name={name} defaultValue={defaultValue} className="min-h-11 w-full rounded border px-3 text-sm">
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function FileField({
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
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <input name={name} type="file" accept={accept} multiple={multiple} className="w-full text-sm" />
      {current && <p className="truncate text-xs text-neutral-500">atual: {current}</p>}
    </div>
  );
}
