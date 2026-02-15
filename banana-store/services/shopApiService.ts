import { Product, ProductTier } from '../types';
import { Order, User } from './storageService';

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
  }
};
