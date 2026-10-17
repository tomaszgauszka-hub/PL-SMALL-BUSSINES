-- TEST-only pilot. These records have no links to accounting/tax ledgers.
alter table public.mk_ksef_test_workspaces add column last_auth_at timestamptz;
create table public.mk_ksef_test_documents (
 id uuid primary key, owner uuid not null references auth.users(id), workspace_id uuid not null,
 environment text not null default 'TEST' check(environment='TEST'),
 number text not null check(number ~ '^TEST/[0-9]{4}/[A-F0-9]{32}$'),
 input jsonb not null check(jsonb_typeof(input)='object' and coalesce(input->>'synthetic','')='true' and octet_length(input::text)<50000),
 xml text not null check(octet_length(xml) between 1 and 300000), invoice_hash text not null check(length(invoice_hash)=44),
 net bigint not null check(net>0), vat bigint not null check(vat>=0), gross bigint not null check(gross=net+vat),
 status text not null default 'ready' check(status in('ready','sending','processing','accepted','rejected','unknown','blocked')),
 phase text not null default 'validated' check(phase in('validated','claimed','session_open','submission_started','submitted','checked','finished')),
 session_reference text, invoice_reference text, ksef_number text, mf_status integer,
 message text not null default 'XML FA(3) sprawdzony lokalnym XSD.',
 upo text check(octet_length(upo)<=2000000), upo_hash text check(length(upo_hash)=44), closed_at timestamptz,
 events jsonb not null default '[]' check(jsonb_typeof(events)='array'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner,id),unique(owner,number), foreign key(owner,workspace_id) references public.mk_ksef_test_workspaces(owner,id),
 check(status<>'accepted' or (mf_status is not null and mf_status=200 and ksef_number is not null and session_reference is not null and invoice_reference is not null)),
 check(upo is null or (status='accepted' and upo_hash is not null))
);
create index mk_ksef_test_documents_owner_created on public.mk_ksef_test_documents(owner,created_at desc);
create index mk_ksef_test_documents_owner_workspace on public.mk_ksef_test_documents(owner,workspace_id);
alter table public.mk_ksef_test_documents enable row level security;
revoke all on public.mk_ksef_test_documents from public,anon,authenticated;
grant select on public.mk_ksef_test_documents to authenticated;
create policy mk_ksef_test_documents_read on public.mk_ksef_test_documents for select to authenticated using(owner=(select auth.uid()));

create table mk_private.ksef_test_runtime (
 owner uuid primary key references auth.users(id), lease uuid, lease_until timestamptz, last_started_at timestamptz,
 document_id uuid, action text, foreign key(owner,document_id) references public.mk_ksef_test_documents(owner,id)
);
alter table mk_private.ksef_test_runtime enable row level security;
revoke all on mk_private.ksef_test_runtime from public,anon,authenticated;

create function mk_private.ksef_test_create(p_id uuid,p_data jsonb) returns jsonb
 language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid(); w public.mk_ksef_test_workspaces%rowtype; d public.mk_ksef_test_documents%rowtype;
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 select * into w from public.mk_ksef_test_workspaces where owner=u for update;
 if w.id is null or w.status<>'person_created' then raise exception 'Brak przydzielonej JDG TEST.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>400000 then raise exception 'Nieprawidłowy dokument TEST.';end if;
 select * into d from public.mk_ksef_test_documents where id=p_id;
 if d.id is not null then
  if d.owner<>u or d.input is distinct from p_data->'input' then raise exception 'Konflikt identyfikatora dokumentu.' using errcode='40001';end if;
  return jsonb_build_object('id',d.id,'duplicate',true);
 end if;
 if (select count(*) from public.mk_ksef_test_documents where owner=u)>=100 then raise exception 'Pilot pozwala na 100 faktur testowych.';end if;
 if jsonb_typeof(p_data->'input'->'lines') is distinct from 'array' or jsonb_array_length(p_data->'input'->'lines') not between 1 and 20 then raise exception 'Dokument TEST wymaga od 1 do 20 pozycji.';end if;
 insert into public.mk_ksef_test_documents(id,owner,workspace_id,number,input,xml,invoice_hash,net,vat,gross)
 values(p_id,u,w.id,p_data->>'number',p_data->'input',p_data->>'xml',p_data->>'invoiceHash',(p_data->>'net')::bigint,(p_data->>'vat')::bigint,(p_data->>'gross')::bigint);
 return jsonb_build_object('id',p_id,'duplicate',false);
end $fn$;

