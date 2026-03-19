-- 0008_fix_is_mj_rls.sql
-- Fix récursion RLS autour de public.is_mj() qui provoquait "stack depth limit exceeded"
-- lors des uploads Storage (code 54001).

begin;

-- 1) Rendre la fonction security definer pour éviter qu'elle ne soit soumise aux RLS/policies
--    de mj_admins qui utilisent à leur tour is_mj().
create or replace function public.is_mj()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mj_admins a
    where a.user_id = auth.uid()
  );
$$;

-- 2) Retirer les policies qui ré-appellent is_mj() (source de la récursion).
drop policy if exists mj_all_mj_admins on public.mj_admins;
drop policy if exists mj_admins_self_read on public.mj_admins;

-- 3) Règle minimale : lecture de sa propre ligne mj_admins.
create policy mj_admins_self_read
on public.mj_admins
for select
to authenticated
using (user_id = auth.uid());

commit;

