import type { BusinessSetting } from "@oil-agency/shared";
import { brandFooter, brandHeader, brandingCss, currentBusiness } from "@/features/printing/brand";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

const shell = (title: string, body: string, business: BusinessSetting = currentBusiness()) => `<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:8mm}${brandingCss}body{font:12px Arial,sans-serif;color:#111;margin:0}.urdu{font-family:"Jameel Noori Nastaleeq","Noto Nastaliq Urdu",serif;direction:rtl}h1{text-align:center;font-size:22px;margin:10px 0 18px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #ddd;text-align:left}.right{text-align:right}.summary{margin:16px 0 16px auto;width:280px}.row{display:flex;justify-content:space-between;gap:16px;padding:4px}.total{font-size:15px;font-weight:bold}.receipt-details p{margin:8px 0}.amount-box{border-top:1px solid #ddd;border-bottom:1px solid #ddd;margin-top:14px;padding:11px 5px}
</style></head><body>${brandHeader(business)}<h1>${escape(title)}</h1>${body}${brandFooter(business)}</body></html>`;

export async function printCustomerStatement(statement: { customer: { name: string; businessName: string | null; code: string }; previousBalance: string; currentBalance: string; overdue: string; entries: Array<{ id: string; occurredAt: string; entryType: string; notes: string | null; debit: string; credit: string; currentBalance: string }> }) {
  const business = currentBusiness();
  const rows = statement.entries.map((entry) => `<tr><td>${escape(new Date(entry.occurredAt).toLocaleDateString("en-PK", { timeZone: business.timezone }))}</td><td>${escape(entry.entryType)}</td><td>${escape(entry.notes ?? "")}</td><td class="right">${escape(entry.debit)}</td><td class="right">${escape(entry.credit)}</td><td class="right">${escape(entry.currentBalance)}</td></tr>`).join("");
  const html = shell(`Khata statement — ${statement.customer.name}`, `<p>${escape(statement.customer.businessName ?? "")} · ${escape(statement.customer.code)}</p><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><div class="row"><span>Previous balance</span><b>${escape(business.currency)} ${escape(statement.previousBalance)}</b></div><div class="row total"><span>Current balance</span><span>${escape(business.currency)} ${escape(statement.currentBalance)}</span></div><div class="row"><span>Overdue</span><span>${escape(business.currency)} ${escape(statement.overdue)}</span></div></div>`, business);
  if (!window.agencyDesktop?.printPdf) throw new Error("Printing is only available in the desktop app.");
  return window.agencyDesktop.printPdf(html, `statement-${statement.customer.code}`);
}

export async function printPaymentReceipt(payment: { receiptNumber: string; paidAt: string; amount: string; method: string; reference: string | null; customer: { name: string; businessName: string | null }; business?: BusinessSetting }, reprint = false) {
  const business = payment.business ?? currentBusiness();
  const customer = [payment.customer.name, payment.customer.businessName].filter(Boolean).join(" — ");
  const paidAt = new Date(payment.paidAt).toLocaleString("en-PK", { timeZone: business.timezone });
  const html = shell("Payment receipt", `<div class="receipt-details"><p><b>Receipt:</b> ${escape(payment.receiptNumber)}</p><p><b>Customer:</b> ${escape(customer)}</p><p><b>Date:</b> ${escape(paidAt)}</p><p><b>Method:</b> ${escape(payment.method)}</p><p><b>Reference:</b> ${escape(payment.reference ?? "—")}</p></div><div class="row total amount-box"><span>Amount received</span><span>${escape(business.currency)} ${escape(payment.amount)}</span></div>`, business);
  if (!window.agencyDesktop?.printThermal) throw new Error("Printing is only available in the desktop app.");
  return window.agencyDesktop.printThermal(html);
}
