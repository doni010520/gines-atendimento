import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assumeConversation, returnToBot, sendMessageFormAction } from "../actions";

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
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 flex h-[75vh] flex-col rounded-xl border bg-white">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
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
          {(messages ?? []).length === 0 && <p className="text-center text-sm text-neutral-400">Sem mensagens ainda.</p>}
        </div>
        {canSend ? (
          <form action={sendMessageFormAction.bind(null, id)} className="flex gap-2 border-t p-3">
            <input
              name="text"
              placeholder="Escrever mensagem..."
              className="flex-1 rounded border px-3 py-2 text-sm"
              autoComplete="off"
            />
            <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Enviar
            </button>
          </form>
        ) : (
          <div className="border-t p-3 text-center text-xs text-neutral-400">
            {conversation.status === "bot" ? "O robô está atendendo essa conversa." : "Atendimento encerrado."}
          </div>
        )}
      </div>

      <div className="space-y-4">
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
            <button type="submit" className="w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white">
              Assumir atendimento
            </button>
          </form>
        )}
        {conversation.status === "open" && (
          <form action={returnToBot.bind(null, id)}>
            <button type="submit" className="w-full rounded border px-4 py-2 text-sm font-medium text-neutral-700">
              Devolver pro robô
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
