import { useEffect, useState } from "react";
import type { InventoryOptionDto } from "@oil-agency/shared";
import { apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth-store";

type Line = { productId: string; batchId: string; countedPackQuantity: number; countedBaseQuantity: number };

export function StockCountPage() {
  const token = useAuthStore((state) => state.token)!;
  const [products, setProducts] = useState<InventoryOptionDto[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { void apiRequest<{ products: InventoryOptionDto[] }>("/inventory/options", {}, token).then((result) => setProducts(result.products)); }, [token]);
  function add() { const product = products.find((item) => !lines.some((line) => line.productId === item.id && !line.batchId)); if (product) setLines([...lines, { productId: product.id, batchId: "", countedPackQuantity: 0, countedBaseQuantity: 0 }]); }
  function update(index: number, patch: Partial<Line>) { setLines(lines.map((line, position) => position === index ? { ...line, ...patch } : line)); }
  async function post() { try { await apiRequest("/inventory/counts", { method: "POST", body: JSON.stringify({ notes: notes || undefined, lines: lines.map((line) => ({ ...line, batchId: line.batchId || null })) }) }, token); setLines([]); setNotes(""); setMessage("Physical count posted. Variances were recorded as stock movements."); } catch (error) { setMessage(error instanceof Error ? error.message : "Count failed."); } }
  return <section className="p-8">
    <div className="mb-7"><p className="mb-2 text-sm font-semibold text-primary">INVENTORY</p><h1 className="m-0 text-3xl font-bold">Physical stock count</h1><p className="mt-2 text-sm text-muted-foreground">Enter actual quantities. The system calculates and posts each variance.</p></div>
    {message && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">{message}</div>}
    <Card className="mb-5"><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>System stock</TableHead><TableHead>Counted outer packs</TableHead><TableHead>Individual items</TableHead><TableHead>Variance preview</TableHead><TableHead/></TableRow></TableHeader><TableBody>{lines.map((line, index) => {
      const product = products.find((item) => item.id === line.productId)!;
      const batch = product?.batches.find((item) => item.id === line.batchId);
      const expected = batch?.stockBaseQty ?? product?.unbatchedStockBaseQty ?? 0;
      const counted = line.countedPackQuantity * (product?.unitsPerPack ?? 1) + line.countedBaseQuantity;
      return <TableRow key={`${line.productId}:${line.batchId}:${index}`}><TableCell><select className="h-10 rounded border px-2" value={line.productId} onChange={(event) => update(index, { productId: event.target.value, batchId: "" })}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></TableCell><TableCell><select className="h-10 rounded border px-2" value={line.batchId} onChange={(event) => update(index, { batchId: event.target.value })}><option value="">Unbatched stock</option>{product?.batches.map((item) => <option value={item.id} key={item.id}>{item.batchNumber}</option>)}</select></TableCell><TableCell>{expected}</TableCell><TableCell><Input className="w-28" type="number" min="0" value={line.countedPackQuantity} onChange={(event) => update(index, { countedPackQuantity: Number(event.target.value) })}/></TableCell><TableCell><Input className="w-28" type="number" min="0" value={line.countedBaseQuantity} onChange={(event) => update(index, { countedBaseQuantity: Number(event.target.value) })}/></TableCell><TableCell className={counted - expected < 0 ? "text-red-700" : "text-emerald-700"}>{counted - expected > 0 ? "+" : ""}{counted - expected}</TableCell><TableCell><Button variant="ghost" onClick={() => setLines(lines.filter((_, position) => position !== index))}>Remove</Button></TableCell></TableRow>;
    })}</TableBody></Table><div className="p-4"><Button variant="outline" onClick={add}>Add count line</Button></div></Card>
    <Card className="max-w-3xl p-5"><label className="text-sm font-medium">Count notes<Textarea className="mt-2" value={notes} onChange={(event) => setNotes(event.target.value)}/></label><div className="mt-4 flex justify-end"><Button disabled={!lines.length} onClick={() => void post()}>Post count and variances</Button></div></Card>
  </section>;
}
