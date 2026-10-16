-- Separate JDG documents. Never reinterpret the existing DN cash ledger.
create table public.mk_invoice_sequences(owner uuid not null references auth.users(id),year integer not null check(year in(2025,2026)),series text not null check(series in('FV','FK')),value integer not null check(value>0),primary key(owner,year,series));
create table public.mk_invoices(
 id uuid primary key,owner uuid not null references auth.users(id),client_id uuid,
 direction text not null check(direction in('sale','purchase')),status text not null check(status in('draft','issued')),kind text not null check(kind in('regular','correction')),
 number text not null default '' check(length(number)<=80),party_key text not null default '',parent_id uuid,
 issue_date date not null,sale_date date not null,due_date date not null,tax_date date not null,vat_date date not null,received_date date not null,
 net bigint not null default 0,vat bigint not null default 0,gross bigint not null default 0,deductible_vat bigint not null default 0,pit_cost bigint not null default 0,
 data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<100000),
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),issued_at timestamptz,
 unique(owner,id),foreign key(owner,client_id) references public.mk_clients(owner,id),foreign key(owner,parent_id) references public.mk_invoices(owner,id),
 check(issue_date between '2025-01-01' and '2026-12-31' and sale_date between '2025-01-01' and '2026-12-31' and tax_date between '2025-01-01' and '2026-12-31' and vat_date between '2025-01-01' and '2026-12-31' and received_date between '2025-01-01' and '2026-12-31'),
 check(due_date between '2025-01-01' and '2099-12-31'),
 check(abs(net)<=99999999999 and abs(vat)<=99999999999 and abs(gross)<=99999999999 and gross=net+vat),
 check((kind='regular' and parent_id is null) or (kind='correction' and parent_id is not null))
);
create index mk_invoices_owner_tax_date on public.mk_invoices(owner,tax_date);
create index mk_invoices_owner_vat_date on public.mk_invoices(owner,vat_date);
create index mk_invoices_owner_client on public.mk_invoices(owner,client_id);
create index mk_invoices_owner_parent on public.mk_invoices(owner,parent_id);
create unique index mk_invoice_sale_number on public.mk_invoices(owner,number) where status='issued' and direction='sale';
create unique index mk_invoice_purchase_number on public.mk_invoices(owner,party_key,number) where status='issued' and direction='purchase';
create table public.mk_invoice_payments(
 id uuid primary key,owner uuid not null references auth.users(id),invoice_id uuid not null,date date not null check(date between '2025-01-01' and '2026-12-31'),
 amount bigint not null check(amount<>0 and abs(amount)<=99999999999),method text not null check(method in('Przelew','Gotówka','Karta','Inne')),note text not null default '' check(length(note)<=500),reversal_of uuid,
 created_at timestamptz not null default now(),unique(owner,invoice_id,id),unique(owner,reversal_of),
 foreign key(owner,invoice_id) references public.mk_invoices(owner,id),foreign key(owner,invoice_id,reversal_of) references public.mk_invoice_payments(owner,invoice_id,id)
);
create index mk_invoice_payments_owner_date on public.mk_invoice_payments(owner,date);
create index mk_invoice_payments_owner_invoice on public.mk_invoice_payments(owner,invoice_id);
create table public.mk_invoice_attachments(
 id uuid primary key,owner uuid not null references auth.users(id),invoice_id uuid not null,name text not null check(length(name) between 1 and 200),mime text not null check(mime in('application/pdf','image/jpeg','image/png')),size integer not null check(size between 1 and 4194304),key text not null unique,
 foreign key(owner,invoice_id) references public.mk_invoices(owner,id),check(key=owner::text||'/'||id::text)
);
create index mk_invoice_attachments_owner_invoice on public.mk_invoice_attachments(owner,invoice_id);
do $fn$ declare t text;begin
 foreach t in array array['mk_invoice_sequences','mk_invoices','mk_invoice_payments','mk_invoice_attachments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy %I on public.%I for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()))',t||'_own',t);
  execute format('revoke all on public.%I from public,anon',t);
  execute format('grant select,insert on public.%I to authenticated',t);
 end loop;
