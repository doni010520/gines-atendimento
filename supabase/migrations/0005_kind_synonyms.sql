-- "kind" é um valor só (ex: "apartamento"), mas o cliente usa vocabulário variado
-- pro mesmo imóvel (studio, kitnet, apê, loft...) — sem sinônimo a busca falha e o
-- bot relata "não temos" quando na verdade tem, só não bateu a palavra exata.
alter table properties add column kind_synonyms text[] not null default '{}';

update properties set kind_synonyms = array['apartamento','apto','ap','studio','estudio','estúdio','kitnet','kit']
  where kind = 'apartamento';
update properties set kind_synonyms = array['casa','residencia','residência']
  where kind = 'casa';
update properties set kind_synonyms = array['sobrado','duplex','casa duplex','casa de vila']
  where kind = 'sobrado';
