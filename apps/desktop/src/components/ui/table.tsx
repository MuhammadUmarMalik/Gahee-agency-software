import type { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) { return <div className="w-full overflow-auto"><table className={cn("w-full caption-bottom text-sm", className)} {...props}/></div>; }
export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) { return <thead className="border-b bg-slate-50/80" {...props}/>; }
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) { return <tbody {...props}/>; }
export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) { return <tr className={cn("border-b transition-colors last:border-0 hover:bg-primary/[.025]", className)} {...props}/>; }
export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) { return <th className={cn("h-12 px-4 text-left align-middle text-[11px] font-bold uppercase tracking-[.06em] text-muted-foreground", className)} {...props}/>; }
export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) { return <td className={cn("p-4 align-middle", className)} {...props}/>; }
