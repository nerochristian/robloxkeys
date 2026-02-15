import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
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
import { Order, User } from './services/storageService';
import { BRAND_CONFIG } from './config/brandConfig';
import { ShopApiService } from './services/shopApiService';
import { BotBridgeService } from './services/botBridgeService';

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
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    storeName: BRAND_CONFIG.identity.storeName,
    currency: 'USD',
    paypalEmail: '',
    stripeKey: '',
    cryptoAddress: ''
  });

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

  // Initialize and Load Data
  useEffect(() => {
    const localProducts: Product[] = [];
    setProducts(localProducts);
    const session = readSession();
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
      } catch {
        setApiOnline(false);
      }
    };

    const handlePaymentReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const checkoutStatus = params.get('checkout');
      const paymentMethod = params.get('payment_method');
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

      if (checkoutStatus !== 'success' || !paymentMethod || !token) {
        clearQuery();
        return;
      }

      if (paymentMethod !== 'card' && paymentMethod !== 'crypto') {
        clearQuery();
        return;
      }

      const finalizeConfirmedOrder = async (confirmation: { ok: boolean; order?: Order; products?: Product[] }) => {
        if (!confirmation.ok || !confirmation.order) {
          throw new Error('Payment confirmation failed.');
        }

        if (confirmation.products && confirmation.products.length > 0) {
          setProducts(confirmation.products);
        }

        BotBridgeService.sendOrder(confirmation.order, session, paymentMethod).catch((bridgeError) => {
          console.error('Failed to notify bot about confirmed payment:', bridgeError);
        });

        if (!session) {
          const orderUser = (confirmation.order as unknown as { user?: { id?: string; email?: string; role?: 'admin' | 'user'; createdAt?: string } }).user;
          const fallbackUser: User = {
            id: String(orderUser?.id || confirmation.order.userId || 'guest'),
            email: String(orderUser?.email || 'guest@robloxkeys.local'),
            role: orderUser?.role === 'admin' ? 'admin' : 'user',
            createdAt: String(orderUser?.createdAt || new Date().toISOString()),
          };
          writeSession(fallbackUser);
          setUser(fallbackUser);
        }

        setCart([]);
        window.history.replaceState({}, document.title, '/vault');
        setView('dashboard');
        const credentialLines = Object.entries(confirmation.order.credentials || {})
          .map(([lineId, credential]) => {
            const itemName =
              confirmation.order!.items.find((item) => item.id === lineId || item.productId === lineId)?.name || lineId;
            return `${itemName}: ${credential}`;
          })
          .filter((line) => line.trim().length > 0);
        const deliveryMessage = credentialLines.length > 0
          ? `Payment confirmed.\n\nDelivered credentials:\n${credentialLines.join('\n\n')}`
          : 'Payment confirmed. Open Account > Member Vault to view delivered credentials.';
        alert(deliveryMessage);
      };

      try {
        const confirmationToken = paymentMethod === 'card' ? sessionId : trackId;
        if (paymentMethod === 'card') {
          const confirmation = await ShopApiService.confirmPayment(token, confirmationToken, paymentMethod);
          await finalizeConfirmedOrder(confirmation);
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
        const remoteSettings = await ShopApiService.getState('settings');
        setAdminSettings(remoteSettings);
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
    const onPopState = () => applyRoute(window.location.pathname, products, user, window.location.search);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [products, user]);

  // Background Glow Mouse Tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty('--mouse-x', `${x}%`);
      document.documentElement.style.setProperty('--mouse-y', `${y}%`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

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

    setCart([item]);
    if (!user) {
      setView('auth');
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
    if (cart.length > 0) {
      setIsCheckoutOpen(true);
      pushRoute('/', products, newUser);
    } else {
      pushRoute(newUser.role === 'admin' ? '/admin' : '/vault', products, newUser);
    }
  };

  const handleLogout = () => {
    writeSession(null);
    setUser(null);
    pushRoute('/', products, null);
    setCart([]);
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

  // Authentication Required View
  if (view === 'auth') {
    return <Auth onAuthComplete={handleAuthComplete} onBack={() => pushRoute('/', products, user)} />;
  }

  // Admin View
  if (view === 'admin' && user?.role === 'admin') {
    return (
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
    );
  }

  return (
    <div className="min-h-screen relative z-10 transition-opacity duration-500">
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
            pushRoute('/auth', products, user);
          }
        }}
      />
      
      <main className="transition-all duration-500 ease-in-out">
        {view === 'store' && (
          <div className="animate-reveal">
            {apiOnline === false && (
              <div className="mx-auto mt-28 mb-4 max-w-7xl px-6">
                <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-3 text-xs font-bold uppercase tracking-wider text-yellow-200">
                  Store API offline. Local fallback is disabled.
                </div>
              </div>
            )}
            <Hero />
            <ProductList products={products} onView={handleViewProduct} onBuyNow={handleBuyNow} />
          </div>
        )}
        {view === 'product-detail' && selectedProduct && (
          <div className="animate-reveal">
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
          <div className="animate-reveal">
            <UserDashboard user={user} onLogout={handleLogout} onBrowse={() => pushRoute('/', products, user)} />
          </div>
        )}
        {view === 'privacy' && (
          <div className="animate-reveal">
            <PrivacyPolicyPage onBack={() => pushRoute('/', products, user)} />
          </div>
        )}
        {view === 'terms' && (
          <div className="animate-reveal">
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
            setIsCartOpen(false);
            setView('auth');
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
  );
}
