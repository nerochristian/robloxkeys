import { AdminSettings, Product, ProductTier } from '../types';
import {
  BlacklistEntry,
  Category,
  Coupon,
  DomainRecord,
  Feedback,
  Invoice,
  Order,
  PaymentMethodConfig,
  ProductGroup,
  SecurityLog,
  TeamMember,
  Ticket,
  User,
} from './storageService';

const DEFAULT_PUBLIC_STORE_API_URL = 'https://robloxkeys-production.up.railway.app';

const resolveStoreApiBaseUrl = (): string => {
  const configured = ((import.meta.env.VITE_STORE_API_URL as string | undefined) || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'robloxkeys.store' || host === 'www.robloxkeys.store') {
      return DEFAULT_PUBLIC_STORE_API_URL;
    }
  }
  return '';
};

const STORE_API_BASE_URL = resolveStoreApiBaseUrl();
const STORE_API_PREFIX = ((import.meta.env.VITE_STORE_API_PREFIX as string | undefined) || '/shop').trim() || '/shop';
const STORE_API_TIMEOUT_MS = Number(import.meta.env.VITE_STORE_API_TIMEOUT_MS || 10000);
const SHOP_SESSION_TOKEN_KEY = 'robloxkeys.shop_session_token';

const readSessionToken = (): string => {
  try {
    return String(localStorage.getItem(SHOP_SESSION_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
};

const writeSessionToken = (token: string) => {
  try {
    if (!token) {
      localStorage.removeItem(SHOP_SESSION_TOKEN_KEY);
      return;
    }
    localStorage.setItem(SHOP_SESSION_TOKEN_KEY, token);
  } catch {
    // Ignore storage failures in restricted environments.
  }
};

const buildHeaders = (withJsonContentType: boolean = true): HeadersInit => {
  const headers: HeadersInit = withJsonContentType ? { 'Content-Type': 'application/json' } : {};
  const sessionToken = readSessionToken();
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  return headers;
};

const getTurnstileToken = (): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const w = window as any;
      // If the Turnstile widget was rendered on page load, reset it to get a fresh token
      if (w.turnstile && document.getElementById('cf-turnstile-widget')) {
        // Store a one-time callback that resolves when the widget produces a new token
        let resolved = false;
        const origToken = sessionStorage.getItem('cf-turnstile-token') || '';
        const checkNew = () => {
          const t = sessionStorage.getItem('cf-turnstile-token') || '';
          if (t && t !== origToken && !resolved) { resolved = true; resolve(t); }
        };
        // The render callback in index.html writes to sessionStorage, so reset will re-trigger it
        w.turnstile.reset('#cf-turnstile-widget');
        // Poll briefly for the new token (the callback in index.html sets it)
        const poll = setInterval(() => { checkNew(); if (resolved) clearInterval(poll); }, 100);
        setTimeout(() => { clearInterval(poll); if (!resolved) { resolved = true; resolve(origToken); } }, 4000);
      } else {
        resolve(sessionStorage.getItem('cf-turnstile-token') || '');
      }
    } catch { resolve(''); }
  });
};

const buildSecureHeaders = async (withJsonContentType: boolean = true): Promise<HeadersInit> => {
  const headers = buildHeaders(withJsonContentType);
  const turnstile = await getTurnstileToken();
  if (turnstile) {
    (headers as Record<string, string>)['cf-turnstile-response'] = turnstile;
  }
  return headers;
};

const withTimeout = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STORE_API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, credentials: STORE_API_BASE_URL ? 'omit' : 'same-origin' });
  } finally {
    clearTimeout(timeoutId);
  }
};

type ProductPayload = Product & {
  original_price?: number;
  features_json?: string;
  tiers?: Array<ProductTier & { original_price?: number }>;
};

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const pickFirstString = (...values: unknown[]): string => {
  for (const value of values) {
    const candidate = readString(value);
    if (candidate) return candidate;
  }
  return '';
};

