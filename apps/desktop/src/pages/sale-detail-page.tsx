import { ArrowLeft, FileText, LoaderCircle, Pencil, Printer, ReceiptText, ShoppingCart, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PERMISSIONS } from "@oil-agency/shared";
import { apiRequest } from "@/api/client";
import { useAppDialog } from "@/components/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Invoice, type SaleInvoice } from "@/features/pos/invoice";
import { printA4, printPdf, printThermal } from "@/features/pos/print-service";
import { useAuthStore } from "@/stores/auth-store";

type DetailedSale = SaleInvoice & { paymentStatus: string; saleType: string; status: string };

export function SaleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const token = useAuthStore((state) => state.token)!;
  const permissions = useAuthStore((state) => state.user?.permissions ?? []);
  const canManageAccounting = permissions.includes(PERMISSIONS.ACCOUNTING_MANAGE);
  const [sale, setSale] = useState<DetailedSale | null>(null);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await apiRequest<{ sale: DetailedSale }>(`/pos/sales/${id}`, {}, token);
      setSale(result.sale); setNotes(result.sale.notes ?? ""); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sale could not be loaded."); }
    finally { setLoading(false); }
  }, [id, token]);
  useEffect(() => { void load(); }, [load]);

  async function print(action: (value: SaleInvoice, reprint: boolean) => Promise<unknown>) {
    if (!sale) return;
    setMessage("");
    try { await action(sale, true); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Printing failed."); }
  }

  async function saveNotes() {
    if (!sale) return;
    try {
      const result = await apiRequest<{ sale: DetailedSale }>(`/pos/sales/${sale.id}`, { method: "PATCH", body: JSON.stringify({ notes: notes.trim() || null }) }, token);
      setSale(result.sale); setNotes(result.sale.notes ?? ""); setEditing(false); setMessage("Invoice notes updated. The change was recorded in the audit log.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invoice notes could not be updated."); }
  }

  async function remove() {
    if (!sale) return;
    const reason = await dialog.prompt({ title: "Delete this sale?", description: "For accounting safety, this will void the invoice and reverse its stock, payments, cashbook, khata, and journal entries. Enter a reason.", confirmLabel: "Void sale", destructive: true, placeholder: "Reason for voiding this invoice" });
    if (!reason) return;
    try {
      await apiRequest(`/pos/sales/${sale.id}`, { method: "DELETE", body: JSON.stringify({ reason }) }, token);
      await load(); setMessage("Sale voided successfully. All related records were reversed and retained for audit.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sale could not be voided."); }
  }

  if (loading) return <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-primary"/></div>;
  if (!sale) return <section className="p-8"><Button variant="ghost" onClick={() => navigate("/sales")}><ArrowLeft className="mr-2"/>Sales</Button><div className="mt-5 rounded-xl border bg-white p-4 text-red-700">{message || "Sale was not found."}</div></section>;

  return <section className="p-8">
    <div className="mb-5 flex items-start justify-between gap-6">
      <div><Button variant="ghost" className="-ml-3 mb-2" onClick={() => navigate("/sales")}><ArrowLeft className="mr-2"/>Sales management</Button><p className="mb-1 text-sm font-semibold text-primary">SALES INVOICE</p><h1 className="m-0 text-3xl font-bold">{sale.invoiceNumber}</h1><p className="mt-2 text-sm text-muted-foreground">{sale.saleType.replaceAll("_", " ")} · {sale.paymentStatus.replaceAll("_", " ")} · {sale.status.replaceAll("_", " ")}</p></div>
      <div className="flex max-w-3xl flex-wrap justify-end gap-2 pt-10">
        <Button variant="outline" onClick={() => navigate("/pos")}><ShoppingCart className="mr-2" size={17}/>New sale</Button>
        {canManageAccounting && <Button variant="outline" onClick={() => setEditing((value) => !value)}><Pencil className="mr-2" size={17}/>Edit notes</Button>}
        {canManageAccounting && sale.status === "POSTED" && <Button variant="destructive" onClick={() => void remove()}><Trash2 className="mr-2" size={17}/>Delete / void</Button>}
        <Button variant="outline" onClick={() => void print(printPdf)}><FileText className="mr-2" size={17}/>Save PDF</Button><Button variant="outline" onClick={() => void print(printThermal)}><ReceiptText className="mr-2" size={17}/>80mm print</Button><Button onClick={() => void print(printA4)}><Printer className="mr-2" size={17}/>Print A4</Button>
      </div>
    </div>
    {message && <div className="mb-4 rounded-xl border bg-slate-50 p-3 text-sm">{message}</div>}
    {sale.status === "VOIDED" && <div className="mb-4 rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm"><strong>Voided invoice.</strong> It remains visible because posted financial records are never permanently deleted.</div>}
    {editing && <Card className="mx-auto mb-5 max-w-5xl p-5"><div className="mb-3"><h2 className="m-0 text-lg">Edit invoice notes</h2><p className="mb-0 mt-1 text-sm text-muted-foreground">Financial amounts, products, stock, and payments are immutable after posting. Void and recreate the invoice if those values are wrong.</p></div><Textarea rows={4} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional sale notes"/><div className="mt-3 flex justify-end gap-2"><Button variant="outline" onClick={() => { setNotes(sale.notes ?? ""); setEditing(false); }}>Cancel</Button><Button onClick={() => void saveNotes()}>Save notes</Button></div></Card>}
    <Card className="mx-auto max-w-5xl overflow-hidden"><Invoice sale={sale} reprint={sale.status === "VOIDED"}/></Card>
  </section>;
}
