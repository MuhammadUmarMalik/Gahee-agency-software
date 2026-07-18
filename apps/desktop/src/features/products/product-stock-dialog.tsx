import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowDown, ArrowRightLeft, ArrowUp, History, LoaderCircle, PackageX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import type { InventoryStockDto, ProductDto } from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

const actions = ["ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE", "EXPIRY"] as const;
type StockAction = (typeof actions)[number];

const actionSchema = z.object({
  action: z.enum(actions),
  batchId: z.string(),
  packQuantity: z.number().int().min(0).max(2_000_000_000),
  baseQuantity: z.number().int().min(0).max(2_000_000_000),
  reason: z.string().trim().min(3, "Enter a short reason.").max(500),
}).refine((value) => value.packQuantity > 0 || value.baseQuantity > 0, {
  message: "Enter a quantity greater than zero.",
  path: ["baseQuantity"],
});

type ActionForm = z.infer<typeof actionSchema>;
const actionDetails: Record<StockAction, { label: string; help: string; icon: typeof ArrowUp; tone: string }> = {
  ADJUSTMENT_IN: { label: "Add stock", help: "Found stock or a correction", icon: ArrowUp, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  ADJUSTMENT_OUT: { label: "Remove stock", help: "Shortage or a correction", icon: ArrowDown, tone: "text-amber-700 bg-amber-50 border-amber-200" },
  DAMAGE: { label: "Mark damaged", help: "Move unusable stock out", icon: PackageX, tone: "text-red-700 bg-red-50 border-red-200" },
  EXPIRY: { label: "Mark expired", help: "Write off expired stock", icon: AlertTriangle, tone: "text-violet-700 bg-violet-50 border-violet-200" },
};

interface Props {
  product: ProductDto;
  stock: InventoryStockDto;
  token: string;
  onClose(): void;
  onPosted(): Promise<void>;
}

export function ProductStockDialog({ product, stock, token, onClose, onPosted }: Props) {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState("");
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<ActionForm>({
    resolver: zodResolver(actionSchema),
    defaultValues: { action: "ADJUSTMENT_IN", batchId: "", packQuantity: 0, baseQuantity: 0, reason: "" },
  });
  const action = watch("action");
  const unbatchedStock = Math.max(0, stock.currentBaseQty - stock.batches.reduce((sum, batch) => sum + batch.stockBaseQty, 0));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function submit(values: ActionForm) {
    setSubmitError("");
    try {
      const common = { productId: product.id, batchId: values.batchId || null, packQuantity: values.packQuantity, baseQuantity: values.baseQuantity, reason: values.reason };
      if (values.action === "DAMAGE" || values.action === "EXPIRY") {
        await apiRequest("/inventory/write-offs", { method: "POST", body: JSON.stringify({ ...common, type: values.action }) }, token);
      } else {
        await apiRequest("/inventory/adjustments", { method: "POST", body: JSON.stringify({ ...common, movementType: values.action }) }, token);
      }
      await onPosted();
      onClose();
    } catch (error) { setSubmitError(error instanceof ApiError ? error.message : "Could not save the stock change."); }
  }

  const selected = actionDetails[action];
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-6 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="stock-dialog-title" className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl border bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-6 py-5">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[.16em] text-primary">Product stock</p><h2 id="stock-dialog-title" className="m-0 text-2xl font-bold">{product.name}</h2><p className="mb-0 mt-1 text-sm text-muted-foreground">{product.sku} · 1 {product.packUnit.symbol ?? product.packUnit.name} = {product.unitsPerPack} {product.baseUnit.symbol ?? product.baseUnit.name}</p></div>
        <button aria-label="Close" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={onClose}><X size={20}/></button>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-6 p-6">
        <div>
          <div className="mb-5 grid grid-cols-4 gap-2">
            {(Object.entries(actionDetails) as Array<[StockAction, typeof selected]>).map(([value, details]) => {
              const Icon = details.icon;
              return <button type="button" key={value} className={cn("rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm", action === value ? details.tone : "border-slate-200 bg-white text-slate-600")} onClick={() => reset({ action: value, batchId: "", packQuantity: 0, baseQuantity: 0, reason: "" })}>
                <Icon size={19}/><strong className="mt-2 block text-sm">{details.label}</strong><span className="mt-0.5 block text-[11px] leading-4 opacity-80">{details.help}</span>
              </button>;
            })}
          </div>

          <form onSubmit={handleSubmit(submit)} className="rounded-xl border bg-slate-50/70 p-5">
            <input type="hidden" {...register("action")}/>
            <div className="mb-4"><h3 className="m-0 text-lg font-bold">{selected.label}</h3><p className="mb-0 mt-1 text-sm text-muted-foreground">Every change is saved in stock history. Stock is never edited silently.</p></div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Batch (optional)">
                <select className="h-11 w-full rounded-lg border bg-white px-3 text-sm" {...register("batchId")}>
                  <option value="">General / unbatched stock · {unbatchedStock} {stock.baseUnit}</option>
                  {stock.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batchNumber} · {batch.stockBaseQty} {stock.baseUnit}{batch.isExpired ? " · expired" : ""}</option>)}
                </select>
              </Field>
              <div/>
              <Field label={`${product.packUnit.name} quantity`} error={errors.packQuantity?.message}>
                <Input type="number" min="0" {...register("packQuantity", { valueAsNumber: true })}/>
              </Field>
              <Field label={`${product.baseUnit.name} quantity`} error={errors.baseQuantity?.message}>
                <Input type="number" min="0" {...register("baseQuantity", { valueAsNumber: true })}/>
              </Field>
              <Field label="Reason" error={errors.reason?.message} className="col-span-2">
                <Textarea placeholder={action === "DAMAGE" ? "For example: leaking item" : action === "EXPIRY" ? "For example: batch expired during storage" : "Why is this correction needed?"} {...register("reason")}/>
              </Field>
            </div>
            {submitError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{submitError}</p>}
            <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="mr-2 animate-spin" size={17}/>}Save stock change</Button></div>
          </form>
        </div>

        <aside>
          <div className="grid grid-cols-2 gap-2">
            <StockMetric label="Current" value={stock.currentBaseQty} unit={stock.baseUnit}/><StockMetric label="Available" value={stock.availableBaseQty} unit={stock.baseUnit} good/>
            <StockMetric label="Expired held" value={stock.expiredBaseQty} unit={stock.baseUnit} warning/><StockMetric label="Returned" value={stock.returnedBaseQty} unit={stock.baseUnit}/>
          </div>
          <div className="mt-4 rounded-xl border p-4"><h3 className="m-0 text-sm font-bold">Other actions</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Customer returns must use the original invoice so payment and khata stay correct.</p>
            <Button className="mt-2 w-full justify-start" variant="outline" onClick={() => { onClose(); navigate("/sales-returns"); }}><ArrowRightLeft className="mr-2" size={17}/>Customer return</Button>
            <Button className="mt-2 w-full justify-start" variant="ghost" onClick={() => { onClose(); navigate(`/inventory/movements?productId=${product.id}`); }}><History className="mr-2" size={17}/>View stock history</Button>
          </div>
          {stock.batches.length > 0 && <div className="mt-4 rounded-xl border p-4"><h3 className="m-0 text-sm font-bold">Batches</h3><div className="mt-3 space-y-2">{stock.batches.map((batch) => <div key={batch.id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate">{batch.batchNumber}</span><span className={cn("shrink-0 font-semibold", batch.isExpired && "text-red-700")}>{batch.stockBaseQty} {stock.baseUnit}{batch.isExpired ? " · Expired" : ""}</span></div>)}</div></div>}
        </aside>
      </div>
    </div>
  </div>;
}

function Field({ label, error, className, children }: { label: string; error?: string | undefined; className?: string | undefined; children: React.ReactNode }) {
  return <label className={cn("text-sm font-semibold", className)}>{label}<div className="mt-2">{children}</div>{error && <span className="mt-1 block text-xs text-red-700">{error}</span>}</label>;
}
function StockMetric({ label, value, unit, good, warning }: { label: string; value: number; unit: string; good?: boolean; warning?: boolean }) {
  return <div className={cn("rounded-xl border p-3", good && "border-emerald-200 bg-emerald-50", warning && value > 0 && "border-red-200 bg-red-50")}><span className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span><strong className="mt-1 block text-lg">{value}</strong><span className="text-[11px] text-muted-foreground">{unit}</span></div>;
}
