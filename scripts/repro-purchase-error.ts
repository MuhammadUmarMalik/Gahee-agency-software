import { db } from "../apps/api/src/lib/db.js";
import { PurchaseService } from "../apps/api/src/modules/purchases/purchase.service.js";

const service = new PurchaseService(db);

try {
  const [supplier] = await db.supplier.findMany({ take: 1 });
  const [product] = await db.product.findMany({
    take: 1,
    include: { packings: { where: { isActive: true }, orderBy: { unitsPerPack: "desc" } } },
  });
  const [user] = await db.user.findMany({ take: 1 });

  if (!supplier || !product || !user) {
    throw new Error("Seed data is missing supplier, product, or user.");
  }

  const invoice = `REPRO-${Date.now()}`;
  const purchase = await service.create(
    {
      supplierId: supplier.id,
      supplierInvoice: invoice,
      purchaseDate: "2026-07-21",
      dueDate: "2026-07-21",
      discount: "0.00",
      tax: "0.00",
      transportExpense: "0.00",
      loadingExpense: "0.00",
      otherExpense: "0.00",
      paidAmount: "0.00",
      paymentMethod: "CASH",
      paymentReference: "",
      notes: "Purchase repro",
      items: [
        {
          productId: product.id,
          batchId: null,
          batchNumber: "",
          manufacturingDate: "2026-07-01",
          expiryDate: "2029-10-16",
          cartonQuantity: 20,
          pieceQuantity: 0,
          purchaseRate: "10600.02",
        },
      ],
    },
    user.id,
  );

  console.log(JSON.stringify({ ok: true, purchaseId: purchase.id, invoiceNumber: purchase.invoiceNumber }, null, 2));
} catch (error) {
  console.error("REPRO_ERROR_START");
  console.error(error);
  console.error("REPRO_ERROR_END");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
