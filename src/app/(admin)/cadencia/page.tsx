import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormSubmitButton } from "../FormSubmitButton";
import { MEDIA_SLOT_LABEL, MEDIA_TOUCHES } from "@/lib/followup/media";
import { TOUCH_OFFSET_HOURS } from "@/lib/followup/engine";
import { OBJETIVO_TOQUE } from "@/lib/followup/ai-copy";
import { dataHora } from "@/lib/ui/format";
import { FilePicker } from "./FilePicker";
import { removeFollowupMedia, saveFollowupMedia } from "./actions";

export default async function CadenciaPage() {
  const supabase = await createSupabaseServerClient();
  const { data: midias } = await supabase.from("followup_media").select("*");
  const porToque = new Map((midias ?? []).map((m) => [m.touch, m]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuração de follow-up"
        hint="Quando o lead para de responder, o robô manda 6 toques contados da última mensagem dele."
      />

      <section className="space-y-2">
        <h2 className="px-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">
          Áudio / vídeo pré-gravado
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {MEDIA_TOUCHES.map((touch) => {
            const midia = porToque.get(touch);
            const label = MEDIA_SLOT_LABEL[touch];
            return (
              <Card key={touch} className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{label.titulo}</span>
                  <Badge tone={midia ? "ok" : "mute"}>{midia ? (midia.media_type === "video" ? "Vídeo" : "Áudio") : "Só texto"}</Badge>
                </div>
                <p className="text-xs text-ink-muted">{label.dica}</p>

                {midia &&
                  (midia.media_type === "video" ? (
                    <video src={midia.url} controls preload="metadata" className="w-full rounded-lg" />
                  ) : (
                    <audio src={midia.url} controls preload="metadata" className="w-full" />
                  ))}
                {midia && (
                  <p className="truncate text-[11px] text-ink-subtle">
                    {midia.file_name ?? "arquivo"} · {dataHora(midia.updated_at)}
                  </p>
                )}

                <div className="mt-auto space-y-2 pt-1">
                  {midia && (
                    <form action={removeFollowupMedia.bind(null, touch)}>
                      <FormSubmitButton pendingLabel="Removendo..." variant="danger" size="sm" block>
                        Remover
                      </FormSubmitButton>
                    </form>
                  )}
                  <form action={saveFollowupMedia.bind(null, touch)} className="space-y-2">
                    <FilePicker name="file" accept="audio/*,video/*" required />
                    <FormSubmitButton pendingLabel="Enviando..." size="sm" block>
                      {midia ? "Substituir arquivo" : "Enviar arquivo"}
                    </FormSubmitButton>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
        <p className="px-1 text-xs text-ink-subtle">
          Áudio chega no WhatsApp como mensagem de voz. Sem arquivo, o toque sai só com o texto.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">Os 6 toques</h2>
        <Card className="divide-y divide-border">
          {Object.entries(TOUCH_OFFSET_HOURS).map(([touch, horas]) => (
            <div key={touch} className="flex gap-3 px-4 py-3 text-sm">
              <span className="tabular w-14 shrink-0 font-semibold text-ink">{horas}h</span>
              <span className="text-ink-muted">{OBJETIVO_TOQUE[Number(touch)]}</span>
            </div>
          ))}
        </Card>
        <p className="px-1 text-xs text-ink-subtle">
          Os textos são escritos pela IA a partir da conversa. Qualquer resposta do lead pausa a cadência; fora do
          horário (09h30–19h30, sem domingo) o toque espera a próxima abertura. Sem retorno após o 6º toque, a conversa
          recebe a etiqueta “Perdido por Falta de Retorno”.
        </p>
      </section>
    </div>
  );
}