export const resolveAssetUrl = (value: unknown): string => {
  const raw = readString(value);
  if (!raw) return '';
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      let pathname = parsed.pathname || '';

      if (pathname.startsWith('/media/')) {
        pathname = `/shop${pathname}`;
      }

      // Keep media links pinned to current API base so old/private hosts do not break images.
      if (pathname.startsWith('/shop/media/')) {
        return STORE_API_BASE_URL
          ? `${STORE_API_BASE_URL}${pathname}${parsed.search || ''}`
          : `${pathname}${parsed.search || ''}`;
      }

      const host = parsed.hostname.toLowerCase();
      if (host === 'media.discordapp.net' || host === 'cdn.discordapp.com') {
        // Signed media.discordapp.net links can expire; normalize to durable CDN URL.
        const normalized = new URL(parsed.toString());
        normalized.hostname = 'cdn.discordapp.com';
        const allowedParams = new Set(['size', 'quality', 'format', 'width', 'height']);
        const keepEntries: Array<[string, string]> = [];
        for (const [key, itemValue] of normalized.searchParams.entries()) {
          if (allowedParams.has(key.toLowerCase())) {
            keepEntries.push([key, itemValue]);
          }
        }
        normalized.search = '';
        for (const [key, itemValue] of keepEntries) {
          normalized.searchParams.append(key, itemValue);
        }
        return normalized.toString();
      }
    } catch {
      // Keep original URL if parsing fails.
    }
    return raw;
  }
  if (raw.startsWith('//')) {
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
    return `${protocol}${raw}`;
  }

  const looksLikeMediaAssetId = /^img-[a-z0-9-]+$/i.test(raw);
  if (looksLikeMediaAssetId) {
    return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}/shop/media/${raw}` : `/shop/media/${raw}`;
  }

  const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
  if (normalizedPath.startsWith('/media/')) {
    const mediaPath = `/shop${normalizedPath}`;
    return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${mediaPath}` : mediaPath;
  }
  if (normalizedPath.startsWith('/shop/')) {
    return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${normalizedPath}` : normalizedPath;
  }

  return raw;
};

const resolveCatalogImageUrl = (value: unknown): string => resolveAssetUrl(value);

const normalizeTier = (tier: ProductTier & { original_price?: number } & Record<string, unknown>): ProductTier => ({
  ...tier,
  price: Number(tier.price || 0),
  originalPrice: typeof tier.originalPrice === 'number' ? tier.originalPrice : Number(tier.original_price || 0),
  stock: Number(tier.stock || 0),
  image: resolveCatalogImageUrl(
    pickFirstString(tier.image, tier.imageUrl, tier.image_url, tier.thumbnail)
  ),
});

const normalizeProduct = (p: ProductPayload): Product => {
  let features = p.features || [];
  if ((!Array.isArray(features) || features.length === 0) && typeof p.features_json === 'string') {
    try {
      const parsed = JSON.parse(p.features_json);
      if (Array.isArray(parsed)) features = parsed.map((x) => String(x));
    } catch {
      features = [];
    }
  }

  const tiers = Array.isArray(p.tiers) ? p.tiers.map(normalizeTier) : [];
  const productImage = pickFirstString(
    p.image,
    (p as Record<string, unknown>).imageUrl,
    (p as Record<string, unknown>).image_url,
    (p as Record<string, unknown>).thumbnail,
    (p as Record<string, unknown>).icon
  );
  const bannerImage = pickFirstString(
    p.bannerImage,
    (p as Record<string, unknown>).banner_image,
    (p as Record<string, unknown>).coverImage,
    (p as Record<string, unknown>).cover_image
  );

  return {
    ...p,
    originalPrice: typeof p.originalPrice === 'number' ? p.originalPrice : Number(p.original_price || 0),
    features,
    tiers,
    image: resolveCatalogImageUrl(productImage),
    bannerImage: resolveCatalogImageUrl(bannerImage),
  };
};

const resolvePath = (path: string): string => {
  const fullPath = `${STORE_API_PREFIX}${path}`;
  return STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${fullPath}` : fullPath;
};

export interface AdminSummaryCustomer {
  id: string;
  email: string;
  orders: number;
  totalSpent: number;
  createdAt: string;
}

export interface AdminSummaryMetrics {
  revenue: number;
  unitsSold: number;
  pendingOrders: number;
  completedOrders: number;
  totalOrders: number;
  customers: number;
}

export interface AdminSummaryTopProduct {
  id: string;
  name: string;
  units: number;
  revenue: number;
}

export interface AdminSummary {
  orders: Order[];
  customers: AdminSummaryCustomer[];
  metrics: AdminSummaryMetrics;
  topProducts: AdminSummaryTopProduct[];
}

export type AuthLoginResult =
  | {
    requires2fa: true;
    otpToken: string;
    message: string;
    expiresInSeconds: number;
  }
  | {
    requires2fa: false;
    user: User;
    discordLinkToken?: string;
    requiresDiscord?: boolean;
    message?: string;
  };

