-- Additive extension. Existing DN ledgers and the shared TaskOn Auth are retained.
create table public.mk_business_profiles (
 owner uuid primary key references auth.users(id), business_type text not null check(business_type in ('dn','jdg')),
 initial_type text not null check(initial_type in ('dn','jdg')), jdg_start_date date,
 tax_form text not null default 'scale' check(tax_form in ('scale','linear','lump_sum')),
 vat_status text not null default 'exempt' check(vat_status in ('exempt','active')), vat_start_date date,
 exemption_basis text not null default 'art. 113 ust. 1 lub 9 ustawy o VAT' check(length(exemption_basis)<=300),
 configured boolean not null default false, version integer not null default 1 check(version>0), updated_at timestamptz not null default now(),
 check(jdg_start_date is null or jdg_start_date between '2025-01-01' and '2026-12-31'),
 check(vat_start_date is null or vat_start_date between '2025-01-01' and '2026-12-31'),
 check(not configured or business_type='dn' or jdg_start_date is not null),
 check(vat_status<>'active' or vat_start_date is not null),
 check(business_type<>'dn' or (tax_form='scale' and vat_status='exempt'))
);
create table public.mk_business_events (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id),
 from_type text not null check(from_type in ('dn','jdg')), to_type text not null check(to_type='jdg'),
 effective_date date not null, created_at timestamptz not null default now(), unique(owner)
);
create table public.mk_products (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 160), kind text not null check(kind in ('product','service')),
 sku text not null default '' check(length(sku)<=60), unit text not null default 'szt.' check(length(btrim(unit)) between 1 and 30),
 unit_price bigint not null check(unit_price between 0 and 99999999999), vat_rate text not null check(vat_rate in ('23','8','5','0','zw','np')),
 lump_sum_rate integer not null check(lump_sum_rate in (200,300,550,850,1000,1200,1250,1400,1500,1700)),
 description text not null default '' check(length(description)<=1500), archived boolean not null default false,
 version integer not null default 1 check(version>0), created_at timestamptz not null default now(), unique(owner,id)
);
create index mk_products_owner_name on public.mk_products(owner,name);

-- Existing Ewidora users retain DN. Do not create profiles for other TaskOn users.
insert into public.mk_business_profiles(owner,business_type,initial_type,configured)
select owner,'dn','dn',true from (select owner from public.mk_operations union select owner from public.mk_profiles) s;

alter table public.mk_business_profiles enable row level security;
alter table public.mk_business_events enable row level security;
alter table public.mk_products enable row level security;
create policy mk_business_profiles_own on public.mk_business_profiles for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
create policy mk_business_events_own on public.mk_business_events for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
create policy mk_products_own on public.mk_products for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
revoke all on public.mk_business_profiles,public.mk_business_events,public.mk_products from public,anon;
grant select,insert,update on public.mk_business_profiles,public.mk_products to authenticated;
grant select,insert on public.mk_business_events to authenticated;

create function mk_private.business_history_guard() returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if new.owner<>old.owner or new.initial_type<>old.initial_type then raise exception 'Historia działalności jest niezmienna.';end if;
 if old.business_type='jdg' and (new.business_type<>'jdg' or (old.configured and new.jdg_start_date is distinct from old.jdg_start_date)) then raise exception 'Nie można cofnąć JDG ani zmienić zapisanej daty jej rozpoczęcia.';end if;
 return new;
end $fn$;
create trigger mk_business_history before update on public.mk_business_profiles for each row execute function mk_private.business_history_guard();

