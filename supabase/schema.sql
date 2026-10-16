-- Mała Księga: amounts are integer grosze; all records are owned by auth.uid().
-- This file is copied verbatim to the CLI-generated migration.
create schema if not exists mk_private;
revoke all on schema mk_private from public, anon;
grant usage on schema mk_private to authenticated;

create table public.mk_clients (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 160), nip text not null default '' check(nip='' or nip ~ '^[0-9]{10}$'),
 email text not null default '' check(length(email)<=254), phone text not null default '' check(length(phone)<=40),
 address text not null default '' check(length(address)<=400), notes text not null default '' check(length(notes)<=2000),
 archived integer not null default 0 check(archived in(0,1)), version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), unique(owner,id)
);
create index mk_clients_owner_name on public.mk_clients(owner,name);
create table public.mk_profiles(owner uuid primary key references auth.users(id), data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<10000),version integer not null default 1 check(version>0),updated_at timestamptz not null default now());
create table public.mk_sales (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id), client_id uuid, client_name text not null,
 date date not null check(date between '2025-01-01' and '2026-12-31'), issue_date date not null check(issue_date between '2025-01-01' and '2026-12-31'),due_date date not null,
 amount bigint not null check(amount<>0 and abs(amount)<=99999999999), description text not null check(length(description) between 1 and 1500),category text not null check(length(category) between 1 and 80),
 number text not null check(length(number) between 1 and 80),kind text not null check(kind in('sale','correction')),parent_id uuid,reason text not null default '' check(length(reason)<=1000),
 b2b integer not null default 0 check(b2b in(0,1)), ksef_eligible integer not null default 0 check(ksef_eligible in(0,1) and (ksef_eligible=0 or b2b=1)),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<15000),created_at timestamptz not null default now(),
 unique(owner,id),unique(owner,number),foreign key(owner,client_id) references public.mk_clients(owner,id),foreign key(owner,parent_id) references public.mk_sales(owner,id),
 check((kind='sale' and amount>0 and parent_id is null) or (kind='correction' and parent_id is not null and length(btrim(reason))>0))
);
create index mk_sales_owner_date on public.mk_sales(owner,date);
create index mk_sales_owner_client on public.mk_sales(owner,client_id);
create index mk_sales_owner_parent on public.mk_sales(owner,parent_id);
create table public.mk_payments (
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),sale_id uuid not null,
 date date not null check(date between '2025-01-01' and '2026-12-31'),amount bigint not null check(amount<>0 and abs(amount)<=99999999999),
 method text not null check(method in('Przelew','Gotówka','Karta','Świadczenie niepieniężne','Inne')),note text not null default '' check(length(note)<=500),created_at timestamptz not null default now(),
 foreign key(owner,sale_id) references public.mk_sales(owner,id)
);
create index mk_payments_owner_date on public.mk_payments(owner,date);
create index mk_payments_owner_sale on public.mk_payments(owner,sale_id);
create table public.mk_expenses (
 id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),date date not null,paid_date date not null check(paid_date between '2025-01-01' and '2026-12-31'),
 amount bigint not null check(amount<>0 and abs(amount)<=99999999999),deductible bigint not null check(abs(deductible)<=99999999999),
 description text not null check(length(description) between 1 and 1500),category text not null check(length(category) between 1 and 80),evidence text not null default '' check(length(evidence)<=200),notes text not null default '' check(length(notes)<=2000),created_at timestamptz not null default now(),
 check(abs(deductible)<=abs(amount) and (deductible=0 or sign(deductible)=sign(amount))),check(deductible=0 or length(btrim(evidence))>0),unique(owner,id)
);
create index mk_expenses_owner_paid_date on public.mk_expenses(owner,paid_date);
create table public.mk_taxes(owner uuid not null references auth.users(id),year integer not null check(year in(2025,2026)),other_income bigint not null default 0 check(other_income between 0 and 99999999999),deductions bigint not null default 0 check(deductions between 0 and 99999999999),advances bigint not null default 0 check(advances between 0 and 99999999999),tax_relief bigint not null default 0 check(tax_relief between 0 and 99999999999),version integer not null default 1 check(version>0),primary key(owner,year));
create table public.mk_audit(id uuid primary key default gen_random_uuid(),owner uuid not null references auth.users(id),action text not null,details text not null,created_at timestamptz not null default now());
create index mk_audit_owner_created on public.mk_audit(owner,created_at desc);
create table public.mk_counters(owner uuid not null references auth.users(id),year integer not null,value integer not null check(value>0),primary key(owner,year));
create table public.mk_operations(id uuid not null,owner uuid not null references auth.users(id),fingerprint text not null,created_at timestamptz not null default now(),primary key(owner,id));
create table public.mk_legal_events(owner uuid not null references auth.users(id),kind text not null check(kind in('dn_breach','ksef_breach')),date date not null,details jsonb not null,created_at timestamptz not null default now(),primary key(owner,kind));
create table public.mk_attachments(id uuid primary key,owner uuid not null references auth.users(id),expense_id uuid not null,name text not null check(length(name) between 1 and 200),mime text not null check(mime in('application/pdf','image/jpeg','image/png')),size integer not null check(size between 1 and 5242880),key text not null unique,created_at timestamptz not null default now(),foreign key(owner,expense_id) references public.mk_expenses(owner,id),check(split_part(key,'/',1)=owner::text));
create index mk_attachments_owner_expense on public.mk_attachments(owner,expense_id);

