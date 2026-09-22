import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { assumeConversation, returnToBot } from "../actions";
import { ResetButton } from "../ResetButton";
import { Composer } from "../Composer";
import { ChatFrame } from "../ChatFrame";
import { ChatMessages } from "../ChatMessages";
import { FormSubmitButton } from "../../FormSubmitButton";
import { Badge } from "@/components/ui/badge";
import { IconBack, IconHandRaised } from "@/components/icons";
import { conversationStatus } from "@/lib/ui/status";
import { dataHora, esperando, iniciais, preco } from "@/lib/ui/format";
import { STAGE_DONE, STAGE_RUNNING } from "@/lib/followup/engine";
import { proximoToque } from "@/lib/followup/touches";

/** Procura (até 4 níveis) o primeiro texto sob uma das chaves — o formato do `raw` varia por origem. */
function acharTexto(raw: Json | undefined, chaves: string[], nivel = 0): string | null {
  if (!raw || typeof raw !== "object" || nivel > 4) return null;
  const entradas = Array.isArray(raw) ? raw.map((v, i) => [String(i), v] as const) : Object.entries(raw);
  for (const [k, v] of entradas) {
    if (chaves.includes(k.toLowerCase()) && typeof v === "string" && v.trim()) return v.trim();
  }
  for (const [, v] of entradas) {
    const achado = acharTexto(v as Json, chaves, nivel + 1);
    if (achado) return achado;
  }
  return null;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5">
      <h3 className="mb-1.5 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-ink-muted">{rotulo}</span>
      <span className="text-right text-ink">{valor}</span>
    </div>
  );
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*,contact:contacts(name,phone,created_at),property:properties(id,title,price,neighborhood)")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: toquesAtivos } = await supabase
    .from("followup_touches")
    .select("*")
    .eq("active", true)
    .order("delay_hours")
    .order("position");
  const toques = toquesAtivos ?? [];
  const proximo =
    conversation.followup_stage === STAGE_RUNNING ? proximoToque(toques, conversation.followup_last_touch_hours) : null;
  const etapaFollowup =
    conversation.followup_stage === STAGE_DONE
      ? "Encerrada"
      : proximo
        ? `Toque ${toques.indexOf(proximo) + 1} de ${toques.length}`
        : "Parada";

  const [{ data: messages }, { data: referral }] = await Promise.all([
    supabase
      .from("messages")
      .select("id,body,direction,is_internal,created_at,media_type,media_url")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("ad_referrals")
      .select("raw,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Busca as 300 mais novas e inverte: numa conversa longa o que importa é o fim.
  const lista = (messages ?? []).reverse().map((m) => ({
    id: m.id,
    body: m.body,
    direction: m.direction,
    isInternal: m.is_internal,
    createdAt: m.created_at,
    mediaType: m.media_type,
    mediaUrl: m.media_url,
  }));

  const canSend = conversation.status === "open" || conversation.status === "queued";
  const status = conversationStatus(conversation.status);
  const espera = esperando(conversation.last_message_at);
  const nome = conversation.contact?.name ?? null;
  const telefone = conversation.contact?.phone ?? null;
  const tags = conversation.tags ?? [];

  const anuncio = referral
    ? acharTexto(referral.raw, ["title", "headline", "adtitle", "body", "sourceurl", "source_url", "url"])
    : null;

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Link
        href="/inbox"
        aria-label="Voltar para a lista"
        className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-mute-soft hover:text-ink md:hidden"
      >
        <IconBack className="h-5 w-5" />
      </Link>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink">
        {iniciais(nome, telefone)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{nome || telefone || "Sem nome"}</p>
        <p className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
          {nome && telefone && <span className="tabular truncate">{telefone}</span>}
          <Badge tone={status.tone} className="!px-1.5 !py-0.5 !text-[10px]">
            {status.label}
          </Badge>
        </p>
      </div>
    </div>
  );

  const actions = (
    <>
      {conversation.status === "queued" && (
        <form action={assumeConversation.bind(null, id)}>
          <FormSubmitButton pendingLabel="Assumindo..." variant="success" size="sm">
            <IconHandRaised className="h-4 w-4" />
            Assumir
          </FormSubmitButton>
        </form>
      )}
      {conversation.status !== "queued" && (
        <form action={conversation.ai_enabled ? assumeConversation.bind(null, id) : returnToBot.bind(null, id)}>
          <FormSubmitButton
            pendingLabel="Alterando..."
            variant={conversation.ai_enabled ? "secondary" : "primary"}
            size="sm"
          >
            {conversation.ai_enabled ? "Pausar IA" : "Reativar IA"}
          </FormSubmitButton>
        </form>
      )}
    </>
  );

  const sheet = (
    <div className="text-sm">
      <div className="flex flex-col items-center gap-1 border-b border-border px-4 py-5 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold text-primary-ink">
          {iniciais(nome, telefone)}
        </span>
        <p className="mt-1 font-semibold text-ink">{nome ?? "Sem nome"}</p>
        {telefone && <p className="tabular text-xs text-ink-muted">{telefone}</p>}
      </div>

      <Secao titulo="Imóvel de interesse">
        {conversation.property ? (
          <Link href={`/imoveis/${conversation.property.id}/editar`} className="group block">
            <p className="font-medium text-ink group-hover:text-primary group-hover:underline">
              {conversation.property.title}
            </p>
            {conversation.property.neighborhood && (
              <p className="text-xs text-ink-muted">{conversation.property.neighborhood}</p>
            )}
            {conversation.property.price != null && (
              <p className="tabular mt-0.5 text-xs font-semibold text-ink">{preco(conversation.property.price)}</p>
            )}
          </Link>
        ) : (
          <p className="text-xs text-ink-subtle">Ainda não identificado.</p>
        )}
      </Secao>

      <Secao titulo="Origem">
        {referral ? (
          <>
            <p className="text-xs font-medium text-ink">Anúncio (clique para WhatsApp)</p>
            {anuncio && <p className="mt-0.5 line-clamp-3 text-xs break-words text-ink-muted">{anuncio}</p>}
          </>
        ) : (
          <p className="text-xs text-ink-muted">Contato direto</p>
        )}
      </Secao>

      <Secao titulo="Follow-up">
        <Linha
          rotulo="Etapa"
          valor={<span className="tabular">{etapaFollowup}</span>}
        />
        <Linha
          rotulo="Próximo toque"
          valor={
            <span className="tabular">
              {proximo && conversation.next_followup_at ? dataHora(conversation.next_followup_at) : "—"}
            </span>
          }
        />
        <Linha
          rotulo="Âncora"
          valor={
            <span className="tabular">{conversation.followup_anchor_at ? dataHora(conversation.followup_anchor_at) : "—"}</span>
          }
        />
        <Linha rotulo="IA" valor={conversation.ai_enabled ? "Rodando" : "Pausada"} />
        {conversation.status === "queued" && espera && <Linha rotulo="Esperando" valor={espera} />}
      </Secao>

      {tags.length > 0 && (
        <Secao titulo="Etiquetas">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} tone="warn">
                {tag}
              </Badge>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="Registro">
        <Linha rotulo="Conversa criada" valor={<span className="tabular">{dataHora(conversation.created_at)}</span>} />
        {conversation.contact?.created_at && (
          <Linha rotulo="Contato criado" valor={<span className="tabular">{dataHora(conversation.contact.created_at)}</span>} />
        )}
      </Secao>

      <div className="px-4 py-4">
        <ResetButton conversationId={id} />
      </div>
    </div>
  );

  return (
    <ChatFrame header={header} actions={actions} sheet={sheet}>
      {conversation.status === "queued" && (
        <div className="border-b border-warn-soft bg-warn-soft px-4 py-2 text-xs text-warn-ink">
          Pediu um humano{espera ? ` ${espera}` : ""}. Assuma para responder por aqui.
        </div>
      )}
      <ChatMessages messages={lista} />
      {canSend ? (
        <Composer conversationId={id} />
      ) : (
        <p className="border-t border-border bg-canvas px-4 py-3 text-center text-xs text-ink-subtle">
          {conversation.status === "bot"
            ? "O robô está atendendo essa conversa. Pause a IA para responder manualmente."
            : "Atendimento encerrado. Reative a IA para o robô voltar a atender."}
        </p>
      )}
    </ChatFrame>
  );
}
