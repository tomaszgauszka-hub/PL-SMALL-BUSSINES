-- Pilot identity configuration only. No production invoices or credentials.
-- Assignment is an administrative operation; a user can only read their lab.
create table public.mk_ksef_test_workspaces (
 id uuid primary key default gen_random_uuid(),
 owner uuid not null unique references auth.users(id),
 environment text not null default 'TEST' check(environment='TEST'),
 business_type text not null default 'jdg' check(business_type='jdg'),
 api_base_url text not null default 'https://api-test.ksef.mf.gov.pl/v2' check(api_base_url='https://api-test.ksef.mf.gov.pl/v2'),
 display_name text not null default 'Fikcyjna JDG — laboratorium Ewidory' check(length(display_name) between 1 and 200),
 test_nip text not null check(test_nip ~ '^[0-9]{10}$'),
 test_pesel text not null check(test_pesel ~ '^[0-9]{11}$'),
 status text not null default 'assigned' check(status in('assigned','person_created','setup_unknown','setup_error')),
 api_contract_version text not null default '' check(length(api_contract_version)<=200),
 setup_http_status integer check(setup_http_status between 100 and 599),
 created_at timestamptz not null default now(),
 person_created_at timestamptz,
 unique(owner,id)
);
alter table public.mk_ksef_test_workspaces enable row level security;
revoke all on table public.mk_ksef_test_workspaces from public,anon,authenticated;
grant select on table public.mk_ksef_test_workspaces to authenticated;
create policy mk_ksef_test_workspace_read on public.mk_ksef_test_workspaces for select to authenticated
 using(owner=(select auth.uid()));
comment on table public.mk_ksef_test_workspaces is 'KSeF TEST pilot, synthetic identities only; independent of real DN/JDG profiles and tax ledgers.';