-- All tables use the same actual access model: individual ownership.
do $policies$
declare t text;
begin
 foreach t in array array['mk_clients','mk_profiles','mk_sales','mk_payments','mk_expenses','mk_taxes','mk_audit','mk_counters','mk_operations','mk_legal_events','mk_attachments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert on public.%I to authenticated',t);
  execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid())=owner)',t);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=owner)',t);
 end loop;
 foreach t in array array['mk_clients','mk_profiles','mk_taxes','mk_counters','mk_legal_events'] loop
  execute format('grant update on public.%I to authenticated',t);
  execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid())=owner) with check ((select auth.uid())=owner)',t);
 end loop;
end $policies$;

create function mk_private.money(p jsonb,k text) returns bigint language plpgsql immutable set search_path='' as $fn$
declare v text; n bigint;
begin v:=coalesce(p->>k,'0'); if v !~ '^-?[0-9]{1,11}$' then raise exception 'Kwota % musi być całkowitą liczbą groszy.',k; end if; n:=v::bigint; if abs(n)>99999999999 then raise exception 'Kwota poza zakresem.'; end if; return n; end $fn$;
create function mk_private.detect_breaches(v_owner uuid) returns void language plpgsql security invoker set search_path='' as $fn$
declare hit record;
begin
 select date,used,lim into hit from (
  select date,sum(amount) over(partition by extract(year from date),case when extract(year from date)=2025 then extract(month from date) else extract(quarter from date) end order by date,created_at,id) as used,
   case when extract(year from date)=2025 then 349950 else 1081350 end as lim
  from public.mk_sales where owner=v_owner
 ) s where used>lim order by date limit 1;
 if found then insert into public.mk_legal_events(owner,kind,date,details) values(v_owner,'dn_breach',hit.date,jsonb_build_object('amount',hit.used,'limit',hit.lim)) on conflict(owner,kind) do update set date=least(public.mk_legal_events.date,excluded.date); end if;
 select issue_date into hit from (
  select issue_date,sum(amount) over(partition by date_trunc('month',issue_date) order by issue_date,created_at,id) used
  from public.mk_sales where owner=v_owner and b2b=1 and ksef_eligible=1 and issue_date between '2026-04-01' and '2026-12-31'
 ) s where used>1000000 order by issue_date limit 1;
 if found then insert into public.mk_legal_events(owner,kind,date,details) values(v_owner,'ksef_breach',hit.issue_date,'{"limit":1000000}'::jsonb) on conflict(owner,kind) do update set date=least(public.mk_legal_events.date,excluded.date); end if;
end $fn$;

