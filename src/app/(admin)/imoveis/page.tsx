import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StatusSelect } from "./StatusSelect";
import { PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { IconPlus } from "@/components/icons";
import { preco } from "@/lib/ui/format";

type Imovel = {
  id: string;
  title: string;
  kind: string | null;
  type: string;
  status: string;
  price: number | null;
  neighborhood: string | null;
  video_url: string | null;
  pdf_url: string | null;
  photo_urls: string[] | null;
};

/** Materiais como chips — antes era uma string concatenada por " · ". */
function Materiais({ p }: { p: Imovel }) {
  const itens = [
    p.video_url && "vídeo",
    p.pdf_url && "PDF",
    p.photo_urls?.length ? `${p.photo_urls.length} fotos` : null,
  ].filter(Boolean) as string[];

  if (itens.length === 0) {
    return <span className="text-xs text-ink-subtle">sem material</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {itens.map((i) => (
        <span
          key={i}
          className="rounded-md bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-ink"
        >
          {i}
        </span>
      ))}
    </span>
  );
}

export default async function ImoveisPage() {
  const supabase = await createSupabaseServerClient();
  const { data: properties } = await supabase
    .from("properties")
    .select("id,title,kind,type,status,price,neighborhood,video_url,pdf_url,photo_urls")
    .order("created_at", { ascending: false });

  const list: Imovel[] = properties ?? [];
  const ativos = list.filter((p) => p.status === "ativo").length;

  const vazio = (
    <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-ink-subtle">
      Nenhum imóvel cadastrado ainda. O robô só consegue oferecer o que estiver aqui.
    </p>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Imóveis"
        hint={
          list.length === 0
            ? undefined
            : `${list.length} cadastrado${list.length === 1 ? "" : "s"} · ${ativos} ativo${ativos === 1 ? "" : "s"}`
        }
        action={
          <Link href="/imoveis/novo" className={buttonClass()}>
            <IconPlus className="h-4 w-4" />
            Novo
          </Link>
        }
      />

      {/* Celular: cards */}
      <div className="space-y-3 md:hidden">
        {list.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{p.title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {p.kind ?? "—"} · {p.neighborhood ?? "—"}
                </p>
              </div>
              <StatusSelect id={p.id} status={p.status} />
            </div>
            <p className="tabular mt-2.5 text-base font-semibold text-ink">{preco(p.price)}</p>
            <div className="mt-2">
              <Materiais p={p} />
            </div>
            <Link
              href={`/imoveis/${p.id}/editar`}
              className={buttonClass({ variant: "secondary", block: true, className: "mt-3" })}
            >
              Editar
            </Link>
          </div>
        ))}
        {list.length === 0 && vazio}
      </div>

      {/* Desktop: tabela — aqui os dados são de fato tabulares */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-canvas text-left">
              {["Título", "Tipo", "Bairro", "Preço", "Materiais", "Status", ""].map((h, i) => (
                <th
                  key={h || i}
                  className="px-4 py-2.5 text-[10px] font-extrabold tracking-[0.09em] text-ink-muted uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-border transition-colors hover:bg-surface-muted">
                <td className="px-4 py-3 font-medium text-ink">{p.title}</td>
                <td className="px-4 py-3 text-ink-muted">{p.kind ?? "—"}</td>
                <td className="px-4 py-3 text-ink-muted">{p.neighborhood ?? "—"}</td>
                <td className="tabular px-4 py-3 font-semibold text-ink">{preco(p.price)}</td>
                <td className="px-4 py-3">
                  <Materiais p={p} />
                </td>
                <td className="px-4 py-3">
                  <StatusSelect id={p.id} status={p.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/imoveis/${p.id}/editar`}
                    className="text-sm text-primary underline-offset-4 transition-colors hover:underline"
                  >
                    editar
                  </Link>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-subtle">
                  Nenhum imóvel cadastrado ainda. O robô só consegue oferecer o que estiver aqui.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
