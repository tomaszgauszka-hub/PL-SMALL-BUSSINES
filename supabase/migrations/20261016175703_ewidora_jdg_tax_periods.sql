-- Business registration dates are historical facts, not tax-rule coverage years.
alter table public.mk_business_profiles drop constraint mk_business_profiles_jdg_start_date_check;
alter table public.mk_business_profiles drop constraint mk_business_profiles_vat_start_date_check;
alter table public.mk_business_profiles add constraint mk_business_profiles_jdg_start_date_check check(jdg_start_date is null or jdg_start_date between '1900-01-01' and '2026-12-31');
alter table public.mk_business_profiles add constraint mk_business_profiles_vat_start_date_check check(vat_start_date is null or vat_start_date between '1900-01-01' and '2026-12-31');

create table public.mk_jdg_years(
 owner uuid not null references auth.users(id),year integer not null check(year in(2025,2026)),tax_form text not null check(tax_form in('scale','linear','lump_sum')),
 activity_start_date date not null check(activity_start_date between '1900-01-01' and '2026-12-31'),
 vat_opening_credit bigint not null default 0,other_income bigint not null default 0,scale_deductions bigint not null default 0,business_deductions bigint not null default 0,other_advances bigint not null default 0,scale_relief bigint not null default 0,previous_year_revenue bigint,legacy_vat_sales bigint,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),primary key(owner,year),
 check(least(vat_opening_credit,other_income,scale_deductions,business_deductions,other_advances,scale_relief,coalesce(previous_year_revenue,0),coalesce(legacy_vat_sales,0))>=0),
 check(greatest(vat_opening_credit,other_income,scale_deductions,business_deductions,other_advances,scale_relief,coalesce(previous_year_revenue,0),coalesce(legacy_vat_sales,0))<=99999999999),check(vat_opening_credit%100=0)
);
create table public.mk_jdg_months(
 owner uuid not null references auth.users(id),year integer not null check(year in(2025,2026)),month integer not null check(month between 1 and 12),
 social_deduction bigint not null default 0,health_paid bigint not null default 0,health_in_costs bigint not null default 0,other_deductions bigint not null default 0,pit_paid bigint not null default 0,vat_paid bigint not null default 0,vat_refund_requested bigint not null default 0,
 version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),primary key(owner,year,month),
 check(least(social_deduction,health_paid,health_in_costs,other_deductions,pit_paid,vat_paid,vat_refund_requested)>=0),
 check(greatest(social_deduction,health_paid,health_in_costs,other_deductions,pit_paid,vat_paid,vat_refund_requested)<=99999999999),check(health_in_costs<=health_paid),check(vat_refund_requested%100=0)
);
alter table public.mk_jdg_years enable row level security;
alter table public.mk_jdg_months enable row level security;
create policy mk_jdg_years_own on public.mk_jdg_years for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
create policy mk_jdg_months_own on public.mk_jdg_months for all to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
revoke all on public.mk_jdg_years,public.mk_jdg_months from public,anon;
grant select,insert,update on public.mk_jdg_years,public.mk_jdg_months to authenticated;

