-- Separate KPiR stocktakes. Final snapshots are immutable; corrections form a chain.
create table public.mk_inventories (
 id uuid primary key, owner uuid not null references auth.users(id), kind text not null check(kind in('opening','interim','closing')),
 date date not null check(date between '2025-01-01' and '2026-12-31'), status text not null check(status in('draft','final','void')),
 replaces_id uuid, data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<300000),
 total bigint not null default 0 check(total between 0 and 99999999999), version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), finalized_at timestamptz,
 unique(owner,id),foreign key(owner,replaces_id) references public.mk_inventories(owner,id),check(replaces_id is null or replaces_id<>id),
 check(kind<>'closing' or to_char(date,'MM-DD')='12-31'),check(kind<>'interim' or (date=(date_trunc('month',date::timestamp)+interval '1 month - 1 day')::date and extract(month from date)<12))
);
create index mk_inventories_owner_date on public.mk_inventories(owner,date);
create index mk_inventories_owner_replaces on public.mk_inventories(owner,replaces_id);
create unique index mk_inventory_final_root on public.mk_inventories(owner,kind,date) where status='final' and replaces_id is null;
create unique index mk_inventory_final_revision on public.mk_inventories(owner,replaces_id) where status='final' and replaces_id is not null;
alter table public.mk_inventories enable row level security;
create policy mk_inventories_own on public.mk_inventories for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
revoke all on public.mk_inventories from public,anon;
grant select,insert,update on public.mk_inventories to authenticated;

