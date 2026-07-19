import { ArrowLeft, FileText, LoaderCircle, Printer, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Invoice, type SaleInvoice } from "@/features/pos/invoice";
import { printA4, printPdf, printThermal } from "@/features/pos/print-service";
import { useAuthStore } from "@/stores/auth-store";

type DetailedSale = SaleInvoice & {
  paymentStatus: string;
  saleType: string;
  status: string;
};

export function SaleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token)!;
  const [sale, setSale] = useState<DetailedSale | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    void apiRequest<{ sale: DetailedSale }>(`/pos/sales/${id}`, {}, token)
      .then((result) => { setSale(result.sale); setMessage(""); })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  async function print(action: (value: SaleInvoice, reprint: boolean) => Promise<unknown>) {
    if (!sale) return;
    setMessage("");
    try { await action(sale, true); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Printing failed."); }
  }

  if (loading) return <div className="grid h-full place-items-center"><LoaderCircle className="animate-spin text-primary"/></div>;
  if (!sale) return <section className="p-8"><Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="mr-2"/>Back</Button><div className="mt-5 rounded-xl border bg-white p-4 text-red-700">{message || "Sale was not found."}</div></section>;

  return <section className="p-8">
    <div className="mb-5 flex items-start justify-between">
      <div><Button variant="ghost" className="-ml-3 mb-2" onClick={() => navigate(-1)}><ArrowLeft className="mr-2"/>Back</Button><p className="mb-1 text-sm font-semibold text-primary">SALES INVOICE</p><h1 className="m-0 text-3xl font-bold">{sale.invoiceNumber}</h1><p className="mt-2 text-sm text-muted-foreground">{sale.saleType.replaceAll("_", " ")} · {sale.paymentStatus.replaceAll("_", " ")} · {sale.status.replaceAll("_", " ")}</p></div>
      <div className="flex gap-2 pt-10"><Button variant="outline" onClick={() => void print(printPdf)}><FileText className="mr-2" size={17}/>Save PDF</Button><Button variant="outline" onClick={() => void print(printThermal)}><ReceiptText className="mr-2" size={17}/>80mm print</Button><Button onClick={() => void print(printA4)}><Printer className="mr-2" size={17}/>Print A4</Button></div>
    </div>
    {message && <div className="mb-4 rounded-lg border bg-slate-50 p-3 text-sm">{message}</div>}
    <Card className="mx-auto max-w-5xl overflow-hidden"><Invoice sale={sale}/></Card>
  </section>;
}
