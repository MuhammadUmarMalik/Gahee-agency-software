import {
  AlertTriangle,
  Boxes,
  Eye,
  LoaderCircle,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PERMISSIONS,
  type InventoryStockDto,
  type ProductDto,
  type ProductOption,
  type ProductType,
} from "@oil-agency/shared";
import { ApiError, apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/app-dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductStockDialog } from "@/features/products/product-stock-dialog";
import { useAuthStore } from "@/stores/auth-store";

interface Options {
  categories: ProductOption[];
  brands: ProductOption[];
  units: ProductOption[];
}

export function ProductsPage() {
  const token = useAuthStore((state) => state.token)!;
  const user = useAuthStore((state) => state.user)!;
  const navigate = useNavigate();
  const dialog = useAppDialog();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [stock, setStock] = useState<InventoryStockDto[]>([]);
  const [options, setOptions] = useState<Options>({
    categories: [],
    brands: [],
    units: [],
  });
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productType, setProductType] = useState<"" | ProductType>("");
  const [active, setActive] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [stockProduct, setStockProduct] = useState<ProductDto | null>(null);
  const canViewStock = user.permissions.includes(PERMISSIONS.INVENTORY_VIEW);
  const canAdjustStock = user.permissions.includes(
    PERMISSIONS.INVENTORY_ADJUST,
  );
  const stockByProduct = useMemo(
    () => new Map(stock.map((row) => [row.productId, row])),
    [stock],
  );

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const query = new URLSearchParams({ search, active, pageSize: "100" });
    if (categoryId) query.set("categoryId", categoryId);
    if (brandId) query.set("brandId", brandId);
    if (productType) query.set("productType", productType);
    try {
      const result = await apiRequest<{ products: ProductDto[] }>(
        `/products?${query}`,
        {},
        token,
      );
      setProducts(result.products);
      if (canViewStock) {
        const inventory = await apiRequest<{ stock: InventoryStockDto[] }>(
          "/inventory/stock?includeInactive=true",
          {},
          token,
        );
        setStock(inventory.stock);
      }
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Could not load products.",
      );
    } finally {
      setLoading(false);
    }
  }, [active, brandId, canViewStock, categoryId, productType, search, token]);

  useEffect(() => {
    void apiRequest<Options>("/products/options", {}, token)
      .then(setOptions)
      .catch(() => setMessage("Could not load product filters."));
  }, [token]);
  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  async function remove(product: ProductDto) {
    const currentStock = stockByProduct.get(product.id);
    if (currentStock && currentStock.currentBaseQty !== 0) {
      setMessage(
        `${product.name} still has stock. Remove, damage, or expire the remaining stock first; the stock panel is open below.`,
      );
      setStockProduct(product);
      return;
    }
    if (
      !(await dialog.confirm({
        title: "Delete product?",
        description: `${product.name} will be removed from active use. Its sales and stock history will remain available.`,
        confirmLabel: "Delete product",
        destructive: true,
      }))
    )
      return;
    try {
      await apiRequest<void>(
        `/products/${product.id}`,
        { method: "DELETE" },
        token,
      );
      await loadProducts();
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Could not delete product.",
      );
    }
  }

  const activeCount = products.filter((product) => product.isActive).length;
  const lowCount = stock.filter((row) => row.isLowStock).length;
  const expiredCount = stock.filter((row) => row.expiredBaseQty > 0).length;
  const selectedStock = stockProduct
    ? stockByProduct.get(stockProduct.id)
    : undefined;

  return (
    <section className="p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">
            Catalog & stock
          </p>
          <h1 className="m-0 text-3xl font-bold">Products</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Products, prices, packing units, and stock—all in one place.
          </p>
        </div>
        <Button size="lg" onClick={() => navigate("/products/new")}>
          <Plus className="mr-2" size={18} />
          Add product
        </Button>
      </div>

      {message && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {message}
        </div>
      )}

      <div className="mb-5 grid grid-cols-[repeat(3,180px)_1fr] gap-3">
        <Metric
          label="Active products"
          value={activeCount}
          icon={<Boxes size={18} />}
        />
        <Metric
          label="Low stock"
          value={lowCount}
          icon={<AlertTriangle size={18} />}
          warning={lowCount > 0}
        />
        <Metric
          label="Expired batches"
          value={expiredCount}
          icon={<AlertTriangle size={18} />}
          danger={expiredCount > 0}
        />
        <Card className="flex items-center gap-3 border-dashed bg-white/60 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <PackagePlus size={18} />
          </span>
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            <strong className="block text-sm text-foreground">
              Simple stock flow
            </strong>
            Purchases add stock and POS sales remove it automatically. Use{" "}
            <b>Manage stock</b> only for corrections, damage, and expiry.
          </p>
        </Card>
      </div>

      <Card className="mb-5 p-4">
        <div className="grid grid-cols-[minmax(240px,1.5fr)_repeat(4,minmax(130px,1fr))] gap-3">
          <label className="relative">
            <Search
              className="absolute left-3 top-3 text-muted-foreground"
              size={18}
            />
            <Input
              className="pl-10"
              placeholder="Search name, SKU, or barcode"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <FilterSelect
            value={categoryId}
            onChange={setCategoryId}
            label="All categories"
            options={options.categories}
          />
          <FilterSelect
            value={brandId}
            onChange={setBrandId}
            label="All brands"
            options={options.brands}
          />
          <select
            className="h-11 rounded-lg border bg-white px-3 text-sm"
            value={productType}
            onChange={(event) =>
              setProductType(event.target.value as "" | ProductType)
            }
          >
            <option value="">All product types</option>
            <option value="OIL">Oil</option>
            <option value="GHEE">Ghee</option>
            <option value="OTHER">Other</option>
          </select>
          <select
            className="h-11 rounded-lg border bg-white px-3 text-sm"
            value={active}
            onChange={(event) => setActive(event.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="grid h-56 place-items-center text-muted-foreground">
            <LoaderCircle className="animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="grid h-56 place-items-center text-center">
            <div>
              <Boxes className="mx-auto mb-3 text-muted-foreground" />
              <p className="m-0 font-semibold">No products found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a product or change the filters.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category / brand</TableHead>
                <TableHead>Packing setup</TableHead>
                <TableHead>Available stock</TableHead>
                <TableHead>Retail price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const row = stockByProduct.get(product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      <button className="block text-left font-semibold hover:text-primary hover:underline" onClick={() => navigate(`/products/${product.id}`)}>{product.name}</button>
                      <span className="text-xs text-muted-foreground">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block">
                        {product.category?.name ?? "Uncategorized"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {product.brand?.name ?? "No brand"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <strong className="block text-sm">
                        1 {product.packUnit.name} = {product.unitsPerPack}{" "}
                        {product.baseUnit.name}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        1 {product.baseUnit.name} = 1 stock item
                      </span>
                    </TableCell>
                    <TableCell>
                      <StockCell product={product} stock={row} />
                    </TableCell>
                    <TableCell className="font-semibold">
                      <span className="block">PKR {(Number(product.retailPrice) * product.unitsPerPack).toFixed(2)} / {product.packUnit.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">PKR {product.retailPrice} / {product.baseUnit.name}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View ${product.name}`}
                          onClick={() => navigate(`/products/${product.id}`)}
                        >
                          <Eye size={17} />
                        </Button>
                        {canAdjustStock && row && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStockProduct(product)}
                          >
                            <PackagePlus className="mr-1.5" size={16} />
                            Manage stock
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit ${product.name}`}
                          onClick={() =>
                            navigate(`/products/${product.id}/edit`)
                          }
                        >
                          <Pencil size={17} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${product.name}`}
                          onClick={() => void remove(product)}
                        >
                          <Trash2 className="text-destructive" size={17} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {stockProduct && selectedStock && (
        <ProductStockDialog
          product={stockProduct}
          stock={selectedStock}
          token={token}
          onClose={() => setStockProduct(null)}
          onPosted={loadProducts}
        />
      )}
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange(value: string): void;
  label: string;
  options: ProductOption[];
}) {
  return (
    <select
      className="h-11 rounded-lg border bg-white px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
function Metric({
  label,
  value,
  icon,
  warning,
  danger,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  warning?: boolean;
  danger?: boolean;
}) {
  return (
    <Card
      className={`flex items-center gap-3 px-4 py-3 ${danger ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : ""}`}
    >
      <span
        className={`grid h-9 w-9 place-items-center rounded-lg ${danger ? "bg-red-100 text-red-700" : warning ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}
      >
        {icon}
      </span>
      <div>
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="text-xl">{value}</strong>
      </div>
    </Card>
  );
}
function StockCell({
  product,
  stock,
}: {
  product: ProductDto;
  stock?: InventoryStockDto | undefined;
}) {
  const quantity = stock?.availableBaseQty ?? product.stockOnHandBaseQty;
  const packs = Math.floor(quantity / product.unitsPerPack);
  const looseUnits = quantity % product.unitsPerPack;
  return (
    <div>
      <strong
        className={
          quantity <= product.reorderLevelBaseQty ? "text-amber-700" : ""
        }
      >
        {packs} {product.packUnit.name} + {looseUnits} {product.baseUnit.name}
      </strong>
      <span className="block text-xs text-muted-foreground">
        {quantity} individual item(s)
      </span>
      {stock && stock.expiredBaseQty > 0 && (
        <span className="block text-xs font-medium text-red-700">
          {stock.expiredBaseQty} expired · unavailable
        </span>
      )}
    </div>
  );
}
