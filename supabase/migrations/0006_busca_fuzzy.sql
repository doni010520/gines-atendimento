-- Busca de imóvel deixa de ser só "ilike" literal no bairro. Achado real (21/08/26):
-- "brooklyn" (grafia comum/errada) não batia com "Brooklin" (dado cadastrado) e o bot
-- dizia "não tenho" pra um imóvel que existia. Cliente também pode citar avenida
-- próxima ou característica em vez do nome exato do bairro/rua.
--
-- Solução: pg_trgm (similaridade de texto, tolera erro de digitação/grafia) + busca
-- também em endereço e na copy completa (pega menção a avenida/praça/ponto de
-- referência que só aparece no texto descritivo), tudo dentro de uma função no
-- banco — mais barato e mais confiável que tentar resolver isso no prompt.
create extension if not exists pg_trgm;

create or replace function buscar_imoveis_fuzzy(
  p_localizacao text default null,
  p_tipo_imovel text default null,
  p_tipo text default null,
  p_preco_max numeric default null,
  p_preco_min numeric default null,
  p_quartos_min int default null
)
returns setof properties
language sql
stable
as $$
  select p.*
  from properties p
  where p.status = 'ativo'
    and (p_tipo is null or p_tipo = '' or p.type::text = p_tipo)
    and (p_preco_max is null or p.price <= p_preco_max)
    and (p_preco_min is null or p.price >= p_preco_min)
    and (p_quartos_min is null or p.bedrooms >= p_quartos_min)
    and (
      p_localizacao is null or p_localizacao = '' or
      p.neighborhood ilike '%' || p_localizacao || '%' or
      p.city ilike '%' || p_localizacao || '%' or
      p.address ilike '%' || p_localizacao || '%' or
      p.copy ilike '%' || p_localizacao || '%' or
      similarity(coalesce(p.neighborhood, ''), p_localizacao) > 0.3 or
      similarity(coalesce(p.city, ''), p_localizacao) > 0.3 or
      similarity(coalesce(p.address, ''), p_localizacao) > 0.3
    )
    and (
      p_tipo_imovel is null or p_tipo_imovel = '' or
      p.kind ilike '%' || p_tipo_imovel || '%' or
      similarity(coalesce(p.kind, ''), p_tipo_imovel) > 0.3 or
      exists (
        select 1 from unnest(p.kind_synonyms) s
        where s ilike '%' || p_tipo_imovel || '%' or similarity(s, p_tipo_imovel) > 0.3
      )
    )
  order by
    case when p_localizacao is not null and p_localizacao <> '' then
      greatest(
        similarity(coalesce(p.neighborhood, ''), p_localizacao),
        similarity(coalesce(p.city, ''), p_localizacao),
        similarity(coalesce(p.address, ''), p_localizacao)
      )
    else 0 end desc,
    p.created_at desc
  limit 8;
$$;
