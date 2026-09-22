import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormSubmitButton } from "../FormSubmitButton";
import { rotuloDias, TAG_PADRAO, type Toque } from "@/lib/followup/touches";
import { dataHora } from "@/lib/ui/format";
import { FilePicker } from "./FilePicker";
import { DeleteTouchButton } from "./DeleteTouchButton";
import { addTouch, removeTouchMedia, saveFinalTag, saveTouchMedia, updateTouch } from "./actions";

const CONTROL =
  "w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors " +
  "placeholder:text-ink-subtle hover:border-border-strong focus:bg-surface focus:border-primary";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SECAO = "px-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase";

function horasFmt(h: number) {
  return `${String(Number(h)).replace(".", ",")}h`;
}

/** Campos comuns do toque (novo e edição). `prefixo` deixa os ids únicos na página. */
function CamposToque({ prefixo, toque }: { prefixo: string; toque?: Toque }) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${prefixo}-horas`} className={LABEL}>
          Horas após a última mensagem do robô
        </label>
        <input
          id={`${prefixo}-horas`}
          name="delay_hours"
          type="number"
          min="0.01"
          step="any"
          required
          defaultValue={toque ? Number(toque.delay_hours) : undefined}
          placeholder="ex.: 24"
          className={`tabular min-h-11 ${CONTROL}`}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${prefixo}-objetivo`} className={LABEL}>
          Objetivo (instrução pra IA)
        </label>
        <textarea
          id={`${prefixo}-objetivo`}
          name="objective"
          rows={3}
          required
          defaultValue={toque?.objective}
          placeholder="ex.: Retomar o assunto de onde a conversa parou e convidar a pessoa a continuar."
          className={`py-2.5 leading-relaxed ${CONTROL}`}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${prefixo}-reserva`} className={LABEL}>
          Texto de reserva <span className="font-normal text-ink-subtle">(opcional — sai só se a IA falhar)</span>
        </label>
        <textarea
          id={`${prefixo}-reserva`}
          name="fallback_text"
          rows={2}
          defaultValue={toque?.fallback_text ?? undefined}
          placeholder="Oi{nome}! Passando pra retomar nossa conversa..."
          className={`py-2.5 leading-relaxed ${CONTROL}`}
        />
      </div>
    </>
  );
}

function MidiaDoToque({ toque }: { toque: Toque }) {
  const tem = Boolean(toque.media_url);
  return (
    <div className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink-muted">Áudio / vídeo</span>
        <Badge tone={tem ? "ok" : "mute"}>{tem ? (toque.media_kind === "video" ? "Vídeo" : "Áudio") : "Só texto"}</Badge>
      </div>

      {toque.media_url &&
        (toque.media_kind === "video" ? (
          <video src={toque.media_url} controls preload="metadata" className="w-full rounded-lg" />
        ) : (
          <audio src={toque.media_url} controls preload="metadata" className="w-full" />
        ))}
      {tem && (
        <p className="truncate text-[11px] text-ink-subtle">
          {toque.media_file_name ?? "arquivo"} · {dataHora(toque.updated_at)}
        </p>
      )}

      <div className="mt-auto space-y-2 pt-1">
        <form action={saveTouchMedia.bind(null, toque.id)} className="space-y-2">
          <FilePicker name="file" accept="audio/*,video/*" required />
          <FormSubmitButton pendingLabel="Enviando..." variant="secondary" size="sm" block>
            {tem ? "Substituir arquivo" : "Enviar arquivo"}
          </FormSubmitButton>
        </form>
        {tem && (
          <form action={removeTouchMedia.bind(null, toque.id)}>
            <FormSubmitButton pendingLabel="Removendo..." variant="ghost" size="sm" block>
              Tirar mídia
            </FormSubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function CadenciaPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: lista }, { data: config }] = await Promise.all([
    supabase.from("followup_touches").select("*").order("delay_hours").order("position"),
    supabase.from("followup_settings").select("*").eq("id", true).maybeSingle(),
  ]);
  const toques = lista ?? [];
  const ativos = toques.filter((t) => t.active);
  const etiqueta = config?.final_tag ?? TAG_PADRAO;
  const aplicaEtiqueta = config?.apply_final_tag ?? true;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuração de follow-up"
        hint={`Quando o lead para de responder, o robô manda ${ativos.length} ${ativos.length === 1 ? "toque" : "toques"} contados da última mensagem dele.`}
      />

      <section className="space-y-2">
        <h2 className={SECAO}>Toques da cadência</h2>
        {toques.length === 0 && (
          <Card className="p-4 text-sm text-ink-muted">Nenhum toque cadastrado — a cadência não roda.</Card>
        )}
        <div className="space-y-3">
          {toques.map((toque) => {
            const indice = ativos.findIndex((t) => t.id === toque.id) + 1;
            return (
              <Card key={toque.id} className={`p-4 ${toque.active ? "" : "opacity-70"}`}>
                <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                  <form action={updateTouch.bind(null, toque.id)} className="flex h-full flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {toque.active ? `Toque ${indice}` : "Toque desativado"}
                      </span>
                      <Badge tone="info">
                        <span className="tabular">
                          {horasFmt(toque.delay_hours)} · {rotuloDias(toque.delay_hours)}
                        </span>
                      </Badge>
                      <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-muted">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={toque.active}
                          className="h-4 w-4 accent-[var(--color-primary)]"
                        />
                        Ativo
                      </label>
                    </div>
                    <CamposToque prefixo={toque.id} toque={toque} />
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <FormSubmitButton pendingLabel="Salvando..." size="sm">
                        Salvar toque
                      </FormSubmitButton>
                      <DeleteTouchButton id={toque.id} rotulo={horasFmt(toque.delay_hours)} />
                    </div>
                  </form>
                  <MidiaDoToque toque={toque} />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className={SECAO}>Novo toque</h2>
          <Card className="flex-1 p-4">
            <form action={addTouch} className="flex h-full flex-col gap-3">
              <CamposToque prefixo="novo" />
              <div className="mt-auto pt-1">
                <FormSubmitButton pendingLabel="Adicionando..." size="sm">
                  Adicionar toque
                </FormSubmitButton>
              </div>
            </form>
          </Card>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={SECAO}>Ao encerrar sem retorno</h2>
          <Card className="flex-1 p-4">
            <form action={saveFinalTag} className="flex h-full flex-col gap-3">
              <div className="space-y-1.5">
                <label htmlFor="final_tag" className={LABEL}>
                  Etiqueta da conversa
                </label>
                <input
                  id="final_tag"
                  name="final_tag"
                  maxLength={60}
                  defaultValue={etiqueta}
                  className={`min-h-11 ${CONTROL}`}
                />
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="apply_final_tag"
                  defaultChecked={aplicaEtiqueta}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                Aplicar a etiqueta depois do último toque
              </label>
              <p className="text-xs text-ink-subtle">
                Os textos são escritos pela IA a partir da conversa, seguindo o objetivo de cada toque. Qualquer resposta
                do lead pausa a cadência; fora do horário (09h30–19h30, sem domingo) o toque espera a próxima abertura.
                Entre dois toques há sempre pelo menos 1h. No texto de reserva, <code>{"{nome}"}</code> vira o primeiro
                nome do lead. Áudio chega no WhatsApp como mensagem de voz.
              </p>
              <div className="mt-auto pt-1">
                <FormSubmitButton pendingLabel="Salvando..." size="sm">
                  Salvar etiqueta
                </FormSubmitButton>
              </div>
            </form>
          </Card>
        </section>
      </div>
    </div>
  );
}
