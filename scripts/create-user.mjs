// Cria um usuário de login do painel (admin ou corretor).
// Uso: node --env-file=.env.local scripts/create-user.mjs email senha "Nome" admin
import { createClient } from "@supabase/supabase-js";

const [, , email, password, name, role = "corretor"] = process.argv;

if (!email || !password || !name) {
  console.error('Uso: node --env-file=.env.local scripts/create-user.mjs email senha "Nome" [admin|corretor]');
  process.exit(1);
}
if (!["admin", "corretor"].includes(role)) {
  console.error("role deve ser 'admin' ou 'corretor'");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente (.env.local)");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createErr) {
  console.error("Falha ao criar usuário:", createErr.message);
  process.exit(1);
}

const { error: profileErr } = await supabase
  .from("profiles")
  .insert({ id: created.user.id, name, role });
if (profileErr) {
  console.error("Usuário criado no Auth, mas falhou ao criar profile:", profileErr.message);
  process.exit(1);
}

console.log(`Usuário criado: ${email} (${role}). Já pode logar em /login.`);
