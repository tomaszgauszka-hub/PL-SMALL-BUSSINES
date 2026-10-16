-- Restore the intended grants regardless of a project's default privileges.
-- This touches Ewidora objects only; shared TaskOn objects are unchanged.
do $fn$ declare t text;begin
 foreach t in array array['mk_products','mk_business_profiles','mk_business_events','mk_invoice_payments','mk_invoice_attachments','mk_invoice_sequences','mk_invoices','mk_jdg_months','mk_jdg_years','mk_inventories'] loop
  execute format('revoke all on table public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on table public.%I to authenticated',t);
 end loop;
end $fn$;
grant update on table public.mk_products,public.mk_business_profiles,public.mk_invoice_sequences,public.mk_invoices,public.mk_jdg_months,public.mk_jdg_years,public.mk_inventories to authenticated;