end $fn$;
grant update on public.mk_invoices,public.mk_invoice_sequences to authenticated;

create function mk_private.invoice_guard() returns trigger language plpgsql security invoker set search_path='' as $fn$
declare p public.mk_business_profiles%rowtype;source public.mk_invoices%rowtype;l jsonb;q numeric;price bigint;discount integer;rate text;line_net bigint;line_vat bigint;seq integer;v_series text;seller jsonb;before_net bigint;before_vat bigint;vat_share integer;cost_share integer;restored jsonb;
begin
 if tg_op='UPDATE' and (old.status='issued' or new.owner<>old.owner or new.id<>old.id) then raise exception 'Wystawiony dokument jest niezmienny. Zapisz osobną korektę.';end if;
 select * into p from public.mk_business_profiles where owner=new.owner;
 if p.business_type is distinct from 'jdg' then raise exception 'Ta ewidencja faktur wymaga profilu JDG.';end if;
 if jsonb_typeof(new.data->'lines') is distinct from 'array' or jsonb_array_length(new.data->'lines') not between 1 and 100 then raise exception 'Faktura wymaga od 1 do 100 pozycji.';end if;
 restored:=new.data->'restoredSnapshot';
 new.net:=0;new.vat:=0;
 for l in select value from jsonb_array_elements(new.data->'lines') loop
  if length(btrim(coalesce(l->>'name',''))) not between 1 and 300 or length(btrim(coalesce(l->>'unit',''))) not between 1 and 30 then raise exception 'Sprawdź nazwę i jednostkę pozycji.';end if;
  if coalesce(l->>'quantityMilli','') !~ '^-?[0-9]{1,10}$' or coalesce(l->>'discountBps','') !~ '^[0-9]{1,5}$' then raise exception 'Nieprawidłowa ilość lub rabat.';end if;
  q:=(l->>'quantityMilli')::numeric;price:=mk_private.money(l,'unitPrice');discount:=(l->>'discountBps')::integer;rate:=l->>'vatRate';
  if q=0 or abs(q)>1000000000 or price<0 or discount not between 0 and 10000 or coalesce(rate,'') not in('23','8','5','0','zw','np') or coalesce((l->>'lumpSumRate')::integer,-1) not in(200,300,550,850,1000,1200,1250,1400,1500,1700) then raise exception 'Pozycja poza obsługiwanym zakresem.';end if;
  if new.kind='regular' and q<0 then raise exception 'Ujemna pozycja wymaga korekty.';end if;
  if coalesce(l->>'productId','')<>'' and not exists(select 1 from public.mk_products where owner=new.owner and id=(l->>'productId')::uuid) then raise exception 'Wybierz własną pozycję katalogu.';end if;
  line_net:=round(q*price*(10000-discount)/10000000);line_vat:=round(line_net::numeric*(case when rate in('zw','np') then 0 else rate::integer end)/100);
  new.net:=new.net+line_net;new.vat:=new.vat+line_vat;
 end loop;
 new.gross:=new.net+new.vat;
 vat_share:=coalesce((new.data->>'vatDeductionBps')::integer,0);cost_share:=coalesce((new.data->>'costDeductionBps')::integer,0);
 if vat_share not between 0 and 10000 or cost_share not between 0 and 10000 then raise exception 'Udział odliczenia musi wynosić od 0 do 100%%.';end if;
 new.deductible_vat:=case when new.direction='purchase' and p.vat_status='active' and new.vat_date>=p.vat_start_date then round(new.vat::numeric*vat_share/10000) else 0 end;
 if restored is not null then
  new.deductible_vat:=mk_private.money(restored,'deductibleVat');
  if (new.direction='sale' and new.deductible_vat<>0) or abs(new.deductible_vat)>abs(new.vat) or (new.deductible_vat<>0 and sign(new.deductible_vat)<>sign(new.vat)) then raise exception 'Nieprawidłowe odliczenie VAT w kopii.';end if;
 end if;
 new.pit_cost:=case when new.direction='purchase' then round((new.gross-new.deductible_vat)::numeric*cost_share/10000) else 0 end;
 if restored is not null and new.pit_cost<>mk_private.money(restored,'pitCost') then raise exception 'Koszt PIT w kopii nie zgadza się z pozycjami i odliczeniem VAT.';end if;
 new.party_key:=coalesce(nullif(new.data->>'partyNip',''),lower(btrim(new.data->>'partyName')));
 if new.kind='correction' then
  select * into source from public.mk_invoices where owner=new.owner and id=new.parent_id and status='issued' and kind='regular' and direction=new.direction for update;
  if not found or length(btrim(coalesce(new.data->>'reason','')))=0 then raise exception 'Korekta wymaga własnej faktury źródłowej i przyczyny.';end if;
 end if;
 if new.status='issued' then
  if new.issue_date>(now() at time zone 'Europe/Warsaw')::date then raise exception 'Przyszły dokument zapisz jako szkic.';end if;
  if not p.configured or p.jdg_start_date is null or new.tax_date<p.jdg_start_date or (new.direction='sale' and new.sale_date<p.jdg_start_date) then raise exception 'Sprawdź konfigurację JDG i datę ujęcia dokumentu.';end if;
  if new.direction='purchase' and new.vat_date<new.received_date then raise exception 'Odliczenie VAT nie może poprzedzać otrzymania faktury.';end if;
  if length(btrim(coalesce(new.data->>'partyName','')))=0 or length(btrim(coalesce(new.data->>'partyAddress','')))=0 then raise exception 'Uzupełnij nazwę i adres kontrahenta.';end if;
  select data into seller from public.mk_profiles where owner=new.owner;
  if restored is not null then
   if length(btrim(coalesce(restored->'seller'->>'name','')))=0 or length(btrim(coalesce(restored->'seller'->>'address','')))=0 or coalesce(restored->'seller'->>'nip','') !~ '^[0-9]{10}$' then raise exception 'Niepełne historyczne dane sprzedawcy w kopii.';end if;
   seller:=jsonb_build_object('sellerName',restored->'seller'->>'name','sellerAddress',restored->'seller'->>'address','sellerNip',restored->'seller'->>'nip');
  end if;
  if length(btrim(coalesce(seller->>'sellerName','')))=0 or length(btrim(coalesce(seller->>'sellerAddress','')))=0 or regexp_replace(coalesce(seller->>'sellerNip',''),'[[:space:]-]','','g') !~ '^[0-9]{10}$' then raise exception 'Uzupełnij nazwę, adres i NIP sprzedawcy w ustawieniach.';end if;
  seller:=seller||jsonb_build_object('sellerNip',regexp_replace(coalesce(seller->>'sellerNip',''),'[[:space:]-]','','g'));
  if new.direction='sale' then
   if restored is null and (p.vat_status='exempt' or new.sale_date<coalesce(p.vat_start_date,'9999-12-31')) and exists(select 1 from jsonb_array_elements(new.data->'lines') e where e->>'vatRate' not in('zw','np')) then raise exception 'Dla zwolnienia z VAT użyj właściwej stawki zw lub np.';end if;
   if exists(select 1 from jsonb_array_elements(new.data->'lines') e where e->>'vatRate'='zw') and length(btrim(coalesce(new.data->>'exemptionBasis','')))=0 then raise exception 'Wpisz podstawę zwolnienia z VAT.';end if;
  elsif new.deductible_vat<>0 and coalesce(new.data->>'partyNip','') !~ '^[0-9]{10}$' then raise exception 'Odliczenie VAT wymaga danych faktury z NIP dostawcy.';
  end if;
  if new.direction='sale' and new.number='' then
   v_series:=case when new.kind='correction' then 'FK' else 'FV' end;
   insert into public.mk_invoice_sequences(owner,year,series,value) values(new.owner,extract(year from new.issue_date)::integer,v_series,1) on conflict(owner,year,series) do update set value=public.mk_invoice_sequences.value+1 returning value into seq;
   new.number:=v_series||'/'||extract(year from new.issue_date)::integer::text||'/'||seq::text;
  end if;
  if new.number='' then raise exception 'Wpisz numer dokumentu.';end if;
  if new.direction='sale' and new.number ~ ('^(FV|FK)/'||extract(year from new.issue_date)::integer::text||'/[0-9]{1,9}$') then
   insert into public.mk_invoice_sequences(owner,year,series,value) values(new.owner,extract(year from new.issue_date)::integer,split_part(new.number,'/',1),greatest(1,split_part(new.number,'/',3)::integer)) on conflict(owner,year,series) do update set value=greatest(public.mk_invoice_sequences.value,excluded.value);
  end if;
  new.data:=new.data||jsonb_build_object('seller',jsonb_build_object('name',seller->>'sellerName','address',seller->>'sellerAddress','nip',seller->>'sellerNip'));
  if new.kind='correction' then
   select source.net+coalesce(sum(net),0),source.vat+coalesce(sum(vat),0) into before_net,before_vat from public.mk_invoices where owner=new.owner and parent_id=source.id and status='issued';
   if before_net+new.net<0 or before_vat+new.vat<0 or before_net+before_vat+new.gross<0 then raise exception 'Korekty nie mogą obniżyć dokumentu poniżej zera.';end if;
   new.client_id:=source.client_id;new.party_key:=source.party_key;
   new.data:=new.data||jsonb_build_object('partyName',source.data->>'partyName','partyAddress',source.data->>'partyAddress','partyNip',source.data->>'partyNip','seller',source.data->'seller','source',jsonb_build_object('number',source.number,'issueDate',source.issue_date,'net',before_net,'vat',before_vat,'gross',before_net+before_vat,'lines',source.data->'lines'));
  end if;
  new.issued_at:=case when restored is null then now() else coalesce(nullif(restored->>'issuedAt','')::timestamptz,now()) end;
 end if;
 return new;