create function public.mk_mutate(p_op_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
 v_owner uuid:=auth.uid(); fingerprint text; previous text; d jsonb:=p_data; row_data jsonb; c public.mk_clients%rowtype; parent public.mk_sales%rowtype;
 v_id uuid; v_client uuid; v_parent uuid; v_amount bigint; v_deductible bigint; v_initial bigint; v_year integer; v_seq integer; v_number text; v_count integer; v_version integer;
 v_label text; v_details text; seller jsonb; snap jsonb; stamp timestamptz:=clock_timestamp();
begin
 if v_owner is null then raise exception 'Zaloguj się.' using errcode='42501'; end if;
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>1000000 then raise exception 'Nieprawidłowy zapis.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));
 fingerprint:=encode(sha256(convert_to(p_action||d::text,'UTF8')),'hex');
 select o.fingerprint into previous from public.mk_operations o where o.owner=v_owner and o.id=p_op_id;
 if found then if previous<>fingerprint then raise exception 'Konflikt operacji.' using errcode='40001'; end if; return jsonb_build_object('duplicate',true); end if;
 if p_action='client' then
  v_id:=(d->>'id')::uuid; v_version:=coalesce((d->>'version')::integer,0);
  if v_version=0 then
   insert into public.mk_clients(id,owner,name,nip,email,phone,address,notes,archived) values(v_id,v_owner,btrim(d->>'name'),regexp_replace(coalesce(d->>'nip',''),'[ -]','','g'),coalesce(d->>'email',''),coalesce(d->>'phone',''),coalesce(d->>'address',''),coalesce(d->>'notes',''),coalesce((d->>'archived')::integer,0));
  else
   update public.mk_clients set name=btrim(d->>'name'),nip=regexp_replace(coalesce(d->>'nip',''),'[ -]','','g'),email=coalesce(d->>'email',''),phone=coalesce(d->>'phone',''),address=coalesce(d->>'address',''),notes=coalesce(d->>'notes',''),archived=coalesce((d->>'archived')::integer,0),version=version+1 where owner=v_owner and id=v_id and version=v_version;
   get diagnostics v_count=row_count; if v_count=0 then raise exception 'Kontakt zmieniono na innym urządzeniu.' using errcode='40001'; end if;
  end if;
  v_label:='Zapisano klienta'; v_details:=d->>'name';
 elsif p_action='sale' then
  v_id:=(d->>'id')::uuid; v_client:=nullif(d->>'clientId','')::uuid; v_parent:=nullif(d->>'parentId','')::uuid; v_amount:=mk_private.money(d,'amount'); v_initial:=mk_private.money(d,'initialPayment');
  if v_initial<0 or v_initial>abs(v_amount) then raise exception 'Nieprawidłowa pierwsza wpłata.'; end if;
  if v_client is not null then select * into c from public.mk_clients where owner=v_owner and id=v_client; if not found then raise exception 'Nie znaleziono własnego klienta.'; end if; end if;
  if coalesce((d->>'b2b')::integer,0)=1 and (v_client is null or c.nip='') then raise exception 'B2B wymaga klienta z NIP.'; end if;
  if d->>'kind'='correction' then
   select * into parent from public.mk_sales where owner=v_owner and id=v_parent and kind='sale';
   if not found or parent.client_id is distinct from v_client or parent.b2b<>coalesce((d->>'b2b')::integer,0) then raise exception 'Korekta musi wskazywać własny dokument i tego samego klienta.'; end if;
  end if;
  select data into seller from public.mk_profiles where owner=v_owner;
  snap:=jsonb_build_object('seller',coalesce(seller,'{}'::jsonb),'client',jsonb_build_object('name',coalesce(c.name,'Osoba prywatna'),'nip',coalesce(c.nip,''),'address',coalesce(c.address,'')),'parentNumber',coalesce(parent.number,''));
  if d ? '_restoreSnapshot' then snap:=d->'_restoreSnapshot';end if;
  if d ? '_restoreCreatedAt' then stamp:=(d->>'_restoreCreatedAt')::timestamptz;end if;
  v_year:=extract(year from (d->>'issueDate')::date)::integer;
  insert into public.mk_counters(owner,year,value) values(v_owner,v_year,1) on conflict(owner,year) do update set value=public.mk_counters.value+1 returning value into v_seq;
  v_number:=coalesce(nullif(btrim(d->>'number'),''),'E/'||v_year::text||'/'||v_seq::text);
  insert into public.mk_sales(id,owner,client_id,client_name,date,issue_date,due_date,amount,description,category,number,kind,parent_id,reason,b2b,ksef_eligible,snapshot,created_at)
   values(v_id,v_owner,v_client,coalesce(c.name,'Osoba prywatna'),(d->>'date')::date,(d->>'issueDate')::date,(d->>'dueDate')::date,v_amount,d->>'description',d->>'category',v_number,d->>'kind',v_parent,coalesce(d->>'reason',''),coalesce((d->>'b2b')::integer,0),coalesce((d->>'ksefEligible')::integer,0),snap,stamp);
  if v_initial>0 then insert into public.mk_payments(id,owner,sale_id,date,amount,method,note) values(gen_random_uuid(),v_owner,v_id,(d->>'paymentDate')::date,case when v_amount<0 then -v_initial else v_initial end,coalesce(d->>'method','Przelew'),'Płatność przy dodaniu sprzedaży'); end if;
  v_label:=case when d->>'kind'='correction' then 'Dodano korektę sprzedaży' else 'Dodano sprzedaż' end;v_details:=v_number;
  perform mk_private.detect_breaches(v_owner);
 elsif p_action='payment' then
  insert into public.mk_payments(id,owner,sale_id,date,amount,method,note) values((d->>'id')::uuid,v_owner,(d->>'saleId')::uuid,(d->>'date')::date,mk_private.money(d,'amount'),d->>'method',coalesce(d->>'note',''));
  v_label:='Zapisano wpłatę lub zwrot';v_details:=coalesce(d->>'note','');
 elsif p_action='expense' then
  insert into public.mk_expenses(id,owner,date,paid_date,amount,deductible,description,category,evidence,notes) values((d->>'id')::uuid,v_owner,(d->>'date')::date,(d->>'paidDate')::date,mk_private.money(d,'amount'),mk_private.money(d,'deductible'),d->>'description',d->>'category',coalesce(d->>'evidence',''),coalesce(d->>'notes',''));
  v_label:='Dodano wydatek';v_details:=d->>'description';
 elsif p_action='settings' then
  v_version:=coalesce((d->>'version')::integer,0);
  if v_version=0 then insert into public.mk_profiles(owner,data) values(v_owner,d-'version'); else
   update public.mk_profiles set data=d-'version',version=version+1,updated_at=stamp where owner=v_owner and version=v_version;
   get diagnostics v_count=row_count; if v_count=0 then raise exception 'Profil zmieniono na innym urządzeniu.' using errcode='40001';end if;
  end if;
  v_label:='Zapisano profil';v_details:='Dane sprzedawcy i checklista';
 elsif p_action='tax' then
  v_year:=(d->>'year')::integer;v_version:=coalesce((d->>'version')::integer,0);
  if v_version=0 then insert into public.mk_taxes(owner,year,other_income,deductions,advances,tax_relief) values(v_owner,v_year,mk_private.money(d,'otherIncome'),mk_private.money(d,'deductions'),mk_private.money(d,'advances'),mk_private.money(d,'taxRelief')); else
   update public.mk_taxes set other_income=mk_private.money(d,'otherIncome'),deductions=mk_private.money(d,'deductions'),advances=mk_private.money(d,'advances'),tax_relief=mk_private.money(d,'taxRelief'),version=version+1 where owner=v_owner and year=v_year and version=v_version;
   get diagnostics v_count=row_count; if v_count=0 then raise exception 'Prognozę zmieniono na innym urządzeniu.' using errcode='40001';end if;
  end if;
  v_label:='Zapisano dane prognozy PIT';v_details:=v_year::text;
 elsif p_action='import' then
  if d->>'format' is distinct from 'mala-ksiega-1' or jsonb_typeof(d->'clients') is distinct from 'array' or jsonb_typeof(d->'sales') is distinct from 'array' or jsonb_typeof(d->'payments') is distinct from 'array' or jsonb_typeof(d->'expenses') is distinct from 'array' then raise exception 'Nieprawidłowa kopia.';end if;
  if jsonb_array_length(d->'clients')+jsonb_array_length(d->'sales')+jsonb_array_length(d->'payments')+jsonb_array_length(d->'expenses')>150 then raise exception 'Zbyt dużo wpisów w partii importu.';end if;
  if d ? 'settings' then
   if jsonb_typeof(d->'settings')<>'object' then raise exception 'Nieprawidłowy profil w kopii.';end if;
   if not exists(select 1 from public.mk_profiles where owner=v_owner) then perform public.mk_mutate(gen_random_uuid(),'settings',(d->'settings')||'{"version":0}'::jsonb);end if;
  end if;
  if d ? 'tax' then
   if jsonb_typeof(d->'tax')<>'array' or jsonb_array_length(d->'tax')>2 then raise exception 'Nieprawidłowe dane PIT w kopii.';end if;
   for row_data in select value from jsonb_array_elements(d->'tax') loop
    if not exists(select 1 from public.mk_taxes where owner=v_owner and year=(row_data->>'year')::integer) then perform public.mk_mutate(gen_random_uuid(),'tax',row_data||'{"version":0}'::jsonb);end if;
   end loop;
  end if;
  if d ? 'legalEvents' then
   if jsonb_typeof(d->'legalEvents')<>'array' or jsonb_array_length(d->'legalEvents')>2 then raise exception 'Nieprawidłowe zdarzenia w kopii.';end if;
   for row_data in select value from jsonb_array_elements(d->'legalEvents') loop
    insert into public.mk_legal_events(owner,kind,date,details) values(v_owner,row_data->>'kind',(row_data->>'date')::date,(row_data->>'details')::jsonb) on conflict(owner,kind) do update set date=least(public.mk_legal_events.date,excluded.date);
   end loop;
  end if;
  for row_data in select value from jsonb_array_elements(d->'clients') loop
   if not exists(select 1 from public.mk_clients where owner=v_owner and id=(row_data->>'id')::uuid) then perform public.mk_mutate(gen_random_uuid(),'client',row_data||'{"version":0}'::jsonb);end if;
  end loop;
  for row_data in select value from jsonb_array_elements(d->'sales') order by case when value->>'kind'='sale' then 0 else 1 end loop
   if not exists(select 1 from public.mk_sales where owner=v_owner and id=(row_data->>'id')::uuid) then
    row_data:=row_data||'{"initialPayment":0}'::jsonb;
    if row_data ? 'snapshot' then row_data:=row_data||jsonb_build_object('_restoreSnapshot',(row_data->>'snapshot')::jsonb);end if;
    if row_data ? 'createdAt' then row_data:=row_data||jsonb_build_object('_restoreCreatedAt',row_data->>'createdAt');end if;
    perform public.mk_mutate(gen_random_uuid(),'sale',row_data);
   end if;
  end loop;
  for row_data in select value from jsonb_array_elements(d->'payments') loop
   if not exists(select 1 from public.mk_payments where owner=v_owner and id=(row_data->>'id')::uuid) then perform public.mk_mutate(gen_random_uuid(),'payment',row_data);end if;
  end loop;
  for row_data in select value from jsonb_array_elements(d->'expenses') loop
   if not exists(select 1 from public.mk_expenses where owner=v_owner and id=(row_data->>'id')::uuid) then perform public.mk_mutate(gen_random_uuid(),'expense',row_data);end if;
  end loop;
  for v_year in 2025..2026 loop
   select coalesce(max(substring(number from '^E/[0-9]{4}/([0-9]+)$')::integer),0) into v_seq from public.mk_sales where owner=v_owner and number like 'E/'||v_year::text||'/%';
   if v_seq>0 then insert into public.mk_counters(owner,year,value) values(v_owner,v_year,v_seq) on conflict(owner,year) do update set value=greatest(public.mk_counters.value,excluded.value);end if;
  end loop;
  v_label:='Zaimportowano kopię';v_details:='Dopisano nowe wpisy bez nadpisywania istniejących.';
 else raise exception 'Nieobsługiwana operacja.';
 end if;
 insert into public.mk_operations(id,owner,fingerprint) values(p_op_id,v_owner,fingerprint);
 insert into public.mk_audit(owner,action,details) values(v_owner,v_label,coalesce(v_details,''));
 return jsonb_build_object('duplicate',false);
end $fn$;

create function public.mk_get_state() returns jsonb language sql stable security invoker set search_path='' as $fn$
 select jsonb_build_object(
 'clients',coalesce((select jsonb_agg(to_jsonb(c)-'owner'-'created_at' order by name) from public.mk_clients c where owner=auth.uid()),'[]'),
 'sales',coalesce((select jsonb_agg(jsonb_build_object('id',id,'clientId',coalesce(client_id::text,''),'clientName',client_name,'date',date,'issueDate',issue_date,'dueDate',due_date,'amount',amount,'description',description,'category',category,'number',number,'kind',kind,'parentId',coalesce(parent_id::text,''),'reason',reason,'b2b',b2b,'ksefEligible',ksef_eligible,'snapshot',snapshot::text,'createdAt',created_at) order by date desc,created_at desc) from public.mk_sales where owner=auth.uid()),'[]'),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'saleId',sale_id,'date',date,'amount',amount,'method',method,'note',note,'createdAt',created_at) order by date desc) from public.mk_payments where owner=auth.uid()),'[]'),
 'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',date,'paidDate',paid_date,'amount',amount,'deductible',deductible,'description',description,'category',category,'evidence',evidence,'notes',notes,'createdAt',created_at) order by paid_date desc) from public.mk_expenses where owner=auth.uid()),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expenseId',expense_id,'name',name,'mime',mime,'size',size)) from public.mk_attachments where owner=auth.uid()),'[]'),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'action',action,'details',details,'createdAt',created_at) order by created_at desc) from(select * from public.mk_audit where owner=auth.uid() order by created_at desc limit 100)a),'[]'),
 'tax',coalesce((select jsonb_agg(jsonb_build_object('year',year,'otherIncome',other_income,'deductions',deductions,'advances',advances,'taxRelief',tax_relief,'version',version)) from public.mk_taxes where owner=auth.uid()),'[]'),
 'settings',jsonb_build_object('sellerName','','sellerAddress','','sellerNip','','sellerEmail','','startDate','','eligible60',false,'regulated',false,'specialVat',false,'specialCash',false,'version',0)||coalesce((select data||jsonb_build_object('version',version) from public.mk_profiles where owner=auth.uid()),'{}'),
 'legalEvents',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'date',date,'details',details::text)) from public.mk_legal_events where owner=auth.uid()),'[]'));
