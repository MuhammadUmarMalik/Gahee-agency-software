import { zodResolver } from "@hookform/resolvers/zod";
import {
  Code2,
  Eye,
  EyeOff,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { loginInputSchema, type LoginInput } from "@oil-agency/shared";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(input: LoginInput) {
    setServerError(null);
    try {
      await login(input);
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? error.message
          : "The local service is unavailable. Please restart the application.",
      );
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-[minmax(420px,560px)_1fr] bg-background">
      <section className="flex items-center justify-center border-r bg-white px-12">
        <div className="w-full max-w-sm">
          <div className="mb-9 flex items-center gap-3">
            <img
              src="/app-icon.svg"
              className="h-12 w-12 rounded-xl shadow-sm"
              alt="Oil Agency POS logo"
            />
            <div>
              <p className="m-0 text-lg font-bold">Oil Agency POS</p>
              <p className="m-0 text-sm text-muted-foreground">
                Stock, sales and khata
              </p>
            </div>
          </div>
          <Card className="border-0 shadow-none">
            <CardHeader className="px-0">
              <h1 className="m-0 text-3xl font-bold tracking-tight">
                Welcome back
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to begin today’s work.
              </p>
            </CardHeader>
            <CardContent className="px-0">
              <form
                className="space-y-5"
                onSubmit={handleSubmit(onSubmit)}
                noValidate
              >
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">
                    Username
                  </span>
                  <Input
                    autoFocus
                    autoComplete="username"
                    {...register("username")}
                  />
                  {errors.username && (
                    <span className="mt-1 block text-sm text-destructive">
                      {errors.username.message}
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">
                    Password
                  </span>
                  <span className="relative block">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-11"
                      {...register("password")}
                    />
                    <button
                      type="button"
                      className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-muted-foreground"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                  {errors.password && (
                    <span className="mt-1 block text-sm text-destructive">
                      {errors.password.message}
                    </span>
                  )}
                </label>
                {serverError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {serverError}
                  </div>
                )}
                <Button size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="mr-2 animate-spin" size={18} />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
          <p className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole size={14} />
            Your business data stays on this computer.
          </p>
          <div className="mt-5 border-t pt-5">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-foreground">
              <Code2 size={14} className="text-primary" />
              Developed &amp; supported by Umar Malik
            </p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <a
                className="flex items-center gap-2 hover:text-primary"
                href="https://www.umarmalik-dev.com"
                target="_blank"
                rel="noreferrer"
              >
                <Globe2 size={14} />
                www.umarmalik-dev.com
              </a>
              <a
                className="flex items-center gap-2 hover:text-primary"
                href="https://wa.me/923062617205"
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={14} />
                WhatsApp: +92 306 2617205
              </a>
            </div>
          </div>
        </div>
      </section>
      <section className="relative flex items-end overflow-hidden bg-emerald-50 p-16 text-foreground">
        <div className="absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full border-[90px] border-emerald-100/80" />
        <div className="absolute bottom-24 right-20 h-44 w-44 rounded-full bg-white/60 blur-2xl" />
        <div className="relative max-w-xl">
          <div className="mb-8 flex items-center gap-4">
            <img
              src="/app-icon.svg"
              className="h-16 w-16 rounded-2xl shadow-lg"
              alt=""
            />
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-[.2em] text-primary">
                Umar Malik presents
              </p>
              <p className="mb-0 mt-1 text-sm font-semibold">
                Purpose-built business software
              </p>
            </div>
          </div>
          <p className="mb-4 text-sm font-bold uppercase tracking-[.22em] text-primary">
            Simple daily operations
          </p>
          <h2 className="m-0 text-5xl font-semibold leading-tight">
            Every pack, tin and balance in one place.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
            Designed for a single-location cooking oil and ghee agency. Fast
            enough for the counter, clear enough for everyone.
          </p>
          <p className="mt-10 text-sm font-medium text-emerald-900">
            Software development · Business automation · Technical support
          </p>
        </div>
      </section>
    </main>
  );
}
