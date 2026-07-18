import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PosProduct } from "@oil-agency/shared";

export interface PosCartItem { key: string; product: PosProduct; unit: "PACK" | "BASE"; quantity: number }
export interface PosCartSnapshot { items: PosCartItem[]; customerId: string | null; saleType: "RETAIL" | "WHOLESALE"; discountBps: number; notes: string }
interface PosCartState extends PosCartSnapshot {
  add(product: PosProduct, unit?: "PACK" | "BASE"): void; remove(key: string): void; setQuantity(key: string, quantity: number): void; setUnit(key: string, unit: "PACK" | "BASE"): void;
  setCustomer(customerId: string | null): void; setSaleType(saleType: "RETAIL" | "WHOLESALE"): void; setDiscount(discountBps: number): void; setNotes(notes: string): void; clear(): void; restore(snapshot: PosCartSnapshot): void;
}
const initial: PosCartSnapshot = { items: [], customerId: null, saleType: "RETAIL", discountBps: 0, notes: "" };
const keyFor = (productId: string, unit: "PACK" | "BASE") => `${productId}:${unit}`;
export const usePosCartStore = create<PosCartState>()(persist((set) => ({
  ...initial,
  add(product, unit = "BASE") { set((state) => { const key = keyFor(product.id, unit), existing = state.items.find((item) => item.key === key); return { items: existing ? state.items.map((item) => item.key === key ? { ...item, quantity: item.quantity + 1, product } : item) : [...state.items, { key, product, unit, quantity: 1 }] }; }); },
  remove(key) { set((state) => ({ items: state.items.filter((item) => item.key !== key) })); },
  setQuantity(key, quantity) { set((state) => ({ items: quantity <= 0 ? state.items.filter((item) => item.key !== key) : state.items.map((item) => item.key === key ? { ...item, quantity: Math.min(1_000_000, Math.floor(quantity)) } : item) })); },
  setUnit(key, unit) { set((state) => { const current = state.items.find((item) => item.key === key); if (!current) return state; const newKey = keyFor(current.product.id, unit), target = state.items.find((item) => item.key === newKey); return { items: target ? state.items.filter((item) => item.key !== key).map((item) => item.key === newKey ? { ...item, quantity: item.quantity + current.quantity } : item) : state.items.map((item) => item.key === key ? { ...item, key: newKey, unit } : item) }; }); },
  setCustomer(customerId) { set({ customerId }); }, setSaleType(saleType) { set({ saleType }); }, setDiscount(discountBps) { set({ discountBps }); }, setNotes(notes) { set({ notes }); },
  clear() { set(initial); }, restore(snapshot) { set(snapshot); },
}), { name: "oil-agency-pos-cart", version: 1 }));
