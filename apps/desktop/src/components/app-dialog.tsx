import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DialogRequest = { type: "confirm" | "prompt"; title: string; description: string; confirmLabel: string; destructive?: boolean; placeholder?: string };
type DialogApi = { confirm(request: Omit<DialogRequest, "type">): Promise<boolean>; prompt(request: Omit<DialogRequest, "type">): Promise<string | null> };
const DialogContext = createContext<DialogApi | null>(null);

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((value: boolean | string | null) => void) | null>(null);
  const open = useCallback((next: DialogRequest) => new Promise<boolean | string | null>((resolve) => { resolver.current = resolve; setValue(""); setRequest(next); }), []);
  const close = useCallback((result: boolean | string | null) => { resolver.current?.(result); resolver.current = null; setRequest(null); }, []);
  const api: DialogApi = { confirm: (next) => open({ ...next, type: "confirm" }) as Promise<boolean>, prompt: (next) => open({ ...next, type: "prompt" }) as Promise<string | null> };
  return <DialogContext.Provider value={api}>{children}{request && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-900/30 p-6 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) close(request.type === "confirm" ? false : null); }}><div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"><div className="flex items-start gap-3 p-6 pb-4"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${request.destructive ? "bg-red-50 text-red-700" : "bg-emerald-50 text-primary"}`}>{request.destructive ? <AlertTriangle size={20}/> : <HelpCircle size={20}/>}</span><div className="min-w-0 flex-1"><h2 className="m-0 text-xl font-bold">{request.title}</h2><p className="mb-0 mt-2 text-sm leading-6 text-muted-foreground">{request.description}</p></div><button aria-label="Close dialog" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" onClick={() => close(request.type === "confirm" ? false : null)}><X size={18}/></button></div>{request.type === "prompt" && <div className="px-6 pb-2"><Input autoFocus placeholder={request.placeholder} value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && value.trim()) close(value.trim()); }}/></div>}<div className="mt-3 flex justify-end gap-2 border-t bg-slate-50/70 p-4"><Button variant="outline" onClick={() => close(request.type === "confirm" ? false : null)}>Cancel</Button><Button variant={request.destructive ? "destructive" : "default"} disabled={request.type === "prompt" && !value.trim()} onClick={() => close(request.type === "confirm" ? true : value.trim())}>{request.confirmLabel}</Button></div></div></div>}</DialogContext.Provider>;
}

export function useAppDialog() { const context = useContext(DialogContext); if (!context) throw new Error("useAppDialog must be used inside AppDialogProvider."); return context; }
