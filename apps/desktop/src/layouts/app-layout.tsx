import {
  ArrowRightLeft,
  Banknote,
  BarChart3,
  Boxes,
  ChevronRight,
  CloudUpload,
  Droplets,
  ReceiptText,
  RotateCcw,
  LayoutDashboard,
  LogOut,
  ScanLine,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Landmark,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { PERMISSIONS, type BusinessSetting, type PermissionCode } from "@oil-agency/shared";
import { apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth-store";
import { useBusinessStore } from "@/stores/business-store";

type MenuLink = {
  to: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  permission: PermissionCode;
};
const sections: Array<{ label: string; links: MenuLink[] }> = [
  {
    label: "Workspace",
    links: [
      {
        to: "/",
        label: "Dashboard",
        description: "Today at a glance",
        icon: LayoutDashboard,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
      {
        to: "/pos",
        label: "POS sale",
        description: "Scan and checkout",
        icon: ScanLine,
        permission: PERMISSIONS.POS_USE,
      },
      {
        to: "/sales",
        label: "Sales management",
        description: "Invoices and payments",
        icon: ReceiptText,
        permission: PERMISSIONS.SALES_VIEW,
      },
    ],
  },
  {
    label: "Business",
    links: [
      {
        to: "/products",
        label: "Products & stock",
        description: "Items and stock actions",
        icon: Boxes,
        permission: PERMISSIONS.PRODUCTS_MANAGE,
      },
      {
        to: "/purchases",
        label: "Purchases",
        description: "Supplier invoices",
        icon: ShoppingCart,
        permission: PERMISSIONS.PURCHASES_MANAGE,
      },
      {
        to: "/customers",
        label: "Customers & khata",
        description: "Balances and recovery",
        icon: Users,
        permission: PERMISSIONS.PARTIES_MANAGE,
      },
      {
        to: "/suppliers",
        label: "Suppliers",
        description: "Payables and ledger",
        icon: Truck,
        permission: PERMISSIONS.PARTIES_MANAGE,
      },
    ],
  },
  {
    label: "Operations",
    links: [
      {
        to: "/sales-returns",
        label: "Sales returns",
        description: "Invoice-based returns",
        icon: ArrowRightLeft,
        permission: PERMISSIONS.SALES_RETURN,
      },
      {
        to: "/purchase-returns",
        label: "Purchase returns",
        description: "Supplier invoice returns",
        icon: RotateCcw,
        permission: PERMISSIONS.PURCHASES_MANAGE,
      },
      {
        to: "/expenses",
        label: "Expenses",
        description: "Agency operating costs",
        icon: ReceiptText,
        permission: PERMISSIONS.CASHBOOK_VIEW,
      },
      {
        to: "/cashbook",
        label: "Cashbook",
        description: "Cash entries and closing",
        icon: Banknote,
        permission: PERMISSIONS.CASHBOOK_VIEW,
      },
      {
        to: "/reports",
        label: "Reports",
        description: "Operational reports",
        icon: BarChart3,
        permission: PERMISSIONS.REPORTS_BASIC,
      },
      {
        to: "/accounting",
        label: "Accounting",
        description: "Ledgers and statements",
        icon: Landmark,
        permission: PERMISSIONS.ACCOUNTING_VIEW,
      },
      {
        to: "/fbr-queue",
        label: "FBR queue",
        description: "Digital invoices",
        icon: CloudUpload,
        permission: PERMISSIONS.SETTINGS_MANAGE,
      },
    ],
  },
];

export function AppLayout() {
  const { user, logout, token } = useAuthStore();
  const business = useBusinessStore((state) => state.business);
  const setBusiness = useBusinessStore((state) => state.setBusiness);
  useEffect(() => { if (token) void apiRequest<{ business: BusinessSetting }>("/settings/client", {}, token).then((result) => setBusiness(result.business)).catch(() => undefined); }, [setBusiness, token]);
  return (
    <div className="grid min-h-screen grid-cols-[236px_minmax(0,1fr)]">
      <aside className="relative flex h-screen flex-col overflow-hidden border-r border-slate-200 bg-white text-foreground">
        <div className="pointer-events-none absolute -left-16 -top-20 h-52 w-52 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="relative flex items-center gap-3 border-b border-slate-100 px-4 py-5">
          {business.logoDataUrl ? <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-white p-1.5 shadow-sm"><img src={business.logoDataUrl} alt="Agency logo" className="h-full w-full object-contain"/></span> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-md shadow-emerald-900/10"><Droplets size={29} /></span>}
          <div className="min-w-0">
            <strong className="block truncate text-base">{business.name}</strong>
            <span className="text-[11px] text-muted-foreground">Single location</span>
          </div>
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sections.map((section) => {
            const visible = section.links.filter((link) =>
              user?.permissions.includes(link.permission),
            );
            if (!visible.length) return null;
            return (
              <div className="mb-5" key={section.label}>
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {visible.map(({ to, label, description, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-foreground",
                          isActive &&
                            "bg-emerald-50 text-primary ring-1 ring-inset ring-emerald-200/80",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:text-foreground",
                              isActive && "bg-white text-primary shadow-sm",
                            )}
                          >
                            <Icon size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-[13px] leading-4">
                              {label}
                            </strong>
                            <span className="block truncate text-[10px] leading-4 text-slate-400 group-hover:text-slate-500">
                              {description}
                            </span>
                          </span>
                          {isActive && (
                            <ChevronRight
                              size={14}
                              className="text-primary"
                            />
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
          {(user?.permissions.includes(PERMISSIONS.USERS_MANAGE) ||
            user?.permissions.includes(PERMISSIONS.SETTINGS_MANAGE)) && (
            <div className="mb-2">
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">
                Administration
              </p>
              {user?.permissions.includes(PERMISSIONS.USERS_MANAGE) && (
                <NavLink
                  to="/users"
                  className={({ isActive }) =>
                    cn(
                      "group mb-1 flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-foreground",
                      isActive &&
                        "bg-emerald-50 text-primary ring-1 ring-inset ring-emerald-200/80",
                    )
                  }
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100">
                    <Users size={17} />
                  </span>
                  <span>
                    <strong className="block text-[13px] leading-4">
                      Users
                    </strong>
                    <span className="block text-[10px] leading-4 text-slate-400">
                      Accounts and access
                    </span>
                  </span>
                </NavLink>
              )}
              {user?.permissions.includes(PERMISSIONS.SETTINGS_MANAGE) && (
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    cn(
                      "group flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-slate-600 transition hover:bg-slate-50 hover:text-foreground",
                      isActive &&
                        "bg-emerald-50 text-primary ring-1 ring-inset ring-emerald-200/80",
                    )
                  }
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100">
                    <Settings size={17} />
                  </span>
                  <span>
                    <strong className="block text-[13px] leading-4">
                      Settings
                    </strong>
                    <span className="block text-[10px] leading-4 text-slate-400">
                      Agency and backups
                    </span>
                  </span>
                </NavLink>
              )}
            </div>
          )}
        </nav>

        <div className="relative border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-primary">
              {initials(user?.displayName)}
            </span>
            <div className="min-w-0">
              <p className="m-0 truncate text-xs font-semibold">
                {user?.displayName}
              </p>
              <p className="m-0 text-[10px] text-muted-foreground">
                {roleLabel(user?.role)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-slate-500 hover:bg-slate-50 hover:text-foreground"
            onClick={() => void logout()}
          >
            <LogOut size={17} />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="h-screen min-w-0 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
}

function initials(name?: string) {
  return (name ?? "U")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function roleLabel(role?: string) {
  return role ? `${role[0]}${role.slice(1).toLowerCase()}` : "User";
}
