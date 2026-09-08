import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PropertyForm } from "../../PropertyForm";
import { PageHeader } from "@/components/ui/card";
import { IconBack } from "@/components/icons";

export default async function EditarImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (!property) notFound();

  return (
    <div className="space-y-5">
      <Link
        href="/imoveis"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <IconBack className="h-4 w-4" />
        Imóveis
      </Link>
      <PageHeader title="Editar imóvel" hint={property.title} />
      <PropertyForm property={property} />
    </div>
  );
}
