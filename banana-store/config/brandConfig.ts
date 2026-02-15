export const BRAND_CONFIG = {
  identity: {
    storeName: "Roblox Keys",
    shortName: "Roblox Keys",
    botName: "Roblox Keys Bot",
    adminPanelName: "Roblox Keys Panel",
    pageTitle: "Roblox Keys - Premium Digital Goods",
  },
  assets: {
    // Paste your image URLs here.
    logoUrl: "",
    bannerUrl: "",
    faviconUrl: "",
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
} as const;

export const BRAND_INITIALS = BRAND_CONFIG.identity.shortName
  .split(" ")
  .map((part) => part[0])
  .join("")
  .slice(0, 2)
  .toUpperCase();
