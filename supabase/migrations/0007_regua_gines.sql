-- Régua de conversão pedida pelo Gines (26/08/26):
-- D1 fim de tarde -> D3 manhã -> D7 início da tarde -> encerra.
-- Substitui a régua antiga (+2h -> +6h -> loop de 48h pra sempre).

alter table conversations
  add column if not exists visit_offers_count int not null default 0,
  add column if not exists opt_out boolean not null default false,
  add column if not exists last_followup_shift text;

comment on column conversations.followup_stage is
  '0=material não enviado; 1=aguardando D1 (fim de tarde); 2=aguardando D3 (manhã); 3=aguardando D7 (início da tarde); 4=régua encerrada';
comment on column conversations.visit_offers_count is
  'Quantos convites de visita a IA já fez nesta conversa. Teto de 2 (regra do Gines).';
comment on column conversations.opt_out is
  'Pessoa pediu pra parar / disse que não tem interesse. Trava a régua permanentemente, mesmo se a conversa for reaberta.';
comment on column conversations.last_followup_shift is
  'Turno do último follow-up enviado (manha|tarde|fim_tarde) — garante a alternância obrigatória de turnos.';

-- quem já recebeu convite de visita conta como 1 (ainda pode receber o 2º)
update conversations set visit_offers_count = 1 where visit_offered = true and visit_offers_count = 0;

-- quem estava no loop infinito de 48h já levou 2+ mensagens: encerra a régua em vez de
-- migrar pro D7 e mandar mais uma. Quem estava no estágio 1/2 entra na régua nova pelo
-- estágio equivalente e é reencaixado no turno certo na hora de disparar.
update conversations
  set followup_stage = 4, next_followup_at = null
  where followup_stage >= 3;

-- destaques que a régua injeta nas copies do D1/D3 — cache por imóvel, gerado uma vez
alter table properties
  add column if not exists highlight_visual text,
  add column if not exists highlight_tecnico text;

comment on column properties.highlight_visual is
  'Destaque visual/arquitetônico usado na copy do D1 ("Acredito que ___ chamou sua atenção"). Gerado a partir da base do imóvel.';
comment on column properties.highlight_tecnico is
  'Diferencial técnico/acabamento usado na copy do D3 ("a casa já conta com ___"). Gerado a partir da base do imóvel.';
