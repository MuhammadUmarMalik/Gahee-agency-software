import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, CircleDollarSign, CreditCard, LoaderCircle, Plus, ReceiptText, Search, Settings2, Tags, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { createExpenseInputSchema, EXPENSE_PAYMENT_METHODS, type CreateExpenseInput } from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { useAppDialog } from "@/components/app-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/stores/auth-store";

const today = new Date().toLocaleDateString("en-CA");
const monthStart = `${today.slice(0, 8)}01`;
const selectClass = "mt-1 h-11 w-full rounded-xl border border-input bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
type Category = { id: string; name: string; isActive: boolean; _count?: { expenses: number } };
type Expense = { id: string; voucherNumber: string; category: string; description: string; amount: string; method: string; reference: string | null; status: "POSTED" | "VOIDED"; incurredAt: string; voidReason: string | null; createdBy: { displayName: string } };
type ExpenseReport = { expenses: Expense[]; summary: { count: number; total: string; cashPaid: string; nonCashPaid: string } };
const defaults: CreateExpenseInput = { categoryId: "", amount: "", paymentMethod: "CASH", incurredOn: today, description: "", reference: "" };

export function ExpensesPage() {
  const token = useAuthStore((state) => state.token)!;
  const dialog = useAppDialog();
  const [categories, setCategories] = useState<Category[]>([]);
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [categoryId, setCategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [message, setMessage] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const loadCategories = useCallback(async () => {
    const result = await apiRequest<{ categories: Category[] }>("/expenses/categories?includeInactive=true", {}, token);
    setCategories(result.categories);
  }, [token]);
  const loadExpenses = useCallback(async () => {
    try {
      const query = new URLSearchParams({ from, to, ...(categoryId ? { categoryId } : {}), ...(paymentMethod ? { paymentMethod } : {}), ...(appliedSearch ? { search: appliedSearch } : {}) });
      setReport(await apiRequest<ExpenseReport>(`/expenses?${query}`, {}, token));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Expenses could not be loaded."); }
  }, [appliedSearch, categoryId, from, paymentMethod, to, token]);
  useEffect(() => { void loadCategories().catch((error) => setMessage(error instanceof Error ? error.message : "Categories could not be loaded.")); }, [loadCategories]);
  useEffect(() => { void loadExpenses(); }, [loadExpenses]);

  async function voidExpense(expense: Expense) {
    const reason = await dialog.prompt({ title: "Cancel expense?", description: `${expense.voucherNumber} will remain in history. A cash expense will create an equal cash-in reversal today.`, confirmLabel: "Cancel expense", destructive: true, placeholder: "Reason for cancellation" });
    if (!reason) return;
    try {
      await apiRequest(`/expenses/${expense.id}/void`, { method: "POST", body: JSON.stringify({ reason }) }, token);
      setMessage(`${expense.voucherNumber} cancelled and audit logged.`);
      await loadExpenses();
    } catch (error) { setMessage(error instanceof ApiError ? error.message : "Expense could not be cancelled."); }
  }

  return <section className="p-8">
    <div className="mb-6 flex items-end justify-between gap-4">
      <div><p className="mb-1 text-sm font-semibold text-primary">Agency operations</p><h1 className="m-0 text-3xl font-bold">Expenses</h1><p className="mt-2 text-sm text-muted-foreground">Record freight, loading, food, utilities, wages, and other agency costs.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setCategoriesOpen(true)}><Settings2 className="mr-2" size={17}/>Manage categories</Button><Button onClick={() => setExpenseOpen(true)}><Plus className="mr-2" size={17}/>Add expense</Button></div>
    </div>
    {message && <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>{message}</span><button className="rounded-lg p-1 hover:bg-emerald-100" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={16}/></button></div>}
    <div className="mb-5 grid grid-cols-4 gap-4">
      <Summary icon={CircleDollarSign} label="Total expenses" value={`PKR ${report?.summary.total ?? "0.00"}`}/>
      <Summary icon={ReceiptText} label="Posted entries" value={String(report?.summary.count ?? 0)}/>
      <Summary icon={Banknote} label="Paid in cash" value={`PKR ${report?.summary.cashPaid ?? "0.00"}`}/>
      <Summary icon={CreditCard} label="Non-cash" value={`PKR ${report?.summary.nonCashPaid ?? "0.00"}`}/>
    </div>
    <Card className="mb-5 p-5"><div className="grid grid-cols-[170px_170px_220px_190px_minmax(220px,1fr)_auto] items-end gap-3">
      <label className="text-sm font-medium">From<Input className="mt-1" type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label>
      <label className="text-sm font-medium">To<Input className="mt-1" type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label>
      <label className="text-sm font-medium">Category<select className={selectClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? "" : " (inactive)"}</option>)}</select></label>
      <label className="text-sm font-medium">Payment<select className={selectClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="">All methods</option>{EXPENSE_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{paymentLabel(method)}</option>)}</select></label>
      <label className="text-sm font-medium">Search<div className="relative mt-1"><Search className="absolute left-3 top-3 text-muted-foreground" size={17}/><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setAppliedSearch(search.trim()); }} placeholder="Voucher, reference, or description"/></div></label>
      <Button variant="outline" onClick={() => setAppliedSearch(search.trim())}>Search</Button>
    </div></Card>
    <Card className="overflow-hidden"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="m-0 text-lg font-semibold">Expense register</h2><p className="mb-0 mt-1 text-xs text-muted-foreground">Posted records are not deleted; corrections are made by cancellation and reversal.</p></div></div>
      <Table><TableHeader><TableRow><TableHead>Date / voucher</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Payment</TableHead><TableHead>Entered by</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="w-24 text-right">Action</TableHead></TableRow></TableHeader><TableBody>
        {report?.expenses.length ? report.expenses.map((expense) => <TableRow key={expense.id} className={expense.status === "VOIDED" ? "opacity-60" : ""}><TableCell><strong>{new Date(expense.incurredAt).toLocaleDateString("en-GB")}</strong><span className="block text-xs text-muted-foreground">{expense.voucherNumber}</span></TableCell><TableCell>{expense.category}</TableCell><TableCell className="max-w-xs"><span className="block truncate">{expense.description}</span><span className="block text-xs text-muted-foreground">{expense.reference || "No reference"}</span>{expense.voidReason && <span className="block text-xs text-red-700">Cancelled: {expense.voidReason}</span>}</TableCell><TableCell>{paymentLabel(expense.method)}</TableCell><TableCell>{expense.createdBy.displayName}</TableCell><TableCell className="text-right font-semibold">PKR {expense.amount}</TableCell><TableCell><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${expense.status === "POSTED" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{expense.status === "POSTED" ? "Posted" : "Cancelled"}</span></TableCell><TableCell className="text-right">{expense.status === "POSTED" ? <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => void voidExpense(expense)}>Cancel</Button> : "—"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={8} className="py-16 text-center"><ReceiptText className="mx-auto mb-3 text-slate-300" size={34}/><strong className="block">No expenses found</strong><span className="mt-1 block text-sm text-muted-foreground">Add an expense or change the selected filters.</span></TableCell></TableRow>}
      </TableBody></Table>
    </Card>
    {expenseOpen && <ExpenseModal categories={categories.filter((category) => category.isActive)} token={token} onClose={() => setExpenseOpen(false)} onCreated={async (voucher) => { setExpenseOpen(false); setMessage(`${voucher} posted successfully.`); await loadExpenses(); }}/>} 
    {categoriesOpen && <CategoryModal categories={categories} token={token} onClose={() => setCategoriesOpen(false)} onChanged={loadCategories}/>} 
  </section>;
}

function ExpenseModal({ categories, token, onClose, onCreated }: { categories: Category[]; token: string; onClose(): void; onCreated(voucher: string): Promise<void> }) {
  const form = useForm<CreateExpenseInput>({ resolver: zodResolver(createExpenseInputSchema), defaultValues: { ...defaults, categoryId: categories[0]?.id ?? "" } });
  const [error, setError] = useState("");
  async function submit(input: CreateExpenseInput) { try { setError(""); const result = await apiRequest<{ expense: Expense }>("/expenses", { method: "POST", body: JSON.stringify(input) }, token); await onCreated(result.expense.voucherNumber); } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Expense could not be posted."); } }
  return <Modal title="Add agency expense" description="Cash payments automatically appear as cash out in the cashbook." onClose={onClose}><form className="grid grid-cols-2 gap-4" onSubmit={form.handleSubmit(submit)}>
    {error && <div className="col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <Field label="Category" error={form.formState.errors.categoryId?.message}><select className={selectClass} {...form.register("categoryId")}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
    <Field label="Amount (PKR)" error={form.formState.errors.amount?.message}><Input className="mt-1" autoFocus inputMode="decimal" placeholder="0.00" {...form.register("amount")}/></Field>
    <Field label="Payment method" error={form.formState.errors.paymentMethod?.message}><select className={selectClass} {...form.register("paymentMethod")}>{EXPENSE_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{paymentLabel(method)}</option>)}</select></Field>
    <Field label="Expense date" error={form.formState.errors.incurredOn?.message}><Input className="mt-1" type="date" {...form.register("incurredOn")}/></Field>
    <div className="col-span-2"><Field label="Description / purpose" error={form.formState.errors.description?.message}><Textarea className="mt-1" rows={3} placeholder="Example: Freight paid for supplier delivery" {...form.register("description")}/></Field></div>
    <div className="col-span-2"><Field label="Reference (optional)" error={form.formState.errors.reference?.message}><Input className="mt-1" placeholder="Receipt number, vehicle number, or payee" {...form.register("reference")}/></Field></div>
    <div className="col-span-2 mt-2 flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <LoaderCircle className="mr-2 animate-spin" size={17}/>}Post expense</Button></div>
  </form></Modal>;
}

function CategoryModal({ categories, token, onClose, onChanged }: { categories: Category[]; token: string; onClose(): void; onChanged(): Promise<void> }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function add() { if (name.trim().length < 2) return setError("Enter a category name."); try { setBusy("new"); setError(""); await apiRequest("/expenses/categories", { method: "POST", body: JSON.stringify({ name: name.trim() }) }, token); setName(""); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Category could not be created."); } finally { setBusy(""); } }
  async function toggle(category: Category) { try { setBusy(category.id); setError(""); await apiRequest(`/expenses/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !category.isActive }) }, token); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Category could not be updated."); } finally { setBusy(""); } }
  return <Modal title="Expense categories" description="Inactive categories remain on old expense records but cannot be selected for new entries." onClose={onClose}><div className="flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void add(); }} placeholder="New category name"/><Button disabled={busy === "new"} onClick={() => void add()}><Plus className="mr-2" size={16}/>Add</Button></div>{error && <p className="mb-0 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="mt-4 max-h-[390px] space-y-2 overflow-auto pr-1">{categories.map((category) => <div key={category.id} className="flex items-center gap-3 rounded-xl border p-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-primary"><Tags size={17}/></span><div className="min-w-0 flex-1"><strong className="block text-sm">{category.name}</strong><span className="text-xs text-muted-foreground">{category._count?.expenses ?? 0} expense(s)</span></div><Button size="sm" variant="outline" disabled={busy === category.id} onClick={() => void toggle(category)}>{category.isActive ? "Deactivate" : "Activate"}</Button></div>)}</div></Modal>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose(): void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-6 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-white shadow-2xl"><div className="flex items-start justify-between border-b p-6"><div><h2 className="m-0 text-xl font-bold">{title}</h2><p className="mb-0 mt-1 text-sm text-muted-foreground">{description}</p></div><button className="rounded-lg p-2 text-muted-foreground hover:bg-muted" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="max-h-[calc(100vh-170px)] overflow-auto p-6">{children}</div></div></div>; }
function Field({ label, error, children }: { label: string; error: string | undefined; children: React.ReactNode }) { return <label className="text-sm font-medium">{label}{children}{error && <span className="mt-1 block text-xs text-red-700">{error}</span>}</label>; }
function Summary({ icon: Icon, label, value }: { icon: typeof ReceiptText; label: string; value: string }) { return <Card className="flex items-center gap-4 p-5"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-primary"><Icon size={21}/></span><div><p className="m-0 text-xs font-medium text-muted-foreground">{label}</p><p className="mb-0 mt-1 text-xl font-bold">{value}</p></div></Card>; }
function paymentLabel(method: string) { return ({ CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", OTHER: "Other" } as Record<string, string>)[method] ?? method.replaceAll("_", " "); }