create function mk_private.ksef_test_claim(p_action text,p_document_id uuid) returns jsonb
 language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid();w public.mk_ksef_test_workspaces%rowtype;r mk_private.ksef_test_runtime%rowtype;d public.mk_ksef_test_documents%rowtype;v_lease uuid:=gen_random_uuid();
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 if p_action is null or p_action not in('connect','send','refresh') then raise exception 'Nieobsługiwana operacja TEST.';end if;
 select * into w from public.mk_ksef_test_workspaces where owner=u for update;
 if w.id is null or w.status<>'person_created' then raise exception 'Brak przydzielonej JDG TEST.' using errcode='42501';end if;
 insert into mk_private.ksef_test_runtime(owner) values(u) on conflict(owner) do nothing;
 select * into r from mk_private.ksef_test_runtime where owner=u for update;
 if r.lease_until>now() then raise exception 'Operacja KSeF TEST już trwa. Odśwież stan po chwili.' using errcode='40001';end if;
 if r.last_started_at>now()-interval '10 seconds' then raise exception 'Poczekaj 10 sekund między operacjami MF TEST.' using errcode='40001';end if;
 if p_action='connect' and p_document_id is not null then raise exception 'Nieprawidłowa operacja.';end if;
 if p_action<>'connect' then
  select * into d from public.mk_ksef_test_documents where owner=u and id=p_document_id for update;
  if d.id is null then raise exception 'Nie znaleziono faktury TEST.' using errcode='42501';end if;
  if p_action='send' and d.status<>'ready' then raise exception 'Ta faktura została już skierowana do wysyłki. Sprawdź jej status.' using errcode='40001';end if;
  if p_action='send' then update public.mk_ksef_test_documents set status='sending',phase='claimed',updated_at=now() where owner=u and id=d.id;end if;
 end if;
 update mk_private.ksef_test_runtime set lease=v_lease,lease_until=now()+interval '120 seconds',last_started_at=now(),document_id=p_document_id,action=p_action where owner=u;
 return jsonb_build_object('lease',v_lease,'workspace',jsonb_build_object('id',w.id,'test_nip',w.test_nip),'document',case when d.id is null then null else to_jsonb(d) end);
end $fn$;

create function mk_private.ksef_test_commit(p_lease uuid,p_data jsonb,p_release boolean) returns void
 language plpgsql security definer set search_path='' as $fn$
declare u uuid:=auth.uid();r mk_private.ksef_test_runtime%rowtype;d public.mk_ksef_test_documents%rowtype;next_status text;next_phase text;
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>2100000 then raise exception 'Nieprawidłowy wynik operacji.';end if;
 select * into r from mk_private.ksef_test_runtime where owner=u for update;
 if r.lease is distinct from p_lease or p_lease is null or r.lease_until<=now() then raise exception 'Operacja wygasła. Sprawdź stan faktury.' using errcode='40001';end if;
 if coalesce((p_data->>'authenticated')::boolean,false) then update public.mk_ksef_test_workspaces set last_auth_at=now() where owner=u;end if;
 if r.document_id is not null then
  select * into d from public.mk_ksef_test_documents where owner=u and id=r.document_id for update;
  next_status:=coalesce(p_data->>'status',d.status);next_phase:=coalesce(p_data->>'phase',d.phase);
  if d.status='accepted' and next_status<>'accepted' then raise exception 'Przyjęta faktura TEST jest niezmienna.';end if;
  if d.session_reference is not null and p_data ? 'sessionReference' and d.session_reference<>p_data->>'sessionReference' then raise exception 'Referencja sesji jest niezmienna.';end if;
  if d.invoice_reference is not null and p_data ? 'invoiceReference' and d.invoice_reference<>p_data->>'invoiceReference' then raise exception 'Referencja faktury jest niezmienna.';end if;
  if next_status='ready' and (d.session_reference is not null or d.phase not in('validated','claimed')) then raise exception 'Nie można ponownie wysłać faktury o nieustalonym wyniku.';end if;
  update public.mk_ksef_test_documents set status=next_status,phase=next_phase,
   session_reference=coalesce(p_data->>'sessionReference',session_reference),invoice_reference=coalesce(p_data->>'invoiceReference',invoice_reference),
   ksef_number=coalesce(p_data->>'ksefNumber',ksef_number),mf_status=coalesce((p_data->>'mfStatus')::integer,mf_status),
   message=left(coalesce(p_data->>'message',message),1500),upo=coalesce(p_data->>'upo',upo),upo_hash=coalesce(p_data->>'upoHash',upo_hash),
   closed_at=case when coalesce((p_data->>'closed')::boolean,false) then coalesce(closed_at,now()) else closed_at end,updated_at=now(),
   events=events||jsonb_build_array(jsonb_build_object('at',now(),'status',next_status,'phase',next_phase,'message',left(coalesce(p_data->>'message','Zapis etapu operacji TEST.'),1500)))
   where owner=u and id=d.id;
 end if;
 if p_release then update mk_private.ksef_test_runtime set lease=null,lease_until=null where owner=u;end if;
end $fn$;

create function public.mk_ksef_test_create(p_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select mk_private.ksef_test_create(p_id,p_data)$$;
create function public.mk_ksef_test_claim(p_action text,p_document_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select mk_private.ksef_test_claim(p_action,p_document_id)$$;
create function public.mk_ksef_test_commit(p_lease uuid,p_data jsonb,p_release boolean default true) returns void language sql security invoker set search_path='' as $$select mk_private.ksef_test_commit(p_lease,p_data,p_release)$$;
revoke all on function mk_private.ksef_test_create(uuid,jsonb),mk_private.ksef_test_claim(text,uuid),mk_private.ksef_test_commit(uuid,jsonb,boolean),public.mk_ksef_test_create(uuid,jsonb),public.mk_ksef_test_claim(text,uuid),public.mk_ksef_test_commit(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function mk_private.ksef_test_create(uuid,jsonb),mk_private.ksef_test_claim(text,uuid),mk_private.ksef_test_commit(uuid,jsonb,boolean),public.mk_ksef_test_create(uuid,jsonb),public.mk_ksef_test_claim(text,uuid),public.mk_ksef_test_commit(uuid,jsonb,boolean) to authenticated;