$fn$;
create function public.mk_attach_file(p_id uuid,p_expense_id uuid,p_name text,p_mime text,p_size integer,p_key text) returns void language plpgsql security invoker set search_path='' as $fn$
declare u uuid:=auth.uid();begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 insert into public.mk_attachments(id,owner,expense_id,name,mime,size,key) values(p_id,u,p_expense_id,p_name,p_mime,p_size,p_key);
 insert into public.mk_audit(owner,action,details) values(u,'Dodano dowód zakupu',p_name);
end $fn$;
revoke all on function mk_private.money(jsonb,text),mk_private.detect_breaches(uuid),public.mk_mutate(uuid,text,jsonb),public.mk_get_state(),public.mk_attach_file(uuid,uuid,text,text,integer,text) from public,anon;
grant execute on function mk_private.money(jsonb,text),mk_private.detect_breaches(uuid),public.mk_mutate(uuid,text,jsonb),public.mk_get_state(),public.mk_attach_file(uuid,uuid,text,text,integer,text) to authenticated;

-- Private storage: each user's files have a mandatory own-user path prefix.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('mk-evidence','mk-evidence',false,5242880,array['application/pdf','image/jpeg','image/png']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy mk_evidence_read on storage.objects for select to authenticated using(bucket_id='mk-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy mk_evidence_insert on storage.objects for insert to authenticated with check(bucket_id='mk-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy mk_evidence_delete on storage.objects for delete to authenticated using(bucket_id='mk-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Keep this bucket private even if another application later adds a broad policy.
-- Every other bucket continues to use its existing policies.
create policy mk_evidence_owner_guard on storage.objects as restrictive for all to public
using(bucket_id <> 'mk-evidence' or ((select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text))
with check(bucket_id <> 'mk-evidence' or ((select auth.uid()) is not null and (storage.foldername(name))[1]=(select auth.uid())::text));
