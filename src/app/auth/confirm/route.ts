import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Entrada dos links de "definir senha" (recuperação/convite). Troca o token por uma sessão
 * e manda pra /redefinir-senha. Aceita os dois formatos do Supabase:
 *   ?token_hash=...&type=recovery  — link gerado pelo admin
 *   ?code=...                      — link do e-mail com PKCE
 * O destino é fixo (sem parâmetro de redirecionamento) pra não virar open redirect.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (tokenHash && (type === "recovery" || type === "invite")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (!ok) redirect(`/login?error=${encodeURIComponent("Link inválido ou expirado. Peça um novo.")}`);
  redirect("/redefinir-senha");
}
