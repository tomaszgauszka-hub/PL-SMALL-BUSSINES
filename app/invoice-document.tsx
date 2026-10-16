import Brand from "./brand";
import { calculateInvoiceLine } from "../lib/business";
import type { Invoice } from "../lib/invoices";
import { dateLabel, money } from "../lib/domain";
export default function InvoiceDocument({ invoice, demo = false }: { invoice: Invoice; demo?: boolean }) {
  const sale = invoice.direction === "sale";
  const seller = sale ? invoice.seller : { name: invoice.partyName, address: invoice.partyAddress, nip: invoice.partyNip };
  const buyer = sale ? { name: invoice.partyName, address: invoice.partyAddress, nip: invoice.partyNip } : invoice.seller;
  const rates = [...new Set(invoice.lines.map(line => line.vatRate))].map(rate => {
    const totals = invoice.lines.filter(line => line.vatRate === rate).reduce((sum, line) => { const value = calculateInvoiceLine(line); return { net: sum.net + value.net, vat: sum.vat + value.vat }; }, { net: 0, vat: 0 });
    return { rate, ...totals };
  });
  return <article className="invoice-document">
    <header className="invoice-print-header"><Brand /><div><p>{!sale ? "Zapis faktury zakupu" : invoice.kind === "correction" ? "Faktura korygująca" : "Faktura"}</p><h1>{invoice.number || "Szkic — bez numeru"}</h1></div></header>
    {demo && <div className="invoice-watermark">Dane demonstracyjne — dokument przykładowy</div>}{invoice.status === "draft" && <div className="invoice-watermark">SZKIC — dokument niewystawiony</div>}
    <div className="invoice-dates"><span>Data wystawienia<strong>{dateLabel(invoice.issueDate)}</strong></span><span>Data dostawy / wykonania<strong>{dateLabel(invoice.saleDate)}</strong></span><span>Termin płatności<strong>{dateLabel(invoice.dueDate)}</strong></span></div>
    <div className="invoice-parties"><section><h2>Sprzedawca</h2><strong>{seller?.name}</strong><p>{seller?.address}</p>{seller?.nip && <p>NIP: {seller.nip}</p>}</section><section><h2>Nabywca</h2><strong>{buyer?.name}</strong><p>{buyer?.address}</p>{buyer?.nip && <p>NIP: {buyer.nip}</p>}</section></div>
    {invoice.source && <div className="invoice-source"><strong>Do faktury {invoice.source.number} z {dateLabel(invoice.source.issueDate)}</strong><p>Przyczyna korekty: {invoice.reason}</p><p>Poniższe pozycje przedstawiają zmianę wartości dokumentu.</p></div>}
    <table className="invoice-lines"><thead><tr><th>Lp.</th><th>Produkt / usługa</th><th>Ilość / j.m.</th><th>Cena netto</th><th>Rabat</th><th>Netto</th><th>VAT</th><th>Kwota VAT</th><th>Brutto</th></tr></thead><tbody>{invoice.lines.map((line, index) => { const value = calculateInvoiceLine(line); return <tr key={index}><td>{index + 1}</td><td>{line.name}</td><td>{(line.quantityMilli / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 3 })} {line.unit}</td><td>{money(line.unitPrice)}</td><td>{line.discountBps ? `${(line.discountBps / 100).toLocaleString("pl-PL")}%` : "—"}</td><td>{money(value.net)}</td><td>{line.vatRate}{["zw", "np"].includes(line.vatRate) ? "" : "%"}</td><td>{money(value.vat)}</td><td>{money(value.gross)}</td></tr>; })}</tbody></table>
    <div className="invoice-totals"><table><thead><tr><th>Stawka</th><th>Netto</th><th>VAT</th><th>Brutto</th></tr></thead><tbody>{rates.map(rate => <tr key={rate.rate}><td>{rate.rate}{["zw", "np"].includes(rate.rate) ? "" : "%"}</td><td>{money(rate.net)}</td><td>{money(rate.vat)}</td><td>{money(rate.net + rate.vat)}</td></tr>)}<tr className="invoice-total-row"><th>Razem</th><td>{money(invoice.net)}</td><td>{money(invoice.vat)}</td><td>{money(invoice.gross)}</td></tr></tbody></table></div>
    {invoice.source && <div className="invoice-correction-summary"><p>Przed tą korektą: <strong>{money(invoice.source.gross)}</strong></p><p>Zmiana brutto: <strong>{money(invoice.gross)}</strong></p><p>Po tej korekcie: <strong>{money(invoice.source.gross + invoice.gross)}</strong></p></div>}
    <div className="invoice-payment-note"><strong>{invoice.gross < 0 ? "Kwota zmniejszenia / zwrotu" : "Kwota dokumentu"}: {money(Math.abs(invoice.gross))}</strong><p>Sposób płatności: {invoice.method}</p>{invoice.paymentAccount && <p>Rachunek: {invoice.paymentAccount}</p>}{invoice.splitPayment && <p><strong>Mechanizm podzielonej płatności</strong></p>}</div>
    {invoice.exemptionBasis && invoice.lines.some(line => line.vatRate === "zw") && <p>Podstawa zwolnienia z VAT: {invoice.exemptionBasis}</p>}{invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}
    {!sale && <p className="invoice-source">Wydruk danych z ewidencji zakupów. Oryginalną fakturę dostawcy przechowuj w załącznikach.</p>}
    <footer>ewidora. · Mały biznes. Jasne finanse.</footer>
  </article>;
}
