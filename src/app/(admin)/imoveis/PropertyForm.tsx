import { saveProperty } from "./actions";
import { FormSubmitButton } from "../FormSubmitButton";
import { Card } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { Field, FileField, SelectField, TextareaField } from "@/components/ui/field";
import { PROPERTY_STATUS } from "@/lib/ui/status";
import type { Database } from "@/lib/supabase/database.types";

type Property = Database["public"]["Tables"]["properties"]["Row"];

const STATUS_OPTIONS = Object.entries(PROPERTY_STATUS).map(([value, { label }]) => ({ value, label }));

const TIPO_OPTIONS = [
  { value: "venda", label: "Venda" },
  { value: "locacao", label: "Locação" },
];

/**
 * Cadastro de imóvel em seis seções, na ordem em que se pensa um imóvel:
 * o que é → quanto custa → onde fica → como é por dentro → o que o robô fala →
 * que material existe. Antes eram 18 campos empilhados sem uma pausa.
 *
 * Os `name` são o contrato com `saveProperty` e não mudaram.
 */
export function PropertyForm({ property }: { property?: Property }) {
  return (
    <form action={saveProperty}>
      {property && <input type="hidden" name="id" value={property.id} />}

      <Card className="p-5 sm:p-6">
        <FormSection title="Identificação" hint="o que é e como se chama" first>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Título do anúncio"
              name="title"
              defaultValue={property?.title}
              required
              className="sm:col-span-2"
            />
            <Field
              label="Tipo de imóvel"
              name="kind"
              hint="casa, apartamento, sobrado..."
              defaultValue={property?.kind ?? undefined}
            />
            <SelectField
              label="Modalidade"
              name="type"
              defaultValue={property?.type ?? "venda"}
              options={TIPO_OPTIONS}
            />
            <Field
              label="Sinônimos que o cliente pode usar"
              name="kind_synonyms"
              hint="separados por vírgula: studio, kitnet, apê..."
              defaultValue={property?.kind_synonyms?.join(", ")}
            />
            <SelectField
              label="Status"
              name="status"
              defaultValue={property?.status ?? "ativo"}
              options={STATUS_OPTIONS}
            />
          </div>
        </FormSection>

        <FormSection title="Valores" hint="em reais">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Preço" name="price" type="number" defaultValue={property?.price ?? undefined} />
            <Field
              label="Condomínio"
              name="condo_fee"
              type="number"
              defaultValue={property?.condo_fee ?? undefined}
            />
            <Field label="IPTU" name="iptu" type="number" defaultValue={property?.iptu ?? undefined} />
          </div>
        </FormSection>

        <FormSection title="Onde fica" hint="cidade, bairro, endereço">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cidade" name="city" defaultValue={property?.city ?? "São Paulo"} />
            <Field label="Bairro" name="neighborhood" defaultValue={property?.neighborhood ?? undefined} />
            <Field
              label="Endereço"
              name="address"
              defaultValue={property?.address ?? undefined}
              className="sm:col-span-2"
            />
          </div>
        </FormSection>

        <FormSection title="O imóvel" hint="como é por dentro">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label="Quartos" name="bedrooms" type="number" defaultValue={property?.bedrooms ?? undefined} />
            <Field label="Suítes" name="suites" type="number" defaultValue={property?.suites ?? undefined} />
            <Field
              label="Vagas"
              name="parking_spots"
              type="number"
              defaultValue={property?.parking_spots ?? undefined}
            />
            <Field
              label="Construída (m²)"
              name="area_built"
              type="number"
              defaultValue={property?.area_built ?? undefined}
            />
            <Field
              label="Terreno (m²)"
              name="area_land"
              type="number"
              defaultValue={property?.area_land ?? undefined}
            />
            <Field
              label="Características"
              name="features"
              hint="separadas por vírgula"
              defaultValue={property?.features?.join(", ")}
              className="col-span-2 sm:col-span-5"
            />
          </div>
        </FormSection>

        <FormSection title="O que o robô fala" hint="o texto que ele manda e usa pra responder dúvidas">
          <div className="space-y-4">
            <TextareaField
              label="Copy completa"
              name="copy"
              rows={10}
              required
              defaultValue={property?.copy}
            />
            <TextareaField
              label="Variações do título do anúncio"
              name="ad_ref_titles"
              rows={3}
              hint="uma por linha — usado pra identificar automaticamente qual imóvel a pessoa clicou. Em branco, usa só o título acima."
              defaultValue={property?.ad_ref_titles?.join("\n")}
            />
          </div>
        </FormSection>

        <FormSection title="Materiais" hint="o que o robô envia no WhatsApp">
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
        </FormSection>
      </Card>

      {/*
        Barra fixa: o salvar não foge pro fim de uma página longa. No celular ela
        precisa parar acima da barra de abas (min-h-14 = 3.5rem), senão fica atrás.
      */}
      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mt-3 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-bar backdrop-blur-sm md:bottom-0">
        <p className="hidden text-xs text-ink-subtle sm:block">
          {property ? "As alterações valem pro robô na próxima mensagem." : "O imóvel entra ativo por padrão."}
        </p>
        <FormSubmitButton
          pendingLabel="Enviando (pode demorar com vídeo grande)..."
          className="max-sm:w-full"
        >
          {property ? "Salvar alterações" : "Cadastrar imóvel"}
        </FormSubmitButton>
      </div>
    </form>
  );
}
