-- Bucket público de mídia dos imóveis (vídeo do criativo, PDF, fotos)
-- Público em LEITURA porque a uazapi manda mídia por URL — precisa ser acessível sem auth.
insert into storage.buckets (id, name, public)
values ('property-media', 'property-media', true)
on conflict (id) do nothing;

create policy "property-media: leitura pública"
  on storage.objects for select
  using (bucket_id = 'property-media');

create policy "property-media: upload por usuário autenticado"
  on storage.objects for insert
  with check (bucket_id = 'property-media' and auth.role() = 'authenticated');

create policy "property-media: update por usuário autenticado"
  on storage.objects for update
  using (bucket_id = 'property-media' and auth.role() = 'authenticated');

create policy "property-media: delete por usuário autenticado"
  on storage.objects for delete
  using (bucket_id = 'property-media' and auth.role() = 'authenticated');
