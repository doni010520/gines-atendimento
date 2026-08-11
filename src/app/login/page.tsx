import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function login(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect("/inbox");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">GINES Atendimento</h1>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="space-y-1">
          <label className="text-sm font-medium">E-mail</label>
          <input name="email" type="email" required className="w-full rounded border px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Senha</label>
          <input name="password" type="password" required className="w-full rounded border px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="w-full rounded bg-neutral-900 py-2 text-sm font-medium text-white">
          Entrar
        </button>
      </form>
    </div>
  );
}
