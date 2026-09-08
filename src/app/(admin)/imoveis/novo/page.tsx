import Link from "next/link";
import { PropertyForm } from "../PropertyForm";
import { PageHeader } from "@/components/ui/card";
import { IconBack } from "@/components/icons";

export default function NovoImovelPage() {
  return (
    <div className="space-y-5">
      <Link
        href="/imoveis"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <IconBack className="h-4 w-4" />
        Imóveis
      </Link>
      <PageHeader title="Novo imóvel" hint="O robô só oferece o que estiver cadastrado aqui." />
      <PropertyForm />
    </div>
  );
}
