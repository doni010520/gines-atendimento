import { type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Entrada dos links de "definir senha" (recuperação/convite).
 *
 * GET só mostra um botão — não gasta o token. Prévias de link (WhatsApp, e-mail) abrem a URL
 * sozinhas; se o GET verificasse o token, a prévia consumiria o link de uso único antes da pessoa.
 * O POST (clique no botão) troca o token por sessão e manda pra /redefinir-senha.
 * Destino fixo, sem parâmetro de redirecionamento, pra não virar open redirect.
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const campos = ["token_hash", "type", "code"]
    .filter((k) => p.get(k))
    .map((k) => `<input type="hidden" name="${k}" value="${esc(p.get(k)!)}">`)
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>GINES — Definir senha</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.c{background:#fff;border:1px solid #e3e5e8;border-radius:12px;padding:28px;max-width:360px;width:100%;text-align:center}
h1{color:#1f2a44;font-size:22px;margin:0 0 6px}p{color:#5b6472;font-size:14px;margin:0 0 20px}
button{width:100%;min-height:46px;border:0;border-radius:8px;background:#1f2a44;color:#fff;font-size:15px;font-weight:600;cursor:pointer}</style>
</head><body><form class="c" method="post"><h1>GINES</h1><p>Toque no botão para criar sua nova senha.</p>${campos}
<button type="submit">Continuar</button></form></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");
  const code = String(form.get("code") ?? "");

  // resposta 303 (vira GET) com Location relativa; os cookies da sessão vão nela mesma
  const destino = (path: string) => new Response(null, { status: 303, headers: { Location: path } });
  let response = destino("/redefinir-senha");

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            const partes = [`${name}=${value}`, `Path=${options?.path ?? "/"}`, "SameSite=Lax", "Secure"];
            if (options?.maxAge !== undefined) partes.push(`Max-Age=${options.maxAge}`);
            if (options?.httpOnly) partes.push("HttpOnly");
            response.headers.append("Set-Cookie", partes.join("; "));
          }
        },
      },
    }
  );

  let ok = false;
  if (tokenHash && (type === "recovery" || type === "invite")) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  if (!ok) response = destino(`/login?error=${encodeURIComponent("Link inválido ou expirado. Peça um novo.")}`);
  return response;
}
