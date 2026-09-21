-- Cadência de follow-up nova (pedido do cliente, 09/26):
-- o relógio começa na ÚLTIMA mensagem do robô sem resposta do lead, e são 6 toques
-- em 24h / 48h / 96h / 120h / 168h / 216h contados a partir dessa âncora.
-- Qualquer resposta do lead zera; a próxima resposta do robô recomeça do toque 1.
-- Substitui a régua D1/D3/D7 ancorada em material_sent_at (0007).

alter table conversations
  add column if not exists followup_anchor_at timestamptz,
  add column if not exists tags text[] not null default '{}';

comment on column conversations.followup_anchor_at is
  'Mensagem do robô que ancora a cadência (última sem resposta do lead). Os toques contam horas a partir daqui.';
comment on column conversations.followup_stage is
  '0=cadência parada (lead respondeu ou robô ainda não falou); 1..6=próximo toque a enviar; 7=cadência encerrada (toque 6 enviado ou opt-out)';
comment on column conversations.tags is
  'Etiquetas livres da conversa (ex.: "Perdido por Falta de Retorno", posta pela cadência ao encerrar).';
comment on column conversations.last_followup_shift is
  'Legado da régua D1/D3/D7 (rotação de turnos). Não é mais usado pela cadência nova.';

-- Régua antiga em andamento: não dá pra traduzir D1/D3/D7 em toques da cadência nova sem
-- arriscar disparo em massa pra lead antigo. Para tudo; a conversa volta pra cadência
-- quando o robô responder de novo. Quem já tinha encerrado (4) vira o novo "encerrada" (7).
update conversations
  set followup_stage = 0, next_followup_at = null, followup_anchor_at = null
  where followup_stage between 1 and 3;
update conversations
  set followup_stage = 7, next_followup_at = null
  where followup_stage = 4;

create index if not exists conversations_followup_due_idx
  on conversations(next_followup_at)
  where status = 'bot' and ai_enabled = true and opt_out = false;

-- Mídias pré-gravadas da cadência (globais, não por imóvel): toques 1, 3 e 6.
create table if not exists followup_media (
  touch int primary key check (touch in (1, 3, 6)),
  media_type text not null check (media_type in ('audio', 'video')),
  url text not null,
  storage_path text not null,
  file_name text,
  updated_at timestamptz not null default now()
);

comment on table followup_media is
  'Áudio/vídeo pré-gravado enviado junto com o texto dos toques 1, 3 e 6 da cadência. Sem linha = só texto.';

alter table followup_media enable row level security;
create policy "authenticated read/write followup_media" on followup_media for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Bucket público em LEITURA: a uazapi manda mídia por URL, precisa ser acessível sem auth.
insert into storage.buckets (id, name, public)
values ('followup-media', 'followup-media', true)
on conflict (id) do nothing;

create policy "followup-media: leitura pública"
  on storage.objects for select
  using (bucket_id = 'followup-media');

create policy "followup-media: upload por usuário autenticado"
  on storage.objects for insert
  with check (bucket_id = 'followup-media' and auth.role() = 'authenticated');

create policy "followup-media: update por usuário autenticado"
  on storage.objects for update
  using (bucket_id = 'followup-media' and auth.role() = 'authenticated');

create policy "followup-media: delete por usuário autenticado"
  on storage.objects for delete
  using (bucket_id = 'followup-media' and auth.role() = 'authenticated');
