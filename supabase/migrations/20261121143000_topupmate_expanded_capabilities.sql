-- Explicit Topupmate capability flags for the expanded service families.
alter table public.service_providers
  add column if not exists supports_data_pin boolean not null default false,
  add column if not exists supports_education boolean not null default false,
  add column if not exists supports_internet boolean not null default false,
  add column if not exists supports_gift_cards boolean not null default false,
  add column if not exists supports_virtual_cards boolean not null default false;

update public.service_providers set
  supports_data_pin=true,
  supports_education=true,
  supports_internet=true,
  supports_gift_cards=true,
  supports_virtual_cards=true,
  updated_at=now()
where code='topupmate';
