import * as React from "react";
import { cn } from "@/lib/cn";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("flex min-h-24 w-full resize-y rounded-xl border border-border bg-white px-3.5 py-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,.02)] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground", className)} {...props}/>);
Textarea.displayName = "Textarea";
