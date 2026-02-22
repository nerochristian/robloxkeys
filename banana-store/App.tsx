import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { ProductList } from './components/ProductList';
import { ProductDetail } from './components/ProductDetail';
import { ProductTierPanel } from './components/ProductTierPanel';
import { Cart } from './components/Cart';
import { ChatBot } from './components/ChatBot';
import { Footer } from './components/Footer';
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage';
import { ServiceTermsPage } from './components/ServiceTermsPage';
import { Auth } from './components/Auth';
import { UserDashboard } from './components/UserDashboard';
import { AdminPanel } from './components/AdminPanel';
import { Checkout } from './components/Checkout';
import { Product, CartItem, AdminSettings, ProductTier } from './types';
import type { Order, User } from './services/storageService';
import { applyRuntimeBranding, BRAND_CONFIG } from './config/brandConfig';
import { ShopApiService } from './services/shopApiService';

const RESERVED_SLUGS = new Set(['vault', 'admin', 'auth', 'product']);

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const productSlug = (product: Product): string => {
  const fromPath = slugify(String(product.urlPath || ''));
  if (fromPath) return fromPath;
  const fromName = slugify(String(product.name || ''));
  if (fromName) return fromName;
  return slugify(String(product.id || 'product'));
};

const normalizePath = (pathname: string): string => {
  if (!pathname || pathname === '/') return '/';
  const clean = pathname.replace(/\/+$/, '');
  return clean || '/';
};

const SESSION_KEY = 'robloxkeys.session';
const STORE_THEME_KEY = 'robloxkeys.store_theme_blend';
const CHECKOUT_INTENT_KEY = 'robloxkeys.checkout_intent';
type CheckoutPaymentMethod = 'card' | 'crypto' | 'paypal';
type VaultTransitionState = {
  paymentMethod: CheckoutPaymentMethod;
  credentialLines: string[];
  phase: 'launch' | 'routing';
};
type PendingAuthIntent = {
  returnPath: string;
  returnSearch: string;
  openCheckout: boolean;
  resumeCart: CartItem[];
};
const PAYMENT_METHOD_NAMES: Record<CheckoutPaymentMethod, string> = {
  card: 'Card',
  crypto: 'Crypto',
  paypal: 'PayPal',
};
const VAULT_TRANSITION_MS = 2600;
const VAULT_TRANSITION_EXIT_MS = 450;

const readSession = (): User | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

const writeSession = (user: User | null) => {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
};

const readCheckoutIntent = (): PendingAuthIntent | null => {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAuthIntent>;
    if (!parsed || typeof parsed !== 'object') return null;
    const returnPath = typeof parsed.returnPath === 'string' && parsed.returnPath.trim() ? parsed.returnPath : '/';
    const returnSearch = typeof parsed.returnSearch === 'string' ? parsed.returnSearch : '';
    const openCheckout = Boolean(parsed.openCheckout);
    const resumeCart = Array.isArray(parsed.resumeCart) ? parsed.resumeCart as CartItem[] : [];
    if (!openCheckout) return null;
    return { returnPath, returnSearch, openCheckout, resumeCart };
  } catch {
    return null;
  }
};

const writeCheckoutIntent = (intent: PendingAuthIntent | null) => {
  try {
    if (!intent) {
      sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
      return;
    }
    sessionStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Ignore storage failures.
  }
};

