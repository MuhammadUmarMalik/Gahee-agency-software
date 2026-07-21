import qrcode from "qrcode-generator";

export function fbrQrSvg(payload: string) {
  const value = payload.trim();
  if (!value) throw new Error("QR payload is required.");
  const qr = qrcode(2, "M");
  qr.addData(value, "Alphanumeric");
  qr.make();
  if (qr.getModuleCount() !== 25) throw new Error("FBR QR must be Version 2 (25×25 modules).");
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
