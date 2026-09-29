-- Janela de envio do follow-up editável no painel (/cadencia).
-- Até aqui era fixa no código: 09h30–19h30, segunda a sábado.
-- Minutos do dia no horário de São Paulo; dias da semana 0 = domingo … 6 = sábado.

alter table followup_settings
  add column if not exists window_start_min int not null default 570,
  add column if not exists window_end_min int not null default 1170,
  add column if not exists window_days smallint[] not null default '{1,2,3,4,5,6}';

alter table followup_settings drop constraint if exists followup_settings_window_chk;
alter table followup_settings add constraint followup_settings_window_chk check (
  window_start_min >= 0 and window_end_min <= 1440 and window_start_min < window_end_min
  and cardinality(window_days) > 0 and window_days <@ '{0,1,2,3,4,5,6}'::smallint[]
);

comment on column followup_settings.window_start_min is 'Início da janela de follow-up, em minutos do dia (hora de SP). 570 = 09:30.';
comment on column followup_settings.window_end_min is 'Fim da janela de follow-up, em minutos do dia (hora de SP). 1170 = 19:30.';
comment on column followup_settings.window_days is 'Dias em que o follow-up pode sair. 0 = domingo … 6 = sábado.';
