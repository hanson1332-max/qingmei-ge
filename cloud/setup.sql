-- Execute once in the existing Supabase project's SQL editor.
-- Dedicated GE tables; does not change Gantt records or policies.
begin;
create table public.ge_matrix_admins(user_id uuid primary key references auth.users(id));
create table public.ge_matrices(id text primary key check(id='qingmei-ge'),data jsonb,revision bigint not null default 0,updated_at timestamptz not null default now());
create table public.ge_matrix_history(id bigint generated always as identity primary key,revision bigint not null,data jsonb,changed_by uuid,created_at timestamptz not null default now());
alter table public.ge_matrix_admins enable row level security;
alter table public.ge_matrices enable row level security;
alter table public.ge_matrix_history enable row level security;
revoke all on public.ge_matrix_admins,public.ge_matrices,public.ge_matrix_history from anon,authenticated;
grant select on public.ge_matrices to anon,authenticated;
grant select on public.ge_matrix_admins,public.ge_matrix_history to authenticated;
create policy ge_read on public.ge_matrices for select to anon,authenticated using(true);
create policy ge_own_membership on public.ge_matrix_admins for select to authenticated using(user_id=auth.uid());
create policy ge_history_admin on public.ge_matrix_history for select to authenticated using(exists(select 1 from public.ge_matrix_admins where user_id=auth.uid()));
insert into public.ge_matrices(id) values('qingmei-ge');
create function public.save_ge_matrix(p_data jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare old_row public.ge_matrices;
begin
 if auth.uid() is null or not exists(select 1 from public.ge_matrix_admins where user_id=auth.uid()) then raise exception 'Administrator required' using errcode='42501';end if;
 if p_data is null or jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'tracks') is distinct from 'array' or jsonb_typeof(p_data->'categories') is distinct from 'array' or jsonb_typeof(p_data->'dimensions') is distinct from 'array' or jsonb_typeof(p_data->'meta') is distinct from 'object' or octet_length(p_data::text)>2000000 then raise exception 'Invalid matrix';end if;
 select * into strict old_row from public.ge_matrices where id='qingmei-ge' for update;
 if p_revision is distinct from old_row.revision then raise exception 'Revision conflict' using errcode='40001';end if;
 insert into public.ge_matrix_history(revision,data,changed_by) values(old_row.revision,old_row.data,auth.uid());
 update public.ge_matrices set data=p_data,revision=old_row.revision+1,updated_at=now() where id='qingmei-ge';
 return old_row.revision+1;
end $$;
revoke all on function public.save_ge_matrix(jsonb,bigint) from public,anon,authenticated;
grant execute on function public.save_ge_matrix(jsonb,bigint) to authenticated;
commit;
-- Next: add approved administrator UUID(s), matching the Gantt administrators,
-- via the Supabase table editor into ge_matrix_admins.user_id.
-- Auth URL Configuration: add the final GitHub Pages URL to allowed Redirect URLs.
-- Keep email sign-up disabled for this tool. Visitors can read the published matrix.
