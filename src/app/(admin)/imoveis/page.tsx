import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusSelect } from "./StatusSelect";

export default async function ImoveisPage() {
  const supabase = await createSupabaseServerClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id,title,kind,type,status,price,neighborhood,video_url,pdf_url,photo_urls")
    .order("created_at", { ascending: false });

  const list = properties ?? [];

  function materiais(p: (typeof list)[number]) {
    return (
      [p.video_url && "vídeo", p.pdf_url && "PDF", p.photo_urls?.length && `${p.photo_urls.length} fotos`]
        .filter(Boolean)
        .join(" · ") || "sem material"
    );
  }

  function preco(p: (typeof list)[number]) {
    return p.price ? p.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Imóveis</h1>
        <Link
          href="/imoveis/novo"
          className="flex min-h-11 items-center rounded bg-neutral-900 px-4 text-sm font-medium text-white"
        >
          + Novo
        </Link>
      </div>

      {/* Mobile: lista de cards */}
      <div className="space-y-3 md:hidden">
        {list.map((p) => (
          <div key={p.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-sm text-neutral-500">
                  {p.kind ?? "—"} · {p.neighborhood ?? "—"}
                </p>
              </div>
              <StatusSelect id={p.id} status={p.status} />
            </div>
            <p className="mt-2 text-sm font-medium">{preco(p)}</p>
            <p className="mt-1 text-xs text-neutral-500">{materiais(p)}</p>
            <Link
              href={`/imoveis/${p.id}/editar`}
              className="mt-3 flex min-h-11 items-center justify-center rounded border text-sm text-neutral-700"
            >
              Editar
            </Link>
          </div>
        ))}
        {list.length === 0 && (
          <p className="rounded-xl border bg-white px-4 py-8 text-center text-neutral-400">
            Nenhum imóvel cadastrado ainda.
          </p>
        )}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Bairro</th>
              <th className="px-4 py-2">Preço</th>
              <th className="px-4 py-2">Materiais</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 font-medium">{p.title}</td>
                <td className="px-4 py-2 text-neutral-500">{p.kind ?? "—"}</td>
                <td className="px-4 py-2">{p.neighborhood ?? "—"}</td>
                <td className="px-4 py-2">{preco(p)}</td>
                <td className="px-4 py-2 text-xs text-neutral-500">{materiais(p)}</td>
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
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
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
