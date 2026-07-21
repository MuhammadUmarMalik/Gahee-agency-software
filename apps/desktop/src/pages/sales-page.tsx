import { Eye, LoaderCircle, Plus, ReceiptText, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/stores/auth-store";

type SaleRow = {
  id: string; invoiceNumber: string; soldAt: string; saleType: string; status: string; paymentStatus: string;
  total: string; paid: string; due: string; fbrStatus: string; fbrInvoiceNumber: string | null; notes: string | null;
  customer: { id: string; code: string; name: string; businessName: string | null; phone: string | null } | null;
  createdBy: { displayName: string }; _count: { items: number; payments: number; returns: number };
};
type SaleListResponse = { sales: SaleRow[]; pagination: { page: number; pageSize: number; total: number; pages: number } };

export function SalesPage() {
  const token = useAuthStore((state) => state.token)!;
  const navigate = useNavigate();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, pages: 1 });
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams({ search, status, page: String(page), pageSize: "50" });
    if (paymentStatus) query.set("paymentStatus", paymentStatus);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void apiRequest<SaleListResponse>(`/pos/sales?${query}`, {}, token)
        .then((result) => { setRows(result.sales); setPagination(result.pagination); setError(""); })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [from, page, paymentStatus, search, status, to, token]);

  function resetPage(value: (next: string) => void, next: string) { setPage(1); value(next); }

  return <section className="p-8">
    <div className="mb-7 flex items-start justify-between">
      <div><p className="mb-2 text-sm font-semibold text-primary">SALES</p><h1 className="m-0 text-3xl font-bold">Sales management</h1><p className="mt-2 text-sm text-muted-foreground">Find, review, print, update notes, or safely void an invoice.</p></div>
      <Button onClick={() => navigate("/pos")}><Plus className="mr-2" size={18}/>New sale</Button>
    </div>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <Card className="mb-5 p-4">
      <div className="grid grid-cols-[minmax(240px,1fr)_180px_160px_160px_160px] gap-3">
        <label className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={18}/><Input className="pl-10" placeholder="Invoice, customer, business, or phone" value={search} onChange={(event) => resetPage(setSearch, event.target.value)}/></label>
        <select className="h-11 rounded-xl border bg-white px-3" value={paymentStatus} onChange={(event) => resetPage(setPaymentStatus, event.target.value)}><option value="">All payments</option><option value="PAID">Paid</option><option value="PARTIAL">Partially paid</option><option value="UNPAID">Credit / unpaid</option></select>
        <select className="h-11 rounded-xl border bg-white px-3" value={status} onChange={(event) => resetPage(setStatus, event.target.value)}><option value="ALL">All invoices</option><option value="POSTED">Posted</option><option value="VOIDED">Voided</option></select>
        <Input aria-label="From date" title="From date" type="date" value={from} onChange={(event) => resetPage(setFrom, event.target.value)}/>
        <Input aria-label="To date" title="To date" type="date" value={to} onChange={(event) => resetPage(setTo, event.target.value)}/>
      </div>
    </Card>
    <Card className="overflow-hidden">
      {loading ? <div className="grid h-64 place-items-center"><LoaderCircle className="animate-spin text-primary"/></div> : rows.length ? <Table>
        <TableHeader><TableRow><TableHead>Date / invoice</TableHead><TableHead>Customer</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Due</TableHead><TableHead>Payment</TableHead><TableHead>Invoice status</TableHead><TableHead>Cashier</TableHead><TableHead/></TableRow></TableHeader>
        <TableBody>{rows.map((sale) => <TableRow key={sale.id} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => navigate(`/sales/${sale.id}`)}>
          <TableCell><strong className="block">{sale.invoiceNumber}</strong><span className="text-xs text-muted-foreground">{new Date(sale.soldAt).toLocaleString("en-PK")}</span></TableCell>
          <TableCell><span className="block font-medium">{sale.customer?.businessName || sale.customer?.name || "Walk-in customer"}</span><span className="text-xs text-muted-foreground">{sale.saleType}</span></TableCell>
          <TableCell>{sale._count.items}</TableCell><TableCell className="font-semibold">PKR {sale.total}</TableCell><TableCell>PKR {sale.paid}</TableCell><TableCell className={Number(sale.due) > 0 ? "font-semibold text-red-700" : ""}>PKR {sale.due}</TableCell>
          <TableCell><StatusBadge value={sale.paymentStatus}/></TableCell><TableCell><StatusBadge value={sale.status}/></TableCell><TableCell>{sale.createdBy.displayName}</TableCell>
          <TableCell><Button aria-label={`View ${sale.invoiceNumber}`} size="sm" variant="ghost"><Eye size={16}/></Button></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <div className="grid h-64 place-items-center text-center text-muted-foreground"><div><ReceiptText className="mx-auto mb-3"/><p className="m-0 font-medium">No sales match these filters.</p><p className="mb-0 mt-1 text-sm">Create a sale in POS or clear the filters.</p></div></div>}
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground"><span>{pagination.total} invoice{pagination.total === 1 ? "" : "s"}</span><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {pagination.page} of {pagination.pages}</span><Button size="sm" variant="outline" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
    </Card>
  </section>;
}

function StatusBadge({ value }: { value: string }) {
  const color = value === "PAID" || value === "POSTED" ? "bg-emerald-50 text-emerald-700" : value === "PARTIAL" ? "bg-amber-50 text-amber-700" : value === "VOIDED" ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${color}`}>{value.replaceAll("_", " ")}</span>;
}
