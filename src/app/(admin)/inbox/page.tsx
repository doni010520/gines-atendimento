import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  bot: { label: "Com o robô", className: "bg-blue-50 text-blue-700" },
  queued: { label: "Aguardando corretor", className: "bg-amber-50 text-amber-700" },
  open: { label: "Em atendimento", className: "bg-green-50 text-green-700" },
  closed: { label: "Encerrado", className: "bg-neutral-100 text-neutral-500" },
};

export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id,status,last_message_at,contact:contacts(name,phone),property:properties(title)")
    .order("last_message_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Imóvel</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Última mensagem</th>
            </tr>
          </thead>
          <tbody>
            {(conversations ?? []).map((c) => {
              const status = STATUS_LABEL[c.status] ?? STATUS_LABEL.bot;
              return (
                <tr key={c.id} className="border-t hover:bg-neutral-50">
                  <td className="px-4 py-2">
                    <Link href={`/inbox/${c.id}`} className="font-medium hover:underline">
                      {c.contact?.name ?? c.contact?.phone ?? "—"}
                    </Link>
                    <div className="text-xs text-neutral-400">{c.contact?.phone}</div>
                  </td>
                  <td className="px-4 py-2">{c.property?.title ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${status.className}`}>{status.label}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "—"}
                  </td>
                </tr>
              );
            })}
            {(conversations ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma conversa ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
