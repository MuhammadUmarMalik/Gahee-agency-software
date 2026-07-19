import type { BusinessSetting } from "@oil-agency/shared";
import { useBusinessStore } from "@/stores/business-store";

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export const currentBusiness = () => useBusinessStore.getState().business;

export const brandingCss = `
*{box-sizing:border-box}.agency-brand{display:flex;align-items:center;justify-content:center;gap:12px;border-bottom:2px solid #176b42;padding-bottom:10px;margin-bottom:14px;text-align:center}.agency-logo{width:58px;height:58px;object-fit:contain;flex:0 0 auto}.agency-name{font-size:22px;font-weight:800;line-height:1.15}.agency-name-urdu,.agency-address-urdu,.agency-thanks-urdu{font-family:"Jameel Noori Nastaleeq","Jameel Noori Nastaleeq Kasheeda","Noto Nastaliq Urdu",serif;direction:rtl;line-height:1.7}.agency-name-urdu{font-size:17px}.agency-contact{font-size:10px;color:#444;line-height:1.45}.agency-footer{text-align:center;border-top:1px solid #777;margin-top:22px;padding-top:8px;page-break-inside:avoid}.agency-footer p{margin:1px}.agency-thanks-urdu{font-size:15px}
`;

export function brandHeader(business: BusinessSetting = currentBusiness()) {
  const logo = business.logoDataUrl ? `<img class="agency-logo" src="${escapeHtml(business.logoDataUrl)}" alt="${escapeHtml(business.name)} logo">` : "";
  return `<header class="agency-brand">${logo}<div><div class="agency-name">${escapeHtml(business.name)}</div>${business.nameUrdu ? `<div class="agency-name-urdu" lang="ur">${escapeHtml(business.nameUrdu)}</div>` : ""}${business.address ? `<div class="agency-contact">${escapeHtml(business.address)}</div>` : ""}${business.addressUrdu ? `<div class="agency-contact agency-address-urdu" lang="ur">${escapeHtml(business.addressUrdu)}</div>` : ""}${business.phone ? `<div class="agency-contact">Phone: ${escapeHtml(business.phone)}</div>` : ""}</div></header>`;
}

export function brandFooter(business: BusinessSetting = currentBusiness()) {
  return `<footer class="agency-footer"><p>${escapeHtml(business.thankYou)}</p>${business.thankYouUrdu ? `<p class="agency-thanks-urdu" lang="ur">${escapeHtml(business.thankYouUrdu)}</p>` : ""}</footer>`;
}
