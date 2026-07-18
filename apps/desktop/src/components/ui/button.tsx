import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva("inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50", { variants: { variant: { default: "bg-primary text-primary-foreground hover:bg-primary/90", outline: "border border-border bg-white text-foreground hover:border-primary/30 hover:bg-primary/5", ghost: "bg-transparent shadow-none hover:bg-muted", destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90" }, size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-lg px-3", lg: "h-12 px-6 text-base" } }, defaultVariants: { variant: "default", size: "default" } });

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => { const Component = asChild ? Slot : "button"; return <Component className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}/>; });
Button.displayName = "Button";
