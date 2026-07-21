import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  useFieldArray,
  useForm,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import type { z } from "zod";
import {
  createPurchaseInputSchema,
  type CreatePurchaseInput,
  type PurchaseProductOption,
  type PurchaseSupplierOption,
} from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth-store";

interface Options {
  suppliers: PurchaseSupplierOption[];
  products: PurchaseProductOption[];
}
type PurchaseFormValues = z.input<typeof createPurchaseInputSchema>;
interface PurchaseForEdit {
  supplier: { id: string };
  supplierInvoice: string | null;
  purchasedAt: string;
  dueDate: string | null;
  discount: string;
  tax: string;
  transportExpense: string;
  loadingExpense: string;
  otherExpense: string;
  paid: string;
  notes: string | null;
  items: Array<{
    product: { id: string };
    batch: {
      id: string;
      batchNumber: string;
      manufactureDate: string | null;
      expiryDate: string | null;
    } | null;
    packQuantity: number;
    baseQuantity: number;
    purchaseRate: string;
  }>;
  payments: Array<{
    method: CreatePurchaseInput["paymentMethod"];
    reference: string | null;
  }>;
}
const today = new Date().toISOString().slice(0, 10);
const emptyDefaults: CreatePurchaseInput = {
  supplierId: "",
  supplierInvoice: "",
  purchaseDate: today,
  dueDate: today,
  discount: "0.00",
  tax: "0.00",
  transportExpense: "0.00",
  loadingExpense: "0.00",
  otherExpense: "0.00",
  paidAmount: "0.00",
  paymentMethod: "CASH",
  paymentReference: "",
  notes: "",
  items: [],
};
const newLine = (
  product?: PurchaseProductOption,
): CreatePurchaseInput["items"][number] => ({
  productId: product?.id ?? "",
  batchId: null,
  batchNumber: "",
  manufacturingDate: null,
  expiryDate: null,
  cartonQuantity: 0,
  pieceQuantity: 0,
  purchaseRate: product?.purchasePrice ?? "0.00",
});
const amount = (value: string | undefined) => Number(value || 0) || 0;

