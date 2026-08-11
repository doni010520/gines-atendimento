-- GINES Atendimento — schema inicial
create extension if not exists pgcrypto;

create type property_status as enum ('ativo','reservado','vendido','inativo');
create type property_type as enum ('venda','locacao');
create type conversation_status as enum ('bot','queued','open','closed');
create type message_direction as enum ('in','out');
create type message_status as enum ('sent','delivered','read','failed');
create type user_role as enum ('admin','corretor');

-- perfil do corretor/admin, 1:1 com auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  role user_role not null default 'corretor',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type property_type not null default 'venda',
  status property_status not null default 'ativo',
  price numeric(14,2),
  condo_fee numeric(10,2),
  iptu numeric(10,2),
  address text,
  neighborhood text,
  city text default 'São Paulo',
  bedrooms int,
  suites int,
  parking_spots int,
  area_built numeric(8,2),
  area_land numeric(8,2),
  copy text not null,
  features text[] not null default '{}',
  video_url text,
  pdf_url text,
  photo_urls text[] not null default '{}',
  -- variações de título do anúncio, usadas pra casar com o referral do WhatsApp (Ads Manager)
  ad_ref_titles text[] not null default '{}',
  responsible_user_id uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index properties_status_idx on properties(status);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  name_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  property_id uuid references properties(id),
  status conversation_status not null default 'bot',
  ai_enabled boolean not null default true,
  assigned_user_id uuid references profiles(id),
  summary text,
  -- 0=nenhum material enviado ainda, 1=aguardando gatilho +2h, 2=aguardando +6h (visita autoguiada),
  -- 3+=em loop de 48/48h
  followup_stage int not null default 0,
  next_followup_at timestamptz,
  material_sent_at timestamptz,
  bot_lock_until timestamptz,
  last_message_at timestamptz not null default now(),
  handoff_notified_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(contact_id)
);
create index conversations_next_followup_idx on conversations(next_followup_at) where ai_enabled = true;
create index conversations_status_idx on conversations(status);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction message_direction not null,
  external_id text,
  body text,
  media_url text,
  media_type text,
  tool_name text,
  tool_calls_json jsonb,
  is_internal boolean not null default false,
  status message_status not null default 'sent',
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on messages(conversation_id, created_at);
create unique index messages_external_id_uniq on messages(external_id) where external_id is not null;

-- referral bruto do anúncio (Click to WhatsApp) recebido no 1º contato, pra auditoria do matching
create table ad_referrals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  raw jsonb not null,
  matched_property_id uuid references properties(id),
  created_at timestamptz not null default now()
);

create table app_logs (
  id bigserial primary key,
  level text not null,
  source text not null,
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index app_logs_created_idx on app_logs(created_at desc);

-- updated_at automático em properties
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;
create trigger properties_set_updated_at before update on properties
  for each row execute function set_updated_at();

-- RLS: webhook/agente usam service_role (ignora RLS); painel usa usuário autenticado
alter table profiles enable row level security;
alter table properties enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table ad_referrals enable row level security;
alter table app_logs enable row level security;

create policy "profiles: self read" on profiles for select using (auth.uid() = id);
create policy "authenticated read/write properties" on properties for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read contacts" on contacts for select using (auth.role() = 'authenticated');
create policy "authenticated read/write conversations" on conversations for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write messages" on messages for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read ad_referrals" on ad_referrals for select using (auth.role() = 'authenticated');
create policy "authenticated read app_logs" on app_logs for select using (auth.role() = 'authenticated');