end $fn$;
create trigger mk_invoice_validate before insert or update on public.mk_invoices for each row execute function mk_private.invoice_guard();

create function mk_private.invoice_payment_guard() returns trigger language plpgsql security invoker set search_path='' as $fn$
declare doc public.mk_invoices%rowtype;original public.mk_invoice_payments%rowtype;paid bigint;
begin
 select * into doc from public.mk_invoices where owner=new.owner and id=new.invoice_id and status='issued' for update;
 if not found then raise exception 'Płatność wymaga własnej wystawionej faktury.';end if;
 if new.reversal_of is not null then
  select * into original from public.mk_invoice_payments where owner=new.owner and invoice_id=new.invoice_id and id=new.reversal_of and reversal_of is null;
  if original.id is null or new.amount<>-original.amount then raise exception 'Odwrócenie musi odpowiadać pierwotnej płatności.';end if;
  if exists(select 1 from public.mk_invoice_payments where owner=new.owner and reversal_of=new.reversal_of) then raise exception 'Ten wpis został już odwrócony.';end if;
 elsif sign(new.amount)<>sign(doc.gross) then raise exception 'Zwrot powiąż z ujemną korektą faktury.';
 end if;
 select coalesce(sum(amount),0)+new.amount into paid from public.mk_invoice_payments where owner=new.owner and invoice_id=new.invoice_id;
 if paid<least(0,doc.gross) or paid>greatest(0,doc.gross) then raise exception 'Płatności przekraczają kwotę dokumentu.';end if;
 return new;
