import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { lazy, Suspense } from "react";
import { PERMISSIONS } from "@oil-agency/shared";
import { ProtectedRoute } from "@/components/protected-route";
import { AppDialogProvider } from "@/components/app-dialog";
import { AppLayout } from "@/layouts/app-layout";
import { LoginPage } from "@/pages/login-page";
import { useAuthStore } from "@/stores/auth-store";

const HomePage = lazy(() => import("@/pages/home-page").then((module) => ({ default: module.HomePage })));
const UsersPage = lazy(() => import("@/pages/users-page").then((module) => ({ default: module.UsersPage })));
const ProductsPage = lazy(() => import("@/pages/products-page").then((module) => ({ default: module.ProductsPage })));
const ProductFormPage = lazy(() => import("@/pages/product-form-page").then((module) => ({ default: module.ProductFormPage })));
const ProductDetailPage = lazy(() => import("@/pages/product-detail-page").then((module) => ({ default: module.ProductDetailPage })));
const InventoryPage = lazy(() => import("@/pages/inventory-page").then((module) => ({ default: module.InventoryPage })));
const InventoryMovementsPage = lazy(() => import("@/pages/inventory-movements-page").then((module) => ({ default: module.InventoryMovementsPage })));
const InventoryAdjustmentPage = lazy(() => import("@/pages/inventory-adjustment-page").then((module) => ({ default: module.InventoryAdjustmentPage })));
const StockCountPage = lazy(() => import("@/pages/stock-count-page").then((module) => ({ default: module.StockCountPage })));
const PurchasesPage = lazy(() => import("@/pages/purchases-page").then((module) => ({ default: module.PurchasesPage })));
const PurchaseFormPage = lazy(() => import("@/pages/purchase-form-page").then((module) => ({ default: module.PurchaseFormPage })));
const PurchaseDetailPage = lazy(() => import("@/pages/purchase-detail-page").then((module) => ({ default: module.PurchaseDetailPage })));
const PosPage = lazy(() => import("@/pages/pos-page").then((module) => ({ default: module.PosPage })));
const CustomersPage = lazy(() => import("@/pages/customers-page").then((module) => ({ default: module.CustomersPage })));
const CustomerFormPage = lazy(() => import("@/pages/customer-form-page").then((module) => ({ default: module.CustomerFormPage })));
const CustomerDetailPage = lazy(() => import("@/pages/customer-detail-page").then((module) => ({ default: module.CustomerDetailPage })));
const CustomerRecoveryPage = lazy(() => import("@/pages/customer-recovery-page").then((module) => ({ default: module.CustomerRecoveryPage })));
const SuppliersPage = lazy(() => import("@/pages/suppliers-page").then((module) => ({ default: module.SuppliersPage })));
const SupplierFormPage = lazy(() => import("@/pages/supplier-form-page").then((module) => ({ default: module.SupplierFormPage })));
const SupplierDetailPage = lazy(() => import("@/pages/supplier-detail-page").then((module) => ({ default: module.SupplierDetailPage })));
const SupplierOutstandingPage = lazy(() => import("@/pages/supplier-outstanding-page").then((module) => ({ default: module.SupplierOutstandingPage })));
const SalesReturnPage = lazy(() => import("@/pages/sales-return-page").then((module) => ({ default: module.SalesReturnPage })));
const CashbookPage = lazy(() => import("@/pages/cashbook-page").then((module) => ({ default: module.CashbookPage })));
const ExpensesPage = lazy(() => import("@/pages/expenses-page").then((module) => ({ default: module.ExpensesPage })));
const ReportsPage = lazy(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })));
const SettingsPage = lazy(() => import("@/pages/settings-page").then((module) => ({ default: module.SettingsPage })));
const AccountingPage = lazy(() => import("@/pages/accounting-page").then((module) => ({ default: module.AccountingPage })));
const PurchaseReturnsPage = lazy(() => import("@/pages/purchase-returns-page").then((module) => ({ default: module.PurchaseReturnsPage })));

