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

const STORE_API_BASE_URL = ((import.meta.env.VITE_STORE_API_URL as string | undefined) || '').trim().replace(/\/$/, '');
const STORE_API_PREFIX = ((import.meta.env.VITE_STORE_API_PREFIX as string | undefined) || '/shop').trim() || '/shop';
const STORE_API_KEY =
  (import.meta.env.VITE_STORE_API_KEY as string | undefined) ||
  (import.meta.env.VITE_BOT_API_KEY as string | undefined) ||
  '';
const STORE_API_KEY_HEADER =
  ((import.meta.env.VITE_STORE_API_KEY_HEADER as string | undefined) ||
    (import.meta.env.VITE_BOT_API_KEY_HEADER as string | undefined) ||
    'x-api-key').toLowerCase();
const STORE_API_AUTH_SCHEME =
  (import.meta.env.VITE_STORE_API_AUTH_SCHEME as string | undefined) ||
  (import.meta.env.VITE_BOT_API_AUTH_SCHEME as string | undefined) ||
  '';
const STORE_API_TIMEOUT_MS = Number(import.meta.env.VITE_STORE_API_TIMEOUT_MS || 10000);

const buildHeaders = (): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (STORE_API_KEY) {
    const value = STORE_API_AUTH_SCHEME ? `${STORE_API_AUTH_SCHEME} ${STORE_API_KEY}` : STORE_API_KEY;
    headers[STORE_API_KEY_HEADER] = value;
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

const normalizeTier = (tier: ProductTier & { original_price?: number }): ProductTier => ({
  ...tier,
  price: Number(tier.price || 0),
  originalPrice: typeof tier.originalPrice === 'number' ? tier.originalPrice : Number(tier.original_price || 0),
  stock: Number(tier.stock || 0),
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

  return {
    ...p,
    originalPrice: typeof p.originalPrice === 'number' ? p.originalPrice : Number(p.original_price || 0),
    features,
    tiers
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
    };

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
  async health(): Promise<{ ok: boolean; products?: number; orders?: number }> {
    const response = await withTimeout(resolvePath('/health'), {
      method: 'GET',
      headers: buildHeaders()
    });
    if (!response.ok) throw new Error(`Shop health request failed (${response.status})`);
    return response.json() as Promise<{ ok: boolean; products?: number; orders?: number }>;
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
      headers: buildHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({})) as {
      ok?: boolean;
      message?: string;
      user?: User;
      requires2fa?: boolean;
      otpToken?: string;
      expiresInSeconds?: number;
    };
    if (!response.ok) {
      throw new Error(payload.message || `Login failed (${response.status})`);
    }

    if (payload.requires2fa) {
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

    if (!payload.user) {
      throw new Error('User session was not returned by the server');
    }

    return {
      requires2fa: false,
      user: payload.user,
    };
  },

  async authVerifyOtp(otpToken: string, code: string): Promise<User> {
    const response = await withTimeout(resolvePath('/auth/verify-otp'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ otpToken, code }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; user?: User };
    if (!response.ok || !payload.user) {
      throw new Error(payload.message || `OTP verification failed (${response.status})`);
    }
    return payload.user;
  },

  async authRegister(email: string, password: string): Promise<User> {
    const response = await withTimeout(resolvePath('/auth/register'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; user?: User };
    if (!response.ok || !payload.user) {
      throw new Error(payload.message || `Register failed (${response.status})`);
    }
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

  async buy(order: Order, user: User | null, paymentMethod: string, paymentVerified: boolean = false): Promise<{ ok: boolean; products?: Product[]; orderId?: string; order?: Order }> {
    const response = await withTimeout(resolvePath('/buy'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ order, user, paymentMethod, paymentVerified }),
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

  async createPayment(order: Order, user: User | null, paymentMethod: string, successUrl: string, cancelUrl: string): Promise<{ ok: boolean; checkoutUrl?: string; token?: string; sessionId?: string; trackId?: string; manual?: boolean }> {
    const response = await withTimeout(resolvePath('/payments/create'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ order, user, paymentMethod, successUrl, cancelUrl }),
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
    return response.json() as Promise<{ ok: boolean; checkoutUrl?: string; token?: string; sessionId?: string; trackId?: string; manual?: boolean }>;
  },

  async confirmPayment(token: string, sessionId: string, paymentMethod: string = 'card'): Promise<{ ok: boolean; order?: Order; products?: Product[] }> {
    const response = await withTimeout(resolvePath('/payments/confirm'), {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        token,
        sessionId: paymentMethod === 'card' ? sessionId : '',
        trackId: paymentMethod === 'crypto' ? sessionId : '',
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
