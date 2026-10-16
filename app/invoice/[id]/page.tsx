import { redirect, notFound } from "next/navigation";
import { currentUser, serverSupabase } from "../../../lib/supabase/server";
import type { Invoice } from "../../../lib/invoices";
import InvoiceDocument from "../../invoice-document";
import PrintButton from "./print-button";
export const dynamic = "force-dynamic";
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser(); if (!user) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await serverSupabase(); const { data: row, error } = await db.from("mk_invoices").select("*").eq("id", id).eq("owner", user.id).maybeSingle();
  if (error || !row) notFound();
  const invoice = { ...row.data, id: row.id, number: row.number, status: row.status, direction: row.direction, kind: row.kind, net: row.net, vat: row.vat, gross: row.gross, version: row.version } as Invoice;
  return <main className="invoice-page"><div className="invoice-page-actions no-print"><a className="btn ghost" href="/">Wróć do aplikacji</a><PrintButton /></div><InvoiceDocument invoice={invoice} /></main>;
}