create function public.mk_business_mutate(p_op_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare u uuid:=auth.uid(); d jsonb:=p_data; fp text; previous text; p public.mk_business_profiles%rowtype; n integer; start_date date; item_id uuid;
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 if p_op_id is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>20000 then raise exception 'Nieprawidłowy zapis.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 fp:=md5(p_action||':'||d::text);
 select fingerprint into previous from public.mk_operations where owner=u and id=p_op_id;
 if found then if previous<>fp then raise exception 'Konflikt operacji.' using errcode='40001';end if;return jsonb_build_object('duplicate',true);end if;
 select * into p from public.mk_business_profiles where owner=u;
 if p_action='register' then
  if coalesce(d->>'businessType','') not in ('dn','jdg') then raise exception 'Wybierz rodzaj działalności.';end if;
  insert into public.mk_business_profiles(owner,business_type,initial_type,configured) values(u,d->>'businessType',d->>'businessType',d->>'businessType'='dn') on conflict(owner) do nothing;
 elsif p_action='profile' then
  if p.owner is null then raise exception 'Najpierw wybierz rodzaj działalności.';end if;
  if p.version<>coalesce((d->>'version')::integer,0) then raise exception 'Profil zmienił się na innym urządzeniu.' using errcode='40001';end if;
  start_date:=nullif(d->>'jdgStartDate','')::date;
  if d->>'businessType'='jdg' and (start_date is null or start_date>(now() at time zone 'Europe/Warsaw')::date) then raise exception 'Podaj datę rozpoczęcia JDG, nie późniejszą niż dziś.';end if;
  if p.business_type='dn' and d->>'businessType'='jdg' then
   if not coalesce((d->>'confirmTransition')::boolean,false) then raise exception 'Potwierdź przejście na JDG.';end if;
   if exists(select 1 from public.mk_sales where owner=u and date>=start_date) or exists(select 1 from public.mk_expenses where owner=u and date>=start_date) then raise exception 'W tej dacie lub później istnieją wpisy DN. Nie przekształcamy ich automatycznie w księgowość JDG.';end if;
   insert into public.mk_business_events(owner,from_type,to_type,effective_date) values(u,'dn','jdg',start_date);
  end if;
  update public.mk_business_profiles set business_type=d->>'businessType',jdg_start_date=start_date,tax_form=d->>'taxForm',vat_status=d->>'vatStatus',vat_start_date=nullif(d->>'vatStartDate','')::date,exemption_basis=coalesce(d->>'exemptionBasis',''),configured=true,version=version+1,updated_at=now() where owner=u;
 elsif p_action='product' then
  item_id:=(d->>'id')::uuid;
  if exists(select 1 from public.mk_products where owner=u and id=item_id) then
   update public.mk_products set name=btrim(d->>'name'),kind=d->>'kind',sku=coalesce(d->>'sku',''),unit=btrim(d->>'unit'),unit_price=mk_private.money(d,'unitPrice'),vat_rate=d->>'vatRate',lump_sum_rate=(d->>'lumpSumRate')::integer,description=coalesce(d->>'description',''),archived=(d->>'archived')::boolean,version=version+1 where owner=u and id=item_id and version=(d->>'version')::integer;
   get diagnostics n=row_count;if n=0 then raise exception 'Produkt zmienił się na innym urządzeniu.' using errcode='40001';end if;
  else
   if coalesce((d->>'version')::integer,0)<>0 then raise exception 'Produkt już nie istnieje. Odśwież katalog.' using errcode='40001';end if;
   insert into public.mk_products(id,owner,name,kind,sku,unit,unit_price,vat_rate,lump_sum_rate,description,archived) values(item_id,u,btrim(d->>'name'),d->>'kind',coalesce(d->>'sku',''),btrim(d->>'unit'),mk_private.money(d,'unitPrice'),d->>'vatRate',(d->>'lumpSumRate')::integer,coalesce(d->>'description',''),coalesce((d->>'archived')::boolean,false));
  end if;
 else raise exception 'Nieobsługiwana operacja.';
 end if;
 insert into public.mk_operations(id,owner,fingerprint) values(p_op_id,u,fp);
 insert into public.mk_audit(owner,action,details) values(u,case p_action when 'register' then 'Wybrano rodzaj działalności' when 'profile' then 'Zapisano profil działalności' else 'Zapisano pozycję katalogu' end,coalesce(d->>'name',d->>'businessType',''));
 return jsonb_build_object('duplicate',false);
end $fn$;

create function public.mk_business_state() returns jsonb language sql stable security invoker set search_path='' as $fn$
select jsonb_build_object(
 'profile',(select jsonb_build_object('businessType',business_type,'initialType',initial_type,'jdgStartDate',coalesce(jdg_start_date::text,''),'taxForm',tax_form,'vatStatus',vat_status,'vatStartDate',coalesce(vat_start_date::text,''),'exemptionBasis',exemption_basis,'configured',configured,'version',version) from public.mk_business_profiles where owner=auth.uid()),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'sku',sku,'unit',unit,'unitPrice',unit_price,'vatRate',vat_rate,'lumpSumRate',lump_sum_rate,'description',description,'archived',archived,'version',version) order by name) from public.mk_products where owner=auth.uid()),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'fromType',from_type,'toType',to_type,'effectiveDate',effective_date,'createdAt',created_at)) from public.mk_business_events where owner=auth.uid()),'[]'));
$fn$;
revoke all on function mk_private.business_history_guard(),public.mk_business_mutate(uuid,text,jsonb),public.mk_business_state() from public,anon;
grant execute on function mk_private.business_history_guard(),public.mk_business_mutate(uuid,text,jsonb),public.mk_business_state() to authenticated;

-- DN cash-based accounting must never become a substitute for JDG ledgers.
create function mk_private.dn_source_guard() returns trigger language plpgsql security invoker set search_path='' as $fn$
declare p public.mk_business_profiles%rowtype; is_correction boolean:=false;
begin
 select * into p from public.mk_business_profiles where owner=new.owner;
 if p.business_type='jdg' then
  if tg_table_name='mk_sales' then is_correction:=new.kind='correction';else is_correction:=new.amount<0;end if;
  if p.initial_type='jdg' or (not is_correction and (p.jdg_start_date is null or new.date>=p.jdg_start_date)) then raise exception 'To ewidencja DN. Nowe operacje JDG wymagają osobnej ewidencji faktur.';end if;
 end if;
 return new;
end $fn$;
create trigger mk_sales_dn_source before insert or update on public.mk_sales for each row execute function mk_private.dn_source_guard();
create trigger mk_expenses_dn_source before insert or update on public.mk_expenses for each row execute function mk_private.dn_source_guard();
revoke all on function mk_private.dn_source_guard() from public,anon;
grant execute on function mk_private.dn_source_guard() to authenticated;
