import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { GroupHeader, PageHeader } from "@/components/ui/card";
import { conversationStatus, INBOX_GROUPS } from "@/lib/ui/status";
import { quando } from "@/lib/ui/format";

type Conversa = {
  id: string;
  status: string;
  last_message_at: string | null;
  contact: { name: string | null; phone: string } | null;
  property: { title: string } | null;
};

export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id,status,last_message_at,contact:contacts(name,phone),property:properties(title)")
    .order("last_message_at", { ascending: false })
    .limit(100);

  const list: Conversa[] = conversations ?? [];

  // Agrupamento é client-side sobre os mesmos dados: a query não muda, e a ordem
  // cronológica se mantém dentro de cada grupo.
  const grupos = INBOX_GROUPS.map((g) => ({
    ...g,
    itens: list.filter((c) => (g.statuses as readonly string[]).includes(c.status)),
  }));

  const esperando = grupos[0].itens.length;

  return (
    <div className="space-y-7">
      <PageHeader
        title="Inbox"
        hint={
          esperando > 0
            ? `${esperando} ${esperando === 1 ? "pessoa espera" : "pessoas esperam"} um corretor.`
            : "Nenhuma conversa esperando por você."
        }
      />

      {grupos.map((grupo) => {
        if (grupo.itens.length === 0 && !grupo.empty) return null;
        const urgente = grupo.key === "urgente";

        return (
          <section key={grupo.key}>
            <GroupHeader title={grupo.title} count={grupo.itens.length} />

            {grupo.itens.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-ink-subtle">
                {grupo.empty}
              </p>
            ) : (
              <ul className="space-y-2">
                {grupo.itens.map((c) => {
                  const status = conversationStatus(c.status);
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/inbox/${c.id}`}
                        className={`flex min-h-16 flex-col justify-center gap-1 rounded-xl border border-border bg-surface px-4 py-3 shadow-card transition-colors hover:border-border-strong hover:bg-surface-muted ${
                          urgente ? "border-l-[3px] border-l-warn-edge" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-ink">
                            {c.contact?.name ?? c.contact?.phone ?? "—"}
                          </span>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="flex min-w-0 items-center gap-2 text-ink-muted">
                            <span className="truncate">{c.property?.title ?? "Imóvel não identificado"}</span>
                            {c.contact?.phone && (
                              <>
                                <span className="text-border-strong">·</span>
                                <span className="tabular hidden shrink-0 text-ink-subtle sm:inline">
                                  {c.contact.phone}
                                </span>
                              </>
                            )}
                          </span>
                          <span className="tabular shrink-0 text-ink-subtle">
                            {quando(c.last_message_at)}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {list.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-ink-subtle">
          Nenhuma conversa ainda. Assim que alguém escrever no WhatsApp, ela aparece aqui.
        </p>
      )}
    </div>
  );
}
