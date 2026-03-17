import { Product } from '../types';
import { Order, User } from './storageService';

interface BridgeResponse {
  ok?: boolean;
  reply?: string;
  message?: string;
}

const resolveStoreApiBaseUrl = (): string => {
  const configured = ((import.meta.env.VITE_STORE_API_URL as string | undefined) || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  return '';
};

const STORE_API_BASE_URL = resolveStoreApiBaseUrl();
const STORE_API_PREFIX = ((import.meta.env.VITE_STORE_API_PREFIX as string | undefined) || '/shop').trim() || '/shop';
const STORE_API_TIMEOUT_MS = Number(import.meta.env.VITE_STORE_API_TIMEOUT_MS || 10000);

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STORE_API_TIMEOUT_MS);
  const url = STORE_API_BASE_URL ? `${STORE_API_BASE_URL}${path}` : path;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: STORE_API_BASE_URL ? 'omit' : 'same-origin',
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bridge request failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
};

export const BotBridgeService = {
  askBot: async (message: string, products: Product[]): Promise<string> => {
    const data = await post<BridgeResponse>(`${STORE_API_PREFIX}/chat`, { message, products });
    return data.reply || 'I could not generate a recommendation right now. Please try again.';
  },

  // Legacy shim for older callers; order logs are now emitted server-side at purchase/confirm.
  sendOrder: async (_order: Order, _user: User | null, _paymentMethod: string): Promise<void> => {
    return;
  },
};
