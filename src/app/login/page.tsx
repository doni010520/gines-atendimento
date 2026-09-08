import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FormSubmitButton } from "../(admin)/FormSubmitButton";

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

const CAMPO =
  "min-h-11 w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink " +
  "transition-colors hover:border-border-strong focus:border-primary focus:bg-surface";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold tracking-tight text-primary">GINES</p>
          <p className="mt-1 text-sm text-ink-muted">Painel de atendimento</p>
        </div>

        <form
          action={login}
          className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-float"
        >
          {error && (
            <p className="rounded-lg border border-danger-edge bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-semibold text-ink-muted">
              E-mail
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-semibold text-ink-muted">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={CAMPO}
            />
          </div>

          <FormSubmitButton pendingLabel="Entrando..." block>
            Entrar
          </FormSubmitButton>
        </form>
      </div>
    </div>
  );
}
