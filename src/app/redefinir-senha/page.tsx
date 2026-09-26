import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FormSubmitButton } from "../(admin)/FormSubmitButton";

async function definirSenha(formData: FormData) {
  "use server";
  const senha = String(formData.get("password") ?? "");
  const confirmacao = String(formData.get("confirm") ?? "");
  if (senha.length < 8) redirect(`/redefinir-senha?error=${encodeURIComponent("A senha precisa ter pelo menos 8 caracteres.")}`);
  if (senha !== confirmacao) redirect(`/redefinir-senha?error=${encodeURIComponent("As duas senhas não conferem.")}`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) redirect(`/redefinir-senha?error=${encodeURIComponent(error.message)}`);
  redirect("/inbox");
}

const CAMPO =
  "min-h-11 w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink " +
  "transition-colors hover:border-border-strong focus:border-primary focus:bg-surface";

/** Chega aqui já logado pelo link de /auth/confirm (o proxy barra quem não tem sessão). */
export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold tracking-tight text-primary">GINES</p>
          <p className="mt-1 text-sm text-ink-muted">Definir nova senha</p>
        </div>

        <form
          action={definirSenha}
          className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-float"
        >
          {user?.email && <p className="text-sm text-ink-muted">Conta: {user.email}</p>}
          {error && (
            <p className="rounded-lg border border-danger-edge bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-semibold text-ink-muted">
              Nova senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={CAMPO}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="block text-xs font-semibold text-ink-muted">
              Repita a senha
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={CAMPO}
            />
          </div>

          <FormSubmitButton pendingLabel="Salvando..." block>
            Salvar senha e entrar
          </FormSubmitButton>
        </form>
      </div>
    </div>
  );
}
