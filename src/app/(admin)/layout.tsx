import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MobileTabBar } from "./MobileTabBar";
import { DesktopNav } from "./DesktopNav";
import { FormSubmitButton } from "./FormSubmitButton";

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
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-7">
            <span className="text-[15px] font-bold tracking-tight text-primary">GINES</span>
            <DesktopNav />
          </div>

          <div className="flex items-center gap-2">
            {profile?.name && (
              <span className="hidden text-right text-xs leading-tight sm:block">
                <span className="block font-medium text-ink">{profile.name}</span>
                {profile.role && <span className="block text-ink-subtle">{profile.role}</span>}
              </span>
            )}
            <form action={signOut}>
              <FormSubmitButton pendingLabel="Saindo..." variant="ghost" size="sm">
                Sair
              </FormSubmitButton>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:px-6 md:pb-8">{children}</main>
      <MobileTabBar />
    </div>
  );
}