export interface AuthVerifyOtpResult {
  user: User;
  discordLinkToken?: string;
  requiresDiscord?: boolean;
  message?: string;
}

export type ShopStateKey =
  | 'settings'
  | 'users'
  | 'logs'
  | 'categories'
  | 'groups'
  | 'coupons'
  | 'invoices'
  | 'tickets'
  | 'feedbacks'
  | 'domains'
  | 'team'
  | 'blacklist'
  | 'payment_methods';

export interface ShopStateMap {
  settings: AdminSettings;
  users: User[];
  logs: SecurityLog[];
  categories: Category[];
  groups: ProductGroup[];
  coupons: Coupon[];
  invoices: Invoice[];
  tickets: Ticket[];
  feedbacks: Feedback[];
  domains: DomainRecord[];
  team: TeamMember[];
  blacklist: BlacklistEntry[];
  payment_methods: PaymentMethodConfig[];
}

const defaultStateValue = <K extends ShopStateKey>(stateKey: K): ShopStateMap[K] => {
  const defaults: ShopStateMap = {
    settings: {
      storeName: 'Roblox Keys',
      logoUrl: '',
      bannerUrl: '',
      faviconUrl: '',
      currency: 'USD',
      paypalEmail: '',
      stripeKey: '',
      cryptoAddress: '',
    },
    users: [],
    logs: [],
    categories: [],
    groups: [],
    coupons: [],
    invoices: [],
    tickets: [],
    feedbacks: [],
    domains: [],
    team: [],
    blacklist: [],
    payment_methods: [
      { id: 'pm-card', name: 'Card', enabled: true, instructions: 'Stripe/Card checkout' },
      { id: 'pm-paypal', name: 'PayPal', enabled: true, instructions: 'PayPal email checkout' },
      { id: 'pm-crypto', name: 'Crypto', enabled: true, instructions: 'Manual wallet transfer' },
    ],
  };
  return defaults[stateKey];
};

export const REQUIRE_API =
  String(import.meta.env.VITE_REQUIRE_API ?? 'true').trim().toLowerCase() !== 'false';

