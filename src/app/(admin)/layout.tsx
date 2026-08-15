import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MobileTabBar } from "./MobileTabBar";

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
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="font-semibold">GINES</span>
          <nav className="hidden gap-4 text-sm md:flex">
            <Link href="/inbox" className="flex min-h-11 items-center text-neutral-600 hover:text-neutral-900">
              Inbox
            </Link>
            <Link href="/imoveis" className="flex min-h-11 items-center text-neutral-600 hover:text-neutral-900">
              Imóveis
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <span className="hidden sm:inline">
            {profile?.name} {profile?.role ? `· ${profile.role}` : ""}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="flex min-h-11 min-w-11 items-center justify-center text-neutral-500 hover:text-neutral-900"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 md:pb-6">{children}</main>
      <MobileTabBar />
    </div>
  );
}
