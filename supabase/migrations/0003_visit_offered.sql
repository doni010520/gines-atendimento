-- controla se o convite de visita já foi feito nesta conversa — evita o bot repetir
-- o convite em toda resposta (achado em teste real, 14/08/26)
alter table conversations add column visit_offered boolean not null default false;