export const ShopApiService = {
  hasSessionToken(): boolean {
    return Boolean(readSessionToken());
  },

  clearSessionToken(): void {
    writeSessionToken('');
  },

  async health(): Promise<{
    ok: boolean;
    products?: number;
    orders?: number;
    branding?: {
      storeName?: string;
      logoUrl?: string;
      bannerUrl?: string;
      faviconUrl?: string;
    };
  }> {
    const response = await withTimeout(resolvePath('/health'), {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!response.ok) throw new Error(`Shop health request failed (${response.status})`);
    return response.json() as Promise<{
      ok: boolean;
      products?: number;
      orders?: number;
      branding?: {
        storeName?: string;
        logoUrl?: string;
        bannerUrl?: string;
        faviconUrl?: string;
      };
    }>;
  },

  async getProducts(): Promise<Product[]> {
    const response = await withTimeout(resolvePath('/products'), {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!response.ok) throw new Error(`Products request failed (${response.status})`);
    const payload = await response.json() as { products?: ProductPayload[] } | ProductPayload[];
    const products = Array.isArray(payload) ? payload : (payload.products || []);
    return products.map(normalizeProduct);
  },

  async getPaymentMethods(): Promise<{ card: { enabled: boolean; automated: boolean }; paypal: { enabled: boolean; automated: boolean }; crypto: { enabled: boolean; automated: boolean } }> {
    const response = await withTimeout(resolvePath('/payment-methods'), {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!response.ok) throw new Error(`Payment methods request failed (${response.status})`);
    const payload = await response.json() as { methods?: { card: { enabled: boolean; automated: boolean }; paypal: { enabled: boolean; automated: boolean }; crypto: { enabled: boolean; automated: boolean } } };
    return payload.methods || {
      card: { enabled: false, automated: true },
      paypal: { enabled: false, automated: false },
      crypto: { enabled: false, automated: false },
    };
  },

  async getOrders(params?: { userId?: string; userEmail?: string; status?: Order['status'] }): Promise<Order[]> {
    const search = new URLSearchParams();
    if (params?.userId) search.set('userId', params.userId);
    if (params?.userEmail) search.set('userEmail', params.userEmail);
    if (params?.status) search.set('status', params.status);
    const query = search.toString();
    const path = query ? `/orders?${query}` : '/orders';
    const response = await withTimeout(resolvePath(path), {
      method: 'GET',
      headers: buildHeaders(),
    });
    if (!response.ok) throw new Error(`Orders request failed (${response.status})`);
    const payload = await response.json() as { orders?: Order[] };
    return Array.isArray(payload.orders) ? payload.orders : [];
  },

  async getAdminSummary(): Promise<AdminSummary> {
    const response = await withTimeout(resolvePath('/admin/summary'), {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!response.ok) throw new Error(`Admin summary request failed (${response.status})`);
    const payload = await response.json() as {
      orders?: Order[];
      customers?: AdminSummaryCustomer[];
      metrics?: Partial<AdminSummaryMetrics>;
      topProducts?: AdminSummaryTopProduct[];
    };
    return {
      orders: Array.isArray(payload.orders) ? payload.orders : [],
      customers: Array.isArray(payload.customers) ? payload.customers : [],
      metrics: {
        revenue: Number(payload.metrics?.revenue || 0),
        unitsSold: Number(payload.metrics?.unitsSold || 0),
        pendingOrders: Number(payload.metrics?.pendingOrders || 0),
        completedOrders: Number(payload.metrics?.completedOrders || 0),
        totalOrders: Number(payload.metrics?.totalOrders || 0),
        customers: Number(payload.metrics?.customers || 0),
      },
      topProducts: Array.isArray(payload.topProducts) ? payload.topProducts : [],
    };
  },

  async getState<K extends ShopStateKey>(stateKey: K): Promise<ShopStateMap[K]> {
    const response = await withTimeout(resolvePath(`/state/${encodeURIComponent(stateKey)}`), {
      method: 'GET',
      headers: buildHeaders(),
    });
    if (!response.ok) throw new Error(`Get state failed (${response.status})`);
    const payload = await response.json() as { state?: ShopStateMap[K] };
    if (payload.state === undefined || payload.state === null) {
      return defaultStateValue(stateKey);
    }
    return payload.state;
  },

  async setState<K extends ShopStateKey>(stateKey: K, state: ShopStateMap[K]): Promise<ShopStateMap[K]> {
    const response = await withTimeout(resolvePath(`/state/${encodeURIComponent(stateKey)}`), {
      method: 'PUT',
      headers: buildHeaders(),
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error(`Set state failed (${response.status})`);
    const payload = await response.json() as { state?: ShopStateMap[K] };
    if (payload.state === undefined || payload.state === null) {
      return state;
    }
    return payload.state;
  },

  async authLogin(email: string, password: string): Promise<AuthLoginResult> {
    const response = await withTimeout(resolvePath('/auth/login'), {
      method: 'POST',
      headers: await buildSecureHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      message?: string;
      user?: User;
      sessionToken?: string;
      requires2fa?: boolean;
      otpToken?: string;
      expiresInSeconds?: number;
      discordLinkToken?: string;
      requiresDiscord?: boolean;
    };
    if (!response.ok) {
      throw new Error(payload.message || `Login failed (${response.status})`);
    }

    if (payload.requires2fa) {
      writeSessionToken('');
      if (!payload.otpToken) {
        throw new Error('OTP session was not provided by the server');
      }
      return {
        requires2fa: true,
        otpToken: payload.otpToken,
        message: payload.message || 'Verification code sent',
        expiresInSeconds: Number(payload.expiresInSeconds || 300),
      };
    }

    if (!payload.user || !payload.sessionToken) {
      throw new Error('User session was not returned by the server');
    }
    writeSessionToken(String(payload.sessionToken || '').trim());

    return {
      requires2fa: false,
      user: payload.user,
      discordLinkToken: payload.discordLinkToken,
      requiresDiscord: Boolean(payload.requiresDiscord),
      message: payload.message,
    };
  },

  async authVerifyOtp(otpToken: string, code: string): Promise<AuthVerifyOtpResult> {
    const response = await withTimeout(resolvePath('/auth/verify-otp'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ otpToken, code }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      message?: string;
      user?: User;
      sessionToken?: string;
      discordLinkToken?: string;
      requiresDiscord?: boolean;
    };
    if (!response.ok || !payload.user || !payload.sessionToken) {
      throw new Error(payload.message || `OTP verification failed (${response.status})`);
    }
    writeSessionToken(String(payload.sessionToken || '').trim());
    return {
      user: payload.user,
      discordLinkToken: payload.discordLinkToken,
      requiresDiscord: Boolean(payload.requiresDiscord),
      message: payload.message,
    };
  },

  async authGetDiscordConnectUrl(linkToken: string, returnUrl: string): Promise<{ url: string }> {
    const response = await withTimeout(resolvePath('/auth/discord/connect-url'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ linkToken, returnUrl }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; url?: string };
    if (!response.ok || !payload.url) {
      throw new Error(payload.message || `Discord connect failed (${response.status})`);
    }
    return { url: payload.url };
  },

  async authGetDiscordLinkToken(): Promise<{ linkToken: string }> {
    const response = await withTimeout(resolvePath('/auth/discord/link-token'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({}),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; linkToken?: string };
    if (!response.ok || !payload.linkToken) {
      throw new Error(payload.message || `Discord link token failed (${response.status})`);
    }
    return { linkToken: payload.linkToken };
  },

  async authDiscordUnlink(): Promise<User> {
    const response = await withTimeout(resolvePath('/auth/discord/unlink'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({}),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; user?: User };
    if (!response.ok || !payload.user) {
      throw new Error(payload.message || `Discord unlink failed (${response.status})`);
    }
    return payload.user;
  },

  async authRegister(email: string, password: string): Promise<User> {
    const response = await withTimeout(resolvePath('/auth/register'), {
      method: 'POST',
      headers: await buildSecureHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; user?: User; sessionToken?: string };
    if (!response.ok || !payload.user || !payload.sessionToken) {
      throw new Error(payload.message || `Register failed (${response.status})`);
    }
    writeSessionToken(String(payload.sessionToken || '').trim());
    return payload.user;
  },

  async upsertProduct(product: Product): Promise<{ product?: Product; products?: Product[] }> {
    const response = await withTimeout(resolvePath('/products'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ product }),
    });
    if (!response.ok) throw new Error(`Upsert product failed (${response.status})`);
    const payload = await response.json() as { product?: ProductPayload; products?: ProductPayload[] };
    return {
      product: payload.product ? normalizeProduct(payload.product) : undefined,
      products: payload.products ? payload.products.map(normalizeProduct) : undefined,
    };
  },

  async uploadImage(file: File): Promise<{ id: string; url: string; filename: string; mimeType: string; size: number; createdAt: string }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await withTimeout(resolvePath('/media/upload'), {
      method: 'POST',
      headers: buildHeaders(false),
      body: formData,
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      message?: string;
      asset?: {
        id?: string;
        url?: string;
        filename?: string;
        mimeType?: string;
        size?: number;
        createdAt?: string;
      };
    };
    if (!response.ok || !payload.asset?.url || !payload.asset?.id) {
      throw new Error(payload.message || `Image upload failed (${response.status})`);
    }
    const assetId = String(payload.asset.id);
    const generatedMediaUrl = STORE_API_BASE_URL ? `${STORE_API_BASE_URL}/shop/media/${assetId}` : `/shop/media/${assetId}`;
    return {
      id: assetId,
      // Always persist/use a deterministic generated media URL from asset id.
      // This prevents broken hosts from reverse-proxy environments.
      url: resolveCatalogImageUrl(generatedMediaUrl || String(payload.asset.url)),
      filename: String(payload.asset.filename || file.name || ''),
      mimeType: String(payload.asset.mimeType || file.type || ''),
      size: Number(payload.asset.size || file.size || 0),
      createdAt: String(payload.asset.createdAt || new Date().toISOString()),
    };
  },

  async deleteProduct(productId: string): Promise<{ products?: Product[] }> {
    const response = await withTimeout(resolvePath(`/products/${encodeURIComponent(productId)}`), {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    if (!response.ok) throw new Error(`Delete product failed (${response.status})`);
    const payload = await response.json() as { products?: ProductPayload[] };
    return { products: payload.products ? payload.products.map(normalizeProduct) : undefined };
  },

  async updateStock(productId: string, delta: number, reason: string = 'manual', tierId?: string): Promise<{ product?: Product; products?: Product[] }> {
    const response = await withTimeout(resolvePath('/stock'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ productId, delta, reason, tierId }),
    });
    if (!response.ok) {
      let message = `Update stock failed (${response.status})`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = `${payload.message} (${response.status})`;
      } catch {
        // Keep generic message.
      }
      throw new Error(message);
    }
    const payload = await response.json() as { product?: ProductPayload; products?: ProductPayload[] };
    return {
      product: payload.product ? normalizeProduct(payload.product) : undefined,
      products: payload.products ? payload.products.map(normalizeProduct) : undefined,
    };
  },

  async addInventory(productId: string, items: string[], tierId?: string): Promise<{ ok: boolean; stock: number; products?: Product[] }> {
    const response = await withTimeout(resolvePath('/inventory/add'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ productId, items, tierId }),
    });
    if (!response.ok) {
      let message = `Add inventory failed (${response.status})`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = `${payload.message} (${response.status})`;
      } catch {
        // Keep generic error message.
      }
      throw new Error(message);
    }
    const payload = await response.json() as { ok: boolean; stock?: number; products?: ProductPayload[] };
    return {
      ok: Boolean(payload.ok),
      stock: Number(payload.stock || 0),
      products: payload.products ? payload.products.map(normalizeProduct) : undefined,
    };
  },

  async buy(order: Order, paymentMethod: string, paymentVerified: boolean = false): Promise<{ ok: boolean; products?: Product[]; orderId?: string; order?: Order }> {
    const response = await withTimeout(resolvePath('/buy'), {
      method: 'POST',
      headers: await buildSecureHeaders(),
      body: JSON.stringify({ order, paymentMethod, paymentVerified }),
    });
    if (!response.ok) {
      let message = `Buy request failed (${response.status})`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = `${payload.message} (${response.status})`;
      } catch {
        // Ignore JSON parsing errors and keep generic message.
      }
      throw new Error(message);
    }
    const payload = await response.json() as { ok: boolean; products?: ProductPayload[]; orderId?: string; order?: Order };
    return {
      ok: Boolean(payload.ok),
      products: payload.products ? payload.products.map(normalizeProduct) : undefined,
      orderId: payload.orderId,
      order: payload.order,
    };
  },

  async createPayment(order: Order, paymentMethod: string, successUrl: string, cancelUrl: string): Promise<{ ok: boolean; checkoutUrl?: string; token?: string; sessionId?: string; trackId?: string; paypalOrderId?: string; manual?: boolean }> {
    const response = await withTimeout(resolvePath('/payments/create'), {
      method: 'POST',
      headers: await buildSecureHeaders(),
      body: JSON.stringify({ order, paymentMethod, successUrl, cancelUrl }),
    });
    if (!response.ok) {
      let message = `Create payment failed (${response.status})`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = `${payload.message} (${response.status})`;
      } catch {
        // Keep generic error message.
      }
      throw new Error(message);
    }
    return response.json() as Promise<{ ok: boolean; checkoutUrl?: string; token?: string; sessionId?: string; trackId?: string; paypalOrderId?: string; manual?: boolean }>;
  },

  async confirmPayment(token: string, sessionId: string, paymentMethod: string = 'card', paypalOrderId: string = ''): Promise<{ ok: boolean; order?: Order; products?: Product[] }> {
    const response = await withTimeout(resolvePath('/payments/confirm'), {
      method: 'POST',
      headers: await buildSecureHeaders(),
      body: JSON.stringify({
        token,
        sessionId: paymentMethod === 'card' ? sessionId : '',
        trackId: paymentMethod === 'crypto' ? sessionId : '',
        paypalOrderId: paymentMethod === 'paypal' ? paypalOrderId : '',
        paymentMethod,
      }),
    });
    if (!response.ok) {
      let message = `Confirm payment failed (${response.status})`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = `${payload.message} (${response.status})`;
      } catch {
        // Keep generic error message.
      }
      throw new Error(message);
    }
    const payload = await response.json() as { ok: boolean; order?: Order; products?: ProductPayload[] };
    return {
      ok: Boolean(payload.ok),
      order: payload.order,
      products: payload.products ? payload.products.map(normalizeProduct) : undefined,
    };
  },

  async updateOrderStatus(orderId: string, status: Order['status']): Promise<{ ok: boolean; order?: Order }> {
    const response = await withTimeout(resolvePath(`/orders/${encodeURIComponent(orderId)}/status`), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      let message = `Update order status failed (${response.status})`;
      try {
        const payload = await response.json() as { message?: string };
        if (payload.message) message = `${payload.message} (${response.status})`;
      } catch {
        // Keep generic error message.
      }
      throw new Error(message);
    }
    return response.json() as Promise<{ ok: boolean; order?: Order }>;
  }
};
