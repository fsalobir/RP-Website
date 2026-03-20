begin;

alter table public.provinces
  add column if not exists capital_city_id uuid references public.cities(id) on delete set null;

alter table public.realms
  add column if not exists capital_city_id uuid references public.cities(id) on delete set null;

create index if not exists idx_provinces_capital_city_id on public.provinces (capital_city_id);
create index if not exists idx_realms_capital_city_id on public.realms (capital_city_id);

create or replace function public.validate_province_capital_city()
returns trigger
language plpgsql
as $$
declare
  city_province_id uuid;
begin
  if new.capital_city_id is null then
    return new;
  end if;

  select c.province_id
  into city_province_id
  from public.cities c
  where c.id = new.capital_city_id;

  if city_province_id is null then
    raise exception 'Capitale régionale invalide: ville inexistante (%).', new.capital_city_id;
  end if;

  if city_province_id <> new.id then
    raise exception 'Capitale régionale invalide: la ville % n''appartient pas à la province %.', new.capital_city_id, new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_province_capital_city on public.provinces;
create trigger trg_validate_province_capital_city
before insert or update of capital_city_id
on public.provinces
for each row
execute function public.validate_province_capital_city();

create or replace function public.validate_realm_capital_city()
returns trigger
language plpgsql
as $$
declare
  city_realm_id uuid;
  city_province_id uuid;
  province_capital_city_id uuid;
begin
  if new.capital_city_id is null then
    return new;
  end if;

  select c.province_id, p.realm_id, p.capital_city_id
  into city_province_id, city_realm_id, province_capital_city_id
  from public.cities c
  join public.provinces p on p.id = c.province_id
  where c.id = new.capital_city_id;

  if city_realm_id is null then
    raise exception 'Capitale nationale invalide: ville inexistante (%).', new.capital_city_id;
  end if;

  if city_realm_id <> new.id then
    raise exception 'Capitale nationale invalide: la ville % n''appartient pas au royaume %.', new.capital_city_id, new.id;
  end if;

  if province_capital_city_id is distinct from new.capital_city_id then
    raise exception 'Capitale nationale invalide: la ville % n''est pas capitale régionale de sa province %.', new.capital_city_id, city_province_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_realm_capital_city on public.realms;
create trigger trg_validate_realm_capital_city
before insert or update of capital_city_id
on public.realms
for each row
execute function public.validate_realm_capital_city();

create or replace function public.sync_realm_capital_after_province_change()
returns trigger
language plpgsql
as $$
begin
  if old.capital_city_id is distinct from new.capital_city_id then
    update public.realms r
    set capital_city_id = null,
        updated_at = now()
    where r.id = new.realm_id
      and r.capital_city_id = old.capital_city_id
      and old.capital_city_id is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_realm_capital_after_province_change on public.provinces;
create trigger trg_sync_realm_capital_after_province_change
after update of capital_city_id
on public.provinces
for each row
execute function public.sync_realm_capital_after_province_change();

commit;