create function mk_private.inventory_guard() returns trigger language plpgsql security invoker set search_path='' as $fn$
declare p public.mk_business_profiles%rowtype;source public.mk_inventories%rowtype;l jsonb;q numeric;price bigint;reference bigint;minimum_price bigint;excluded bigint;gross bigint;category text;method text;seller jsonb;restored jsonb;
begin
 if tg_op='UPDATE' and (old.status<>'draft' or new.id<>old.id or new.owner<>old.owner or new.created_at<>old.created_at) then raise exception 'Zatwierdzony lub anulowany spis jest niezmienny. Utwórz poprawioną wersję.';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner::text,0));
 select * into p from public.mk_business_profiles where owner=new.owner;
 if p.business_type is distinct from 'jdg' then raise exception 'Spis do KPiR wymaga profilu JDG.';end if;
 if new.status='void' then if tg_op<>'UPDATE' then raise exception 'Nieprawidłowy status.';end if;return new;end if;
 if jsonb_typeof(new.data->'lines') is distinct from 'array' or jsonb_array_length(new.data->'lines')>300 then raise exception 'Spis może zawierać do 300 pozycji.';end if;
 if new.kind='opening' and p.configured and new.date<>greatest(make_date(extract(year from new.date)::integer,1,1),p.jdg_start_date) then raise exception 'Spis początkowy wymaga 1 stycznia lub dnia rozpoczęcia JDG.';end if;
 if p.configured and new.date<p.jdg_start_date then raise exception 'Data spisu poprzedza rozpoczęcie JDG.';end if;
 new.total:=0;
 for l in select value from jsonb_array_elements(new.data->'lines') loop
  if length(btrim(coalesce(l->>'name',''))) not between 1 and 300 or length(btrim(coalesce(l->>'unit',''))) not between 1 and 30 or length(coalesce(l->>'note',''))>1000 or length(coalesce(l->>'location',''))>400 or length(coalesce(l->>'ownerName',''))>200 then raise exception 'Sprawdź opis, jednostkę i uwagi pozycji.';end if;
  if coalesce(l->>'quantityMilli','') !~ '^[0-9]{1,10}$' then raise exception 'Nieprawidłowa ilość.';end if;
  q:=(l->>'quantityMilli')::numeric;price:=mk_private.money(l,'unitPrice');excluded:=mk_private.money(l,'excludedValue');minimum_price:=mk_private.money(l,'minimumUnitPrice');category:=l->>'category';method:=l->>'method';
  reference:=case when jsonb_typeof(l->'referencePrice')='null' then null else mk_private.money(l,'referencePrice') end;
  if q not between 1 and 1000000000 or price<0 or excluded<0 or minimum_price<0 or reference<0 or coalesce(category,'') not in('goods','materials','wip','finished','defective','waste') or coalesce(method,'') not in('purchase','acquisition','cost','market','estimate','unvalued') or coalesce(l->>'ownership','') not in('own','third_party') then raise exception 'Pozycja spisu poza obsługiwanym zakresem.';end if;
  if coalesce(l->>'productId','')<>'' and not exists(select 1 from public.mk_products where owner=new.owner and id=(l->>'productId')::uuid) then raise exception 'Wybierz własną pozycję katalogu.';end if;
  if l->>'ownership'='third_party' then
   if length(btrim(coalesce(l->>'ownerName','')))=0 or method<>'unvalued' or price<>0 or excluded<>0 then raise exception 'Towary obce wymagają właściciela i ujęcia bez wyceny.';end if;
   continue;
  end if;
  if method='unvalued' or (category in('goods','materials') and method not in('purchase','acquisition','market')) or (category in('wip','finished','defective') and method not in('cost','market')) or (category='waste' and method<>'estimate') then raise exception 'Sposób wyceny nie odpowiada rodzajowi składnika.';end if;
  if method='market' and (reference is null or price>reference or length(btrim(coalesce(l->>'note','')))=0) then raise exception 'Niższa wycena wymaga ceny pierwotnej i uzasadnienia.';end if;
  if reference is not null and price<reference and length(btrim(coalesce(l->>'note','')))=0 then raise exception 'Uzasadnij obniżenie wyceny.';end if;
  if category='wip' and price<minimum_price then raise exception 'Wycena produkcji w toku nie może być niższa od materiałów bezpośrednich.';end if;
  gross:=round(q*price/1000);
  if gross>99999999999 or excluded>gross or (excluded>0 and length(btrim(coalesce(l->>'note','')))=0) then raise exception 'Sprawdź wartość i pomniejszenie ustawowe pozycji.';end if;
  new.total:=new.total+gross-excluded;
 end loop;
 if length(coalesce(new.data->>'countedBy',''))>200 or length(coalesce(new.data->>'location',''))>400 or length(coalesce(new.data->>'notes',''))>2000 or length(coalesce(new.data->>'reason',''))>1000 then raise exception 'Opis spisu jest za długi.';end if;
 if new.replaces_id is not null then
  select * into source from public.mk_inventories where owner=new.owner and id=new.replaces_id and status='final' and kind=new.kind and date=new.date;
  if not found or length(btrim(coalesce(new.data->>'reason','')))=0 then raise exception 'Poprawiona wersja wymaga własnego zatwierdzonego spisu z tej samej daty i przyczyny.';end if;
 end if;
 restored:=new.data->'restoredSnapshot';
 if restored is not null and new.total<>mk_private.money(restored,'total') then raise exception 'Wartość spisu w kopii nie zgadza się z pozycjami.';end if;
 if new.status='final' then
  if not p.configured then raise exception 'Najpierw skonfiguruj JDG.';end if;
  if new.date>(now() at time zone 'Europe/Warsaw')::date then raise exception 'Przyszły spis zapisz jako szkic.';end if;
  if length(btrim(coalesce(new.data->>'countedBy','')))=0 or (jsonb_array_length(new.data->'lines')=0 and coalesce(new.data->>'zeroConfirmed','false')<>'true') then raise exception 'Wpisz osobę sporządzającą spis i potwierdź spis zerowy.';end if;
  if exists(select 1 from public.mk_inventories where owner=new.owner and status='final' and replaces_id=new.replaces_id) or (new.replaces_id is null and exists(select 1 from public.mk_inventories where owner=new.owner and kind=new.kind and date=new.date and status='final')) then raise exception 'Spis zmienił się na innym urządzeniu. Odśwież i popraw jego najnowszą wersję.' using errcode='40001';end if;
  if new.replaces_id is not null then seller:=source.data->'seller';
  elsif restored is not null then seller:=restored->'seller';
  else select jsonb_build_object('name',data->>'sellerName','address',data->>'sellerAddress','nip',regexp_replace(coalesce(data->>'sellerNip',''),'[[:space:]-]','','g')) into seller from public.mk_profiles where owner=new.owner;end if;
  if length(btrim(coalesce(seller->>'name','')))=0 or length(btrim(coalesce(seller->>'address','')))=0 or coalesce(seller->>'nip','') !~ '^[0-9]{10}$' then raise exception 'Uzupełnij nazwę, adres i NIP firmy w ustawieniach.';end if;
  new.data:=new.data||jsonb_build_object('seller',seller);
  new.finalized_at:=case when restored is null then now() else coalesce(nullif(restored->>'finalizedAt','')::timestamptz,now()) end;
 else new.finalized_at:=null;end if;
 return new;