const resolveRoute = (
  pathname: string,
  catalog: Product[],
  session: User | null
): { view: 'store' | 'auth' | 'admin' | 'product-detail' | 'dashboard' | 'privacy' | 'terms'; product: Product | null } => {
  const path = normalizePath(pathname);
  const lowered = path.toLowerCase();

  if (lowered === '/vault') {
    return { view: session ? 'dashboard' : 'auth', product: null };
  }
  if (lowered === '/admin') {
    return { view: session?.role === 'admin' ? 'admin' : 'auth', product: null };
  }
  if (lowered === '/auth') {
    return { view: 'auth', product: null };
  }
  if (lowered === '/privacy') {
    return { view: 'privacy', product: null };
  }
  if (lowered === '/terms') {
    return { view: 'terms', product: null };
  }
  if (lowered === '/') {
    return { view: 'store', product: null };
  }

  let slug = '';
  if (lowered.startsWith('/product/')) {
    slug = slugify(lowered.slice('/product/'.length));
  } else {
    slug = slugify(lowered.slice(1));
  }

  if (!slug || RESERVED_SLUGS.has(slug)) {
    return { view: 'store', product: null };
  }

  const match = catalog.find((p) => productSlug(p) === slug) || null;
  if (!match) {
    return { view: 'store', product: null };
  }
  return { view: 'product-detail', product: match };
};

