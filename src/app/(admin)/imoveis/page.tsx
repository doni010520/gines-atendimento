import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusSelect } from "./StatusSelect";

export default async function ImoveisPage() {
  const supabase = await createSupabaseServerClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id,title,type,status,price,neighborhood,video_url,pdf_url,photo_urls")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Imóveis</h1>
        <Link href="/imoveis/novo" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          + Novo imóvel
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Bairro</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Materiais</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(properties ?? []).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-medium">{p.title}</td>
                <td className="px-4 py-2">{p.neighborhood ?? "—"}</td>
                <td className="px-4 py-2">
                  {p.price ? p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">
                  {[p.video_url && "vídeo", p.pdf_url && "PDF", p.photo_urls?.length && `${p.photo_urls.length} fotos`]
                    .filter(Boolean)
                    .join(" · ") || "sem material"}
                </td>
                <td className="px-4 py-2">
                  <StatusSelect id={p.id} status={p.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/imoveis/${p.id}/editar`} className="text-neutral-600 hover:underline">
                    editar
                  </Link>
                </td>
              </tr>
            ))}
            {(properties ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum imóvel cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
