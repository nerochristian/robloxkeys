type RuntimeBranding = {
  storeName?: string;
  logoUrl?: string;
  bannerUrl?: string;
  faviconUrl?: string;
};

const resolveStoreApiBaseUrl = (): string => {
  const configured = ((import.meta.env.VITE_STORE_API_URL as string | undefined) || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return "";
};

const STORE_API_BASE_URL = resolveStoreApiBaseUrl();

export const BRAND_CONFIG = {
  // Shared brand asset URLs for website surfaces.
  // Keep these aligned with bot branding constants/env where possible.
  assets: {
    logoUrl: "https://cdn.discordapp.com/icons/1388303592502333530/9d7828a6890fa9cbd6ce373d295992b3.webp?size=512&quality=lossless",
    bannerUrl: "",
    faviconUrl: "https://cdn.discordapp.com/icons/1388303592502333530/9d7828a6890fa9cbd6ce373d295992b3.webp?size=64&quality=lossless",
  },
  identity: {
    storeName: "Roblox Keys",
    shortName: "Roblox Keys",
    botName: "Roblox Keys Bot",
    adminPanelName: "Roblox Keys Panel",
    pageTitle: "Roblox Keys - Premium Digital Goods",
  },
  emojis: {
    brand: "🗝️",
    bot: "🤖",
    cartEmpty: "🛒",
    support: "🛟",
    trust: "🛡️",
  },
  copy: {
    heroTagline: "Your streamlined destination for licenses and accounts; designed to make digital access stress-free.",
    footerTagline: "Premium Digital Solutions designed to make your access stress-free.",
    trustHeading: "Why Trust Roblox Keys?",
    authJoinHeading: "Join Roblox Keys",
    authSecurityLine: "Protected by Roblox Keys Security",
    cartEmptyMessage: "Cart is empty right now",
    productUsageNotice: [
      "Accounts only work in the official {service} app.",
      "To use on PC, you need a VPN matching the account region.",
    ],
  },
  links: {
    discord: "#",
    support: "https://discord.gg/NzJUttTa",
    privacy: "/privacy",
    terms: "/terms",
  },
  storage: {
    keyPrefix: "robloxkeys",
  },
};

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeBrandAssetUrl = (value: unknown): string => {
  const raw = clean(value);
  if (!raw) return "";
  if (/^(data:|blob:)/i.test(raw)) return raw;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      let pathname = parsed.pathname || "";
      if (pathname.startsWith("/media/")) pathname = `/shop${pathname}`;
      if (pathname.startsWith("/shop/media/")) {
        return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${pathname}${parsed.search || ""}` : `${pathname}${parsed.search || ""}`;
      }

      const host = parsed.hostname.toLowerCase();
      if (host === "media.discordapp.net" || host === "cdn.discordapp.com") {
        parsed.hostname = "cdn.discordapp.com";
        const allowedParams = new Set(["size", "quality", "format", "width", "height"]);
        const keep: Array<[string, string]> = [];
        for (const [key, itemValue] of parsed.searchParams.entries()) {
          if (allowedParams.has(key.toLowerCase())) {
            keep.push([key, itemValue]);
          }
        }
        parsed.search = "";
        for (const [key, itemValue] of keep) {
          parsed.searchParams.append(key, itemValue);
        }
        return parsed.toString();
      }
    } catch {
      return raw;
    }
    return raw;
  }

  if (/^img-[a-z0-9-]+$/i.test(raw)) {
    return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}/shop/media/${raw}` : `/shop/media/${raw}`;
  }
  if (raw.startsWith("/media/")) {
    const normalized = `/shop${raw}`;
    return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${normalized}` : normalized;
  }
  if (raw.startsWith("/shop/")) {
    return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${raw}` : raw;
  }
  return raw;
};

export const applyRuntimeBranding = (branding: RuntimeBranding | null | undefined) => {
  if (!branding || typeof branding !== "object") return;

  const storeName = clean(branding.storeName);
  const logoUrl = normalizeBrandAssetUrl(branding.logoUrl);
  const bannerUrl = normalizeBrandAssetUrl(branding.bannerUrl);
  const faviconUrl = normalizeBrandAssetUrl(branding.faviconUrl);

  if (storeName) {
    BRAND_CONFIG.identity.storeName = storeName;
    BRAND_CONFIG.identity.shortName = storeName;
    BRAND_CONFIG.identity.botName = `${storeName} Bot`;
    BRAND_CONFIG.identity.adminPanelName = `${storeName} Panel`;
    BRAND_CONFIG.identity.pageTitle = `${storeName} - Premium Digital Goods`;
  }
  if (logoUrl) BRAND_CONFIG.assets.logoUrl = logoUrl;
  if (bannerUrl) BRAND_CONFIG.assets.bannerUrl = bannerUrl;
  if (faviconUrl) BRAND_CONFIG.assets.faviconUrl = faviconUrl;
};

export const BRAND_INITIALS = BRAND_CONFIG.identity.shortName
  .split(" ")
  .map((part) => part[0])
  .join("")
  .slice(0, 2)
  .toUpperCase();
