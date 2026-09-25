-- Comportamento da IA editável pelo painel (/agente).
-- Só a "personalidade" sai do código: nome, identidade, tom, saudação, frases fixas e
-- instruções extras. Regras operacionais (transbordo, teto de convites, uso das tools,
-- não inventar dado) continuam travadas em src/lib/ai/prompt.ts.
-- Linha única; coluna nula/vazia = usa o padrão do código (AGENT_DEFAULTS).

create table if not exists agent_settings (
  id boolean primary key default true check (id),
  assistant_name text,
  identity text,
  ai_disclosure text,
  tone text,
  greeting text,
  handoff_message text,
  optout_message text,
  extra_instructions text,
  updated_at timestamptz not null default now()
);

comment on table agent_settings is
  'Personalidade da IA editável em /agente. Campo nulo/vazio = padrão do código.';
comment on column agent_settings.optout_message is '{nome} vira ", Primeironome" (ou some).';

alter table agent_settings enable row level security;
create policy "authenticated read/write agent_settings" on agent_settings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into agent_settings (id) values (true) on conflict do nothing;
