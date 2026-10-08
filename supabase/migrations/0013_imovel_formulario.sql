-- Lead de anúncio com formulário (Meta "Preenchi seu formulário…") chega no WhatsApp sem
-- título nem id do anúncio — não dá pra saber o imóvel pela mensagem. O Gines escolhe em
-- /agente qual imóvel esses leads recebem.
alter table agent_settings
  add column if not exists imovel_formulario_id uuid references properties(id) on delete set null;

comment on column agent_settings.imovel_formulario_id is
  'Imóvel usado quando o lead vem de anúncio que não identifica o imóvel (ex.: formulário).';
