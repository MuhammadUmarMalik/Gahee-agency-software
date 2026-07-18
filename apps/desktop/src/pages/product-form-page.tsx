import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Barcode, LoaderCircle, Save, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { createProductInputSchema, isIndividualUnit, isOuterPackUnit, type CreateProductInput, type ProductDto, type ProductOption, updateProductInputSchema } from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth-store";

interface Options { categories: ProductOption[]; brands: ProductOption[]; units: ProductOption[] }
type PriceField = "purchasePrice" | "retailPrice" | "wholesalePrice" | "minimumPrice";
type PackPrices = Record<PriceField, string>;
const defaults: CreateProductInput = { name: "", brandId: null, categoryId: null, productType: "OIL", sizeValue: null, sizeUnit: null, baseUnitId: "", packUnitId: "", unitsPerPack: 12, purchaseUnit: "PACK", saleUnit: "BASE", sku: "", barcode: "", purchasePrice: "0.00", retailPrice: "0.00", wholesalePrice: "0.00", minimumPrice: "0.00", taxRatePercent: "0.00", reorderLevelBaseQty: 0, openingStockPackQty: 0, openingStockBaseQty: 0, rackLocation: "", notes: "", isActive: true };
const zeroPackPrices: PackPrices = { purchasePrice: "0.00", retailPrice: "0.00", wholesalePrice: "0.00", minimumPrice: "0.00" };

