import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assumeConversation, returnToBot } from "../actions";
import { ResetButton } from "../ResetButton";
import { SendMessageForm } from "../SendMessageForm";
import { FormSubmitButton } from "../../FormSubmitButton";

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

  return (
    <div className="space-y-3">
      <Link href="/inbox" className="flex min-h-11 items-center text-sm text-neutral-500 md:hidden">
        ← Voltar pro Inbox
      </Link>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="order-1 flex h-[65vh] flex-col rounded-xl border bg-white lg:h-[75vh] lg:col-span-2">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {(messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm sm:max-w-[75%] ${
                  m.is_internal
                    ? "mx-auto bg-amber-50 text-amber-800"
                    : m.direction === "in"
                      ? "bg-neutral-100"
                      : "ml-auto bg-neutral-900 text-white"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1 text-[10px] opacity-60">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
              </div>
            ))}
            {(messages ?? []).length === 0 && (
              <p className="text-center text-sm text-neutral-400">Sem mensagens ainda.</p>
            )}
          </div>
          {canSend ? (
            <SendMessageForm conversationId={id} />
          ) : (
            <div className="border-t p-3 text-center text-xs text-neutral-400">
              {conversation.status === "bot" ? "O robô está atendendo essa conversa." : "Atendimento encerrado."}
            </div>
          )}
        </div>

        <div className="order-2 space-y-4">
          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="font-medium">{conversation.contact?.name ?? "Sem nome"}</p>
            <p className="text-neutral-500">{conversation.contact?.phone}</p>
            {conversation.property && (
              <div className="mt-3 border-t pt-3">
                <p className="font-medium">{conversation.property.title}</p>
                <p className="text-neutral-500">{conversation.property.neighborhood}</p>
              </div>
            )}
          </div>

          {conversation.status === "queued" && (
            <form action={assumeConversation.bind(null, id)}>
              <FormSubmitButton pendingLabel="Assumindo..." className="min-h-11 w-full rounded bg-green-600 px-4 text-sm font-medium text-white">
                Assumir atendimento
              </FormSubmitButton>
            </form>
          )}
          {conversation.status === "open" && (
            <form action={returnToBot.bind(null, id)}>
              <FormSubmitButton pendingLabel="Devolvendo..." className="min-h-11 w-full rounded border px-4 text-sm font-medium text-neutral-700">
                Devolver pro robô
              </FormSubmitButton>
            </form>
          )}

          <ResetButton conversationId={id} />
        </div>
      </div>
    </div>
  );
}
