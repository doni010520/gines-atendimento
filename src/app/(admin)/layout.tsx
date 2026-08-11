import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("name,role").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">GINES</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/inbox" className="text-neutral-600 hover:text-neutral-900">
              Inbox
            </Link>
            <Link href="/imoveis" className="text-neutral-600 hover:text-neutral-900">
              Imóveis
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <span>
            {profile?.name} {profile?.role ? `· ${profile.role}` : ""}
          </span>
          <form action={signOut}>
            <button type="submit" className="text-neutral-500 hover:text-neutral-900">
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  );
}
