import { createSupabaseServerClient } from "@/lib/supabase/server";
import { InboxList, type InboxItem } from "./InboxList";
import { AutoRefresh } from "./AutoRefresh";

/**
 * Casca do Inbox estilo WhatsApp Web: a lista de conversas mora no layout, então
 * ela continua na tela enquanto o corretor troca de conversa (/inbox/[id]).
 */
export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id,status,last_message_at,tags,contact:contacts(name,phone),property:properties(title)")
    .order("last_message_at", { ascending: false })
    .limit(150);

  const list = conversations ?? [];
  const ids = list.map((c) => c.id);

  // Prévia da última mensagem: uma consulta só, ordenada da mais nova pra mais
  // antiga; a primeira que aparecer de cada conversa é a última dela.
  const ultima = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id,body,created_at")
      .in("conversation_id", ids)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .limit(1500);
    for (const m of msgs ?? []) {
      if (!ultima.has(m.conversation_id)) ultima.set(m.conversation_id, m.body);
    }
  }

  const items: InboxItem[] = list.map((c) => ({
    id: c.id,
    status: c.status,
    lastMessageAt: c.last_message_at,
    tags: c.tags ?? [],
    name: c.contact?.name ?? null,
    phone: c.contact?.phone ?? null,
    propertyTitle: c.property?.title ?? null,
    preview: ultima.get(c.id) ?? null,
  }));

  return (
    <div className="flex h-full min-h-0 bg-surface">
      <AutoRefresh />
      <InboxList items={items} />
      <section className="flex min-w-0 flex-1">{children}</section>
    </div>
  );
}
