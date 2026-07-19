import { create } from "zustand";
import { DEFAULT_BUSINESS_SETTING, type BusinessSetting } from "@oil-agency/shared";

type BusinessState = {
  business: BusinessSetting;
  setBusiness(business: BusinessSetting): void;
};

export const useBusinessStore = create<BusinessState>((set) => ({
  business: DEFAULT_BUSINESS_SETTING,
  setBusiness: (business) => set({ business }),
}));
