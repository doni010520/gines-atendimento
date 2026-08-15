-- "type" já existe pra venda/locação (modalidade). Faltava o TIPO FÍSICO do imóvel
-- (casa/apartamento/sobrado/terreno/...), que é o que o cliente costuma falar
-- ("quero uma casa") — sem esse campo a busca não tinha onde colocar isso.
-- Texto livre (não enum) porque o vocabulário de imobiliária é grande e varia.
alter table properties add column kind text;

update properties set kind = 'apartamento' where title ilike '%apartamento%';
update properties set kind = 'casa' where title ilike '%casa%' and kind is null;
update properties set kind = 'sobrado' where title ilike '%sobrado%' and kind is null;
