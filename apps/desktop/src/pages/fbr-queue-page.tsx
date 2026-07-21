import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CloudUpload, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";

const tabs = ["ALL", "PENDING", "SUBMITTED", "FAILED"] as const;
type Tab = (typeof tabs)[number];

export function FbrQueuePage() {
  const authToken = useAuthStore((state) => state.token)!;
  const userId = useAuthStore((state) => state.user?.id);
  const [rows, setRows] = useState<FbrQueueRow[]>([]);
  const [tab, setTab] = useState<Tab>("ALL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try { setRows(await window.agencyDesktop?.listFbrQueue(authToken) ?? []); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the FBR queue."); }
    finally { setLoading(false); }
  }, [authToken]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 10_000); return () => clearInterval(timer); }, [load]);
  const visible = useMemo(() => rows.filter((row) => tab === "ALL" || (tab === "SUBMITTED" ? row.sale?.fbrStatus === "submitted" : tab === "FAILED" ? ["failed", "requires_review"].includes(row.sale?.fbrStatus ?? "") || ["FAILED", "REQUIRES_REVIEW"].includes(row.status) : row.sale?.fbrStatus === "pending" || row.sale?.fbrStatus === "submitting" || ["PENDING", "PROCESSING"].includes(row.status))), [rows, tab]);
  async function sync() { setLoading(true); setMessage(""); try { const result = await window.agencyDesktop?.syncFbrNow(authToken); setMessage(`Processed ${result?.processed ?? 0} queued invoice(s).`); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "FBR synchronization failed."); } finally { setLoading(false); } }
  async function retry(id: string) { try { await window.agencyDesktop?.retryFbrJob(authToken, id); setMessage("Invoice queued for another validation attempt."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not retry the invoice."); } }
  async function validate(saleId: string) { if (!userId) return; try { await window.agencyDesktop?.validateFbrSale(authToken, saleId, userId); setMessage("FBR validation completed."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "FBR validation failed."); await load(); } }
  async function submit(saleId: string) { if (!userId) return; try { await window.agencyDesktop?.submitFbrSale(authToken, saleId, userId); setMessage("FBR submission completed."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "FBR submission failed."); await load(); } }
  return <section className="p-8"><div className="mb-6 flex items-end justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">Offline synchronization</p><h1 className="m-0 text-3xl font-bold">FBR invoice queue</h1><p className="mt-2 text-sm text-muted-foreground">Invoices are saved locally first, validated, and submitted one at a time.</p></div><Button onClick={() => void sync()} disabled={loading}>{loading ? <LoaderCircle className="mr-2 animate-spin"/> : <CloudUpload className="mr-2"/>}Sync now</Button></div>
    {message && <div className="mb-4 rounded-xl border bg-white p-3 text-sm">{message}</div>}
    <div className="mb-4 flex gap-2">{tabs.map((value) => <Button key={value} variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}>{value.replace("SUBMITTED", "Submitted").replace("PENDING", "Pending").replace("FAILED", "Failed / review").replace("ALL", "All")}</Button>)}</div>
    <Card className="overflow-hidden"><div className="grid grid-cols-[1.1fr_1fr_.7fr_1.5fr_auto] gap-4 border-b bg-slate-50 px-5 py-3 text-xs font-bold uppercase text-slate-500"><span>Invoice</span><span>FBR status</span><span>Attempts</span><span>Last result</span><span>Action</span></div>{visible.length ? visible.map((row) => <div key={row.id} className="grid grid-cols-[1.1fr_1fr_.7fr_1.5fr_auto] items-center gap-4 border-b px-5 py-4 last:border-0"><div><strong className="block">{row.sale?.invoiceNumber ?? "Missing sale"}</strong><span className="text-xs text-muted-foreground">{row.sale ? new Date(row.sale.soldAt).toLocaleString() : new Date(row.createdAt).toLocaleString()}</span></div><div className="flex items-center gap-2">{row.sale?.fbrStatus === "submitted" ? <CheckCircle2 className="text-emerald-600" size={17}/> : row.sale?.fbrStatus === "requires_review" || row.status === "REQUIRES_REVIEW" ? <TriangleAlert className="text-amber-600" size={17}/> : <RefreshCw className={cn("text-slate-500", (row.sale?.fbrStatus === "submitting" || row.status === "PROCESSING") && "animate-spin")} size={16}/>}<span className="text-sm font-semibold">{(row.sale?.fbrStatus ?? row.status).replaceAll("_", " ")}</span></div><span className="text-sm">{row.attempts}</span><span className="line-clamp-2 text-xs text-muted-foreground">{row.sale?.fbrInvoiceNumber ?? row.lastError ?? row.sale?.fbrError ?? "Waiting for network"}</span><div className="flex gap-2">{row.sale && row.sale.fbrStatus !== "submitted" && row.sale.fbrStatus !== "submitting" && <><Button size="sm" variant="outline" onClick={() => void validate(row.sale!.id)}>Validate</Button><Button size="sm" onClick={() => void submit(row.sale!.id)}>Submit</Button></>}{row.sale?.fbrStatus !== "submitted" && row.status !== "PROCESSING" && <Button size="sm" variant="outline" onClick={() => void retry(row.id)}>Retry</Button>}</div></div>) : <div className="grid h-52 place-items-center text-sm text-muted-foreground">No invoices in this queue.</div>}</Card>
  </section>;
}