create function public.mk_jdg_tax_mutate(p_op_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare u uuid:=auth.uid();d jsonb:=p_data;fp text;previous text;v_year integer;v_month integer;v_version integer;expected integer;
begin
 if u is null then raise exception 'Zaloguj się.' using errcode='42501';end if;
 if not exists(select 1 from public.mk_business_profiles where owner=u and business_type='jdg' and configured) then raise exception 'Najpierw uzupełnij konfigurację JDG.';end if;
 if p_op_id is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>10000 then raise exception 'Nieprawidłowe dane.';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));fp:=md5(p_action||':'||d::text);
 select fingerprint into previous from public.mk_operations where owner=u and id=p_op_id;
 if found then if previous<>fp then raise exception 'Konflikt operacji.' using errcode='40001';end if;return jsonb_build_object('duplicate',true);end if;
 v_year:=(d->>'year')::integer;expected:=(d->>'version')::integer;
 if p_action='year' then
  select version into v_version from public.mk_jdg_years where owner=u and year=v_year;
  if coalesce(v_version,0)<>expected then raise exception 'Ustawienia roku zmieniły się na innym urządzeniu.' using errcode='40001';end if;
  insert into public.mk_jdg_years(owner,year,tax_form,activity_start_date,vat_opening_credit,other_income,scale_deductions,business_deductions,other_advances,scale_relief,previous_year_revenue,legacy_vat_sales)
  values(u,v_year,d->>'taxForm',(d->>'activityStartDate')::date,mk_private.money(d,'vatOpeningCredit'),mk_private.money(d,'otherIncome'),mk_private.money(d,'scaleDeductions'),mk_private.money(d,'businessDeductions'),mk_private.money(d,'otherAdvances'),mk_private.money(d,'scaleRelief'),case when jsonb_typeof(d->'previousYearRevenue')='null' then null else mk_private.money(d,'previousYearRevenue') end,case when jsonb_typeof(d->'legacyVatSales')='null' then null else mk_private.money(d,'legacyVatSales') end)
  on conflict(owner,year) do update set tax_form=excluded.tax_form,activity_start_date=excluded.activity_start_date,vat_opening_credit=excluded.vat_opening_credit,other_income=excluded.other_income,scale_deductions=excluded.scale_deductions,business_deductions=excluded.business_deductions,other_advances=excluded.other_advances,scale_relief=excluded.scale_relief,previous_year_revenue=excluded.previous_year_revenue,legacy_vat_sales=excluded.legacy_vat_sales,version=public.mk_jdg_years.version+1,updated_at=now();
 elsif p_action='month' then
  v_month:=(d->>'month')::integer;select version into v_version from public.mk_jdg_months where owner=u and year=v_year and month=v_month;
  if coalesce(v_version,0)<>expected then raise exception 'Dane miesiąca zmieniły się na innym urządzeniu.' using errcode='40001';end if;
  insert into public.mk_jdg_months(owner,year,month,social_deduction,health_paid,health_in_costs,other_deductions,pit_paid,vat_paid,vat_refund_requested)
  values(u,v_year,v_month,mk_private.money(d,'socialDeduction'),mk_private.money(d,'healthPaid'),mk_private.money(d,'healthInCosts'),mk_private.money(d,'otherDeductions'),mk_private.money(d,'pitPaid'),mk_private.money(d,'vatPaid'),mk_private.money(d,'vatRefundRequested'))
  on conflict(owner,year,month) do update set social_deduction=excluded.social_deduction,health_paid=excluded.health_paid,health_in_costs=excluded.health_in_costs,other_deductions=excluded.other_deductions,pit_paid=excluded.pit_paid,vat_paid=excluded.vat_paid,vat_refund_requested=excluded.vat_refund_requested,version=public.mk_jdg_months.version+1,updated_at=now();
 else raise exception 'Nieobsługiwana operacja.';
 end if;
 insert into public.mk_operations(id,owner,fingerprint) values(p_op_id,u,fp);
 insert into public.mk_audit(owner,action,details) values(u,case p_action when 'year' then 'Zapisano roczny profil podatkowy JDG' else 'Zapisano składki i wpłaty podatków' end,v_year::text||case when v_month is null then '' else '-'||lpad(v_month::text,2,'0') end);
 return jsonb_build_object('duplicate',false);
end $fn$;
create function public.mk_jdg_tax_state() returns jsonb language sql stable security invoker set search_path='' as $fn$
select jsonb_build_object(
 'years',coalesce((select jsonb_agg(jsonb_build_object('year',year,'taxForm',tax_form,'activityStartDate',activity_start_date,'vatOpeningCredit',vat_opening_credit,'otherIncome',other_income,'scaleDeductions',scale_deductions,'businessDeductions',business_deductions,'otherAdvances',other_advances,'scaleRelief',scale_relief,'previousYearRevenue',previous_year_revenue,'legacyVatSales',legacy_vat_sales,'version',version) order by year desc) from public.mk_jdg_years where owner=auth.uid()),'[]'),
 'months',coalesce((select jsonb_agg(jsonb_build_object('year',year,'month',month,'socialDeduction',social_deduction,'healthPaid',health_paid,'healthInCosts',health_in_costs,'otherDeductions',other_deductions,'pitPaid',pit_paid,'vatPaid',vat_paid,'vatRefundRequested',vat_refund_requested,'version',version) order by year,month) from public.mk_jdg_months where owner=auth.uid()),'[]'));
$fn$;
revoke all on function public.mk_jdg_tax_mutate(uuid,text,jsonb),public.mk_jdg_tax_state() from public,anon;
grant execute on function public.mk_jdg_tax_mutate(uuid,text,jsonb),public.mk_jdg_tax_state() to authenticated;
