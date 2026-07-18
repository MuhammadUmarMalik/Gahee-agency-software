import * as React from "react";
import { cn } from "@/lib/cn";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => <input ref={ref} className={cn("flex h-11 w-full rounded-xl border border-border bg-white px-3.5 py-2 text-sm shadow-[0_1px_2px_rgba(15,23,42,.02)] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground disabled:opacity-100", className)} {...props}/>);
Input.displayName = "Input";
