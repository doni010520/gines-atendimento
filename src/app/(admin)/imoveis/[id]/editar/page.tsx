import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PropertyForm } from "../../PropertyForm";

export default async function EditarImovelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: property } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (!property) notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Editar imóvel</h1>
      <PropertyForm property={property} />
    </div>
  );
}