const router = createBrowserRouter([{ path: "/", element: <ProtectedRoute><AppLayout/></ProtectedRoute>, children: [
  { index: true, element: <HomePage/> },
  { path: "pos", element: <ProtectedRoute permission={PERMISSIONS.POS_USE}><PosPage/></ProtectedRoute> },
  { path: "sales-returns", element: <ProtectedRoute permission={PERMISSIONS.SALES_RETURN}><SalesReturnPage/></ProtectedRoute> },
  { path: "cashbook", element: <ProtectedRoute permission={PERMISSIONS.CASHBOOK_VIEW}><CashbookPage/></ProtectedRoute> },
  { path: "expenses", element: <ProtectedRoute permission={PERMISSIONS.CASHBOOK_VIEW}><ExpensesPage/></ProtectedRoute> },
  { path: "reports", element: <ProtectedRoute permission={PERMISSIONS.REPORTS_BASIC}><ReportsPage/></ProtectedRoute> },
  { path: "accounting", element: <ProtectedRoute permission={PERMISSIONS.ACCOUNTING_VIEW}><AccountingPage/></ProtectedRoute> },
  { path: "products", element: <ProtectedRoute permission={PERMISSIONS.PRODUCTS_MANAGE}><ProductsPage/></ProtectedRoute> },
  { path: "products/new", element: <ProtectedRoute permission={PERMISSIONS.PRODUCTS_MANAGE}><ProductFormPage/></ProtectedRoute> },
  { path: "products/:id/edit", element: <ProtectedRoute permission={PERMISSIONS.PRODUCTS_MANAGE}><ProductFormPage/></ProtectedRoute> },
  { path: "products/:id", element: <ProtectedRoute permission={PERMISSIONS.PRODUCTS_MANAGE}><ProductDetailPage/></ProtectedRoute> },
  { path: "inventory", element: <ProtectedRoute permission={PERMISSIONS.INVENTORY_VIEW}><InventoryPage/></ProtectedRoute> },
  { path: "inventory/movements", element: <ProtectedRoute permission={PERMISSIONS.INVENTORY_VIEW}><InventoryMovementsPage/></ProtectedRoute> },
  { path: "inventory/adjust", element: <ProtectedRoute permission={PERMISSIONS.INVENTORY_ADJUST}><InventoryAdjustmentPage/></ProtectedRoute> },
  { path: "inventory/count", element: <ProtectedRoute permission={PERMISSIONS.INVENTORY_ADJUST}><StockCountPage/></ProtectedRoute> },
  { path: "purchases", element: <ProtectedRoute permission={PERMISSIONS.PURCHASES_MANAGE}><PurchasesPage/></ProtectedRoute> },
  { path: "purchases/new", element: <ProtectedRoute permission={PERMISSIONS.PURCHASES_MANAGE}><PurchaseFormPage/></ProtectedRoute> },
  { path: "purchases/:id/edit", element: <ProtectedRoute permission={PERMISSIONS.PURCHASES_MANAGE}><PurchaseFormPage/></ProtectedRoute> },
  { path: "purchases/:id", element: <ProtectedRoute permission={PERMISSIONS.PURCHASES_MANAGE}><PurchaseDetailPage/></ProtectedRoute> },
  { path: "purchase-returns", element: <ProtectedRoute permission={PERMISSIONS.PURCHASES_MANAGE}><PurchaseReturnsPage/></ProtectedRoute> },
  { path: "customers", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><CustomersPage/></ProtectedRoute> },
  { path: "customers/new", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><CustomerFormPage/></ProtectedRoute> },
  { path: "customers/recovery", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><CustomerRecoveryPage/></ProtectedRoute> },
  { path: "customers/:id", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><CustomerDetailPage/></ProtectedRoute> },
  { path: "customers/:id/edit", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><CustomerFormPage/></ProtectedRoute> },
  { path: "suppliers", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><SuppliersPage/></ProtectedRoute> },
  { path: "suppliers/new", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><SupplierFormPage/></ProtectedRoute> },
  { path: "suppliers/outstanding", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><SupplierOutstandingPage/></ProtectedRoute> },
  { path: "suppliers/:id", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><SupplierDetailPage/></ProtectedRoute> },
  { path: "suppliers/:id/edit", element: <ProtectedRoute permission={PERMISSIONS.PARTIES_MANAGE}><SupplierFormPage/></ProtectedRoute> },
  { path: "users", element: <ProtectedRoute permission={PERMISSIONS.USERS_MANAGE}><UsersPage/></ProtectedRoute> },
  { path: "settings", element: <ProtectedRoute permission={PERMISSIONS.SETTINGS_MANAGE}><SettingsPage/></ProtectedRoute> },
  { path: "*", element: <Navigate to="/" replace/> },
] }]);

export function App() {
  const user = useAuthStore((state) => state.user);
  if (!user) return <LoginPage/>;
  return <AppDialogProvider><Suspense fallback={<div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>}><RouterProvider router={router}/></Suspense></AppDialogProvider>;
}
