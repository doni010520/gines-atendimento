import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assumeConversation, returnToBot } from "../actions";
import { ResetButton } from "../ResetButton";
import { SendMessageForm } from "../SendMessageForm";
import { FormSubmitButton } from "../../FormSubmitButton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { IconBack, IconHandRaised } from "@/components/icons";
import { conversationStatus } from "@/lib/ui/status";
import { dataHora, esperando, preco } from "@/lib/ui/format";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*,contact:contacts(name,phone),property:properties(title,price,neighborhood)")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  const canSend = conversation.status === "open" || conversation.status === "queued";
  const status = conversationStatus(conversation.status);
  const espera = esperando(conversation.last_message_at);
  const lista = messages ?? [];

  return (
    <div className="space-y-3">
      <Link
        href="/inbox"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink md:hidden"
      >
        <IconBack className="h-4 w-4" />
        Inbox
      </Link>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/*
          Altura: antes travada em 65vh/75vh, o que deixava buraco no desktop e
          apertava no celular. `dvh` acompanha a barra do navegador móvel, que
          aparece e some conforme a rolagem.
        */}
        <Card className="order-1 flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col overflow-hidden lg:col-span-2 lg:h-[calc(100dvh-9rem)]">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">
                {conversation.contact?.name ?? "Sem nome"}
              </p>
              <p className="truncate text-xs text-ink-muted">
                {conversation.property ? (
                  <>
                    {conversation.property.title}
                    {conversation.property.neighborhood && ` · ${conversation.property.neighborhood}`}
                    {conversation.property.price != null && (
                      <span className="tabular"> · {preco(conversation.property.price)}</span>
                    )}
                  </>
                ) : (
                  <span className="tabular">{conversation.contact?.phone}</span>
                )}
              </p>
            </div>
            <Badge tone={status.tone}>{status.label}</Badge>
          </header>

          {/*
            A ação mais importante do painel. Antes morava na coluna lateral —
            no celular, abaixo do chat inteiro, fora da primeira tela.
          */}
          {conversation.status === "queued" && (
            <div className="flex items-center justify-between gap-3 border-b border-warn-soft bg-warn-soft px-4 py-2.5">
              <p className="text-xs leading-snug text-warn-ink">
                Pediu um humano{espera ? ` ${espera}` : ""}
              </p>
              <form action={assumeConversation.bind(null, id)}>
                <FormSubmitButton pendingLabel="Assumindo..." variant="success" size="sm">
                  <IconHandRaised className="h-4 w-4" />
                  Assumir
                </FormSubmitButton>
              </form>
            </div>
          )}

          <div className="flex-1 space-y-2.5 overflow-y-auto bg-surface-muted p-4">
            {lista.map((m) => (
              <div
                key={m.id}
                className={`w-fit max-w-[85%] px-3 py-2 text-sm sm:max-w-[72%] ${
                  m.is_internal
                    ? "mx-auto rounded-lg bg-warn-soft text-warn-ink"
                    : m.direction === "in"
                      ? "rounded-xl rounded-bl-sm border border-border bg-surface text-ink"
                      : "ml-auto rounded-xl rounded-br-sm bg-primary text-white"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p
                  className={`tabular mt-1 text-[10px] ${
                    m.direction === "out" && !m.is_internal ? "text-white/60" : "text-ink-subtle"
                  }`}
                >
                  {dataHora(m.created_at)}
                </p>
              </div>
            ))}
            {lista.length === 0 && (
              <p className="py-8 text-center text-sm text-ink-subtle">Sem mensagens ainda.</p>
            )}
          </div>

          {canSend ? (
            <SendMessageForm conversationId={id} />
          ) : (
            <p className="border-t border-border px-4 py-3 text-center text-xs text-ink-subtle">
              {conversation.status === "bot"
                ? "O robô está atendendo essa conversa. Ela aparece aqui quando ele pedir ajuda."
                : "Atendimento encerrado."}
            </p>
          )}
        </Card>

        <aside className="order-2 space-y-3">
          <Card className="p-4 text-sm">
            <p className="font-semibold text-ink">{conversation.contact?.name ?? "Sem nome"}</p>
            <p className="tabular mt-0.5 text-xs text-ink-muted">{conversation.contact?.phone}</p>

            {conversation.property && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">
                  Imóvel do interesse
                </p>
                <p className="mt-1.5 font-medium text-ink">{conversation.property.title}</p>
                <p className="text-xs text-ink-muted">{conversation.property.neighborhood}</p>
                {conversation.property.price != null && (
                  <p className="tabular mt-1 font-semibold text-ink">
                    {preco(conversation.property.price)}
                  </p>
                )}
              </div>
            )}
          </Card>

          {conversation.status === "open" && (
            <form action={returnToBot.bind(null, id)}>
              <FormSubmitButton pendingLabel="Devolvendo..." variant="secondary" block>
                Devolver pro robô
              </FormSubmitButton>
            </form>
          )}

          <ResetButton conversationId={id} />
        </aside>
      </div>
    </div>
  );
}
