import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, LoaderCircle, Pencil, Plus, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  createUserInputSchema,
  resetPasswordInputSchema,
  updateUserInputSchema,
  type CreateUserInput,
  type RoleCode,
} from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";

interface UserRow {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  cashierDiscountLimitBps: number;
  lastLoginAt: string | null;
  role: { code: RoleCode; name: string };
}

interface EditState {
  user: UserRow;
  displayName: string;
  roleCode: RoleCode;
  discountPercent: string;
  newPassword: string;
}

export function UsersPage() {
  const token = useAuthStore((state) => state.token)!;
  const currentUser = useAuthStore((state) => state.user)!;
  const logout = useAuthStore((state) => state.logout);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserInputSchema),
    defaultValues: { username: "", displayName: "", password: "", roleCode: "CASHIER", cashierDiscountLimitBps: 0 },
  });
  const newUserRole = watch("roleCode");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<{ users: UserRow[] }>("/users", {}, token);
      setUsers(result.users);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function createUser(input: CreateUserInput) {
    setMessage(null);
    try {
      await apiRequest("/users", { method: "POST", body: JSON.stringify(input) }, token);
      reset();
      setShowCreateForm(false);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not create user.");
    }
  }

  async function toggleUser(user: UserRow) {
    setMessage(null);
    try {
      await apiRequest(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !user.isActive }) }, token);
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update user.");
    }
  }

  function beginEdit(user: UserRow) {
    setMessage(null);
    setEditing({ user, displayName: user.displayName, roleCode: user.role.code, discountPercent: String(user.cashierDiscountLimitBps / 100), newPassword: "" });
  }

  async function saveUser() {
    if (!editing) return;
    const discountBps = editing.roleCode === "CASHIER" ? Math.round(Number(editing.discountPercent) * 100) : 0;
    const changes = {
      ...(editing.displayName !== editing.user.displayName ? { displayName: editing.displayName } : {}),
      ...(editing.roleCode !== editing.user.role.code ? { roleCode: editing.roleCode } : {}),
      ...(discountBps !== editing.user.cashierDiscountLimitBps ? { cashierDiscountLimitBps: discountBps } : {}),
    };
    if (Object.keys(changes).length === 0) { setEditing(null); return; }
    const parsed = updateUserInputSchema.safeParse(changes);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Please correct the user details."); return; }
    setSavingEdit(true);
    setMessage(null);
    try {
      await apiRequest(`/users/${editing.user.id}`, { method: "PATCH", body: JSON.stringify(parsed.data) }, token);
      const changedOwnRole = editing.user.id === currentUser.id && editing.roleCode !== currentUser.role;
      setEditing(null);
      if (changedOwnRole) { await logout(); return; }
      await loadUsers();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not update user.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function resetPassword() {
    if (!editing) return;
    const parsed = resetPasswordInputSchema.safeParse({ password: editing.newPassword });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Password does not meet the requirements."); return; }
    setSavingEdit(true);
    setMessage(null);
    try {
      await apiRequest(`/users/${editing.user.id}/password`, { method: "PUT", body: JSON.stringify(parsed.data) }, token);
      setEditing(null);
      if (editing.user.id === currentUser.id) { await logout(); return; }
      setMessage("Password reset. Existing sessions for that user were signed out.");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not reset password.");
    } finally {
      setSavingEdit(false);
    }
  }

  return <section className="p-8">
    <div className="mb-8 flex items-start justify-between"><div><p className="mb-2 text-sm font-semibold text-primary">OWNER SETTINGS</p><h1 className="m-0 text-3xl font-bold">Users and access</h1><p className="mt-2 text-sm text-muted-foreground">Create staff accounts, assign roles, and control sign-in access.</p></div><Button onClick={() => { setEditing(null); setShowCreateForm(true); }}><Plus className="mr-2" size={18}/>Add user</Button></div>
    {message && <div role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</div>}

    {showCreateForm && <Card className="mb-7"><CardContent className="pt-6"><PanelHeading title="New staff account" onClose={() => setShowCreateForm(false)}/><form onSubmit={handleSubmit(createUser)} className="grid grid-cols-2 gap-5" noValidate>
      <Field label="Full name" error={errors.displayName?.message}><Input {...register("displayName")}/></Field>
      <Field label="Username" error={errors.username?.message}><Input autoComplete="off" {...register("username")}/></Field>
      <Field label="Temporary password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register("password")}/></Field>
      <Field label="Role" error={errors.roleCode?.message}><RoleSelect {...register("roleCode")}/></Field>
      {newUserRole === "CASHIER" && <Field label="Discount limit (%)" error={errors.cashierDiscountLimitBps?.message}><Input type="number" min="0" max="100" step="0.01" {...register("cashierDiscountLimitBps", { setValueAs: (value) => Math.round(Number(value) * 100) })}/></Field>}
      <div className="col-span-2 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button><Button disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="mr-2 animate-spin" size={18}/>}Create user</Button></div>
    </form></CardContent></Card>}

    {editing && <Card className="mb-7"><CardContent className="pt-6"><PanelHeading title={`Edit ${editing.user.username}`} onClose={() => setEditing(null)}/><div className="grid grid-cols-2 gap-5">
      <Field label="Full name"><Input value={editing.displayName} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })}/></Field>
      <Field label="Role"><RoleSelect value={editing.roleCode} onChange={(event) => setEditing({ ...editing, roleCode: event.target.value as RoleCode })}/></Field>
      {editing.roleCode === "CASHIER" && <Field label="Discount limit (%)"><Input type="number" min="0" max="100" step="0.01" value={editing.discountPercent} onChange={(event) => setEditing({ ...editing, discountPercent: event.target.value })}/></Field>}
      <div className="col-span-2 flex justify-end"><Button disabled={savingEdit} onClick={() => void saveUser()}>{savingEdit && <LoaderCircle className="mr-2 animate-spin" size={18}/>}Save access changes</Button></div>
      <div className="col-span-2 mt-2 border-t pt-5"><h3 className="m-0 text-sm font-semibold">Reset password</h3><p className="mb-3 mt-1 text-xs text-muted-foreground">This immediately signs the user out from every session.</p><div className="flex gap-3"><Input type="password" autoComplete="new-password" placeholder="New temporary password" value={editing.newPassword} onChange={(event) => setEditing({ ...editing, newPassword: event.target.value })}/><Button variant="outline" disabled={savingEdit} onClick={() => void resetPassword()}><KeyRound className="mr-2" size={17}/>Reset password</Button></div></div>
    </div></CardContent></Card>}

    <Card><div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto] gap-4 border-b bg-muted/50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground"><span>Name</span><span>Username</span><span>Role</span><span>Last login</span><span className="w-24">Status</span><span className="w-10"/></div>
      {loading ? <div className="grid h-32 place-items-center text-sm text-muted-foreground"><LoaderCircle className="animate-spin"/></div> : users.map((user) => <div key={user.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto] items-center gap-4 border-b px-5 py-4 last:border-0"><strong className="text-sm">{user.displayName}</strong><span className="text-sm text-muted-foreground">{user.username}</span><span className="text-sm">{user.role.name}</span><span className="text-sm text-muted-foreground">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</span><Button className="w-24" variant="ghost" size="sm" disabled={user.id === currentUser.id} onClick={() => void toggleUser(user)}>{user.isActive ? <><UserRoundCheck className="mr-1 text-primary" size={17}/>Active</> : <><UserRoundX className="mr-1 text-destructive" size={17}/>Inactive</>}</Button><Button variant="ghost" size="sm" aria-label={`Edit ${user.displayName}`} onClick={() => { setShowCreateForm(false); beginEdit(user); }}><Pencil size={17}/></Button></div>)}
    </Card>
  </section>;
}

const RoleSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>((props, ref) => <select ref={ref} className="h-11 w-full rounded-lg border bg-white px-3 text-sm" {...props}><option value="CASHIER">Cashier</option><option value="ADMIN">Admin</option><option value="OWNER">Owner</option></select>);
RoleSelect.displayName = "RoleSelect";

function PanelHeading({ title, onClose }: { title: string; onClose(): void }) {
  return <div className="mb-5 flex items-center justify-between"><h2 className="m-0 text-lg font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose} aria-label="Close form"><X size={18}/></Button></div>;
}

function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}{error && <span className="mt-1 block text-sm text-destructive">{error}</span>}</label>;
}
