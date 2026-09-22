-- Cadência de follow-up editável pelo painel (/cadencia).
-- Até a 0009 os 6 toques (24/48/96/120/168/216h), os objetivos da IA e os slots de mídia
-- (1/3/6) eram fixos no código. Agora cada toque é uma linha de followup_touches.
--
-- Decisão de modelagem (conversa no meio da cadência):
--   A conversa NÃO guarda a posição do toque (followup_stage 1..6 quebrava ao incluir,
--   remover ou reordenar toques). Guarda as HORAS do último toque já enviado
--   (followup_last_touch_hours, 0 = nenhum). O próximo toque é sempre "o primeiro toque
--   ativo com delay_hours maior que isso", recalculado na hora do envio — então editar a
--   lista no meio da cadência nunca reenvia toque passado e nunca pula de volta.
--   followup_next_touch_id é só informativo (o que está agendado), recalculado pelo motor.
--
-- followup_stage passa a ser só o estado: 0 = parada; 1 = rodando; 7 = encerrada.

create table if not exists followup_touches (
  id uuid primary key default gen_random_uuid(),
  position int not null default 0,
  delay_hours numeric not null check (delay_hours > 0),
  objective text not null check (length(trim(objective)) > 0),
  fallback_text text,
  media_url text,
  media_path text,
  media_kind text check (media_kind in ('audio', 'video')),
  media_file_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((media_url is null) = (media_kind is null))
);

-- a ordem da cadência é o delay; dois toques na mesma hora não fazem sentido
create unique index if not exists followup_touches_delay_uidx
  on followup_touches(delay_hours);

comment on table followup_touches is
  'Toques da cadência de follow-up, editáveis em /cadencia. Ordem = delay_hours (horas após a âncora).';
comment on column followup_touches.objective is 'Instrução que a IA usa pra escrever a mensagem do toque.';
comment on column followup_touches.fallback_text is
  'Texto fixo de reserva se a IA falhar. {nome} vira o primeiro nome do lead. Nulo = reserva genérica.';
comment on column followup_touches.position is 'Só exibição/desempate; a ordem real é delay_hours.';

alter table followup_touches enable row level security;
create policy "authenticated read/write followup_touches" on followup_touches for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Configuração geral da cadência (linha única).
create table if not exists followup_settings (
  id boolean primary key default true check (id),
  final_tag text not null default 'Perdido por Falta de Retorno',
  apply_final_tag boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table followup_settings is 'Configuração geral da cadência (linha única, id = true).';

alter table followup_settings enable row level security;
create policy "authenticated read/write followup_settings" on followup_settings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into followup_settings (id) values (true) on conflict (id) do nothing;

-- Semeia os 6 toques de hoje (mesmos objetivos e textos de reserva do código até a 0009),
-- trazendo a mídia que já estava cadastrada em followup_media (slots 1, 3 e 6).
insert into followup_touches (position, delay_hours, objective, fallback_text, media_url, media_path, media_kind, media_file_name)
select s.position, s.delay_hours, s.objective, s.fallback_text, m.url, m.storage_path, m.media_type, m.file_name
from (values
  (1, 24, 'Retomar o assunto exatamente de onde a conversa parou (cite o último ponto tratado), de forma leve, e convidar a pessoa a continuar.',
      'Oi{nome}! Passando pra retomar nossa conversa sobre o imóvel. Ficou alguma dúvida que eu possa te ajudar?'),
  (2, 48, 'Tentativa leve de contato: uma frase curta e simpática perguntando se a pessoa conseguiu ver a última mensagem ou se ainda tem interesse.',
      'Oi{nome}, tudo bem? Só queria saber se ainda faz sentido pra você seguirmos com o imóvel.'),
  (3, 96, 'Escassez natural: mostrar que o imóvel tem procura e que vale não deixar pra depois (ex.: "Temos visitas agendadas para este fim de semana..."), convidando pra agendar uma visita. Sem pressão agressiva e sem inventar números.',
      'Oi{nome}! Essa semana a procura por esse imóvel está movimentada. Se quiser conhecer, me avisa que eu já organizo uma visita pra você.'),
  (4, 120, 'Investigação: perguntar com curiosidade genuína se o imóvel não encaixou no perfil (ex.: "A casa não encaixou no seu perfil?") e se oferecer pra buscar algo mais adequado.',
      'Oi{nome}, ficou alguma coisa que não encaixou no que você procura? Me conta que eu te ajudo a achar uma opção melhor.'),
  (5, 168, 'Penúltima tentativa de resgate: tom cordial, reforçar que está à disposição e fazer uma pergunta simples que seja fácil de responder.',
      'Oi{nome}! Ainda posso te ajudar com esse imóvel ou com outra opção? É só me responder por aqui.'),
  (6, 216, 'Ultimato educado: avisar que, como não houve retorno, está encerrando o atendimento (ex.: "Como não tive retorno, estou encerrando seu atendimento..."), deixando a porta aberta pra pessoa chamar quando quiser.',
      'Oi{nome}. Como não tive retorno, estou encerrando seu atendimento por aqui. Se quiser retomar a busca, é só me chamar — fico à disposição!')
) as s(position, delay_hours, objective, fallback_text)
left join followup_media m on m.touch = s.position
where not exists (select 1 from followup_touches);

-- followup_media fica no banco (dados preservados), mas o código não usa mais.
comment on table followup_media is
  'LEGADO (0009). Substituída por followup_touches.media_* na 0010 — dados copiados, não é mais lida.';

-- Conversas: referência a toque em vez de posição.
alter table conversations
  add column if not exists followup_last_touch_hours numeric not null default 0,
  add column if not exists followup_next_touch_id uuid references followup_touches(id) on delete set null,
  add column if not exists followup_last_touch_at timestamptz;

comment on column conversations.followup_last_touch_hours is
  'delay_hours do último toque enviado nesta cadência (0 = nenhum). Próximo = 1º toque ativo com delay maior.';
comment on column conversations.followup_last_touch_at is
  'Quando saiu o último toque. Piso de 1h até o próximo, mesmo que o painel encurte as horas no meio da cadência.';
comment on column conversations.followup_next_touch_id is
  'Toque agendado em next_followup_at (informativo; o motor recalcula na hora de enviar).';
comment on column conversations.followup_stage is
  '0=cadência parada (lead respondeu ou robô ainda não falou); 1=rodando; 7=encerrada (último toque enviado ou opt-out). Valores 2..6 são legado da 0009 e foram migrados.';

-- Em andamento: stage N (1..6) = "próximo é o toque N" => último enviado foi o N-1.
-- next_followup_at é mantido — ninguém recebe toque adiantado nem repetido.
update conversations c
  set followup_last_touch_hours = coalesce(
        (select t.delay_hours from followup_touches t where t.position = c.followup_stage - 1), 0),
      followup_next_touch_id = (select t.id from followup_touches t where t.position = c.followup_stage),
      followup_stage = 1
  where c.followup_stage between 1 and 6;
