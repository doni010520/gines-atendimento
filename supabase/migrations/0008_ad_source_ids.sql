-- Casamento anúncio -> imóvel (29/08/26).
-- O id do anúncio na Meta (externalAdReply.sourceID) é estável e não muda quando o texto
-- do anúncio é editado — é a chave confiável. O título fica como reserva pro primeiro
-- clique de um anúncio ainda desconhecido, e o id é aprendido a partir dele.

alter table properties
  add column if not exists ad_source_ids text[] not null default '{}';

comment on column properties.ad_source_ids is
  'IDs de anúncio da Meta (externalAdReply.sourceID) que apontam pra este imóvel. Preenchido sozinho no 1º clique casado por título, e editável no painel.';

create index if not exists properties_ad_source_ids_idx on properties using gin (ad_source_ids);