export function PurchaseFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const token = useAuthStore((state) => state.token)!;
  const navigate = useNavigate();
  const [options, setOptions] = useState<Options>({
    suppliers: [],
    products: [],
  });
  const [message, setMessage] = useState("");
  const [duplicate, setDuplicate] = useState("");
  const [loading, setLoading] = useState(true);
  const form = useForm<PurchaseFormValues, unknown, CreatePurchaseInput>({
    resolver: zodResolver(createPurchaseInputSchema),
    defaultValues: emptyDefaults,
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = form;
  const fields = useFieldArray({ control, name: "items" });
  const values = watch();
  useEffect(() => {
    async function load() {
      try {
        const loaded = await apiRequest<Options>(
          "/purchases/options",
          {},
          token,
        );
        setOptions(loaded);
        if (id) {
          const { purchase } = await apiRequest<{ purchase: PurchaseForEdit }>(
            `/purchases/${id}`,
            {},
            token,
          );
          form.reset({
            supplierId: purchase.supplier.id,
            supplierInvoice: purchase.supplierInvoice ?? "",
            purchaseDate: purchase.purchasedAt.slice(0, 10),
            dueDate: (purchase.dueDate ?? purchase.purchasedAt).slice(0, 10),
            discount: purchase.discount,
            tax: purchase.tax,
            transportExpense: purchase.transportExpense,
            loadingExpense: purchase.loadingExpense,
            otherExpense: purchase.otherExpense,
            paidAmount: purchase.paid,
            paymentMethod: purchase.payments[0]?.method ?? "CASH",
            paymentReference: purchase.payments[0]?.reference ?? "",
            notes: purchase.notes ?? "",
            items: purchase.items.map((item) => ({
              productId: item.product.id,
              batchId: item.batch?.id ?? null,
              batchNumber: item.batch?.batchNumber ?? "",
              manufacturingDate:
                item.batch?.manufactureDate?.slice(0, 10) ?? null,
              expiryDate: item.batch?.expiryDate?.slice(0, 10) ?? null,
              cartonQuantity: item.packQuantity,
              pieceQuantity: item.baseQuantity,
              purchaseRate: item.purchaseRate,
            })),
          });
        } else
          form.reset({
            ...emptyDefaults,
            supplierId: loaded.suppliers[0]?.id ?? "",
            items: loaded.products[0] ? [newLine(loaded.products[0])] : [],
          });
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Could not open purchase.",
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [form, id, token]);
  const subtotal = useMemo(
    () =>
      values.items.reduce((sum, line) => {
        const product = options.products.find(
          (item) => item.id === line.productId,
        );
        return (
          sum +
          line.cartonQuantity * amount(line.purchaseRate) +
          (line.pieceQuantity * amount(line.purchaseRate)) /
            (product?.unitsPerPack ?? 1)
        );
      }, 0),
    [options.products, values.items],
  );
  const total =
    subtotal -
    amount(values.discount) +
    amount(values.tax) +
    amount(values.transportExpense) +
    amount(values.loadingExpense) +
    amount(values.otherExpense);
  const due = Math.max(0, total - amount(values.paidAmount));
  async function checkDuplicate() {
    if (!values.supplierId || !values.supplierInvoice.trim())
      return setDuplicate("");
    const query = new URLSearchParams({
      supplierId: values.supplierId,
      supplierInvoice: values.supplierInvoice.trim(),
      ...(id ? { excludeId: id } : {}),
    });
    try {
      const result = await apiRequest<{
        duplicate: boolean;
        purchase: { invoiceNumber: string } | null;
      }>(`/purchases/duplicate-invoice?${query}`, {}, token);
      setDuplicate(
        result.duplicate
          ? `Warning: already entered as ${result.purchase?.invoiceNumber}.`
          : "",
      );
    } catch {
      setDuplicate("");
    }
  }
  async function submit(input: CreatePurchaseInput) {
    setMessage("");
    try {
      const result = await apiRequest<{ purchase: { id: string } }>(
        id ? `/purchases/${id}` : "/purchases",
        { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
        token,
      );
      navigate(`/purchases/${result.purchase.id}`);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : `Could not ${editing ? "update" : "post"} purchase.`,
      );
    }
  }
  if (loading)
    return (
      <div className="grid h-screen place-items-center">
        <LoaderCircle className="animate-spin" />
      </div>
    );
  return (
    <section className="p-8">
      <Button
        variant="ghost"
        className="mb-5 -ml-3"
        onClick={() => navigate(id ? `/purchases/${id}` : "/purchases")}
      >
        <ArrowLeft className="mr-2" size={18} />
        Back to purchases
      </Button>
      <div className="mb-7">
        <p className="mb-2 text-sm font-semibold text-primary">PURCHASES</p>
        <h1 className="m-0 text-3xl font-bold">
          {editing ? "Edit purchase" : "New purchase"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {editing
            ? "Updating reverses the previous stock and accounting entries, then posts the corrected purchase."
            : "The purchase, batches, stock, supplier ledger, and initial payment post together."}
        </p>
      </div>
      {message && (
        <div className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {message}
        </div>
      )}
      {!options.suppliers.length && (
        <div className="mb-5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          No active suppliers are available. Add a supplier before posting a
          purchase.
        </div>
      )}
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <Card className="grid grid-cols-4 gap-5 p-6">
          <Field label="Supplier" error={errors.supplierId?.message}>
            <Select {...register("supplierId")}>
              <option value="">Select supplier</option>
              {options.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Supplier invoice"
            error={errors.supplierInvoice?.message}
          >
            <Input
              {...register("supplierInvoice", {
                onBlur: () => void checkDuplicate(),
              })}
            />
            {duplicate && (
              <span className="mt-1 block text-xs font-semibold text-amber-700">
                {duplicate}
              </span>
            )}
          </Field>
          <Field label="Purchase date" error={errors.purchaseDate?.message}>
            <Input type="date" {...register("purchaseDate")} />
          </Field>
          <Field label="Due date" error={errors.dueDate?.message}>
            <Input type="date" {...register("dueDate")} />
          </Field>
        </Card>
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="m-0 text-lg font-semibold">Products and batches</h2>
            <Button
              type="button"
              variant="outline"
              onClick={() => fields.append(newLine(options.products[0]))}
            >
              <Plus className="mr-2" size={17} />
              Add product
            </Button>
          </div>
          {errors.items?.root?.message && (
            <p className="text-sm text-red-700">{errors.items.root.message}</p>
          )}
          <div className="space-y-4">
            {fields.fields.map((field, index) => {
              const line = values.items[index];
              const product = options.products.find(
                (item) => item.id === line?.productId,
              );
              return (
                <div
                  className="grid grid-cols-12 gap-3 rounded-xl border bg-slate-50 p-4"
                  key={field.id}
                >
                  <Field
                    className="col-span-3"
                    label="Product"
                    error={errors.items?.[index]?.productId?.message}
                  >
                    <Select
                      {...register(`items.${index}.productId`)}
                      onChange={(event) => {
                        const selected = options.products.find(
                          (item) => item.id === event.target.value,
                        );
                        setValue(
                          `items.${index}.productId`,
                          event.target.value,
                        );
                        setValue(
                          `items.${index}.purchaseRate`,
                          selected?.purchasePrice ?? "0.00",
                        );
                        setValue(`items.${index}.batchId`, null);
                        setValue(`items.${index}.batchNumber`, "");
                      }}
                    >
                      <option value="">Select product</option>
                      {options.products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field className="col-span-2" label="Existing batch">
                    <Select
                      value={line?.batchId ?? ""}
                      onChange={(event) => {
                        const batch = product?.batches.find(
                          (item) => item.id === event.target.value,
                        );
                        setValue(`items.${index}.batchId`, batch?.id ?? null);
                        setValue(
                          `items.${index}.batchNumber`,
                          batch?.batchNumber ?? "",
                        );
                        setValue(
                          `items.${index}.manufacturingDate`,
                          batch?.manufacturingDate ?? null,
                        );
                        setValue(
                          `items.${index}.expiryDate`,
                          batch?.expiryDate ?? null,
                        );
                      }}
                    >
                      <option value="">Create new batch</option>
                      {product?.batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.batchNumber}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    className="col-span-2"
                    label="Batch number"
                    error={errors.items?.[index]?.batchNumber?.message}
                  >
                    <Input
                      readOnly={Boolean(line?.batchId)}
                      placeholder={line?.batchId ? "" : "Auto"}
                      {...register(`items.${index}.batchNumber`)}
                    />
                  </Field>
                  <Field className="col-span-2" label="Manufacturing">
                    <Input
                      type="date"
                      disabled={Boolean(line?.batchId)}
                      {...register(`items.${index}.manufacturingDate`, {
                        setValueAs: (value) => value || null,
                      })}
                    />
                  </Field>
                  <Field
                    className="col-span-2"
                    label="Expiry"
                    error={errors.items?.[index]?.expiryDate?.message}
                  >
                    <Input
                      type="date"
                      disabled={Boolean(line?.batchId)}
                      {...register(`items.${index}.expiryDate`, {
                        setValueAs: (value) => value || null,
                      })}
                    />
                  </Field>
                  <div className="col-span-1 flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Remove line"
                      onClick={() => fields.remove(index)}
                    >
                      <Trash2 className="text-red-700" size={18} />
                    </Button>
                  </div>
                  <Field
                    className="col-span-2"
                    label={
                      product?.unitsPerPack === 1
                        ? `Quantity (${product.baseUnit})`
                        : `${product?.packUnit ?? "Tray / Box"} quantity`
                    }
                    error={errors.items?.[index]?.cartonQuantity?.message}
                  >
                    <Input
                      type="number"
                      min="0"
                      {...register(`items.${index}.cartonQuantity`, {
                        valueAsNumber: true,
                      })}
                    />
                    {product && product.unitsPerPack > 1 && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        1 {product.packUnit} = {product.unitsPerPack}{" "}
                        {product.baseUnit}
                      </span>
                    )}
                  </Field>
                  <Field
                    className="col-span-2"
                    label={`Rate / ${product?.unitsPerPack === 1 ? product.baseUnit : (product?.packUnit ?? "outer pack")} (PKR)`}
                    error={errors.items?.[index]?.purchaseRate?.message}
                  >
                    <Input
                      inputMode="decimal"
                      {...register(`items.${index}.purchaseRate`)}
                    />
                  </Field>
                  <div className="col-span-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm">
                    <span className="block text-xs font-semibold text-emerald-700">
                      TOTAL STOCK TO ADD
                    </span>
                    <strong className="text-lg">
                      {line
                        ? line.cartonQuantity * (product?.unitsPerPack ?? 1) +
                          line.pieceQuantity
                        : 0}{" "}
                      {product?.baseUnit ?? "items"}
                    </strong>
                    {product && product.unitsPerPack > 1 && (
                      <span className="ml-2 text-xs text-emerald-700">
                        ({line?.cartonQuantity ?? 0} × {product.unitsPerPack}
                        {line?.pieceQuantity
                          ? ` + ${line.pieceQuantity} loose`
                          : ""}
                        )
                      </span>
                    )}
                  </div>
                  <div className="col-span-4 rounded-lg bg-white p-3 text-sm">
                    <span className="block text-xs text-muted-foreground">
                      LINE TOTAL
                    </span>
                    <strong>
                      PKR{" "}
                      {(
                        (line?.cartonQuantity ?? 0) *
                          amount(line?.purchaseRate) +
                        ((line?.pieceQuantity ?? 0) *
                          amount(line?.purchaseRate)) /
                          (product?.unitsPerPack ?? 1)
                      ).toFixed(2)}
                    </strong>
                  </div>
                  {product && product.unitsPerPack > 1 && (
                    <details className="col-span-12 rounded-lg border border-dashed bg-white px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                        Add extra loose {product.baseUnit} outside complete{" "}
                        {product.packUnit} (optional)
                      </summary>
                      <div className="mt-3 max-w-xs">
                        <Field
                          label={`Extra loose ${product.baseUnit}`}
                          error={errors.items?.[index]?.pieceQuantity?.message}
                        >
                          <Input
                            type="number"
                            min="0"
                            max={product.unitsPerPack - 1}
                            {...register(`items.${index}.pieceQuantity`, {
                              valueAsNumber: true,
                            })}
                          />
                        </Field>
                        <p className="mb-0 text-xs text-muted-foreground">
                          Do not enter items per {product.packUnit} here. That
                          conversion is already set to {product.unitsPerPack}.
                        </p>
                      </div>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
        <div className="grid grid-cols-[1fr_420px] gap-5">
          <Card className="p-6">
            <h2 className="mt-0 text-lg">Payment and notes</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Paid amount (PKR)"
                error={errors.paidAmount?.message}
              >
                <Input
                  inputMode="decimal"
                  readOnly={editing}
                  {...register("paidAmount")}
                />
                {editing && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Use the purchase detail screen to record payments.
                  </span>
                )}
              </Field>
              <Field label="Payment method">
                {editing ? (
                  <>
                    <input type="hidden" {...register("paymentMethod")} />
                    <Input
                      readOnly
                      value={values.paymentMethod.replaceAll("_", " ")}
                    />
                  </>
                ) : (
                  <Select {...register("paymentMethod")}>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CARD">Card</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </Select>
                )}
              </Field>
              <Field label="Payment reference">
                <Input readOnly={editing} {...register("paymentReference")} />
              </Field>
              <Field label="Notes">
                <Textarea {...register("notes")} />
              </Field>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="mt-0 text-lg">Totals</h2>
            <div className="grid grid-cols-2 gap-3">
              <Money label="Discount" bind={register("discount")} />
              <Money label="Tax" bind={register("tax")} />
              <Money label="Transport" bind={register("transportExpense")} />
              <Money label="Loading" bind={register("loadingExpense")} />
              <Money label="Other expenses" bind={register("otherExpense")} />
            </div>
            <div className="mt-5 space-y-2 border-t pt-4 text-sm">
              <Total label="Subtotal" value={subtotal} />
              <Total label="Grand total" value={total} strong />
              <Total label="Due amount" value={due} strong />
            </div>
          </Card>
        </div>
        <div className="flex justify-end gap-3 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(id ? `/purchases/${id}` : "/purchases")}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            disabled={isSubmitting || !options.suppliers.length}
          >
            {isSubmitting ? (
              <LoaderCircle className="mr-2 animate-spin" size={18} />
            ) : (
              <Save className="mr-2" size={18} />
            )}{" "}
            {editing ? "Update purchase" : "Post purchase"}
          </Button>
        </div>
      </form>
    </section>
  );
}
function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
      {error && (
        <span className="mt-1 block text-xs text-red-700">{error}</span>
      )}
    </label>
  );
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="h-11 w-full rounded-lg border bg-white px-3 text-sm"
      {...props}
    />
  );
}
function Money({
  label,
  bind,
}: {
  label: string;
  bind: UseFormRegisterReturn;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <Input className="mt-1" inputMode="decimal" {...bind} />
    </label>
  );
}
function Total({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "text-lg font-bold" : ""}`}
    >
      <span>{label}</span>
      <span>PKR {Math.max(0, value).toFixed(2)}</span>
    </div>
  );
}