export function ProductFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const token = useAuthStore((state) => state.token)!;
  const navigate = useNavigate();
  const [options, setOptions] = useState<Options>({ categories: [], brands: [], units: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [packPrices, setPackPrices] = useState<PackPrices>(zeroPackPrices);
  const form = useForm<CreateProductInput>({ resolver: zodResolver(createProductInputSchema), defaultValues: defaults });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = form;
  const [baseUnitId, packUnitId, unitsPerPack, sizeValue, sizeUnit, productName] = watch(["baseUnitId", "packUnitId", "unitsPerPack", "sizeValue", "sizeUnit", "name"]);
  const baseUnit = useMemo(() => options.units.find((unit) => unit.id === baseUnitId), [baseUnitId, options.units]);
  const packUnit = useMemo(() => options.units.find((unit) => unit.id === packUnitId), [packUnitId, options.units]);
  const individualUnits = useMemo(() => options.units.filter(isIndividualUnit), [options.units]);
  const outerPackUnits = useMemo(() => options.units.filter(isOuterPackUnit), [options.units]);
  const individualOnly = unitsPerPack === 1 && Boolean(baseUnitId) && packUnitId === baseUnitId;
  const piecePrices = useMemo(() => pricesPerPiece(packPrices, unitsPerPack), [packPrices, unitsPerPack]);

  useEffect(() => {
    async function load() {
      try {
        const loadedOptions = await apiRequest<Options>("/products/options", {}, token);
        setOptions(loadedOptions);
        if (id) {
          const { product } = await apiRequest<{ product: ProductDto }>(`/products/${id}`, {}, token);
          reset({ ...productToForm(product), openingStockPackQty: 0, openingStockBaseQty: 0 });
          setPackPrices(packPricesFromProduct(product));
        } else {
          const outerUnit = loadedOptions.units.find((unit) => unit.symbol === "box") ?? loadedOptions.units.find(isOuterPackUnit);
          reset({ ...defaults, baseUnitId: "", packUnitId: outerUnit?.id ?? "" });
          setPackPrices(zeroPackPrices);
        }
      } catch (error) { setMessage(error instanceof ApiError ? error.message : "Could not open the product form."); }
      finally { setLoading(false); }
    }
    void load();
  }, [id, reset, token]);

  async function submit(input: CreateProductInput) {
    setMessage(null);
    try {
      if (Object.values(packPrices).some((price) => !isMoney(price))) return setMessage("Enter valid full-pack prices with up to two decimal places.");
      if (Number(packPrices.minimumPrice) > Number(packPrices.retailPrice)) return setMessage("The full-pack minimum price cannot exceed the full-pack retail price.");
      const pricedInput = { ...input, ...piecePrices };
      if (id) {
        const { openingStockPackQty: _pack, openingStockBaseQty: _base, ...fields } = pricedInput;
        await apiRequest(`/products/${id}`, { method: "PUT", body: JSON.stringify(updateProductInputSchema.parse(fields)) }, token);
      } else await apiRequest("/products", { method: "POST", body: JSON.stringify(createProductInputSchema.parse(pricedInput)) }, token);
      navigate("/products");
    } catch (error) { setMessage(error instanceof ApiError ? error.message : "Could not save product."); }
  }

  async function generateBarcode() {
    try { const result = await apiRequest<{ barcode: string }>("/products/generate-barcode", {}, token); setValue("barcode", result.barcode, { shouldValidate: true, shouldDirty: true }); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : "Could not generate barcode."); }
  }

  async function generateSku(nameOverride?: string) {
    const name = nameOverride?.trim() || productName.trim();
    if (!name) return setMessage("Enter the product name before generating the SKU.");
    const query = new URLSearchParams({ name, ...(baseUnitId ? { baseUnitId } : {}), ...(sizeValue ? { sizeValue: String(sizeValue) } : {}), ...(sizeUnit ? { sizeUnit } : {}) });
    try { const result = await apiRequest<{ sku: string }>(`/products/generate-sku?${query}`, {}, token); setValue("sku", result.sku, { shouldValidate: true, shouldDirty: true }); }
    catch (error) { setMessage(error instanceof ApiError ? error.message : "Could not generate SKU."); }
  }

  function setIndividualOnly(enabled: boolean) {
    if (enabled) { if (!baseUnitId) return setMessage("Select the individual item first."); setValue("packUnitId", baseUnitId, { shouldValidate: true }); setValue("unitsPerPack", 1, { shouldValidate: true }); setValue("purchaseUnit", "BASE"); setValue("saleUnit", "BASE"); setValue("openingStockBaseQty", 0); }
    else { const outer = outerPackUnits.find((unit) => unit.symbol === "tray") ?? outerPackUnits[0]; setValue("packUnitId", outer?.id ?? "", { shouldValidate: true }); setValue("unitsPerPack", 2, { shouldValidate: true }); }
  }

  function applyPreset(baseName: string, packName: string | null, count: number, size: number) {
    const base = options.units.find((unit) => unit.name === baseName), pack = packName ? options.units.find((unit) => unit.name === packName) : base;
    if (!base || !pack) return;
    setValue("baseUnitId", base.id, { shouldValidate: true }); setValue("packUnitId", pack.id, { shouldValidate: true }); setValue("unitsPerPack", count, { shouldValidate: true }); setValue("sizeValue", size, { shouldValidate: true }); setValue("sizeUnit", "KILOGRAM", { shouldValidate: true }); setValue("purchaseUnit", count === 1 ? "BASE" : "PACK"); setValue("saleUnit", "BASE");
  }

  if (loading) return <div className="grid h-screen place-items-center text-muted-foreground"><LoaderCircle className="animate-spin"/></div>;
  return <section className="p-8"><Button variant="ghost" className="mb-5 -ml-3" onClick={() => navigate("/products")}><ArrowLeft className="mr-2" size={18}/>Back to products</Button><div className="mb-7"><p className="mb-2 text-sm font-semibold text-primary">PRODUCT MANAGEMENT</p><h1 className="m-0 text-3xl font-bold">{editing ? "Edit product" : "Add product"}</h1><p className="mt-2 text-sm text-muted-foreground">Product details, pricing, packing, and opening stock are configured on this screen.</p></div>
    {message && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>}
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
      <Section title="Basic information"><div className="grid grid-cols-4 gap-5"><Field label="Product name" error={errors.name?.message} className="col-span-2"><Input autoFocus {...register("name", { onBlur: (event) => { if (!editing && !form.getValues("sku")) void generateSku(event.target.value); } })}/></Field><Field label="SKU (generated automatically)" error={errors.sku?.message}><div className="flex gap-2"><Input placeholder="Generated from product details" {...register("sku")}/><Button type="button" variant="outline" aria-label="Generate SKU" title="Generate SKU now" onClick={() => void generateSku()}><Sparkles size={17}/></Button></div></Field><Field label="Product type" error={errors.productType?.message}><Select {...register("productType")}><option value="OIL">Cooking oil</option><option value="GHEE">Ghee</option><option value="OTHER">Other</option></Select></Field>
        <Field label="Category" error={errors.categoryId?.message}><Select {...register("categoryId", { setValueAs: (value) => value || null })}><option value="">No category</option>{options.categories.map(optionElement)}</Select></Field><Field label="Brand" error={errors.brandId?.message}><Select {...register("brandId", { setValueAs: (value) => value || null })}><option value="">No brand</option>{options.brands.map(optionElement)}</Select></Field><Field label="Size value" error={errors.sizeValue?.message}><Input type="number" min="0.01" step="0.01" {...register("sizeValue", { setValueAs: (value) => value === "" ? null : Number(value) })}/></Field><Field label="Size unit" error={errors.sizeUnit?.message}><Select {...register("sizeUnit", { setValueAs: (value) => value || null })}><option value="">No size</option><option value="MILLILITER">Milliliter</option><option value="LITER">Liter</option><option value="GRAM">Gram</option><option value="KILOGRAM">Kilogram</option></Select></Field>
        <Field label="Barcode" error={errors.barcode?.message} className="col-span-2"><div className="flex gap-2"><Input inputMode="numeric" {...register("barcode")}/><Button type="button" variant="outline" onClick={() => void generateBarcode()}><Barcode className="mr-2" size={17}/>Generate</Button></div></Field><Field label="Rack / location" error={errors.rackLocation?.message}><Input {...register("rackLocation")}/></Field><label className="flex items-center gap-3 pt-8 text-sm font-semibold"><input type="checkbox" className="h-4 w-4 accent-primary" {...register("isActive")}/>Active product</label>
      </div></Section>
      <Section title="Item and outer packing"><div className="mb-4 flex flex-wrap gap-2"><Preset label="1 kg pouch · Box × 12" onClick={() => applyPreset("Pouch", "Box", 12, 1)}/><Preset label="1 kg pouch · Box × 16" onClick={() => applyPreset("Pouch", "Box", 16, 1)}/><Preset label="2.5 kg balti · Tray × 4" onClick={() => applyPreset("Balti", "Tray", 4, 2.5)}/><Preset label="5 kg balti · Tray × 2" onClick={() => applyPreset("Balti", "Tray", 2, 5)}/><Preset label="Tin · Tray × 2" onClick={() => applyPreset("Tin", "Tray", 2, sizeValue ?? 1)}/><Preset label="10 kg balti · Individual" onClick={() => applyPreset("Balti", null, 1, 10)}/><Preset label="16 kg balti · Individual" onClick={() => applyPreset("Balti", null, 1, 16)}/></div><div className="mb-5 grid grid-cols-2 gap-4"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><strong className="block text-emerald-900">Individual item</strong><span className="mt-1 block text-emerald-800">Every tin, balti, bottle, or pouch is one stock item.</span></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm"><strong className="block text-blue-900">Outer packing</strong><span className="mt-1 block text-blue-800">The tray, box, carton, or pack count is configured once and used automatically in purchases.</span></div></div><label className="mb-5 flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold"><input type="checkbox" checked={individualOnly} onChange={(event) => setIndividualOnly(event.target.checked)} className="h-4 w-4 accent-primary"/>Sold and purchased individually — no outer packing</label><div className="grid grid-cols-4 gap-5"><Field label="Individual item" error={errors.baseUnitId?.message}><Select {...register("baseUnitId", { onChange: (event) => { if (individualOnly) setValue("packUnitId", event.target.value, { shouldValidate: true }); } })}><option value="">Select Tin, Balti, Bottle, or Pouch</option>{individualUnits.map(unitOption)}</Select></Field>{!individualOnly && <><Field label="Outer packing" error={errors.packUnitId?.message}><Select {...register("packUnitId")}><option value="">Select Tray, Box, Carton, or Pack</option>{outerPackUnits.map(unitOption)}</Select></Field><Field label={`Items in one ${packUnit?.name.toLowerCase() ?? "outer pack"}`} error={errors.unitsPerPack?.message}><Input type="number" min="2" {...register("unitsPerPack", { valueAsNumber: true })}/></Field></>}<div className={`rounded-xl bg-muted p-3 text-sm ${individualOnly ? "col-span-3" : ""}`}><span className="block text-xs font-semibold text-muted-foreground">CONVERSION</span><strong>{individualOnly ? `1 ${baseUnit?.name ?? "item"} = 1 stock item` : `1 ${packUnit?.name ?? "outer pack"} = ${Number.isFinite(unitsPerPack) ? unitsPerPack : 0} ${baseUnit?.name ?? "items"}`}</strong><span className="mt-1 block text-xs text-muted-foreground">{individualOnly ? "Use a separate product for each size and price." : `Extra loose ${baseUnit?.name.toLowerCase() ?? "items"} can be entered separately when needed.`}</span></div>
        <Field label="Usually purchased as" error={errors.purchaseUnit?.message}><Select {...register("purchaseUnit")}><option value="PACK">{packUnit?.name ?? "Outer pack"}</option><option value="BASE">Individual {baseUnit?.name ?? "item"}</option></Select></Field><Field label="Usually sold as" error={errors.saleUnit?.message}><Select {...register("saleUnit")}><option value="BASE">Individual {baseUnit?.name ?? "item"}</option><option value="PACK">{packUnit?.name ?? "Outer pack"}</option></Select></Field><div className="col-span-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground"><strong className="text-foreground">Separate product for every size.</strong> For example, 10 kg Balti and 15 kg Balti need separate product records, SKUs, prices, and stock.{sizeValue && sizeUnit ? <span className="mt-1 block text-primary">This product: {sizeValue} {sizeLabel(sizeUnit)} {baseUnit?.name ?? "item"}</span> : null}</div></div></Section>
      <Section title="Full pack pricing"><input type="hidden" {...register("purchasePrice")}/><input type="hidden" {...register("retailPrice")}/><input type="hidden" {...register("wholesalePrice")}/><input type="hidden" {...register("minimumPrice")}/><div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong className="block">Enter the price of one complete {individualOnly ? baseUnit?.name.toLowerCase() ?? "item" : packUnit?.name.toLowerCase() ?? "tray / box / carton"}.</strong><span className="mt-1 block">The system divides it by {Math.max(1, Number(unitsPerPack) || 1)} and stores the calculated price of one {baseUnit?.name.toLowerCase() ?? "piece"} for POS sales and stock costing.</span></div><div className="grid grid-cols-4 gap-5"><PackMoneyField label="Purchase" value={packPrices.purchasePrice} onChange={(value) => setPackPrices((prices) => ({ ...prices, purchasePrice: value }))} packName={individualOnly ? baseUnit?.name : packUnit?.name} baseName={baseUnit?.name} piecePrice={piecePrices.purchasePrice}/><PackMoneyField label="Retail" value={packPrices.retailPrice} onChange={(value) => setPackPrices((prices) => ({ ...prices, retailPrice: value }))} packName={individualOnly ? baseUnit?.name : packUnit?.name} baseName={baseUnit?.name} piecePrice={piecePrices.retailPrice}/><PackMoneyField label="Wholesale" value={packPrices.wholesalePrice} onChange={(value) => setPackPrices((prices) => ({ ...prices, wholesalePrice: value }))} packName={individualOnly ? baseUnit?.name : packUnit?.name} baseName={baseUnit?.name} piecePrice={piecePrices.wholesalePrice}/><PackMoneyField label="Minimum sale" value={packPrices.minimumPrice} onChange={(value) => setPackPrices((prices) => ({ ...prices, minimumPrice: value }))} packName={individualOnly ? baseUnit?.name : packUnit?.name} baseName={baseUnit?.name} piecePrice={piecePrices.minimumPrice}/></div><div className="mt-5 max-w-xs"><Field label="Tax rate (%)" error={errors.taxRatePercent?.message}><Input inputMode="decimal" {...register("taxRatePercent")}/></Field></div></Section>
      <Section title={editing ? "Stock controls" : "Opening stock and controls"}><div className="grid grid-cols-4 gap-5">{!editing && <>{<Field label={individualOnly ? `Opening quantity (${baseUnit?.name ?? "items"})` : `Opening ${packUnit?.name ?? "outer packs"}`} error={errors.openingStockPackQty?.message}><Input type="number" min="0" {...register("openingStockPackQty", { valueAsNumber: true })}/></Field>}{!individualOnly && <Field label={`Extra loose ${baseUnit?.name ?? "items"}`} error={errors.openingStockBaseQty?.message}><Input type="number" min="0" {...register("openingStockBaseQty", { valueAsNumber: true })}/></Field>}</>}<Field label={`Reorder level (${baseUnit?.name ?? "individual items"})`} error={errors.reorderLevelBaseQty?.message}><Input type="number" min="0" {...register("reorderLevelBaseQty", { valueAsNumber: true })}/></Field><Field label="Notes" error={errors.notes?.message} className={editing ? "col-span-3" : individualOnly ? "col-span-2" : "col-span-1"}><Textarea {...register("notes")}/></Field></div>{!editing && <p className="mb-0 mt-3 text-xs text-muted-foreground">Stock is stored as individual {baseUnit?.name.toLowerCase() ?? "items"}. Every stock change creates a movement automatically.</p>}</Section>
      <div className="flex justify-end gap-3 pb-8"><Button type="button" variant="outline" onClick={() => navigate("/products")}>Cancel</Button><Button size="lg" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="mr-2 animate-spin" size={18}/> : <Save className="mr-2" size={18}/>}Save product</Button></div>
    </form></section>;
}