export default function App() {
  const [view, setView] = useState<'store' | 'auth' | 'admin' | 'product-detail' | 'dashboard' | 'privacy' | 'terms'>('store');
  const [user, setUser] = useState<User | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [tierPanelProduct, setTierPanelProduct] = useState<Product | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [storeThemeBlend, setStoreThemeBlend] = useState<number>(62);
  const [vaultTransition, setVaultTransition] = useState<VaultTransitionState | null>(null);
  const [vaultProgressArmed, setVaultProgressArmed] = useState(false);
  const [pendingAuthIntent, setPendingAuthIntent] = useState<PendingAuthIntent | null>(null);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    storeName: BRAND_CONFIG.identity.storeName,
    logoUrl: BRAND_CONFIG.assets.logoUrl,
    bannerUrl: BRAND_CONFIG.assets.bannerUrl,
    faviconUrl: BRAND_CONFIG.assets.faviconUrl,
    currency: 'USD',
    paypalEmail: '',
    stripeKey: '',
    cryptoAddress: ''
  });

  useEffect(() => {
    applyRuntimeBranding({
      storeName: adminSettings.storeName,
      logoUrl: adminSettings.logoUrl,
      bannerUrl: adminSettings.bannerUrl,
      faviconUrl: adminSettings.faviconUrl,
    });
    document.title = BRAND_CONFIG.identity.pageTitle;

    if (BRAND_CONFIG.assets.faviconUrl) {
      const favicon = document.querySelector("link[rel='icon']") || document.createElement('link');
      favicon.setAttribute('rel', 'icon');
      favicon.setAttribute('href', BRAND_CONFIG.assets.faviconUrl);
      if (!favicon.parentNode) {
        document.head.appendChild(favicon);
      }
    }
  }, [adminSettings]);

  const applyRoute = (pathname: string, catalog: Product[], session: User | null, search: string = window.location.search) => {
    const route = resolveRoute(pathname, catalog, session);
    setSelectedProduct(route.product);
    if (route.view === 'product-detail' && route.product) {
      const query = new URLSearchParams(search || '');
      const tier = query.get('tier') || '';
      const hasTier = (route.product.tiers || []).some((item) => item.id === tier);
      setSelectedTierId(hasTier ? tier : null);
    } else {
      setSelectedTierId(null);
    }
    setView(route.view);
  };

  const pushRoute = (pathname: string, catalog: Product[], session: User | null, search: string = '') => {
    const normalized = normalizePath(pathname);
    const fullRoute = `${normalized}${search}`;
    if (`${window.location.pathname}${window.location.search}` !== fullRoute) {
      window.history.pushState({}, document.title, fullRoute);
    }
    applyRoute(normalized, catalog, session, search);
  };

  const playVaultTransition = async (paymentMethod: CheckoutPaymentMethod, credentialLines: string[]) => {
    setVaultProgressArmed(false);
    setVaultTransition({
      paymentMethod,
      credentialLines: credentialLines.slice(0, 2),
      phase: 'launch',
    });
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    setVaultProgressArmed(true);
    await new Promise((resolve) => window.setTimeout(resolve, VAULT_TRANSITION_MS));
    setVaultTransition((current) => (current ? { ...current, phase: 'routing' } : current));
    window.history.replaceState({}, document.title, '/vault');
    setSelectedProduct(null);
    setSelectedTierId(null);
    setView('dashboard');
    await new Promise((resolve) => window.setTimeout(resolve, VAULT_TRANSITION_EXIT_MS));
    setVaultTransition(null);
    setVaultProgressArmed(false);
  };

  const requestCheckoutAuth = (resumeCart: CartItem[] = cart) => {
    const returnPath = normalizePath(window.location.pathname);
    const returnSearch = window.location.search || '';
    const snapshot = Array.isArray(resumeCart) ? resumeCart : [];
    const intent: PendingAuthIntent = {
      returnPath,
      returnSearch,
      openCheckout: true,
      resumeCart: snapshot,
    };
    setPendingAuthIntent(intent);
    writeCheckoutIntent(intent);
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    pushRoute('/auth', products, user);
  };

  // Initialize and Load Data
  useEffect(() => {
    const localProducts: Product[] = [];
    setProducts(localProducts);
    let session = readSession();
    if (session && !ShopApiService.hasSessionToken()) {
      writeSession(null);
      session = null;
    }
    if (session) {
      setUser(session);
    }
    applyRoute(window.location.pathname, localProducts, session, window.location.search);
    document.title = BRAND_CONFIG.identity.pageTitle;

    if (BRAND_CONFIG.assets.faviconUrl) {
      const favicon = document.querySelector("link[rel='icon']") || document.createElement('link');
      favicon.setAttribute('rel', 'icon');
      favicon.setAttribute('href', BRAND_CONFIG.assets.faviconUrl);
      if (!favicon.parentNode) {
        document.head.appendChild(favicon);
      }
    }

    const refreshApiHealth = async () => {
      try {
        const health = await ShopApiService.health();
        setApiOnline(Boolean(health.ok));
        if (health.branding && typeof health.branding === 'object') {
          applyRuntimeBranding({
            storeName: String(health.branding.storeName || '').trim(),
            logoUrl: String(health.branding.logoUrl || '').trim(),
            bannerUrl: String(health.branding.bannerUrl || '').trim(),
            faviconUrl: String(health.branding.faviconUrl || '').trim(),
          });
        }
      } catch {
        setApiOnline(false);
      }
    };

    const handlePaymentReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const checkoutStatus = params.get('checkout');
      const paymentMethodParam = params.get('payment_method');
      const token = params.get('token');
      const sessionId = params.get('session_id');
      const trackId = params.get('track_id') || params.get('trackId') || '';

      if (!checkoutStatus) return;

      let shouldClearQuery = true;
      const clearQuery = () => {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
      };

      if (checkoutStatus === 'cancel') {
        clearQuery();
        alert('Payment was cancelled.');
        return;
      }

      if (checkoutStatus !== 'success' || !paymentMethodParam || !token) {
        clearQuery();
        return;
      }

      if (paymentMethodParam !== 'card' && paymentMethodParam !== 'crypto' && paymentMethodParam !== 'paypal') {
        clearQuery();
        return;
      }
      const paymentMethod: CheckoutPaymentMethod = paymentMethodParam;

      const finalizeConfirmedOrder = async (confirmation: { ok: boolean; order?: Order; products?: Product[] }) => {
        if (!confirmation.ok || !confirmation.order) {
          throw new Error('Payment confirmation failed.');
        }

        if (confirmation.products && confirmation.products.length > 0) {
          setProducts(confirmation.products);
        }

        setCart([]);
        const credentialLines = Object.entries(confirmation.order.credentials || {})
          .map(([lineId, credential]) => {
            const itemName =
              confirmation.order!.items.find((item) => item.id === lineId || item.productId === lineId)?.name || lineId;
            return `${itemName}: ${credential}`;
          })
          .filter((line) => line.trim().length > 0);
        await playVaultTransition(paymentMethod, credentialLines);
      };

      try {
        const confirmationToken = paymentMethod === 'card' ? sessionId : trackId;
        if (paymentMethod === 'card') {
          const confirmation = await ShopApiService.confirmPayment(token, confirmationToken, paymentMethod);
          await finalizeConfirmedOrder(confirmation);
        } else if (paymentMethod === 'paypal') {
          const paypalOrderId = sessionStorage.getItem('pending_paypal_order_id') || '';
          const confirmation = await ShopApiService.confirmPayment(token, '', paymentMethod, paypalOrderId);
          await finalizeConfirmedOrder(confirmation);
          try { sessionStorage.removeItem('pending_paypal_order_id'); } catch { }
          try { sessionStorage.removeItem('pending_payment_token'); } catch { }
          try { sessionStorage.removeItem('pending_payment_method'); } catch { }
        } else {
          const maxAttempts = 24;
          const retryDelayMs = 5000;
          let lastError: Error | null = null;

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              const confirmation = await ShopApiService.confirmPayment(token, confirmationToken, paymentMethod);
              await finalizeConfirmedOrder(confirmation);
              lastError = null;
              break;
            } catch (retryError) {
              const message = retryError instanceof Error ? retryError.message.toLowerCase() : '';
              const pending =
                message.includes('pending') ||
                message.includes('waiting') ||
                message.includes('paying') ||
                message.includes('confirming') ||
                message.includes('not completed');
              if (!pending) {
                throw retryError;
              }
              lastError = retryError instanceof Error ? retryError : new Error('Crypto payment is pending');
              await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            }
          }

          if (lastError) {
            shouldClearQuery = false;
            throw new Error('Crypto payment is still pending on-chain. Wait a bit and refresh to auto-confirm.');
          }
        }
      } catch (confirmationError) {
        console.error('Failed to confirm payment return:', confirmationError);
        alert(confirmationError instanceof Error ? confirmationError.message : 'Failed to confirm payment.');
      } finally {
        if (shouldClearQuery) {
          clearQuery();
        }
      }
    };

    (async () => {
      try {
        await handlePaymentReturn();
        await refreshApiHealth();
        if (session?.role === 'admin' && ShopApiService.hasSessionToken()) {
          try {
            const remoteSettings = await ShopApiService.getState('settings');
            setAdminSettings(remoteSettings);
          } catch {
            // Keep default settings when admin state is unavailable.
          }
        }
        const remoteProducts = await ShopApiService.getProducts();
        setProducts(remoteProducts);
        applyRoute(window.location.pathname, remoteProducts, session, window.location.search);
        setApiOnline(true);
      } catch (error) {
        setApiOnline(false);
        console.error('Store API unavailable.', error);
      }
    })();

    const healthInterval = window.setInterval(() => {
      refreshApiHealth().catch(() => setApiOnline(false));
    }, 30000);
    return () => window.clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    const parsed = Number(localStorage.getItem(STORE_THEME_KEY));
    if (!Number.isFinite(parsed)) {
      setStoreThemeBlend(62);
      return;
    }
    setStoreThemeBlend(Math.max(0, Math.min(100, Math.round(parsed))));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE_THEME_KEY, String(Math.max(0, Math.min(100, Math.round(storeThemeBlend)))));
  }, [storeThemeBlend]);

  useEffect(() => {
    const onPopState = () => applyRoute(window.location.pathname, products, user, window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [products, user]);

  const hasTiers = (product: Product) => Array.isArray(product.tiers) && product.tiers.length > 0;

  const buildCartItem = (product: Product, quantity: number, tier?: ProductTier): CartItem => {
    const lineId = tier ? `${product.id}::${tier.id}` : product.id;
    const stock = Math.max(0, tier ? Number(tier.stock || 0) : Number(product.stock || 0));
    return {
      ...product,
      id: lineId,
      productId: product.id,
      tierId: tier?.id,
      tierName: tier?.name,
      quantity: Math.max(1, Math.min(stock || 1, quantity)),
      name: tier ? `${product.name} ${tier.name}` : product.name,
      price: tier ? Number(tier.price || 0) : Number(product.price || 0),
      originalPrice: tier ? Number(tier.originalPrice || 0) : Number(product.originalPrice || 0),
      duration: tier?.duration || product.duration,
      durationSeconds: Math.max(0, Number(tier?.durationSeconds ?? product.durationSeconds ?? 0) || 0),
      image: tier?.image || product.image,
      stock,
    };
  };

  const addToCart = (product: Product, quantity: number = 1, tier?: ProductTier) => {
    if (quantity <= 0) return;
    if (!tier && hasTiers(product)) {
      setTierPanelProduct(product);
      return;
    }

    const item = buildCartItem(product, quantity, tier);
    if (item.stock <= 0) return;

    setCart(prev => {
      const existing = prev.find((cartItem) => cartItem.id === item.id);
      if (existing) {
        const nextQuantity = Math.min(item.stock, existing.quantity + item.quantity);
        return prev.map((cartItem) =>
          cartItem.id === existing.id
            ? { ...cartItem, quantity: nextQuantity }
            : cartItem
        );
      }
      return [...prev, item];
    });
    setIsCartOpen(true);
  };

  const handleBuyNow = (product: Product, quantity: number = 1, tier?: ProductTier) => {
    if (quantity <= 0) return;
    if (!tier && hasTiers(product)) {
      setTierPanelProduct(product);
      return;
    }

    const item = buildCartItem(product, quantity, tier);
    if (item.stock <= 0) return;

    const nextCart = [item];
    setCart(nextCart);
    if (!user) {
      requestCheckoutAuth(nextCart);
    } else {
      setIsCheckoutOpen(true);
    }
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, quantity: Math.max(1, Math.min(item.stock, item.quantity + delta)) };
      }
      return item;
    }));
  };

  const handleViewProduct = (product: Product) => {
    if (hasTiers(product)) {
      setTierPanelProduct(product);
      return;
    }
    setSelectedTierId(null);
    pushRoute(`/${productSlug(product)}`, products, user);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectTier = (product: Product, tier: ProductTier) => {
    setSelectedTierId(tier.id);
    setTierPanelProduct(null);
    pushRoute(`/${productSlug(product)}`, products, user, `?tier=${encodeURIComponent(tier.id)}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthComplete = (newUser: User) => {
    writeSession(newUser);
    setUser(newUser);
    const checkoutIntent = pendingAuthIntent || readCheckoutIntent();
    if (checkoutIntent?.openCheckout) {
      const { returnPath, returnSearch, resumeCart } = checkoutIntent;
      const nextCart = resumeCart.length > 0 ? resumeCart : cart;
      setPendingAuthIntent(null);
      writeCheckoutIntent(null);
      if (nextCart.length > 0) {
        setCart(nextCart);
      }
      pushRoute(returnPath || '/', products, newUser, returnSearch || '');
      window.setTimeout(() => {
        if (nextCart.length > 0) {
          setIsCheckoutOpen(true);
          return;
        }
        setIsCartOpen(true);
      }, 80);
      return;
    }
    setPendingAuthIntent(null);
    writeCheckoutIntent(null);
    if (cart.length > 0) {
      setIsCheckoutOpen(true);
      pushRoute('/', products, newUser);
    } else {
      pushRoute(newUser.role === 'admin' ? '/admin' : '/vault', products, newUser);
    }
  };

  const handleLogout = () => {
    ShopApiService.clearSessionToken();
    writeSession(null);
    setUser(null);
    setPendingAuthIntent(null);
    writeCheckoutIntent(null);
    pushRoute('/', products, null);
    setCart([]);
  };

  const handleUserUpdate = (updatedUser: User) => {
    writeSession(updatedUser);
    setUser(updatedUser);
  };

  const handleCheckoutSuccess = (updatedProducts?: Product[]) => {
    setCart([]);
    setIsCheckoutOpen(false);
    if (updatedProducts && updatedProducts.length > 0) {
      setProducts(updatedProducts);
    } else {
      ShopApiService.getProducts()
        .then((remoteProducts) => setProducts(remoteProducts))
        .catch(() => setProducts([]));
    }
    pushRoute('/vault', products, user);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const storeThemeRatio = Math.max(0, Math.min(1, storeThemeBlend / 100));
  const shouldShowAnimatedBackground = view === 'store' || view === 'product-detail' || view === 'dashboard';

  // Authentication Required View
  if (view === 'auth') {
    return (
      <Auth
        onAuthComplete={handleAuthComplete}
        onBack={() => {
          const checkoutIntent = pendingAuthIntent || readCheckoutIntent();
          if (checkoutIntent) {
            const { returnPath, returnSearch } = checkoutIntent;
            setPendingAuthIntent(null);
            writeCheckoutIntent(null);
            pushRoute(returnPath || '/', products, user, returnSearch || '');
            return;
          }
          pushRoute('/', products, user);
        }}
      />
    );
  }

  // Admin View
  if (view === 'admin' && user?.role === 'admin') {
    return (
      <div className="page-motion">
        <AdminPanel
          products={products}
          setProducts={(newProducts) => {
            if (typeof newProducts === 'function') {
              setProducts((prev) => (newProducts as (prev: Product[]) => Product[])(prev));
              return;
            }
            setProducts(newProducts);
          }}
          settings={adminSettings}
          setSettings={setAdminSettings}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  return (
    <div className="app-shell perf-safety min-h-screen relative z-10 transition-opacity duration-500">
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700 aurora-mode-lite"
        style={{
          opacity: shouldShowAnimatedBackground ? 1 : 0,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            opacity: 0.98,
            background: `
              linear-gradient(180deg, #020202 0%, #050505 56%, #020202 100%),
              radial-gradient(95% 78% at -12% -8%, rgba(250, 204, 21, ${0.1 + storeThemeRatio * 0.12}) 0%, rgba(250, 204, 21, 0.03) 42%, transparent 74%),
              radial-gradient(90% 76% at 110% 112%, rgba(250, 204, 21, ${0.09 + storeThemeRatio * 0.1}) 0%, rgba(250, 204, 21, 0.03) 40%, transparent 74%)
            `,
          }}
        />
        <div className="aurora-layer aurora-layer-a" style={{ opacity: 0.32 + storeThemeRatio * 0.26 }} />
        <div className="aurora-layer aurora-layer-b" style={{ opacity: 0.28 + storeThemeRatio * 0.24 }} />
        <div className="aurora-layer aurora-layer-haze" style={{ opacity: 0.22 + storeThemeRatio * 0.18 }} />
      </div>
      {vaultTransition && (
        <div className={`fixed inset-0 z-[130] flex items-center justify-center px-5 transition-opacity duration-500 ${vaultTransition.phase === 'routing' ? 'opacity-0' : 'opacity-100'}`}>
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -left-20 top-1/2 h-60 w-60 -translate-y-1/2 rounded-full bg-yellow-300/20 blur-3xl animate-pulse" />
            <div className="absolute -right-12 top-1/4 h-72 w-72 rounded-full bg-yellow-400/15 blur-3xl animate-pulse [animation-delay:220ms]" />
          </div>
          <div className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-yellow-300/30 bg-[#090909]/95 p-7 text-white shadow-[0_0_65px_rgba(250,204,21,0.25)]">
            <div className="mb-5 flex justify-center">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-yellow-300/50 bg-yellow-400/15">
                <div className="absolute inset-0 rounded-full border border-yellow-300/35 animate-ping" />
                <span className="text-4xl font-black text-yellow-200">✓</span>
              </div>
            </div>
            <p className="text-center text-[11px] font-black uppercase tracking-[0.34em] text-yellow-100/75">
              Payment Confirmed
            </p>
            <h3 className="mt-3 text-center text-3xl font-black tracking-tight text-yellow-100">
              Vault Access Ready
            </h3>
            <p className="mt-3 text-center text-sm font-semibold text-white/70">
              {PAYMENT_METHOD_NAMES[vaultTransition.paymentMethod]} payment secured. Launching your member vault now.
            </p>
            {vaultTransition.credentialLines.length > 0 ? (
              <div className="mt-5 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {vaultTransition.credentialLines.map((line) => (
                  <p key={line} className="truncate text-xs font-semibold text-white/70">{line}</p>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center text-xs font-semibold text-white/65">
                Credentials were delivered and stored in your vault account.
              </p>
            )}
            <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-500 transition-[width] ease-linear"
                style={{ width: vaultProgressArmed ? '100%' : '0%', transitionDuration: `${VAULT_TRANSITION_MS}ms` }}
              />
            </div>
            <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.24em] text-yellow-100/75">
              {vaultTransition.phase === 'routing' ? 'Entering Member Vault' : 'Preparing Secure Redirect'}
            </p>
          </div>
        </div>
      )}
      <div className="relative z-10">
      <Navbar
        cartCount={cartCount}
        onCartClick={() => setIsCartOpen(true)}
        onLogoClick={() => {
          pushRoute('/', products, user);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onAdminClick={() => {
          if (user) {
            pushRoute(user.role === 'admin' ? '/admin' : '/vault', products, user);
          } else {
            setPendingAuthIntent(null);
            writeCheckoutIntent(null);
            pushRoute('/auth', products, user);
          }
        }}
      />

      <main className="transition-all duration-500 ease-in-out">
        {view === 'store' && (
          <div className="animate-reveal page-motion">
            {apiOnline === false && (
              <div className="mx-auto mt-28 mb-4 max-w-7xl px-6">
                <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-yellow-200">
                  Store API offline. Local fallback is disabled.
                </div>
              </div>
            )}
            <Hero />
            <Features />
            <ProductList products={products} onView={handleViewProduct} onBuyNow={handleBuyNow} themeBlend={storeThemeRatio} />
          </div>
        )}
        {view === 'product-detail' && selectedProduct && (
          <div className="animate-reveal page-motion">
            <ProductDetail
              product={selectedProduct}
              selectedTier={(selectedProduct.tiers || []).find((tier) => tier.id === selectedTierId) || null}
              onBack={() => pushRoute('/', products, user)}
              onAddToCart={addToCart}
              onBuyNow={handleBuyNow}
            />
          </div>
        )}
        {view === 'dashboard' && user && (
          <div className="animate-reveal page-motion">
            <UserDashboard
              user={user}
              onLogout={handleLogout}
              onBrowse={() => pushRoute('/', products, user)}
              onUserUpdate={handleUserUpdate}
              themeBlend={storeThemeBlend}
              onThemeBlendChange={setStoreThemeBlend}
            />
          </div>
        )}
        {view === 'privacy' && (
          <div className="animate-reveal page-motion">
            <PrivacyPolicyPage onBack={() => pushRoute('/', products, user)} />
          </div>
        )}
        {view === 'terms' && (
          <div className="animate-reveal page-motion">
            <ServiceTermsPage onBack={() => pushRoute('/', products, user)} />
          </div>
        )}
      </main>

      <Footer
        onOpenPrivacy={() => pushRoute('/privacy', products, user)}
        onOpenTerms={() => pushRoute('/terms', products, user)}
      />

      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={updateQuantity}
        onRemove={removeFromCart}
        onCheckout={() => {
          if (!user) {
            requestCheckoutAuth(cart);
          } else {
            setIsCartOpen(false);
            setIsCheckoutOpen(true);
          }
        }}
      />

      {isCheckoutOpen && (
        <Checkout
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          items={cart}
          currentUser={user}
          settings={adminSettings}
          onSuccess={handleCheckoutSuccess}
        />
      )}

      <ProductTierPanel
        isOpen={Boolean(tierPanelProduct)}
        product={tierPanelProduct}
        onClose={() => setTierPanelProduct(null)}
        onSelectTier={handleSelectTier}
      />

      <ChatBot products={products} />
      </div>
    </div>
  );
}