end $fn$;
create trigger mk_inventory_validate before insert or update on public.mk_inventories for each row execute function mk_private.inventory_guard();

create function public.mk_inventory_mutate(p_op_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare u uuid:=auth.uid();d jsonb:=p_data;fp text;previous text;old_doc public.mk_inventories%rowtype;doc public.mk_inventories%rowtype;v_id uuid;
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 if p_op_id is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>300000 then raise exception 'Spis jest za duży lub nieprawidłowy.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));fp:=md5(p_action||':'||d::text);
 select fingerprint into previous from public.mk_operations where owner=u and id=p_op_id;
 if found then if previous<>fp then raise exception 'Konflikt operacji.' using errcode='40001';end if;return jsonb_build_object('duplicate',true);end if;
 if p_action='restore' then
  v_id:=(d->'document'->>'id')::uuid;
  if exists(select 1 from public.mk_inventories where owner=u and id=v_id) then return jsonb_build_object('duplicate',true);end if;
  d:=(d->'document')||jsonb_build_object('restoredSnapshot',d->'snapshot');
  insert into public.mk_inventories(id,owner,kind,date,status,replaces_id,data,created_at) values(v_id,u,d->>'kind',(d->>'date')::date,d->>'status',nullif(d->>'replacesId','')::uuid,d,(d->'restoredSnapshot'->>'createdAt')::timestamptz) returning * into doc;
 elsif p_action in('save','discard') then
  v_id:=(d->>'id')::uuid;select * into old_doc from public.mk_inventories where owner=u and id=v_id;
  if old_doc.id is not null then
   if old_doc.status<>'draft' or old_doc.version is distinct from (d->>'version')::integer then raise exception 'Spis zmienił się na innym urządzeniu albo został zatwierdzony.' using errcode='40001';end if;
   if p_action='discard' then update public.mk_inventories set status='void',version=version+1 where owner=u and id=v_id returning * into doc;
   else update public.mk_inventories set kind=d->>'kind',date=(d->>'date')::date,status=d->>'status',replaces_id=nullif(d->>'replacesId','')::uuid,data=d,version=version+1 where owner=u and id=v_id returning * into doc;end if;
  else
   if p_action='discard' or coalesce((d->>'version')::integer,-1)<>0 then raise exception 'Nie znaleziono szkicu.' using errcode='40001';end if;
   insert into public.mk_inventories(id,owner,kind,date,status,replaces_id,data) values(v_id,u,d->>'kind',(d->>'date')::date,d->>'status',nullif(d->>'replacesId','')::uuid,d) returning * into doc;
  end if;
 else raise exception 'Nieobsługiwana operacja.';end if;
 insert into public.mk_operations(id,owner,fingerprint) values(p_op_id,u,fp);
 insert into public.mk_audit(owner,action,details) values(u,case when p_action='discard' then 'Anulowano szkic spisu' when doc.status='final' then 'Zatwierdzono spis z natury' else 'Zapisano szkic spisu' end,doc.date::text||' / '||doc.kind);
 return jsonb_build_object('duplicate',false);
end $fn$;
create function public.mk_inventory_state() returns jsonb language sql stable security invoker set search_path='' as $fn$
select jsonb_build_object('documents',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'kind',kind,'date',date,'status',status,'replacesId',coalesce(replaces_id::text,''),'total',total,'version',version,'createdAt',created_at,'finalizedAt',coalesce(to_jsonb(finalized_at),'""'::jsonb)) order by date desc,created_at desc) from public.mk_inventories where owner=auth.uid()),'[]'));
$fn$;
revoke all on function mk_private.inventory_guard(),public.mk_inventory_mutate(uuid,text,jsonb),public.mk_inventory_state() from public,anon;
grant execute on function mk_private.inventory_guard(),public.mk_inventory_mutate(uuid,text,jsonb),public.mk_inventory_state() to authenticated;
