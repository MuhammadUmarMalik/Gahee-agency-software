import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import type { z } from "zod";
import { setupOwnerInputSchema, type SetupOwnerInput } from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type SecretField = "password" | "confirmPassword" | "ownerPin" | "confirmOwnerPin";

export function OwnerSetupPage({ onCompleted }: { onCompleted(input: SetupOwnerInput): Promise<void> }) {
  const [visibleFields, setVisibleFields] = useState<Record<SecretField, boolean>>({
    password: false,
    confirmPassword: false,
    ownerPin: false,
    confirmOwnerPin: false,
  });
  const [serverError, setServerError] = useState("");
  const form = useForm<z.input<typeof setupOwnerInputSchema>, unknown, SetupOwnerInput>({
    resolver: zodResolver(setupOwnerInputSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      displayName: "",
      username: "",
      password: "",
      confirmPassword: "",
      ownerPin: "",
      confirmOwnerPin: "",
    },
  });

  async function submit(input: SetupOwnerInput) {
    setServerError("");
    try {
      await apiRequest("/auth/setup-owner", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await onCompleted(input);
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "Owner setup could not be completed. Please try again.");
    }
  }

  function toggleVisibility(field: SecretField) {
    setVisibleFields((current) => ({ ...current, [field]: !current[field] }));
  }

  const { errors, isSubmitting } = form.formState;
  const password = form.watch("password");
  const confirmPassword = form.watch("confirmPassword");
  const ownerPin = form.watch("ownerPin");
  const confirmOwnerPin = form.watch("confirmOwnerPin");

  return (
    <main className="h-screen overflow-y-auto bg-emerald-50/60 px-4 py-5 sm:px-6 sm:py-8 lg:grid lg:place-items-center lg:p-6">
      <Card className="mx-auto w-full max-w-5xl overflow-hidden border-white/70 shadow-[0_24px_70px_rgba(18,55,39,.14)]">
        <div className="grid lg:min-h-[660px] lg:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="flex bg-primary px-6 py-6 text-white sm:px-8 lg:flex-col lg:px-9 lg:py-10">
            <div className="flex min-w-0 flex-1 items-center gap-4 lg:block">
              <img src="/app-icon.svg" alt="Oil Agency POS" className="h-14 w-14 shrink-0 rounded-2xl shadow-sm lg:h-16 lg:w-16" />
              <div className="min-w-0 lg:mt-9">
                <p className="m-0 text-[11px] font-bold uppercase tracking-[.2em] text-emerald-100">First-time setup</p>
                <h1 className="mb-0 mt-1 text-xl font-bold leading-tight text-white sm:text-2xl lg:mt-3 lg:text-4xl lg:leading-[1.08]">
                  Your business starts here.
                </h1>
              </div>
            </div>

            <p className="mt-5 hidden text-sm leading-6 text-emerald-50/90 lg:block">
              Create the one account with full control of your agency. You can add admins and cashiers afterward.
            </p>

            <ul className="mt-8 hidden space-y-4 p-0 text-sm text-emerald-50 lg:block">
              <SetupBenefit>Manage users and permissions</SetupBenefit>
              <SetupBenefit>Review financial reports and backups</SetupBenefit>
              <SetupBenefit>Approve protected actions with your PIN</SetupBenefit>
            </ul>

            <div className="ml-5 hidden max-w-[230px] items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 text-xs leading-5 text-emerald-50 md:flex lg:ml-0 lg:mt-auto">
              <ShieldCheck className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
              <span>Your password and PIN are securely hashed before being stored on this computer.</span>
            </div>
          </aside>

          <CardContent className="p-6 sm:p-8">
            <header className="flex flex-col gap-3 border-b border-border/80 pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-[.16em] text-primary">Owner account</p>
                <h2 className="mb-0 mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Set up your credentials</h2>
                <p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  There are no default credentials. Choose details you’ll remember and keep them private.
                </p>
              </div>
              <span className="w-fit shrink-0 rounded-full bg-primary/[.08] px-3 py-1.5 text-xs font-semibold text-primary">
                One-time setup
              </span>
            </header>

            <form className="mt-5 space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
              <section aria-labelledby="profile-heading">
                <SectionHeading icon={<UserRound size={17} />} id="profile-heading" title="Profile" description="How your owner account will appear" />
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field id="displayName" label="Owner name" error={errors.displayName?.message} hint="Your full name, as staff will see it">
                    <Input
                      id="displayName"
                      autoFocus
                      autoComplete="name"
                      placeholder="e.g. Ali Imran"
                      aria-invalid={Boolean(errors.displayName)}
                      aria-describedby={errors.displayName ? "displayName-error" : "displayName-hint"}
                      {...form.register("displayName")}
                    />
                  </Field>
                  <Field id="username" label="Username" error={errors.username?.message} hint="Letters, numbers, dots, underscores or hyphens">
                    <Input
                      id="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="username"
                      spellCheck={false}
                      placeholder="e.g. ali.imran"
                      aria-invalid={Boolean(errors.username)}
                      aria-describedby={errors.username ? "username-error" : "username-hint"}
                      {...form.register("username")}
                    />
                  </Field>
                </div>
              </section>

              <section aria-labelledby="security-heading">
                <SectionHeading icon={<LockKeyhole size={17} />} id="security-heading" title="Password" description="Used to sign in to Oil Agency POS" />
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field id="password" label="Password" error={errors.password?.message}>
                    <SecretInput
                      id="password"
                      visible={visibleFields.password}
                      onToggle={() => toggleVisibility("password")}
                      autoComplete="new-password"
                      registration={form.register("password")}
                      invalid={Boolean(errors.password)}
                      describedBy={errors.password ? "password-error" : "password-requirements"}
                    />
                  </Field>
                  <Field
                    id="confirmPassword"
                    label="Confirm password"
                    error={errors.confirmPassword?.message}
                    success={Boolean(confirmPassword && password === confirmPassword) ? "Passwords match" : undefined}
                  >
                    <SecretInput
                      id="confirmPassword"
                      visible={visibleFields.confirmPassword}
                      onToggle={() => toggleVisibility("confirmPassword")}
                      autoComplete="new-password"
                      registration={form.register("confirmPassword")}
                      invalid={Boolean(errors.confirmPassword)}
                      describedBy={errors.confirmPassword ? "confirmPassword-error" : undefined}
                    />
                  </Field>
                </div>
                <PasswordRequirements password={password} />
              </section>

              <section aria-labelledby="pin-heading">
                <SectionHeading icon={<KeyRound size={17} />} id="pin-heading" title="Owner PIN" description="Used only for sensitive approvals" />
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field id="ownerPin" label="4–12 digit PIN" error={errors.ownerPin?.message}>
                    <SecretInput
                      id="ownerPin"
                      numeric
                      visible={visibleFields.ownerPin}
                      onToggle={() => toggleVisibility("ownerPin")}
                      autoComplete="new-password"
                      registration={form.register("ownerPin")}
                      invalid={Boolean(errors.ownerPin)}
                      describedBy={errors.ownerPin ? "ownerPin-error" : "pin-guidance"}
                    />
                  </Field>
                  <Field
                    id="confirmOwnerPin"
                    label="Confirm owner PIN"
                    error={errors.confirmOwnerPin?.message}
                    success={Boolean(confirmOwnerPin && ownerPin === confirmOwnerPin) ? "PINs match" : undefined}
                  >
                    <SecretInput
                      id="confirmOwnerPin"
                      numeric
                      visible={visibleFields.confirmOwnerPin}
                      onToggle={() => toggleVisibility("confirmOwnerPin")}
                      autoComplete="new-password"
                      registration={form.register("confirmOwnerPin")}
                      invalid={Boolean(errors.confirmOwnerPin)}
                      describedBy={errors.confirmOwnerPin ? "confirmOwnerPin-error" : undefined}
                    />
                  </Field>
                </div>
                <div id="pin-guidance" className="mt-2.5 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900">
                  <KeyRound className="mt-0.5 shrink-0 text-amber-700" size={15} aria-hidden="true" />
                  <span>The owner PIN approves discounts beyond cashier limits. Keep it different from your password and never share it with staff.</span>
                </div>
              </section>

              {serverError && (
                <div role="alert" className="border border-red-200 bg-red-50 p-3.5 text-sm text-red-800">
                  {serverError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-4 border-t border-border/80 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="shrink-0 text-primary" size={16} aria-hidden="true" />
                  Your business data stays on this computer.
                </p>
                <Button size="lg" className="w-full min-w-[230px] sm:w-auto" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><LoaderCircle className="mr-2 animate-spin" size={18} />Creating owner…</>
                  ) : (
                    <>Create owner account<ArrowRight className="ml-2" size={18} /></>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </div>
      </Card>
    </main>
  );
}

function SetupBenefit({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[.12]"><Check size={14} aria-hidden="true" /></span><span className="pt-0.5 leading-5">{children}</span></li>;
}

function SectionHeading({ icon, id, title, description }: { icon: React.ReactNode; id: string; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/[.08] text-primary" aria-hidden="true">{icon}</span>
      <div>
        <h3 id={id} className="m-0 text-sm font-bold">{title}</h3>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Field({ id, label, hint, error, success, children }: { id: string; label: string; hint?: string; error?: string | undefined; success?: string | undefined; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {success && <span className="flex items-center gap-1 text-[11px] font-semibold text-primary"><CheckCircle2 size={13} aria-hidden="true" />{success}</span>}
      </div>
      {children}
      {error ? <span id={`${id}-error`} role="alert" className="mt-1.5 block text-xs leading-5 text-destructive">{error}</span> : hint ? <span id={`${id}-hint`} className="mt-1.5 block text-[11px] leading-4 text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function SecretInput({ id, visible, numeric = false, onToggle, autoComplete, registration, invalid, describedBy }: { id: SecretField; visible: boolean; numeric?: boolean; onToggle(): void; autoComplete: string; registration: UseFormRegisterReturn; invalid: boolean; describedBy?: string | undefined }) {
  return (
    <span className="relative block">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        inputMode={numeric ? "numeric" : undefined}
        pattern={numeric ? "[0-9]*" : undefined}
        maxLength={numeric ? 12 : 128}
        autoComplete={autoComplete}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn("pr-11", invalid && "border-destructive focus:border-destructive focus:ring-destructive/15")}
        {...registration}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? `Hide ${id === "ownerPin" || id === "confirmOwnerPin" ? "PIN" : "password"}` : `Show ${id === "ownerPin" || id === "confirmOwnerPin" ? "PIN" : "password"}`}
        className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-r-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
      >
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </span>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { label: "10+ characters", met: password.length >= 10 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Lowercase", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
  ];
  return (
    <div id="password-requirements" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/60 px-3.5 py-3" aria-label="Password requirements">
      <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Password needs:</span>
      {requirements.map((requirement) => (
        <span key={requirement.label} className={cn("flex items-center gap-1.5 text-[11px] font-medium", requirement.met ? "text-primary" : "text-muted-foreground")}>
          {requirement.met ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
          {requirement.label}
        </span>
      ))}
    </div>
  );
}