function productToForm(product: ProductDto): CreateProductInput { return { name: product.name, brandId: product.brand?.id ?? null, categoryId: product.category?.id ?? null, productType: product.productType, sizeValue: product.sizeValue, sizeUnit: product.sizeUnit, baseUnitId: product.baseUnit.id, packUnitId: product.packUnit.id, unitsPerPack: product.unitsPerPack, purchaseUnit: product.purchaseUnit, saleUnit: product.saleUnit, sku: product.sku, barcode: product.barcode, purchasePrice: product.purchasePrice, retailPrice: product.retailPrice, wholesalePrice: product.wholesalePrice, minimumPrice: product.minimumPrice, taxRatePercent: product.taxRatePercent, reorderLevelBaseQty: product.reorderLevelBaseQty, openingStockPackQty: 0, openingStockBaseQty: 0, rackLocation: product.rackLocation, notes: product.notes, isActive: product.isActive }; }
function optionElement(option: ProductOption) { return <option key={option.id} value={option.id}>{option.name}</option>; }
function unitOption(option: ProductOption) { return <option key={option.id} value={option.id}>{option.name} ({option.symbol})</option>; }
function Preset({ label, onClick }: { label: string; onClick: () => void }) { return <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={onClick}>{label}</Button>; }
function sizeLabel(unit: NonNullable<CreateProductInput["sizeUnit"]>) { return ({ MILLILITER: "ml", LITER: "liter", GRAM: "gram", KILOGRAM: "kg" } as const)[unit]; }
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className="h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" {...props}/>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardContent className="pt-6"><h2 className="mb-5 mt-0 text-lg font-semibold">{title}</h2>{children}</CardContent></Card>; }
function Field({ label, error, className = "", children }: { label: string; error?: string | undefined; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-2 block text-sm font-semibold">{label}</span>{children}{error && <span className="mt-1 block text-xs text-destructive">{error}</span>}</label>; }
function PackMoneyField({ label, value, onChange, packName, baseName, piecePrice }: { label: string; value: string; onChange(value: string): void; packName?: string | undefined; baseName?: string | undefined; piecePrice: string }) { const valid = isMoney(value); return <Field label={`${label} / ${packName ?? "full pack"} (PKR)`} error={valid ? undefined : "Enter a valid price with up to two decimal places."}><Input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)}/><span className={`mt-2 block rounded-lg px-3 py-2 text-xs ${valid ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>Calculated single {baseName?.toLowerCase() ?? "piece"}: <strong>PKR {piecePrice}</strong></span></Field>; }
function isMoney(value: string) { return /^\d{1,8}(\.\d{1,2})?$/.test(value.trim()); }
function singlePrice(packPrice: string, unitsPerPack: number) { if (!isMoney(packPrice)) return "0.00"; const units = Math.max(1, Number.isFinite(unitsPerPack) ? unitsPerPack : 1); return (Math.round((Number(packPrice) * 100) / units) / 100).toFixed(2); }
function pricesPerPiece(prices: PackPrices, unitsPerPack: number): PackPrices { return { purchasePrice: singlePrice(prices.purchasePrice, unitsPerPack), retailPrice: singlePrice(prices.retailPrice, unitsPerPack), wholesalePrice: singlePrice(prices.wholesalePrice, unitsPerPack), minimumPrice: singlePrice(prices.minimumPrice, unitsPerPack) }; }
function packPricesFromProduct(product: ProductDto): PackPrices { const multiply = (price: string) => (Number(price) * product.unitsPerPack).toFixed(2); return { purchasePrice: multiply(product.purchasePrice), retailPrice: multiply(product.retailPrice), wholesalePrice: multiply(product.wholesalePrice), minimumPrice: multiply(product.minimumPrice) }; }