end $fn$;
create trigger mk_invoice_payment_validate before insert on public.mk_invoice_payments for each row execute function mk_private.invoice_payment_guard();

create function public.mk_invoice_mutate(p_op_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare u uuid:=auth.uid();d jsonb:=p_data;fp text;previous text;existing public.mk_invoices%rowtype;doc public.mk_invoices%rowtype;original public.mk_invoice_payments%rowtype;v_id uuid;initial bigint;n integer;
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 if p_op_id is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>100000 then raise exception 'Nieprawidłowy dokument.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));fp:=md5(p_action||':'||d::text);
 select fingerprint into previous from public.mk_operations where owner=u and id=p_op_id;
 if found then if previous<>fp then raise exception 'Konflikt operacji.' using errcode='40001';end if;return jsonb_build_object('duplicate',true);end if;
 if p_action='restoreInvoice' then
  v_id:=(d->'document'->>'id')::uuid;
  if not exists(select 1 from public.mk_invoices where owner=u and id=v_id) then
   d:=(d->'document')||jsonb_build_object('initialPayment',0,'restoredSnapshot',d->'snapshot');
   insert into public.mk_invoices(id,owner,client_id,direction,status,kind,number,parent_id,issue_date,sale_date,due_date,tax_date,vat_date,received_date,data,created_at) values(v_id,u,nullif(d->>'clientId','')::uuid,d->>'direction',d->>'status',d->>'kind',coalesce(d->>'number',''),nullif(d->>'parentId','')::uuid,(d->>'issueDate')::date,(d->>'saleDate')::date,(d->>'dueDate')::date,(d->>'taxDate')::date,(d->>'vatDate')::date,(d->>'receivedDate')::date,d,(d->'restoredSnapshot'->>'createdAt')::timestamptz) returning * into doc;
  end if;
 elsif p_action='restorePayment' then
  if not exists(select 1 from public.mk_invoice_payments where owner=u and id=(d->>'id')::uuid) then
   insert into public.mk_invoice_payments(id,owner,invoice_id,date,amount,method,note,reversal_of,created_at) values((d->>'id')::uuid,u,(d->>'invoiceId')::uuid,(d->>'date')::date,mk_private.money(d,'amount'),d->>'method',coalesce(d->>'note',''),nullif(d->>'reversalOf','')::uuid,(d->>'createdAt')::timestamptz);
  end if;
 elsif p_action='invoice' then
  v_id:=(d->>'id')::uuid;select * into existing from public.mk_invoices where owner=u and id=v_id;
  if found then
   if existing.status='issued' then raise exception 'Dokument wystawiono wcześniej. Nie zapisano go ponownie.' using errcode='40001';end if;
   if existing.version<>coalesce((d->>'version')::integer,0) then raise exception 'Szkic zmienił się na innym urządzeniu.' using errcode='40001';end if;
   update public.mk_invoices set client_id=nullif(d->>'clientId','')::uuid,direction=d->>'direction',status=d->>'status',kind=d->>'kind',number=coalesce(d->>'number',''),parent_id=nullif(d->>'parentId','')::uuid,issue_date=(d->>'issueDate')::date,sale_date=(d->>'saleDate')::date,due_date=(d->>'dueDate')::date,tax_date=(d->>'taxDate')::date,vat_date=(d->>'vatDate')::date,received_date=(d->>'receivedDate')::date,data=d,version=version+1 where owner=u and id=v_id returning * into doc;
  else
   if coalesce((d->>'version')::integer,0)<>0 then raise exception 'Nie znaleziono edytowanego szkicu.' using errcode='40001';end if;
   insert into public.mk_invoices(id,owner,client_id,direction,status,kind,number,parent_id,issue_date,sale_date,due_date,tax_date,vat_date,received_date,data) values(v_id,u,nullif(d->>'clientId','')::uuid,d->>'direction',d->>'status',d->>'kind',coalesce(d->>'number',''),nullif(d->>'parentId','')::uuid,(d->>'issueDate')::date,(d->>'saleDate')::date,(d->>'dueDate')::date,(d->>'taxDate')::date,(d->>'vatDate')::date,(d->>'receivedDate')::date,d) returning * into doc;
  end if;
  initial:=mk_private.money(d,'initialPayment');
  if initial<0 or initial>abs(doc.gross) then raise exception 'Pierwsza płatność przekracza wartość dokumentu.';end if;
  if doc.status='issued' and initial>0 then insert into public.mk_invoice_payments(id,owner,invoice_id,date,amount,method,note) values(gen_random_uuid(),u,doc.id,(d->>'paymentDate')::date,initial*sign(doc.gross),d->>'method','Płatność zapisana z fakturą');end if;
 elsif p_action='payment' then
  insert into public.mk_invoice_payments(id,owner,invoice_id,date,amount,method,note) values((d->>'id')::uuid,u,(d->>'invoiceId')::uuid,(d->>'date')::date,mk_private.money(d,'amount'),d->>'method',coalesce(d->>'note',''));
 elsif p_action='reversePayment' then
  select * into original from public.mk_invoice_payments where owner=u and id=(d->>'paymentId')::uuid and reversal_of is null;
  if not found then raise exception 'Nie znaleziono płatności.';end if;
  insert into public.mk_invoice_payments(id,owner,invoice_id,date,amount,method,note,reversal_of) values((d->>'id')::uuid,u,original.invoice_id,(d->>'date')::date,-original.amount,original.method,coalesce(d->>'note','Odwrócenie błędnego wpisu'),original.id);
 else raise exception 'Nieobsługiwana operacja.';
 end if;
 insert into public.mk_operations(id,owner,fingerprint) values(p_op_id,u,fp);
 insert into public.mk_audit(owner,action,details) values(u,case p_action when 'invoice' then case when doc.status='issued' then 'Zapisano fakturę JDG' else 'Zapisano szkic faktury' end else 'Zapisano płatność faktury' end,coalesce(doc.number,d->>'note',''));
 return jsonb_build_object('duplicate',false);
end $fn$;

create function public.mk_invoice_state() returns jsonb language sql stable security invoker set search_path='' as $fn$
select jsonb_build_object(
 'documents',coalesce((select jsonb_agg(data||jsonb_build_object('id',id,'clientId',coalesce(client_id::text,''),'direction',direction,'status',status,'kind',kind,'number',number,'parentId',coalesce(parent_id::text,''),'issueDate',issue_date,'saleDate',sale_date,'dueDate',due_date,'taxDate',tax_date,'vatDate',vat_date,'receivedDate',received_date,'net',net,'vat',vat,'gross',gross,'deductibleVat',deductible_vat,'pitCost',pit_cost,'version',version,'createdAt',created_at,'issuedAt',coalesce(issued_at::text,'')) order by issue_date desc,created_at desc) from public.mk_invoices where owner=auth.uid()),'[]'),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'invoiceId',invoice_id,'date',date,'amount',amount,'method',method,'note',note,'reversalOf',coalesce(reversal_of::text,''),'createdAt',created_at) order by date desc,created_at desc) from public.mk_invoice_payments where owner=auth.uid()),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'invoiceId',invoice_id,'name',name,'mime',mime,'size',size)) from public.mk_invoice_attachments where owner=auth.uid()),'[]'));
$fn$;
create function public.mk_attach_invoice_file(p_id uuid,p_invoice_id uuid,p_name text,p_mime text,p_size integer,p_key text) returns void language plpgsql security invoker set search_path='' as $fn$
declare u uuid:=auth.uid();begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 insert into public.mk_invoice_attachments(id,owner,invoice_id,name,mime,size,key) values(p_id,u,p_invoice_id,p_name,p_mime,p_size,p_key);
 insert into public.mk_audit(owner,action,details) values(u,'Dodano załącznik faktury',p_name);
end $fn$;
revoke all on function mk_private.invoice_guard(),mk_private.invoice_payment_guard(),public.mk_invoice_mutate(uuid,text,jsonb),public.mk_invoice_state(),public.mk_attach_invoice_file(uuid,uuid,text,text,integer,text) from public,anon;
grant execute on function mk_private.invoice_guard(),mk_private.invoice_payment_guard(),public.mk_invoice_mutate(uuid,text,jsonb),public.mk_invoice_state(),public.mk_attach_invoice_file(uuid,uuid,text,text,integer,text) to authenticated;
