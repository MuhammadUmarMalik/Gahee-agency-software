import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, CheckCircle2, Cloud, Database, HardDriveDownload, ImagePlus, Keyboard, KeyRound, LoaderCircle, Printer, RotateCcw, Save, ShieldCheck, Upload, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import type { z } from "zod";
import { backupSettingSchema, businessSettingSchema, DEFAULT_BACKUP_SETTING, DEFAULT_BUSINESS_SETTING, DEFAULT_PRINTING_SETTING, DEFAULT_SHORTCUT_SETTING, printingSettingSchema, SHORTCUT_KEYS, shortcutSettingSchema, type BackupSetting, type BusinessSetting, type PrintingSetting, type ShortcutSetting } from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useBusinessStore } from "@/stores/business-store";

type Tab = "agency" | "behavior" | "data";
type ClientSettings = {
  business: BusinessSetting;
  shortcuts: ShortcutSetting;
  printing: PrintingSetting;
};
type BackupStatus = {
  createdAt: string;
  createdBy: string;
  details: { fileName?: string; sizeBytes?: number } | null;
} | null;

export function SettingsPage() {
  const token = useAuthStore((state) => state.token)!;
  const setCurrentBusiness = useBusinessStore((state) => state.setBusiness);
  const [tab, setTab] = useState<Tab>("agency");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [backup, setBackup] = useState<BackupStatus>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [localBackups, setLocalBackups] = useState<DesktopBackup[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleClientId, setGoogleClientId] = useState("");
  const [driveBackups, setDriveBackups] = useState<Array<{ id: string; name: string; size?: string; createdTime?: string }>>([]);
  const [fbrToken, setFbrToken] = useState("");
  const [fbrTokenConfigured, setFbrTokenConfigured] = useState(false);
  const [fbrTokenBusy, setFbrTokenBusy] = useState(false);
  const [fbrTesting, setFbrTesting] = useState(false);
  const businessForm = useForm<z.input<typeof businessSettingSchema>, unknown, BusinessSetting>({
    resolver: zodResolver(businessSettingSchema),
    defaultValues: DEFAULT_BUSINESS_SETTING,
  });
  const shortcutForm = useForm<ShortcutSetting>({
    resolver: zodResolver(shortcutSettingSchema),
    defaultValues: DEFAULT_SHORTCUT_SETTING,
  });
  const printingForm = useForm<PrintingSetting>({
    resolver: zodResolver(printingSettingSchema),
    defaultValues: DEFAULT_PRINTING_SETTING,
  });
  const backupForm = useForm<BackupSetting>({
    resolver: zodResolver(backupSettingSchema),
    defaultValues: DEFAULT_BACKUP_SETTING,
  });
  const logo = businessForm.watch("logoDataUrl");
  const fbrEnabled = businessForm.watch("fbrEnabled");
  const fbrEnvironment = businessForm.watch("fbrEnvironment");

  useEffect(() => {
    void (async () => {
      try {
        const [client, rows, status] = await Promise.all([apiRequest<ClientSettings>("/settings/client", {}, token), apiRequest<{ settings: Array<{ key: string; value: unknown }> }>("/settings", {}, token), apiRequest<{ backup: BackupStatus }>("/settings/backup-status", {}, token)]);
        businessForm.reset(client.business);
        shortcutForm.reset(client.shortcuts);
        printingForm.reset(client.printing);
        const backupValue = rows.settings.find((row) => row.key === "backup")?.value;
        backupForm.reset(backupSettingSchema.catch(DEFAULT_BACKUP_SETTING).parse(backupValue));
        setBackup(status.backup);
        if (window.agencyDesktop) {
          const [savedBackups, google, fbrStatus] = await Promise.all([
            window.agencyDesktop.listBackups(token),
            window.agencyDesktop.googleStatus(token),
            window.agencyDesktop.fbrTokenStatus(token).catch(() => ({ configured: false, environment: "SANDBOX" as const, sandboxConfigured: false, productionConfigured: false })),
          ]);
          setLocalBackups(savedBackups);
          setGoogleConnected(google.connected);
          setFbrTokenConfigured(fbrStatus.configured);
        }
      } catch (loadError) {
        setError(loadError instanceof ApiError ? loadError.message : "Could not load settings.");
      } finally {
        setLoading(false);
      }
    })();
  }, [backupForm, businessForm, printingForm, shortcutForm, token]);

  async function save<T>(key: string, value: T, success: string) {
    setError("");
    setMessage("");
    try {
      await apiRequest(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }, token);
      if (key === "business") setCurrentBusiness(value as BusinessSetting);
      setMessage(success);
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : "Could not save settings.");
    }
  }

  async function chooseLogo(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    const extension = file.name.split(".").pop()?.toLowerCase();
    const inferredType = extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "";
    const imageType = /^image\/(png|jpeg|webp)$/.test(file.type) ? file.type : inferredType;
    if (!imageType) return setError("Choose a PNG, JPEG, or WebP logo.");
    if (file.size > 1_048_576) return setError("Logo must be 1 MB or smaller.");
    const value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;/, `data:${imageType};`));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    businessForm.setValue("logoDataUrl", value, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function createBackup() {
    setError("");
    setMessage("");
    if (!window.agencyDesktop?.createBackup) return setError("Local backup is available only in the installed desktop application.");
    setBackingUp(true);
    try {
      const result = await window.agencyDesktop.createBackup(token);
      if (!result.fileName || !result.sizeBytes || !result.createdAt) throw new Error("The backup result was incomplete.");
      setBackup({
        createdAt: result.createdAt,
        createdBy: "You",
        details: { fileName: result.fileName, sizeBytes: result.sizeBytes },
      });
      setLocalBackups((rows) => [result, ...rows]);
      setMessage(`Encrypted backup created: ${result.fileName}.`);
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : "Backup failed.");
    } finally {
      setBackingUp(false);
    }
  }

  async function importBackup() {
    try { const result = await window.agencyDesktop?.importBackup(token); if (result?.backup) { setLocalBackups((rows) => [result.backup!, ...rows]); setMessage("Backup imported and verified."); } }
    catch (value) { setError(value instanceof Error ? value.message : "Backup import failed."); }
  }

  async function connectGoogle() {
    setError("");
    try { const result = await window.agencyDesktop?.connectGoogleDrive(token, googleClientId); setGoogleConnected(Boolean(result?.connected)); setGoogleClientId(""); setMessage("Google Drive connected. Pending encrypted backups will upload automatically."); }
    catch (value) { setError(value instanceof Error ? value.message : "Google Drive connection failed."); }
  }

  async function loadDriveBackups() {
    try { setDriveBackups(await window.agencyDesktop?.listGoogleBackups(token) ?? []); }
    catch (value) { setError(value instanceof Error ? value.message : "Could not load Google Drive backups."); }
  }

  async function saveFbrToken() {
    setError("");
    setMessage("");
    if (!window.agencyDesktop?.setFbrToken) return setError("FBR token storage is available only in the installed desktop application.");
    setFbrTokenBusy(true);
    try {
      const result = await window.agencyDesktop.setFbrToken(token, fbrToken, fbrEnvironment);
      setFbrTokenConfigured(result.configured);
      setFbrToken("");
      setMessage(`FBR ${result.environment.toLowerCase()} token saved.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not save the FBR token.");
    } finally {
      setFbrTokenBusy(false);
    }
  }

  async function clearFbrToken() {
    setError("");
    setMessage("");
    if (!window.agencyDesktop?.clearFbrToken) return setError("FBR token storage is available only in the installed desktop application.");
    setFbrTokenBusy(true);
    try {
      const result = await window.agencyDesktop.clearFbrToken(token, fbrEnvironment);
      setFbrTokenConfigured(result.configured);
      setFbrToken("");
      setMessage(`FBR ${result.environment.toLowerCase()} token cleared.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Could not clear the FBR token.");
    } finally {
      setFbrTokenBusy(false);
    }
  }

  async function testFbrConnection() {
    setError("");
    setMessage("");
    if (!window.agencyDesktop?.testFbrConnection) return setError("FBR connection testing is available only in the installed desktop application.");
    setFbrTesting(true);
    try {
      const result = await window.agencyDesktop.testFbrConnection(token, fbrEnvironment);
      setMessage(`FBR ${result.environment.toLowerCase()} connection OK. HTTP ${result.httpStatus}.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "FBR connection test failed.");
    } finally {
      setFbrTesting(false);
    }
  }

  if (loading)
    return (
      <div className="grid h-full place-items-center text-muted-foreground">
        <LoaderCircle className="animate-spin" />
      </div>
    );
  return (
    <section className="p-8">
      <div className="mb-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">Owner controls</p>
        <h1 className="m-0 text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Agency identity, POS behavior, printing, backups, and data safety.</p>
      </div>
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
        <Card className="h-fit p-2">
          <SettingsTab active={tab === "agency"} icon={<Building2 />} title="Agency details" note="Logo and invoice identity" onClick={() => setTab("agency")} />
          <SettingsTab active={tab === "behavior"} icon={<Keyboard />} title="POS & printing" note="Shortcuts and defaults" onClick={() => setTab("behavior")} />
          <SettingsTab active={tab === "data"} icon={<Database />} title="Backup & data" note="Local data protection" onClick={() => setTab("data")} />
        </Card>
        <div>
          {tab === "agency" && (
            <form onSubmit={businessForm.handleSubmit((value) => save("business", value, "Agency details saved."))} className="space-y-4">
              <SettingsCard icon={<Building2 />} title="Agency details" note="These details appear on A4 and thermal invoices.">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Agency name" error={businessForm.formState.errors.name?.message}>
                    <Input {...businessForm.register("name")} />
                  </Field>
                  <Field label="Agency name in Urdu" error={businessForm.formState.errors.nameUrdu?.message}>
                    <Input dir="rtl" lang="ur" {...businessForm.register("nameUrdu")} />
                  </Field>
                  <Field label="Phone">
                    <Input {...businessForm.register("phone")} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Currency">
                      <Input disabled {...businessForm.register("currency")} />
                    </Field>
                    <Field label="Timezone">
                      <Input disabled {...businessForm.register("timezone")} />
                    </Field>
                  </div>
                  <Field label="Address">
                    <Textarea rows={3} {...businessForm.register("address")} />
                  </Field>
                  <Field label="Address in Urdu">
                    <Textarea dir="rtl" lang="ur" rows={3} {...businessForm.register("addressUrdu")} />
                  </Field>
                  <Field label="Invoice thank-you message">
                    <Input {...businessForm.register("thankYou")} />
                  </Field>
                  <Field label="Urdu thank-you message">
                    <Input dir="rtl" lang="ur" {...businessForm.register("thankYouUrdu")} />
                  </Field>
                </div>
              </SettingsCard>
              <SettingsCard icon={<KeyRound />} title="FBR digital invoicing" note="Posted sales are queued locally, then validated and submitted one at a time.">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border bg-slate-50 p-4">
                    <label className="flex items-center gap-3 text-sm font-semibold">
                      <input type="checkbox" className="h-4 w-4 accent-primary" {...businessForm.register("fbrEnabled")} />
                      Submit posted sales to FBR
                    </label>
                    <span className={cn("rounded-full px-3 py-1 text-xs font-bold", fbrEnabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600")}>{fbrEnabled ? "ENABLED" : "OFF"}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Seller NTN/CNIC" error={businessForm.formState.errors.sellerNTNCNIC?.message}>
                      <Input placeholder="1234567 or 1234567890123" {...businessForm.register("sellerNTNCNIC")} />
                    </Field>
                    <Field label="Seller province" error={businessForm.formState.errors.sellerProvince?.message}>
                      <Input placeholder="Punjab" {...businessForm.register("sellerProvince")} />
                    </Field>
                    <Field label="Environment">
                      <select className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" {...businessForm.register("fbrEnvironment")} onChange={(event) => { businessForm.setValue("fbrEnvironment", event.target.value as "SANDBOX" | "PRODUCTION", { shouldDirty: true, shouldValidate: true }); setFbrTokenConfigured(false); }}>
                        <option value="SANDBOX">Sandbox</option>
                        <option value="PRODUCTION">Production</option>
                      </select>
                    </Field>
                    <Field label="Scenario ID" error={businessForm.formState.errors.fbrScenarioId?.message}>
                      <Input placeholder="SN001" {...businessForm.register("fbrScenarioId")} />
                      <p className="mt-1 text-xs text-muted-foreground">Sandbox: SN001 is for registered buyers; SN002 is for walk-in or unregistered buyers.</p>
                    </Field>
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <strong className="text-sm">{fbrEnvironment === "PRODUCTION" ? "Production" : "Sandbox"} token</strong>
                      <span className={cn("rounded-full px-3 py-1 text-xs font-bold", fbrTokenConfigured ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>{fbrTokenConfigured ? "CONFIGURED" : "REQUIRED"}</span>
                    </div>
                    <div className="flex gap-2">
                      <Input type="password" value={fbrToken} onChange={(event) => setFbrToken(event.target.value)} placeholder="PRAL/FBR security token" autoComplete="off" />
                      <Button type="button" variant="outline" disabled={fbrTokenBusy || !fbrToken.trim()} onClick={() => void saveFbrToken()}>
                        {fbrTokenBusy ? <LoaderCircle className="mr-2 animate-spin" size={17} /> : <Save className="mr-2" size={17} />}
                        Save token
                      </Button>
                      <Button type="button" variant="ghost" disabled={fbrTokenBusy || !fbrTokenConfigured} onClick={() => void clearFbrToken()}>
                        Clear
                      </Button>
                      <Button type="button" variant="outline" disabled={fbrTokenBusy || fbrTesting || !fbrTokenConfigured} onClick={() => void testFbrConnection()}>
                        {fbrTesting ? <LoaderCircle className="mr-2 animate-spin" size={17} /> : <Wifi className="mr-2" size={17} />}
                        Test connection
                      </Button>
                    </div>
                  </div>
                </div>
              </SettingsCard>
              <SettingsCard icon={<ImagePlus />} title="Agency logo" note="PNG, JPEG, or WebP; maximum 1 MB.">
                <div className="flex items-center gap-5">
                  {logo ? (
                    <img src={logo} className="h-24 w-24 rounded-xl border object-contain p-2" alt="Agency logo preview" />
                  ) : (
                    <span className="grid h-24 w-24 place-items-center rounded-xl border border-dashed text-muted-foreground">
                      <ImagePlus />
                    </span>
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => document.getElementById("agency-logo")?.click()}>
                      Choose logo
                    </Button>
                    {logo && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          businessForm.setValue("logoDataUrl", null, {
                            shouldDirty: true,
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                    <input
                      id="agency-logo"
                      hidden
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      onChange={(event) => {
                        void chooseLogo(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
              </SettingsCard>
              <div className="flex justify-end">
                <Button size="lg" disabled={businessForm.formState.isSubmitting}>
                  <Save className="mr-2" size={18} />
                  Save agency details
                </Button>
              </div>
            </form>
          )}

          {tab === "behavior" && (
            <div className="space-y-4">
              <form onSubmit={shortcutForm.handleSubmit((value) => save("shortcuts", value, "POS shortcuts saved."))}>
                <SettingsCard icon={<Keyboard />} title="POS keyboard shortcuts" note="Each action must use a different function key.">
                  <div className="grid grid-cols-2 gap-4">
                    <Shortcut label="Focus product search" registration={shortcutForm.register("focusSearch")} />
                    <Shortcut label="Open checkout" registration={shortcutForm.register("checkout")} />
                    <Shortcut label="Hold current sale" registration={shortcutForm.register("holdSale")} />
                    <Shortcut label="Resume held sale" registration={shortcutForm.register("resumeSale")} />
                  </div>
                  {shortcutForm.formState.errors.root?.message && <p className="text-sm text-red-700">{shortcutForm.formState.errors.root.message}</p>}
                  <div className="mt-5 flex justify-end">
                    <Button>
                      <Save className="mr-2" size={17} />
                      Save shortcuts
                    </Button>
                  </div>
                </SettingsCard>
              </form>
              <form onSubmit={printingForm.handleSubmit((value) => save("printing", value, "Printing defaults saved."))}>
                <SettingsCard icon={<Printer />} title="Invoice printing" note="Defaults used when a cashier opens POS.">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Default invoice paper">
                      <select className="h-11 w-full rounded-lg border bg-white px-3" {...printingForm.register("defaultPaper")}>
                        <option value="A4">A4 paper</option>
                        <option value="THERMAL_80MM">80mm thermal</option>
                      </select>
                    </Field>
                    <label className="mt-7 flex h-11 items-center gap-3 rounded-lg border bg-slate-50 px-4 text-sm font-semibold">
                      <input type="checkbox" className="h-4 w-4 accent-primary" {...printingForm.register("autoPrint")} />
                      Print automatically after checkout
                    </label>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <Button>
                      <Save className="mr-2" size={17} />
                      Save printing defaults
                    </Button>
                  </div>
                </SettingsCard>
              </form>
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-4">
              <SettingsCard icon={<HardDriveDownload />} title="Local database backup" note="Save a complete copy of products, stock, sales, purchases, khata, and settings.">
                <div className="flex items-center justify-between gap-5 rounded-xl border bg-slate-50 p-4">
                  <div>
                    <strong className="block">{backup ? `Last backup: ${new Date(backup.createdAt).toLocaleString()}` : "No backup recorded"}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">{backup ? `${backup.details?.fileName ?? "Database backup"} · ${formatBytes(backup.details?.sizeBytes)} · by ${backup.createdBy}` : "Create your first backup and keep a copy on another drive."}</span>
                  </div>
                  <Button size="lg" disabled={backingUp} onClick={() => void createBackup()}>
                    {backingUp ? <LoaderCircle className="mr-2 animate-spin" /> : <HardDriveDownload className="mr-2" />}
                    Create backup
                  </Button>
                </div>
                <div className="mt-3 flex gap-2"><Button variant="outline" onClick={() => void importBackup()}><Upload className="mr-2" size={17}/>Import backup</Button></div>
                {localBackups.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border"><div className="max-h-52 overflow-auto scrollbar-hidden">{localBackups.slice(0, 20).map((row) => <div key={row.id} className="flex items-center justify-between gap-4 border-b px-4 py-3 last:border-0"><div className="min-w-0"><strong className="block truncate text-sm">{row.fileName}</strong><span className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()} · {formatBytes(row.sizeBytes)} · {row.kind.replaceAll("_", " ")}{row.driveUploadedAt ? " · Drive uploaded" : " · Drive pending"}</span></div><Button variant="outline" size="sm" onClick={() => void window.agencyDesktop?.restoreBackup(token, row.localPath)}><RotateCcw className="mr-2" size={15}/>Restore</Button></div>)}</div></div>}
                <form className="mt-4 flex items-end gap-3" onSubmit={backupForm.handleSubmit((value) => save("backup", value, "Backup reminder saved."))}>
                  <Field label="Remind me if no backup for">
                    <select
                      className="h-11 min-w-52 rounded-lg border bg-white px-3"
                      {...backupForm.register("reminderDays", {
                        valueAsNumber: true,
                      })}
                    >
                      <option value="1">1 day</option>
                      <option value="3">3 days</option>
                      <option value="7">7 days</option>
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                    </select>
                  </Field>
                  <Button variant="outline">Save reminder</Button>
                </form>
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <ShieldCheck className="mt-0.5 shrink-0" size={19} />
                  <p className="m-0">
                    <strong className="block">Keep backups outside this computer</strong>A backup stored only on the same disk will not protect against disk failure or theft.
                  </p>
                </div>
              </SettingsCard>
              <SettingsCard icon={<Cloud />} title="Google Drive backup" note="Encrypted backup files only; operational data remains local-first.">
                <div className="flex items-center justify-between rounded-xl border bg-slate-50 p-4">
                  <div>
                    <strong className="block">{googleConnected ? "Google Drive connected" : "Google Drive is not connected"}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">Backups upload to Oil POS Backups. Failed uploads remain queued locally.</span>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-bold", googleConnected ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600")}>{googleConnected ? "CONNECTED" : "OFFLINE"}</span>
                </div>
                {!googleConnected ? <div className="mt-4 flex gap-2"><Input value={googleClientId} onChange={(event) => setGoogleClientId(event.target.value)} placeholder="Google Desktop OAuth client ID"/><Button disabled={!googleClientId.trim()} onClick={() => void connectGoogle()}>Connect Google</Button></div> : <><div className="mt-4 flex gap-2"><Button onClick={() => void window.agencyDesktop?.uploadPendingBackups(token).then(() => setMessage("Pending backup upload started."))}>Upload pending</Button><Button variant="outline" onClick={() => void loadDriveBackups()}>Restore from Drive</Button><Button variant="outline" onClick={() => void window.agencyDesktop?.disconnectGoogleDrive(token).then(() => { setGoogleConnected(false); setDriveBackups([]); })}>Disconnect</Button></div>{driveBackups.length > 0 && <div className="mt-4 overflow-hidden rounded-xl border">{driveBackups.map((row) => <div key={row.id} className="flex items-center justify-between border-b px-4 py-3 last:border-0"><div><strong className="block text-sm">{row.name}</strong><span className="text-xs text-muted-foreground">{row.createdTime ? new Date(row.createdTime).toLocaleString() : "Drive backup"} · {row.size ? formatBytes(Number(row.size)) : "size unavailable"}</span></div><Button size="sm" variant="outline" onClick={() => void window.agencyDesktop?.restoreGoogleBackup(token, row.id)}><RotateCcw className="mr-2" size={15}/>Restore</Button></div>)}</div>}</>}
              </SettingsCard>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsTab({ active, icon, title, note, onClick }: { active: boolean; icon: React.ReactNode; title: string; note: string; onClick(): void }) {
  return (
    <button className={cn("flex w-full items-center gap-3 rounded-xl p-3 text-left transition", active ? "bg-primary/10 text-primary" : "text-slate-600 hover:bg-muted")} onClick={onClick}>
      <span className={cn("grid h-9 w-9 place-items-center rounded-lg [&>svg]:h-4 [&>svg]:w-4", active ? "bg-primary text-white" : "bg-slate-100")}>{icon}</span>
      <span>
        <strong className="block text-sm">{title}</strong>
        <span className="block text-[10px] text-muted-foreground">{note}</span>
      </span>
    </button>
  );
}
function SettingsCard({ icon, title, note, children }: { icon: React.ReactNode; title: string; note: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div>
          <h2 className="m-0 text-lg">{title}</h2>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">{note}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}
function Field({ label, error, children }: { label: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="text-sm font-semibold">
      <span className="mb-2 block">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}
function Shortcut({ label, registration }: { label: string; registration: UseFormRegisterReturn }) {
  return (
    <Field label={label}>
      <select className="h-11 w-full rounded-lg border bg-white px-3" {...registration}>
        {SHORTCUT_KEYS.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </select>
    </Field>
  );
}
function formatBytes(value?: number) {
  if (!value) return "size unavailable";
  return value >= 1_048_576 ? `${(value / 1_048_576).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;
}
