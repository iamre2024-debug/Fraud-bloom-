begin;

create table if not exists public.fraud_academy_cloud_snapshots (
  sync_key text primary key
    check (sync_key ~ '^[a-f0-9]{64}$'),
  revision bigint not null
    check (revision >= 1),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default clock_timestamp()
);

comment on table public.fraud_academy_cloud_snapshots is
  'Client-encrypted Fraud Academy recovery snapshots. sync_key is an HMAC digest, never a recovery code.';

alter table public.fraud_academy_cloud_snapshots enable row level security;
revoke all on table public.fraud_academy_cloud_snapshots from public, anon, authenticated;
grant select, insert, update on table public.fraud_academy_cloud_snapshots to service_role;

create or replace function public.fraud_academy_compare_and_set_cloud_snapshot(
  p_sync_key text,
  p_base_revision bigint,
  p_payload jsonb
)
returns table (
  saved boolean,
  revision bigint,
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated_at timestamptz := clock_timestamp();
begin
  if p_sync_key is null
    or p_sync_key !~ '^[a-f0-9]{64}$'
    or p_base_revision is null
    or p_base_revision < 0
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
  then
    raise exception 'Invalid cloud snapshot input' using errcode = '22023';
  end if;

  if p_base_revision = 0 then
    return query
      insert into public.fraud_academy_cloud_snapshots as snapshot (
        sync_key,
        revision,
        payload,
        updated_at
      )
      values (
        p_sync_key,
        1,
        p_payload,
        v_updated_at
      )
      on conflict (sync_key) do nothing
      returning true, snapshot.revision, snapshot.payload, snapshot.updated_at;

    if found then
      return;
    end if;
  end if;

  return query
    update public.fraud_academy_cloud_snapshots as snapshot
    set
      revision = snapshot.revision + 1,
      payload = p_payload,
      updated_at = v_updated_at
    where snapshot.sync_key = p_sync_key
      and snapshot.revision = p_base_revision
    returning true, snapshot.revision, snapshot.payload, snapshot.updated_at;

  if found then
    return;
  end if;

  return query
    select
      false,
      snapshot.revision,
      snapshot.payload,
      snapshot.updated_at
    from public.fraud_academy_cloud_snapshots as snapshot
    where snapshot.sync_key = p_sync_key;
end;
$$;

revoke execute on function public.fraud_academy_compare_and_set_cloud_snapshot(text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.fraud_academy_compare_and_set_cloud_snapshot(text, bigint, jsonb)
  to service_role;

commit;
