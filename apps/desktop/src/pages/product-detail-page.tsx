import { ArrowLeft, Boxes, LoaderCircle, Pencil, TrendingDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PERMISSIONS, type InventoryStockDto, type ProductDto } from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuthStore } from "@/stores/auth-store";

export function ProductDetailPage() {
  const { id } = useParams();
  const token = useAuthStore((state) => state.token)!;
  const user = useAuthStore((state) => state.user)!;
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [stock, setStock] = useState<InventoryStockDto | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const canViewStock = user.permissions.includes(PERMISSIONS.INVENTORY_VIEW);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await apiRequest<{ product: ProductDto }>(`/products/${id}`, {}, token);
      setProduct(result.product);
      if (canViewStock) {
        const inventory = await apiRequest<{ stock: InventoryStockDto[] }>(
          `/inventory/stock?includeInactive=true&search=${encodeURIComponent(result.product.sku)}`,
          {},
          token,
        );
        setStock(inventory.stock.find((row) => row.productId === id) ?? null);
      }
      setMessage("");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not load product details.");
    } finally {
      setLoading(false);
    }
  }, [canViewStock, id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="grid h-screen place-items-center"><LoaderCircle className="animate-spin" /></div>;
  if (!product) return <section className="p-8"><Button variant="ghost" onClick={() => navigate("/products")}><ArrowLeft className="mr-2" size={18} />Back to products</Button><div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message || "Product was not found."}</div></section>;

  const available = stock?.availableBaseQty ?? product.stockOnHandBaseQty;
  const packs = Math.floor(available / product.unitsPerPack);
  const loose = available % product.unitsPerPack;
  const size = product.sizeValue && product.sizeUnit ? `${product.sizeValue} ${sizeLabel(product.sizeUnit)}` : "Not specified";

  return <section className="p-8">
    <Button variant="ghost" className="mb-5 -ml-3" onClick={() => navigate("/products")}><ArrowLeft className="mr-2" size={18} />Back to products</Button>
    <div className="mb-7 flex items-start justify-between">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">Product details</p><div className="flex items-center gap-3"><h1 className="m-0 text-3xl font-bold">{product.name}</h1><Status active={product.isActive} /></div><p className="mt-2 text-sm text-muted-foreground">SKU {product.sku}{product.barcode ? ` · Barcode ${product.barcode}` : " · No barcode"}</p></div>
      <Button onClick={() => navigate(`/products/${product.id}/edit`)}><Pencil className="mr-2" size={17} />Edit product</Button>
    </div>
    {message && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>}

    <div className="mb-5 grid grid-cols-4 gap-4">
      <Metric label="Available stock" value={`${available} ${product.baseUnit.name}`} detail={`${packs} ${product.packUnit.name} + ${loose} ${product.baseUnit.name}`} icon={<Boxes size={19} />} warning={Boolean(stock?.isLowStock)} />
      <Metric label={`Retail / ${product.packUnit.name}`} value={`PKR ${packPrice(product.retailPrice, product.unitsPerPack)}`} detail={`PKR ${product.retailPrice} per ${product.baseUnit.name}`} />
      <Metric label={`Wholesale / ${product.packUnit.name}`} value={`PKR ${packPrice(product.wholesalePrice, product.unitsPerPack)}`} detail={`PKR ${product.wholesalePrice} per ${product.baseUnit.name}`} />
      <Metric label="Reorder level" value={`${product.reorderLevelBaseQty} ${product.baseUnit.name}`} detail={stock?.isLowStock ? "Stock is at or below this level" : "Stock level is healthy"} icon={<TrendingDown size={19} />} warning={Boolean(stock?.isLowStock)} />
    </div>

    <div className="mb-5 grid grid-cols-2 gap-5">
      <Card className="p-6"><h2 className="mt-0 text-lg">Product information</h2><Details rows={[
        ["Product type", product.productType], ["Category", product.category?.name ?? "Uncategorized"], ["Brand", product.brand?.name ?? "No brand"], ["Size", size], ["Rack / location", product.rackLocation || "Not assigned"], ["Tax rate", `${product.taxRatePercent}%`],
      ]} /></Card>
      <Card className="p-6"><h2 className="mt-0 text-lg">Packing setup</h2><Details rows={[
        ["Individual item", `${product.baseUnit.name} (${product.baseUnit.symbol ?? "—"})`], ["Outer packing", `${product.packUnit.name} (${product.packUnit.symbol ?? "—"})`], ["Conversion", `1 ${product.packUnit.name} = ${product.unitsPerPack} ${product.baseUnit.name}`], ["Usually purchased as", product.purchaseUnit === "PACK" ? product.packUnit.name : product.baseUnit.name], ["Usually sold as", product.saleUnit === "PACK" ? product.packUnit.name : product.baseUnit.name],
      ]} /></Card>
    </div>

    {canViewStock && <Card className="mb-5 overflow-hidden"><div className="flex items-center justify-between p-5"><div><h2 className="m-0 text-lg">Batch stock</h2><p className="mb-0 mt-1 text-sm text-muted-foreground">Current quantities and expiry position for this product.</p></div><Button variant="outline" onClick={() => navigate(`/inventory/movements?productId=${product.id}`)}>View stock movements</Button></div>{stock?.batches.length ? <Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead>Total stock</TableHead><TableHead>Available</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{stock.batches.map((batch) => <TableRow key={batch.id}><TableCell className="font-semibold">{batch.batchNumber}</TableCell><TableCell>{batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : "No expiry"}</TableCell><TableCell>{batch.stockBaseQty} {product.baseUnit.name}</TableCell><TableCell>{batch.availableBaseQty} {product.baseUnit.name}</TableCell><TableCell><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${batch.isExpired ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{batch.isExpired ? "Expired" : "Available"}</span></TableCell></TableRow>)}</TableBody></Table> : <p className="border-t p-5 text-sm text-muted-foreground">No batch stock is recorded.</p>}</Card>}

    <Card className="p-6"><h2 className="mt-0 text-lg">Notes and record information</h2><p className="whitespace-pre-wrap text-sm leading-6">{product.notes || "No notes added."}</p><div className="mt-5 flex gap-8 border-t pt-4 text-xs text-muted-foreground"><span>Created {new Date(product.createdAt).toLocaleString()}</span><span>Last updated {new Date(product.updatedAt).toLocaleString()}</span></div></Card>
  </section>;
}

function Details({ rows }: { rows: Array<[string, string]> }) { return <dl className="m-0 divide-y">{rows.map(([label, value]) => <div className="flex justify-between gap-6 py-3" key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="m-0 text-right text-sm font-semibold">{value}</dd></div>)}</dl>; }
function Metric({ label, value, detail, icon, warning = false }: { label: string; value: string; detail: string; icon?: React.ReactNode; warning?: boolean }) { return <Card className={`p-5 ${warning ? "border-amber-200 bg-amber-50" : ""}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{icon}</div><strong className={`mt-3 block text-2xl ${warning ? "text-amber-800" : ""}`}>{value}</strong><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></Card>; }
function Status({ active }: { active: boolean }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Active" : "Inactive"}</span>; }
function sizeLabel(unit: NonNullable<ProductDto["sizeUnit"]>) { return ({ MILLILITER: "ml", LITER: "liter", GRAM: "gram", KILOGRAM: "kg" } as const)[unit]; }
function packPrice(singlePrice: string, unitsPerPack: number) { return (Number(singlePrice) * unitsPerPack).toFixed(2); }
