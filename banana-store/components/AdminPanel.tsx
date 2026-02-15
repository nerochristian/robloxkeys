
import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BarChart3,
  CreditCard,
  FileText,
  Globe,
  Layers,
  LogOut,
  MessageSquare,
  Package,
  Plus,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Tag,
  Ticket,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { AdminSettings, Product, ProductTier, ServiceType } from '../types';
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
  Ticket as SupportTicket,
  User,
} from '../services/storageService';
import { BRAND_CONFIG, BRAND_INITIALS } from '../config/brandConfig';
import { AdminSummaryTopProduct, ShopApiService, ShopStateKey, ShopStateMap } from '../services/shopApiService';

interface AdminPanelProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  settings: AdminSettings;
  setSettings: React.Dispatch<React.SetStateAction<AdminSettings>>;
  onLogout: () => void;
}

type Tab =
  | 'dashboard'
  | 'products'
  | 'categories'
  | 'groups'
  | 'orders'
  | 'invoices'
  | 'customers'
  | 'coupons'
  | 'tickets'
  | 'feedbacks'
  | 'domains'
  | 'payment_methods'
  | 'team'
  | 'blacklist'
  | 'settings'
  | 'security';

const newProduct = (): Product => ({
  id: `prod-${Date.now()}`,
  name: '',
  description: '',
  urlPath: '',
  price: 0,
  originalPrice: 0,
  duration: '1 Month',
  type: ServiceType.OTHER,
  features: [],
  detailedDescription: [],
  image: '',
  bannerImage: '',
  category: '',
  group: '',
  visibility: 'public',
  cardBadgeLabel: '',
  cardBadgeIcon: 'grid',
  hideStockCount: false,
  showViewsCount: false,
  showSalesCount: false,
  liveSalesTimespan: 'all_time',
  stock: 0,
  popular: false,
  featured: false,
  verified: false,
  instantDelivery: true,
  tiers: [],
});

const lines = (value: string) => value.split('\n').map((x) => x.trim()).filter(Boolean);
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const hasTiers = (product: Product) => Array.isArray(product.tiers) && product.tiers.length > 0;
const totalStock = (product: Product) => {
  if (!hasTiers(product)) return Number(product.stock || 0);
  return (product.tiers || []).reduce((sum, tier) => sum + Number(tier.stock || 0), 0);
};
const priceLabel = (product: Product) => {
  const tierPrices = (product.tiers || []).map((tier) => Number(tier.price || 0)).filter((price) => price > 0);
  if (tierPrices.length === 0) return `$${Number(product.price || 0).toFixed(2)}`;
  return `$${Math.min(...tierPrices).toFixed(2)} - $${Math.max(...tierPrices).toFixed(2)}`;
};

const navItems: Array<{ id: Tab; label: string; icon: React.ElementType; group: 'overview' | 'commerce' | 'operations' | 'system'; description: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3, group: 'overview', description: 'Revenue and live performance snapshot.' },
  { id: 'products', label: 'Products', icon: Package, group: 'commerce', description: 'Manage products, tiers, and stock.' },
  { id: 'categories', label: 'Categories', icon: Layers, group: 'commerce', description: 'Organize products into categories.' },
  { id: 'groups', label: 'Groups', icon: Layers, group: 'commerce', description: 'Control product group visibility.' },
  { id: 'orders', label: 'Orders', icon: ShoppingBag, group: 'commerce', description: 'Review and update order status.' },
  { id: 'invoices', label: 'Invoices', icon: FileText, group: 'commerce', description: 'Track billing records and payment state.' },
  { id: 'customers', label: 'Customers', icon: Users, group: 'commerce', description: 'Inspect customer accounts and spend.' },
  { id: 'coupons', label: 'Coupons', icon: Tag, group: 'commerce', description: 'Create and manage discount campaigns.' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, group: 'operations', description: 'Handle support tickets quickly.' },
  { id: 'feedbacks', label: 'Feedbacks', icon: MessageSquare, group: 'operations', description: 'Track customer ratings and feedback.' },
  { id: 'domains', label: 'Domains', icon: Globe, group: 'operations', description: 'Manage storefront domains and verification.' },
  { id: 'payment_methods', label: 'Payment Methods', icon: CreditCard, group: 'operations', description: 'Monitor payment gateway setup.' },
  { id: 'team', label: 'Team', icon: UserRound, group: 'system', description: 'Manage staff roles and access.' },
  { id: 'blacklist', label: 'Blacklist', icon: Ban, group: 'system', description: 'Block abusive users, emails, or IPs.' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'system', description: 'Update store-level configuration.' },
  { id: 'security', label: 'Security', icon: ShieldAlert, group: 'system', description: 'Review security events and logs.' },
];

const NAV_GROUPS: Array<{ id: 'overview' | 'commerce' | 'operations' | 'system'; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'operations', label: 'Operations' },
  { id: 'system', label: 'System' },
];

const cardClass = 'bg-[#0b0b0b]/95 border border-[#facc15]/20 rounded-2xl p-5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all hover:border-[#facc15]/35';
const fieldClass = 'w-full rounded-xl border border-white/15 bg-[#0f1219]/90 px-3 py-2.5 text-sm text-white placeholder:text-white/35 transition-all focus:outline-none focus:ring-2 focus:ring-[#facc15]/35 focus:border-[#facc15]/45';
const fieldCompactClass = 'rounded-xl border border-white/15 bg-[#0f1219]/90 px-2 py-1.5 text-sm text-white placeholder:text-white/35 transition-all focus:outline-none focus:ring-2 focus:ring-[#facc15]/35 focus:border-[#facc15]/45';
const primaryButtonClass = 'rounded-xl bg-[#facc15] px-4 py-2.5 font-semibold text-black transition-all hover:-translate-y-0.5 hover:bg-[#eab308] active:scale-[0.98]';
const subtleButtonClass = 'rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/90 transition-all hover:-translate-y-0.5 hover:bg-white/15 active:scale-[0.98]';
const mutedPanelClass = 'rounded-xl border border-[#facc15]/15 bg-[#090909]/95';

export const AdminPanel: React.FC<AdminPanelProps> = ({ products, setProducts, settings, setSettings, onLogout }) => {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [gatewayMethods, setGatewayMethods] = useState({
    card: { enabled: false, automated: true },
    paypal: { enabled: false, automated: false },
    crypto: { enabled: false, automated: false },
  });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<{
    revenue: number;
    unitsSold: number;
    pendingOrders: number;
    totalOrders: number;
    customers: number;
  } | null>(null);
  const [summaryTopProducts, setSummaryTopProducts] = useState<Array<{ name: string; units: number; revenue: number }>>([]);
  const [summaryCustomerStats, setSummaryCustomerStats] = useState<Record<string, { orders: number; spent: number }>>({});

  const [openEditor, setOpenEditor] = useState(false);
  const [openInventoryModal, setOpenInventoryModal] = useState(false);
  const [inventoryProductId, setInventoryProductId] = useState('');
  const [inventoryTierId, setInventoryTierId] = useState('');
  const [inventoryKeysInput, setInventoryKeysInput] = useState('');
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [draft, setDraft] = useState<Product>(newProduct());
  const [featuresText, setFeaturesText] = useState('');
  const [detailsText, setDetailsText] = useState('');
  const [tierDrafts, setTierDrafts] = useState<ProductTier[]>([]);

  const [categoryDraft, setCategoryDraft] = useState({ name: '', slug: '', visibility: 'public' as Category['visibility'] });
  const [groupDraft, setGroupDraft] = useState({ name: '', visibility: 'public' as ProductGroup['visibility'] });
  const [couponDraft, setCouponDraft] = useState({ code: '', type: 'percent' as Coupon['type'], value: 10, maxUses: 100, expiresAt: '' });
  const [ticketDraft, setTicketDraft] = useState({ subject: '', customerEmail: '', priority: 'medium' as SupportTicket['priority'] });
  const [feedbackDraft, setFeedbackDraft] = useState({ customerEmail: '', rating: 5, message: '' });
  const [domainDraft, setDomainDraft] = useState({ domain: '' });
  const [teamDraft, setTeamDraft] = useState({ email: '', role: 'support' });
  const [blacklistDraft, setBlacklistDraft] = useState({ type: 'email' as BlacklistEntry['type'], value: '', reason: '' });

  const setRemoteState = async <K extends ShopStateKey>(key: K, value: ShopStateMap[K]) => {
    await ShopApiService.setState(key, value);
  };

  const appendSecurityLog = async (event: string, status: SecurityLog['status']) => {
    const entry: SecurityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      event,
      timestamp: new Date().toISOString(),
      status,
      ip: 'api',
    };
    const nextLogs = [entry, ...logs].slice(0, 100);
    setLogs(nextLogs);
    try {
      await setRemoteState('logs', nextLogs);
    } catch {
      // Keep UI responsive even if log persistence fails.
    }
  };

  const refresh = async () => {
    try {
      const [
        summary,
        methods,
        usersState,
        logsState,
        categoriesState,
        groupsState,
        couponsState,
        invoicesState,
        ticketsState,
        feedbacksState,
        domainsState,
        paymentMethodsState,
        teamState,
        blacklistState,
        settingsState,
      ] = await Promise.all([
        ShopApiService.getAdminSummary(),
        ShopApiService.getPaymentMethods(),
        ShopApiService.getState('users'),
        ShopApiService.getState('logs'),
        ShopApiService.getState('categories'),
        ShopApiService.getState('groups'),
        ShopApiService.getState('coupons'),
        ShopApiService.getState('invoices'),
        ShopApiService.getState('tickets'),
        ShopApiService.getState('feedbacks'),
        ShopApiService.getState('domains'),
        ShopApiService.getState('payment_methods'),
        ShopApiService.getState('team'),
        ShopApiService.getState('blacklist'),
        ShopApiService.getState('settings'),
      ]);

      setGatewayMethods(methods);
      setUsers(usersState);
      setLogs(logsState);
      setCategories(categoriesState);
      setGroups(groupsState);
      setCoupons(couponsState);
      setInvoices(invoicesState);
      setTickets(ticketsState);
      setFeedbacks(feedbacksState);
      setDomains(domainsState);
      setPaymentMethods(paymentMethodsState);
      setTeam(teamState);
      setBlacklist(blacklistState);
      setSettings(settingsState);

      if (Array.isArray(summary.orders)) {
        setOrders(summary.orders);
      }
      if (Array.isArray(summary.customers)) {
        const nextStats: Record<string, { orders: number; spent: number }> = {};
        summary.customers.forEach((customer, index) => {
          const id = String(customer.id || customer.email || `customer-${index + 1}`);
          nextStats[id] = {
            orders: Number(customer.orders || 0),
            spent: Number(customer.totalSpent || 0),
          };
        });
        setSummaryCustomerStats(nextStats);
      }
      setSummaryMetrics({
        revenue: Number(summary.metrics.revenue || 0),
        unitsSold: Number(summary.metrics.unitsSold || 0),
        pendingOrders: Number(summary.metrics.pendingOrders || 0),
        totalOrders: Number(summary.metrics.totalOrders || 0),
        customers: Number(summary.metrics.customers || 0),
      });
      const top = (summary.topProducts || []).map((row: AdminSummaryTopProduct) => ({
        name: String(row.name || row.id || 'Unknown Product'),
        units: Number(row.units || 0),
        revenue: Number(row.revenue || 0),
      }));
      setSummaryTopProducts(top);
    } catch (error) {
      console.error('Failed to refresh admin data from API:', error);
      setSummaryMetrics(null);
      setSummaryTopProducts([]);
      setSummaryCustomerStats({});
      setMessage('Failed to load admin data from API.');
    }
  };

  useEffect(() => {
    void refresh();
  }, [tab, products]);

  useEffect(() => {
    if (!['dashboard', 'orders', 'customers'].includes(tab)) return;
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [tab]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const usersById = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const localRevenue = orders.filter((o) => o.status === 'completed').reduce((sum, o) => sum + o.total, 0);
  const localUnitsSold = orders
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
  const customers = users.filter((u) => u.role === 'user');
  const localPendingOrders = orders.filter((o) => o.status === 'pending').length;
  const revenue = summaryMetrics?.revenue ?? localRevenue;
  const unitsSold = summaryMetrics?.unitsSold ?? localUnitsSold;
  const pendingOrders = summaryMetrics?.pendingOrders ?? localPendingOrders;
  const totalOrders = summaryMetrics?.totalOrders ?? orders.length;
  const customersCount = summaryMetrics?.customers ?? customers.length;
  const openTickets = tickets.filter((ticket) => ticket.status === 'open').length;
  const lowStockCount = products.filter((product) => {
    const stock = totalStock(product);
    return stock > 0 && stock <= 5;
  }).length;
  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase()));
  const currentNavItem = navItems.find((item) => item.id === tab) || navItems[0];
  const inventoryProduct = products.find((product) => product.id === inventoryProductId) || null;
  const inventoryItemsCount = inventoryKeysInput
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean).length;
  const navBadges: Partial<Record<Tab, number>> = {
    products: lowStockCount,
    orders: pendingOrders,
    tickets: openTickets,
  };

  const computedTopProducts = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number }>();
    orders
      .filter((o) => o.status === 'completed')
      .forEach((o) => o.items.forEach((i) => {
      const prev = map.get(i.id) || { name: i.name, units: 0, revenue: 0 };
      prev.units += i.quantity;
      prev.revenue += i.quantity * i.price;
      map.set(i.id, prev);
    }));
    return [...map.values()].sort((a, b) => b.units - a.units).slice(0, 5);
  }, [orders]);
  const topProducts = summaryTopProducts.length > 0 ? summaryTopProducts : computedTopProducts;

  const openCreate = () => {
    setDraft(newProduct());
    setFeaturesText('');
    setDetailsText('');
    setTierDrafts([]);
    setOpenEditor(true);
  };

  const openEdit = (product: Product) => {
    setDraft({ ...newProduct(), ...product });
    setFeaturesText((product.features || []).join('\n'));
    setDetailsText((product.detailedDescription || []).join('\n'));
    setTierDrafts(
      (product.tiers || []).map((tier) => ({
        id: String(tier.id || `tier-${Date.now()}`),
        name: String(tier.name || ''),
        description: String(tier.description || ''),
        price: Number(tier.price || 0),
        originalPrice: Number(tier.originalPrice || 0),
        stock: Number(tier.stock || 0),
        image: String(tier.image || ''),
        duration: String(tier.duration || ''),
      }))
    );
    setOpenEditor(true);
  };

  const saveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedTiers = tierDrafts
      .map((tier, idx) => {
        const tierId = slug(tier.id || tier.name || `tier-${idx + 1}`);
        return {
          id: tierId || `tier-${Date.now()}-${idx + 1}`,
          name: String(tier.name || '').trim(),
          description: String(tier.description || '').trim(),
          price: Number(tier.price || 0),
          originalPrice: Number(tier.originalPrice || 0),
          stock: Math.max(0, Number(tier.stock || 0)),
          image: String(tier.image || '').trim(),
          duration: String(tier.duration || '').trim(),
        } satisfies ProductTier;
      })
      .filter((tier) => tier.name && tier.id);

    const usesTiers = normalizedTiers.length > 0;
    const aggregatedTierStock = normalizedTiers.reduce((total, tier) => total + Number(tier.stock || 0), 0);

    const normalized: Product = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      urlPath: (draft.urlPath || '').trim(),
      stock: usesTiers ? aggregatedTierStock : Math.max(0, Number(draft.stock || 0)),
      price: usesTiers ? Math.min(...normalizedTiers.map((tier) => Number(tier.price || 0))) : Number(draft.price || 0),
      originalPrice: usesTiers
        ? Math.max(...normalizedTiers.map((tier) => Number(tier.originalPrice || tier.price || 0)))
        : Number(draft.originalPrice || 0),
      features: lines(featuresText),
      detailedDescription: lines(detailsText),
      category: (draft.category || '').trim(),
      group: (draft.group || '').trim(),
      visibility: draft.visibility || 'public',
      liveSalesTimespan: draft.liveSalesTimespan || 'all_time',
      tiers: normalizedTiers,
    };

    if (!normalized.name || !normalized.description) {
      setMessage('Name and description are required.');
      return;
    }
    if (usesTiers && normalizedTiers.some((tier) => tier.price <= 0)) {
      setMessage('Tier price must be greater than zero.');
      return;
    }

    const exists = products.some((p) => p.id === normalized.id);
    ShopApiService.upsertProduct(normalized)
      .then(async (result) => {
        if (result.products) {
          setProducts(result.products);
        } else if (result.product) {
          setProducts((prev) => exists ? prev.map((item) => (item.id === result.product!.id ? result.product! : item)) : [result.product!, ...prev]);
        } else {
          setProducts((prev) => exists ? prev.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...prev]);
        }
        await appendSecurityLog(`${exists ? 'Updated' : 'Created'} product ${normalized.name}`, 'SUCCESS');
        setMessage(`Product ${exists ? 'updated' : 'created'} successfully.`);
        setOpenEditor(false);
      })
      .catch((error) => {
        console.error('API upsert failed.', error);
        setMessage(error instanceof Error ? error.message : 'Failed to save product.');
      });
  };

  const deleteProduct = (id: string) => {
    const product = products.find((x) => x.id === id);
    if (!product || !confirm(`Delete "${product.name}"?`)) return;

    ShopApiService.deleteProduct(id)
      .then(async (result) => {
        if (result.products) setProducts(result.products);
        else setProducts((prev) => prev.filter((x) => x.id !== id));
        await appendSecurityLog(`Deleted product ${product.name}`, 'WARNING');
        setMessage(`Deleted ${product.name}.`);
      })
      .catch((error) => {
        console.error('API delete failed.', error);
        setMessage(error instanceof Error ? error.message : `Failed to delete ${product.name}.`);
      });
  };

  const cloneProduct = (product: Product) => {
    const copy: Product = {
      ...product,
      id: `prod-${Date.now()}`,
      name: `${product.name} (Copy)`
    };

    ShopApiService.upsertProduct(copy)
      .then(async (result) => {
        if (result.products) setProducts(result.products);
        else setProducts((prev) => [copy, ...prev]);
        await appendSecurityLog(`Cloned product ${product.name}`, 'SUCCESS');
        setMessage(`Cloned ${product.name}.`);
      })
      .catch((error) => {
        console.error('API clone failed.', error);
        setMessage(error instanceof Error ? error.message : `Failed to clone ${product.name}.`);
      });
  };

  const adjustStock = (productId: string, delta: number, tierId?: string) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    if (hasTiers(product) && !tierId) {
      setMessage('This product has tiers. Adjust stock on a specific tier.');
      return;
    }

    ShopApiService.updateStock(productId, delta, 'admin_adjustment', tierId)
      .then((result) => {
        if (result.products) setProducts(result.products);
        else if (result.product) setProducts((prev) => prev.map((item) => (item.id === productId ? result.product! : item)));
        const suffix = tierId ? ` (tier ${tierId})` : '';
        setMessage(`Updated stock for ${product.name}${suffix} (${delta > 0 ? '+' : ''}${delta}).`);
      })
      .catch((error) => {
        console.warn('API stock update failed.', error);
        setMessage(error instanceof Error ? error.message : 'Failed to update stock.');
      });
  };

  const promptSetStock = (product: Product) => {
    if (hasTiers(product)) {
      setMessage('This product uses tiers. Use Add Keys for each tier instead.');
      return;
    }
    const input = window.prompt(`Set stock for "${product.name}"`, String(product.stock));
    if (input === null) return;
    const target = Number.parseInt(input, 10);
    if (Number.isNaN(target) || target < 0) {
      setMessage('Stock must be zero or higher.');
      return;
    }
    if (target > product.stock) {
      setMessage('To increase stock, use "Add Keys" and paste real credentials.');
      return;
    }
    const delta = target - product.stock;
    if (delta === 0) return;
    adjustStock(product.id, delta);
  };

  const addStockKeys = (product: Product) => {
    const tiers = product.tiers || [];
    if (hasTiers(product) && tiers.length === 0) {
      setMessage('This product is tiered but has no tier rows.');
      return;
    }
    setInventoryProductId(product.id);
    setInventoryTierId(hasTiers(product) ? tiers[0].id : '');
    setInventoryKeysInput('');
    setOpenInventoryModal(true);
  };

  const closeInventoryModal = () => {
    setOpenInventoryModal(false);
    setInventoryBusy(false);
    setInventoryProductId('');
    setInventoryTierId('');
    setInventoryKeysInput('');
  };

  const submitInventoryKeys = () => {
    if (!inventoryProduct) {
      setMessage('Product no longer exists.');
      closeInventoryModal();
      return;
    }

    const tierId = hasTiers(inventoryProduct) ? inventoryTierId : '';
    if (hasTiers(inventoryProduct)) {
      const selectedTier = (inventoryProduct.tiers || []).find((tier) => tier.id === tierId);
      if (!selectedTier) {
        setMessage('Choose a tier first.');
        return;
      }
    }

    const items = inventoryKeysInput
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (items.length === 0) {
      setMessage('Add at least one stock key/account line.');
      return;
    }

    setInventoryBusy(true);
    ShopApiService.addInventory(inventoryProduct.id, items, tierId || undefined)
      .then((result) => {
        if (result.products) setProducts(result.products);
        const suffix = tierId ? ` [${tierId}]` : '';
        setMessage(`Added ${items.length} stock keys for ${inventoryProduct.name}${suffix}.`);
        closeInventoryModal();
      })
      .catch((error) => {
        console.error('Failed to add stock inventory:', error);
        setMessage(error instanceof Error ? error.message : 'Failed to add stock inventory.');
        setInventoryBusy(false);
      });
  };

  const saveSettings = async () => {
    try {
      await setRemoteState('settings', settings);
      await appendSecurityLog('Store settings updated', 'SUCCESS');
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to save settings.');
    }
  };

  const addCategory = async () => {
    const name = categoryDraft.name.trim();
    if (!name) return;
    const slug = (categoryDraft.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const nextCategories = [
      { id: `cat-${Date.now()}`, name, slug, visibility: categoryDraft.visibility } as Category,
      ...categories,
    ];
    try {
      await setRemoteState('categories', nextCategories);
      await appendSecurityLog(`Created category ${name}`, 'SUCCESS');
      setCategoryDraft({ name: '', slug: '', visibility: 'public' });
      await refresh();
      setMessage('Category added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add category.');
    }
  };

  const addGroup = async () => {
    const name = groupDraft.name.trim();
    if (!name) return;
    const nextGroups = [
      { id: `grp-${Date.now()}`, name, visibility: groupDraft.visibility } as ProductGroup,
      ...groups,
    ];
    try {
      await setRemoteState('groups', nextGroups);
      await appendSecurityLog(`Created group ${name}`, 'SUCCESS');
      setGroupDraft({ name: '', visibility: 'public' });
      await refresh();
      setMessage('Group added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add group.');
    }
  };

  const addCoupon = async () => {
    const code = couponDraft.code.trim().toUpperCase();
    if (!code) return;
    const nextCoupons = [{
      id: `cp-${Date.now()}`,
      code,
      type: couponDraft.type,
      value: Number(couponDraft.value),
      uses: 0,
      maxUses: Number(couponDraft.maxUses),
      expiresAt: couponDraft.expiresAt || undefined,
      active: true,
    } as Coupon, ...coupons];
    try {
      await setRemoteState('coupons', nextCoupons);
      await appendSecurityLog(`Created coupon ${code}`, 'SUCCESS');
      setCouponDraft({ code: '', type: 'percent', value: 10, maxUses: 100, expiresAt: '' });
      await refresh();
      setMessage('Coupon added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add coupon.');
    }
  };

  const addTicket = async () => {
    if (!ticketDraft.subject.trim() || !ticketDraft.customerEmail.trim()) return;
    const nextTickets = [{
      id: `tic-${Date.now()}`,
      subject: ticketDraft.subject.trim(),
      customerEmail: ticketDraft.customerEmail.trim(),
      status: 'open',
      priority: ticketDraft.priority,
      createdAt: new Date().toISOString(),
    } as SupportTicket, ...tickets];
    try {
      await setRemoteState('tickets', nextTickets);
      setTicketDraft({ subject: '', customerEmail: '', priority: 'medium' });
      await refresh();
      setMessage('Ticket added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add ticket.');
    }
  };

  const addFeedback = async () => {
    if (!feedbackDraft.customerEmail.trim() || !feedbackDraft.message.trim()) return;
    const nextFeedbacks = [{
      id: `fb-${Date.now()}`,
      customerEmail: feedbackDraft.customerEmail.trim(),
      rating: Math.max(1, Math.min(5, Number(feedbackDraft.rating))),
      message: feedbackDraft.message.trim(),
      createdAt: new Date().toISOString(),
    } as Feedback, ...feedbacks];
    try {
      await setRemoteState('feedbacks', nextFeedbacks);
      setFeedbackDraft({ customerEmail: '', rating: 5, message: '' });
      await refresh();
      setMessage('Feedback added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add feedback.');
    }
  };

  const addDomain = async () => {
    const domain = domainDraft.domain.trim().toLowerCase();
    if (!domain) return;
    const nextDomains = [{ id: `dom-${Date.now()}`, domain, verified: false, createdAt: new Date().toISOString() } as DomainRecord, ...domains];
    try {
      await setRemoteState('domains', nextDomains);
      setDomainDraft({ domain: '' });
      await refresh();
      setMessage('Domain added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add domain.');
    }
  };

  const addTeamMember = async () => {
    const email = teamDraft.email.trim().toLowerCase();
    if (!email) return;
    const nextTeam = [{ id: `team-${Date.now()}`, email, role: teamDraft.role.trim() || 'support', createdAt: new Date().toISOString() } as TeamMember, ...team];
    try {
      await setRemoteState('team', nextTeam);
      setTeamDraft({ email: '', role: 'support' });
      await refresh();
      setMessage('Team member added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add team member.');
    }
  };

  const addBlacklistEntry = async () => {
    if (!blacklistDraft.value.trim()) return;
    const nextBlacklist = [{
      id: `bl-${Date.now()}`,
      type: blacklistDraft.type,
      value: blacklistDraft.value.trim(),
      reason: blacklistDraft.reason.trim() || 'manual',
      createdAt: new Date().toISOString(),
    } as BlacklistEntry, ...blacklist];
    try {
      await setRemoteState('blacklist', nextBlacklist);
      setBlacklistDraft({ type: 'email', value: '', reason: '' });
      await refresh();
      setMessage('Blacklist entry added.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to add blacklist entry.');
    }
  };

  const deleteCategoryById = async (id: string) => {
    try {
      await setRemoteState('categories', categories.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete category.');
    }
  };

  const deleteGroupById = async (id: string) => {
    try {
      await setRemoteState('groups', groups.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete group.');
    }
  };

  const updateOrderStatus = async (orderId: string, nextStatus: Order['status']) => {
    try {
      await ShopApiService.updateOrderStatus(orderId, nextStatus);
      await refresh();
      setMessage(`Order ${orderId} updated to ${nextStatus}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Failed to update order ${orderId}.`);
    }
  };

  const toggleCoupon = async (coupon: Coupon) => {
    try {
      const nextCoupons = coupons.map((item) => item.id === coupon.id ? { ...item, active: !item.active } : item);
      await setRemoteState('coupons', nextCoupons);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update coupon.');
    }
  };

  const deleteCouponById = async (id: string) => {
    try {
      await setRemoteState('coupons', coupons.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete coupon.');
    }
  };

  const toggleTicket = async (ticket: SupportTicket) => {
    try {
      const nextTickets = tickets.map((item) => item.id === ticket.id ? { ...item, status: item.status === 'open' ? 'closed' : 'open' } : item);
      await setRemoteState('tickets', nextTickets);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update ticket.');
    }
  };

  const deleteTicketById = async (id: string) => {
    try {
      await setRemoteState('tickets', tickets.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete ticket.');
    }
  };

  const deleteFeedbackById = async (id: string) => {
    try {
      await setRemoteState('feedbacks', feedbacks.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete feedback.');
    }
  };

  const toggleDomain = async (domain: DomainRecord) => {
    try {
      const nextDomains = domains.map((item) => item.id === domain.id ? { ...item, verified: !item.verified } : item);
      await setRemoteState('domains', nextDomains);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update domain.');
    }
  };

  const deleteDomainById = async (id: string) => {
    try {
      await setRemoteState('domains', domains.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete domain.');
    }
  };

  const updatePaymentMethod = async (method: PaymentMethodConfig) => {
    try {
      const nextMethods = paymentMethods.map((item) => item.id === method.id ? method : item);
      await setRemoteState('payment_methods', nextMethods);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to update payment method.');
    }
  };

  const deleteTeamMemberById = async (id: string) => {
    try {
      await setRemoteState('team', team.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete team member.');
    }
  };

  const deleteBlacklistEntryById = async (id: string) => {
    try {
      await setRemoteState('blacklist', blacklist.filter((item) => item.id !== id));
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to delete blacklist entry.');
    }
  };

  return (
    <div className="relative min-h-screen bg-[#050505] text-white flex overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(250,204,21,0.16),transparent_46%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.08),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(250,204,21,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(250,204,21,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <aside className="relative z-10 sticky top-0 hidden h-screen w-[310px] bg-[#0a0a0a]/95 border-r border-[#facc15]/20 p-6 lg:flex flex-col backdrop-blur-md">
        <div className="mb-6 rounded-2xl border border-[#facc15]/20 bg-[#0e0e0e] p-4">
          <div className="text-2xl font-black leading-tight">
            <span>{BRAND_CONFIG.identity.shortName}</span> <span className="text-[#facc15]">Admin</span>
          </div>
          <div className="mt-1 text-[11px] text-yellow-200/60 uppercase tracking-[0.18em]">Control Center</div>
          <div className="mt-3 rounded-xl border border-[#facc15]/20 bg-black/40 p-2 text-[11px] text-yellow-100/70">
            Store health: {lowStockCount} low stock, {pendingOrders} pending orders, {openTickets} open tickets.
          </div>
        </div>
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-200/45">{group.label}</p>
              <div className="space-y-1.5">
                {navItems.filter((item) => item.group === group.id).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 border transition-all ${
                      tab === item.id
                        ? 'bg-[#facc15]/18 border-[#facc15]/45 shadow-[0_0_22px_rgba(250,204,21,0.14)]'
                        : 'border-transparent hover:border-white/10 hover:bg-white/5'
                    }`}
                  >
                    {React.createElement(item.icon, { className: 'w-4 h-4 mt-0.5 shrink-0' })}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{item.label}</span>
                        {(navBadges[item.id] || 0) > 0 && (
                          <span className="rounded-full border border-[#facc15]/40 bg-[#facc15]/15 px-2 py-0.5 text-[10px] font-black text-[#facc15]">
                            {navBadges[item.id]}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-yellow-200/60">{item.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onLogout} className="mt-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 flex items-center gap-2">
          <LogOut className="w-4 h-4" /> Log Out
        </button>
      </aside>

      <main className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-[1280px]">
        <header className="mb-5 rounded-2xl border border-[#facc15]/20 bg-[#0b0b0b]/85 px-5 py-5 sm:px-6 shadow-[0_14px_40px_rgba(0,0,0,0.45)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="rounded-full border border-[#facc15]/30 bg-[#facc15]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#facc15]">
              Roblox Keys Admin
            </div>
            <div className="text-xs text-yellow-100/60">Live session</div>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black">{currentNavItem.label}</h1>
              <p className="text-yellow-200/60 text-sm">{currentNavItem.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden rounded-xl border border-[#facc15]/20 bg-black/35 px-3 py-2 text-xs text-yellow-100/70 md:block">
                Pending: <span className="font-bold text-white">{pendingOrders}</span>
              </div>
              <div className="hidden rounded-xl border border-[#facc15]/20 bg-black/35 px-3 py-2 text-xs text-yellow-100/70 md:block">
                Low stock: <span className="font-bold text-white">{lowStockCount}</span>
              </div>
              <div className="hidden rounded-xl border border-[#facc15]/20 bg-black/35 px-3 py-2 text-xs text-yellow-100/70 md:block">
                Tickets: <span className="font-bold text-white">{openTickets}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as Tab)}
              className={`${fieldCompactClass} min-w-[180px]`}
              title="Quick Navigation"
            >
              {navItems.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <div className="bg-[#0b0b0b] border border-[#facc15]/20 rounded-xl px-4 py-2 shadow-[0_0_20px_rgba(250,204,21,0.08)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#facc15] rounded-lg flex items-center justify-center font-black">{BRAND_INITIALS}</div>
                <div><div className="text-sm font-bold">Admin Session</div><div className="text-[11px] text-yellow-200/60">Live</div></div>
              </div>
            </div>
          </div>
        </header>

        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                tab === item.id
                  ? 'border-[#facc15]/45 bg-[#facc15]/15 text-[#facc15]'
                  : 'border-white/15 bg-white/5 text-white/80'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.18)]">
            {message}
          </div>
        )}

        {tab === 'dashboard' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={cardClass}>
                <div className="mb-6 flex items-start justify-between">
                  <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Revenue</div>
                  <BarChart3 className="h-5 w-5 text-[#facc15]" />
                </div>
                <div className="text-3xl font-black">${revenue.toFixed(2)}</div>
                <div className="mt-1 text-xs text-yellow-200/60">Completed order revenue</div>
              </div>
              <div className={cardClass}>
                <div className="mb-6 flex items-start justify-between">
                  <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Orders</div>
                  <ShoppingBag className="h-5 w-5 text-[#facc15]" />
                </div>
                <div className="text-3xl font-black">{totalOrders}</div>
                <div className="mt-1 text-xs text-yellow-200/60">{pendingOrders} pending</div>
              </div>
              <div className={cardClass}>
                <div className="mb-6 flex items-start justify-between">
                  <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Customers</div>
                  <Users className="h-5 w-5 text-[#facc15]" />
                </div>
                <div className="text-3xl font-black">{customersCount}</div>
                <div className="mt-1 text-xs text-yellow-200/60">Registered users</div>
              </div>
              <div className={cardClass}>
                <div className="mb-6 flex items-start justify-between">
                  <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Units Sold</div>
                  <Package className="h-5 w-5 text-[#facc15]" />
                </div>
                <div className="text-3xl font-black">{unitsSold}</div>
                <div className="mt-1 text-xs text-yellow-200/60">Total delivered quantity</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={cardClass}>
                <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Products</div>
                <div className="mt-1 text-2xl font-black">{products.length}</div>
                <div className="mt-2 text-xs text-yellow-200/70">{lowStockCount} near depletion</div>
              </div>
              <div className={cardClass}>
                <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Coupons</div>
                <div className="mt-1 text-2xl font-black">{coupons.length}</div>
                <div className="mt-2 text-xs text-yellow-200/70">Active discounts and campaigns</div>
              </div>
              <div className={cardClass}>
                <div className="text-xs text-yellow-200/60 uppercase tracking-[0.18em]">Support Load</div>
                <div className="mt-1 text-2xl font-black">{openTickets}</div>
                <div className="mt-2 text-xs text-yellow-200/70">Open tickets awaiting action</div>
              </div>
            </div>
            <div className={cardClass}>
              <h2 className="font-bold text-lg mb-3">Top Products</h2>
              {topProducts.length === 0 && <div className="text-yellow-200/60">No sales yet.</div>}
              <div className="space-y-2">
                {topProducts.map((p, index) => (
                  <div key={p.name} className="bg-white/5 rounded-lg p-3 flex items-center justify-between border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className="h-7 w-7 rounded-full bg-[#facc15]/20 border border-[#facc15]/30 flex items-center justify-center text-xs font-black text-[#facc15]">
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="text-xs text-yellow-200/60">{p.units} units</div>
                      </div>
                    </div>
                    <div className="font-bold">${p.revenue.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'products' && (
          <div className={cardClass}>
            <div className={`${mutedPanelClass} mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
              <div className="text-xs text-yellow-100/70">
                Inventory status: <span className="font-bold text-white">{products.length}</span> products,{' '}
                <span className="font-bold text-white">{lowStockCount}</span> low stock.
              </div>
              <div className="text-xs text-yellow-100/70">Use <span className="text-[#facc15] font-semibold">Add Keys</span> to add real deliverable stock.</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-yellow-200/60" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..." className={`${fieldClass} w-full pl-9`} />
              </div>
              <button onClick={openCreate} className={`${primaryButtonClass} inline-flex items-center gap-2`}><Plus className="w-4 h-4" /> Create</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-yellow-100/80 border-b border-[#facc15]/20">
                  <tr className="text-[11px] uppercase tracking-wider">
                    <th className="text-left py-3">ID</th>
                    <th className="text-left py-3">Name</th>
                    <th className="text-left py-3">Category</th>
                    <th className="text-left py-3">Group</th>
                    <th className="text-right py-3">Price</th>
                    <th className="text-right py-3">Stock</th>
                    <th className="text-right py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id} className="border-b border-[#facc15]/10 hover:bg-white/[0.03]">
                      <td className="py-2 text-xs font-mono">{p.id}</td>
                      <td className="py-2">
                        <div className="font-semibold">{p.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {hasTiers(p) && <span className="rounded-full border border-[#facc15]/35 bg-[#facc15]/10 px-2 py-0.5 text-[10px] font-semibold text-[#facc15]">{p.tiers?.length || 0} tiers</span>}
                          {p.visibility !== 'public' && (
                            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] uppercase">{p.visibility}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2">{p.category || '-'}</td>
                      <td className="py-2">{p.group || '-'}</td>
                      <td className="py-2 text-right">{priceLabel(p)}</td>
                      <td className="py-2 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${totalStock(p) <= 5 ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                          {totalStock(p)}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          {!hasTiers(p) && <button onClick={() => adjustStock(p.id, -5)} className={subtleButtonClass}>-5</button>}
                          {!hasTiers(p) && <button onClick={() => promptSetStock(p)} className={subtleButtonClass}>Set</button>}
                          <button onClick={() => addStockKeys(p)} className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/25">Add Keys</button>
                          <button onClick={() => openEdit(p)} className={subtleButtonClass}>Edit</button>
                          <button onClick={() => cloneProduct(p)} className={subtleButtonClass}>Clone</button>
                          <button onClick={() => deleteProduct(p.id)} className="rounded-xl bg-red-500/15 border border-red-400/35 px-3 py-2 text-sm text-red-300 hover:bg-red-500/25">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredProducts.length === 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-[#facc15]/25 bg-[#080808] px-4 py-8 text-center text-sm text-yellow-200/70">
                No products found. Create one to start selling.
              </div>
            )}
          </div>
        )}

        {tab === 'categories' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input value={categoryDraft.name} onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })} placeholder="Category name" className={fieldClass} />
                <input value={categoryDraft.slug} onChange={(e) => setCategoryDraft({ ...categoryDraft, slug: e.target.value })} placeholder="Slug (optional)" className={fieldClass} />
                <select value={categoryDraft.visibility} onChange={(e) => setCategoryDraft({ ...categoryDraft, visibility: e.target.value as Category['visibility'] })} className={fieldClass}><option value="public">public</option><option value="hidden">hidden</option></select>
                <button onClick={addCategory} className={primaryButtonClass}>Add Category</button>
              </div>
            </div>
            <div className={cardClass}><div className="space-y-2">{categories.map((c) => <div key={c.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between"><div><div className="font-semibold">{c.name}</div><div className="text-xs text-yellow-200/60">{c.slug} | {c.visibility}</div></div><button onClick={() => { void deleteCategoryById(c.id); }} className="px-2 py-1 rounded bg-red-500/20"><Trash2 className="w-4 h-4" /></button></div>)}{categories.length === 0 && <div className="text-yellow-200/60">No categories yet.</div>}</div></div>
          </div>
        )}

        {tab === 'groups' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={groupDraft.name} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} placeholder="Group name" className={fieldClass} />
                <select value={groupDraft.visibility} onChange={(e) => setGroupDraft({ ...groupDraft, visibility: e.target.value as ProductGroup['visibility'] })} className={fieldClass}><option value="public">public</option><option value="hidden">hidden</option></select>
                <button onClick={addGroup} className={primaryButtonClass}>Add Group</button>
              </div>
            </div>
            <div className={cardClass}><div className="space-y-2">{groups.map((g) => <div key={g.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between"><div><div className="font-semibold">{g.name}</div><div className="text-xs text-yellow-200/60">{g.visibility}</div></div><button onClick={() => { void deleteGroupById(g.id); }} className="px-2 py-1 rounded bg-red-500/20"><Trash2 className="w-4 h-4" /></button></div>)}{groups.length === 0 && <div className="text-yellow-200/60">No groups yet.</div>}</div></div>
          </div>
        )}

        {tab === 'orders' && (
          <div className={cardClass + ' overflow-x-auto'}>
            <table className="w-full text-sm">
              <thead className="text-yellow-200/70 border-b border-[#facc15]/20"><tr><th className="text-left py-2">Order</th><th className="text-left py-2">Customer</th><th className="text-right py-2">Total</th><th className="text-left py-2">Date</th><th className="text-right py-2">Status</th></tr></thead>
              <tbody>{orders.map((o) => {
                const userPayload = (o as unknown as { user?: { email?: string } }).user;
                const customerLabel = usersById.get(o.userId)?.email || userPayload?.email || o.userId;
                return <tr key={o.id} className="border-b border-[#facc15]/10"><td className="py-2 font-mono text-xs">{o.id}</td><td className="py-2">{customerLabel}</td><td className="py-2 text-right">${o.total.toFixed(2)}</td><td className="py-2 text-yellow-200/60">{new Date(o.createdAt).toLocaleString()}</td><td className="py-2 text-right"><select value={o.status} onChange={(e) => { const nextStatus = e.target.value as Order['status']; void updateOrderStatus(o.id, nextStatus); }} className={fieldCompactClass}><option value="pending">pending</option><option value="completed">completed</option><option value="refunded">refunded</option><option value="cancelled">cancelled</option></select></td></tr>;
              })}</tbody>
            </table>
          </div>
        )}

        {tab === 'invoices' && (
          <div className={cardClass + ' overflow-x-auto'}>
            <table className="w-full text-sm">
              <thead className="text-yellow-200/70 border-b border-[#facc15]/20"><tr><th className="text-left py-2">Invoice</th><th className="text-left py-2">Order</th><th className="text-left py-2">Email</th><th className="text-right py-2">Total</th><th className="text-left py-2">Date</th><th className="text-right py-2">Status</th></tr></thead>
              <tbody>{invoices.map((i) => <tr key={i.id} className="border-b border-[#facc15]/10"><td className="py-2 font-mono text-xs">{i.id}</td><td className="py-2 font-mono text-xs">{i.orderId}</td><td className="py-2">{i.email}</td><td className="py-2 text-right">${i.total.toFixed(2)}</td><td className="py-2 text-yellow-200/60">{new Date(i.createdAt).toLocaleString()}</td><td className="py-2 text-right"><span className="px-2 py-1 rounded bg-white/10 text-xs uppercase">{i.status}</span></td></tr>)}</tbody>
            </table>
          </div>
        )}

        {tab === 'customers' && (
          <div className={cardClass + ' overflow-x-auto'}>
            <table className="w-full text-sm">
              <thead className="text-yellow-200/70 border-b border-[#facc15]/20"><tr><th className="text-left py-2">Email</th><th className="text-left py-2">Joined</th><th className="text-right py-2">Orders</th><th className="text-right py-2">Spent</th></tr></thead>
              <tbody>{customers.map((c) => {
                const remoteStats = summaryCustomerStats[c.id];
                const localOrders = orders.filter((o) => o.userId === c.id);
                const localCompleted = localOrders.filter((o) => o.status === 'completed');
                const ordersCount = remoteStats?.orders ?? localOrders.length;
                const spent = remoteStats?.spent ?? localCompleted.reduce((s, o) => s + o.total, 0);
                return <tr key={c.id} className="border-b border-[#facc15]/10"><td className="py-2">{c.email}</td><td className="py-2 text-yellow-200/60">{new Date(c.createdAt).toLocaleDateString()}</td><td className="py-2 text-right">{ordersCount}</td><td className="py-2 text-right">${spent.toFixed(2)}</td></tr>;
              })}</tbody>
            </table>
          </div>
        )}

        {tab === 'coupons' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                <input value={couponDraft.code} onChange={(e) => setCouponDraft({ ...couponDraft, code: e.target.value })} placeholder="Code" className={fieldClass} />
                <select value={couponDraft.type} onChange={(e) => setCouponDraft({ ...couponDraft, type: e.target.value as Coupon['type'] })} className={fieldClass}><option value="percent">percent</option><option value="fixed">fixed</option></select>
                <input type="number" value={couponDraft.value} onChange={(e) => setCouponDraft({ ...couponDraft, value: Number(e.target.value) })} placeholder="Value" className={fieldClass} />
                <input type="number" value={couponDraft.maxUses} onChange={(e) => setCouponDraft({ ...couponDraft, maxUses: Number(e.target.value) })} placeholder="Max uses" className={fieldClass} />
                <input type="datetime-local" value={couponDraft.expiresAt} onChange={(e) => setCouponDraft({ ...couponDraft, expiresAt: e.target.value })} className={fieldClass} />
                <button onClick={addCoupon} className={primaryButtonClass}>Add Coupon</button>
              </div>
            </div>
            <div className={cardClass + ' overflow-x-auto'}>
              <table className="w-full text-sm"><thead className="text-yellow-200/70 border-b border-[#facc15]/20"><tr><th className="text-left py-2">Code</th><th className="text-left py-2">Type</th><th className="text-right py-2">Value</th><th className="text-right py-2">Uses</th><th className="text-left py-2">Expires</th><th className="text-right py-2">Actions</th></tr></thead>
                <tbody>{coupons.map((c) => <tr key={c.id} className="border-b border-[#facc15]/10"><td className="py-2 font-bold">{c.code}</td><td className="py-2">{c.type}</td><td className="py-2 text-right">{c.value}</td><td className="py-2 text-right">{c.uses}/{c.maxUses}</td><td className="py-2 text-yellow-200/60">{c.expiresAt ? new Date(c.expiresAt).toLocaleString() : '-'}</td><td className="py-2 text-right"><div className="inline-flex gap-2"><button onClick={() => { void toggleCoupon(c); }} className="px-2 py-1 rounded bg-white/10">{c.active ? 'Disable' : 'Enable'}</button><button onClick={() => { void deleteCouponById(c.id); }} className="px-2 py-1 rounded bg-red-500/20">Delete</button></div></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'tickets' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input value={ticketDraft.subject} onChange={(e) => setTicketDraft({ ...ticketDraft, subject: e.target.value })} placeholder="Subject" className={fieldClass} />
                <input value={ticketDraft.customerEmail} onChange={(e) => setTicketDraft({ ...ticketDraft, customerEmail: e.target.value })} placeholder="Customer email" className={fieldClass} />
                <select value={ticketDraft.priority} onChange={(e) => setTicketDraft({ ...ticketDraft, priority: e.target.value as SupportTicket['priority'] })} className={fieldClass}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
                <button onClick={addTicket} className={primaryButtonClass}>Add Ticket</button>
              </div>
            </div>
            <div className={cardClass + ' overflow-x-auto'}>
              <table className="w-full text-sm"><thead className="text-yellow-200/70 border-b border-[#facc15]/20"><tr><th className="text-left py-2">Subject</th><th className="text-left py-2">Customer</th><th className="text-left py-2">Priority</th><th className="text-left py-2">Date</th><th className="text-right py-2">Actions</th></tr></thead>
                <tbody>{tickets.map((t) => <tr key={t.id} className="border-b border-[#facc15]/10"><td className="py-2">{t.subject}</td><td className="py-2">{t.customerEmail}</td><td className="py-2">{t.priority}</td><td className="py-2 text-yellow-200/60">{new Date(t.createdAt).toLocaleString()}</td><td className="py-2 text-right"><div className="inline-flex gap-2"><button onClick={() => { void toggleTicket(t); }} className="px-2 py-1 rounded bg-white/10">{t.status === 'open' ? 'Close' : 'Reopen'}</button><button onClick={() => { void deleteTicketById(t.id); }} className="px-2 py-1 rounded bg-red-500/20">Delete</button></div></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'feedbacks' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input value={feedbackDraft.customerEmail} onChange={(e) => setFeedbackDraft({ ...feedbackDraft, customerEmail: e.target.value })} placeholder="Customer email" className={fieldClass} />
                <input type="number" min={1} max={5} value={feedbackDraft.rating} onChange={(e) => setFeedbackDraft({ ...feedbackDraft, rating: Number(e.target.value) })} placeholder="Rating" className={fieldClass} />
                <input value={feedbackDraft.message} onChange={(e) => setFeedbackDraft({ ...feedbackDraft, message: e.target.value })} placeholder="Message" className={fieldClass} />
                <button onClick={addFeedback} className={primaryButtonClass}>Add Feedback</button>
              </div>
            </div>
            <div className={cardClass}><div className="space-y-2">{feedbacks.map((f) => <div key={f.id} className="bg-white/5 rounded-lg p-3 flex items-start justify-between"><div><div className="font-semibold">{f.customerEmail} | {f.rating}/5</div><div className="text-sm text-yellow-100/80">{f.message}</div><div className="text-xs text-yellow-200/60">{new Date(f.createdAt).toLocaleString()}</div></div><button onClick={() => { void deleteFeedbackById(f.id); }} className="px-2 py-1 rounded bg-red-500/20">Delete</button></div>)}{feedbacks.length === 0 && <div className="text-yellow-200/60">No feedbacks yet.</div>}</div></div>
          </div>
        )}

        {tab === 'domains' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={domainDraft.domain} onChange={(e) => setDomainDraft({ domain: e.target.value })} placeholder="example.com" className={fieldClass} />
                <button onClick={addDomain} className={primaryButtonClass}>Add Domain</button>
              </div>
            </div>
            <div className={cardClass}><div className="space-y-2">{domains.map((d) => <div key={d.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between"><div><div className="font-semibold">{d.domain}</div><div className="text-xs text-yellow-200/60">{d.verified ? 'verified' : 'unverified'} | {new Date(d.createdAt).toLocaleDateString()}</div></div><div className="inline-flex gap-2"><button onClick={() => { void toggleDomain(d); }} className="px-2 py-1 rounded bg-white/10">{d.verified ? 'Unverify' : 'Verify'}</button><button onClick={() => { void deleteDomainById(d.id); }} className="px-2 py-1 rounded bg-red-500/20">Delete</button></div></div>)}{domains.length === 0 && <div className="text-yellow-200/60">No domains yet.</div>}</div></div>
          </div>
        )}

        {tab === 'payment_methods' && (
          <div className={cardClass + ' space-y-3'}>
            <div className="rounded-lg border border-[#facc15]/20 bg-[#0a0a0a] p-3 text-xs text-yellow-200/70">
              Real checkout status is loaded from API environment variables. Set `STRIPE_SECRET_KEY` for card and `OXAPAY_MERCHANT_API_KEY` for automated crypto.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg bg-white/5 p-3"><div className="text-xs uppercase text-yellow-200/60">Card (Stripe)</div><div className="font-bold">{gatewayMethods.card.enabled ? 'Configured' : 'Not configured'}</div></div>
              <div className="rounded-lg bg-white/5 p-3"><div className="text-xs uppercase text-yellow-200/60">PayPal</div><div className="font-bold">{gatewayMethods.paypal.enabled ? 'Configured (manual)' : 'Not configured'}</div></div>
              <div className="rounded-lg bg-white/5 p-3"><div className="text-xs uppercase text-yellow-200/60">Crypto</div><div className="font-bold">{gatewayMethods.crypto.enabled ? (gatewayMethods.crypto.automated ? 'Configured (OxaPay auto)' : 'Configured (manual)') : 'Not configured'}</div></div>
            </div>
            {paymentMethods.map((method) => (
              <div key={method.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-semibold">{method.name}</div>
                  <input
                    value={method.instructions}
                    onChange={(e) => setPaymentMethods((prev) => prev.map((item) => item.id === method.id ? { ...item, instructions: e.target.value } : item))}
                    onBlur={() => {
                      const latest = paymentMethods.find((item) => item.id === method.id) || method;
                      void updatePaymentMethod(latest);
                    }}
                    className={`${fieldCompactClass} mt-1 w-full`}
                  />
                </div>
                <button onClick={() => { void updatePaymentMethod({ ...method, enabled: !method.enabled }); }} className="px-2 py-1 rounded bg-white/10">{method.enabled ? 'Enabled' : 'Disabled'}</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'team' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input value={teamDraft.email} onChange={(e) => setTeamDraft({ ...teamDraft, email: e.target.value })} placeholder="staff@email.com" className={fieldClass} />
                <input value={teamDraft.role} onChange={(e) => setTeamDraft({ ...teamDraft, role: e.target.value })} placeholder="Role" className={fieldClass} />
                <button onClick={addTeamMember} className={primaryButtonClass}>Add Team Member</button>
              </div>
            </div>
            <div className={cardClass}><div className="space-y-2">{team.map((m) => <div key={m.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between"><div><div className="font-semibold">{m.email}</div><div className="text-xs text-yellow-200/60">{m.role} | {new Date(m.createdAt).toLocaleDateString()}</div></div><button onClick={() => { void deleteTeamMemberById(m.id); }} className="px-2 py-1 rounded bg-red-500/20">Delete</button></div>)}{team.length === 0 && <div className="text-yellow-200/60">No team members yet.</div>}</div></div>
          </div>
        )}

        {tab === 'blacklist' && (
          <div className="space-y-4">
            <div className={cardClass}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select value={blacklistDraft.type} onChange={(e) => setBlacklistDraft({ ...blacklistDraft, type: e.target.value as BlacklistEntry['type'] })} className={fieldClass}><option value="email">email</option><option value="ip">ip</option><option value="user">user</option></select>
                <input value={blacklistDraft.value} onChange={(e) => setBlacklistDraft({ ...blacklistDraft, value: e.target.value })} placeholder="Value" className={fieldClass} />
                <input value={blacklistDraft.reason} onChange={(e) => setBlacklistDraft({ ...blacklistDraft, reason: e.target.value })} placeholder="Reason" className={fieldClass} />
                <button onClick={addBlacklistEntry} className={primaryButtonClass}>Add Entry</button>
              </div>
            </div>
            <div className={cardClass}><div className="space-y-2">{blacklist.map((b) => <div key={b.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between"><div><div className="font-semibold">{b.value}</div><div className="text-xs text-yellow-200/60">{b.type} | {b.reason}</div></div><button onClick={() => { void deleteBlacklistEntryById(b.id); }} className="px-2 py-1 rounded bg-red-500/20">Delete</button></div>)}{blacklist.length === 0 && <div className="text-yellow-200/60">No blacklist entries yet.</div>}</div></div>
          </div>
        )}

        {tab === 'settings' && (
          <div className={cardClass + ' max-w-4xl space-y-3'}>
            <input value={settings.storeName} onChange={(e) => setSettings({ ...settings, storeName: e.target.value })} className={fieldClass} placeholder="Store name" />
            <input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} className={fieldClass} placeholder="Currency" />
            <input value={settings.paypalEmail} onChange={(e) => setSettings({ ...settings, paypalEmail: e.target.value })} className={fieldClass} placeholder="PayPal email" />
            <input value={settings.stripeKey} onChange={(e) => setSettings({ ...settings, stripeKey: e.target.value })} className={fieldClass} placeholder="Stripe key" />
            <input value={settings.cryptoAddress} onChange={(e) => setSettings({ ...settings, cryptoAddress: e.target.value })} className={fieldClass} placeholder="Crypto address" />
            <button onClick={saveSettings} className={`${primaryButtonClass} flex items-center gap-2`}><Save className="w-4 h-4" /> Save Settings</button>
          </div>
        )}

        {tab === 'security' && (
          <div className={cardClass + ' space-y-2 max-h-[70vh] overflow-y-auto'}>
            {logs.map((log) => <div key={log.id} className="bg-white/5 rounded-lg p-3 flex items-center justify-between"><div><div className="font-semibold">{log.event}</div><div className="text-xs text-yellow-200/60">{new Date(log.timestamp).toLocaleString()} | {log.ip}</div></div><span className={`px-2 py-1 rounded text-xs uppercase ${log.status === 'SUCCESS' ? 'bg-green-500/20 text-green-300' : log.status === 'WARNING' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-red-500/20 text-red-300'}`}>{log.status}</span></div>)}
          </div>
        )}
        </div>
      </main>

      {openInventoryModal && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-[#facc15]/20 bg-[#0b0b0b] shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
            <div className="flex items-center justify-between border-b border-[#facc15]/20 p-4">
              <div>
                <h3 className="text-xl font-black">Add Stock Keys</h3>
                <p className="mt-1 text-xs text-yellow-200/70">
                  Product: <span className="font-semibold text-white">{inventoryProduct?.name || 'Unknown product'}</span>
                </p>
              </div>
              <button
                onClick={closeInventoryModal}
                className="rounded-lg p-2 hover:bg-white/10"
                disabled={inventoryBusy}
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              {inventoryProduct && hasTiers(inventoryProduct) && (
                <div className="rounded-xl border border-[#facc15]/20 bg-[#090909] p-3">
                  <div className="mb-2 text-sm font-bold">Choose Tier</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {(inventoryProduct.tiers || []).map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setInventoryTierId(tier.id)}
                        className={`rounded-xl border px-3 py-2 text-left transition-all ${
                          inventoryTierId === tier.id
                            ? 'border-[#facc15]/50 bg-[#facc15]/12'
                            : 'border-white/15 bg-white/5 hover:border-[#facc15]/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{tier.name}</span>
                          <span className="text-xs text-yellow-200/75">${Number(tier.price || 0).toFixed(2)}</span>
                        </div>
                        <div className="mt-1 text-xs text-yellow-200/65">
                          Stock: {Number(tier.stock || 0)} | ID: {tier.id}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-[#facc15]/20 bg-[#090909] p-3">
                <label className="mb-2 block text-sm font-bold">Keys / Accounts (one per line)</label>
                <textarea
                  rows={10}
                  value={inventoryKeysInput}
                  onChange={(e) => setInventoryKeysInput(e.target.value)}
                  className={fieldClass}
                  placeholder={'email:pass\nemail2:pass2\nkey-12345'}
                  disabled={inventoryBusy}
                />
                <div className="mt-2 text-xs text-yellow-200/70">
                  Ready to add: <span className="font-semibold text-white">{inventoryItemsCount}</span> line(s)
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#facc15]/20 p-4">
              <button
                type="button"
                onClick={closeInventoryModal}
                className={subtleButtonClass}
                disabled={inventoryBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitInventoryKeys}
                className={primaryButtonClass}
                disabled={inventoryBusy}
              >
                {inventoryBusy ? 'Adding...' : inventoryItemsCount > 0 ? `Add ${inventoryItemsCount} Key${inventoryItemsCount === 1 ? '' : 's'}` : 'Add Keys'}
              </button>
            </div>
          </div>
        </div>
      )}

      {openEditor && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/82 p-2 backdrop-blur-xl sm:p-4">
          <div className="relative w-full max-w-[1320px] overflow-hidden rounded-3xl border border-white/15 bg-[#090909] shadow-[0_30px_100px_rgba(0,0,0,0.72)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(250,204,21,0.13),transparent_34%),radial-gradient(circle_at_90%_12%,rgba(59,130,246,0.08),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(250,204,21,0.06),transparent_38%)]" />
            <div className="relative border-b border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
              <div>
                  <h3 className="text-3xl font-black tracking-tight text-white">{draft.name ? 'Edit Product' : 'Create Product'}</h3>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-yellow-200/65">Catalog Configuration</div>
              </div>
              <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setOpenEditor(false)} className={subtleButtonClass}>Cancel</button>
                  <button type="submit" form="admin-product-editor-form" className={`${primaryButtonClass} inline-flex items-center gap-2`}><Save className="h-4 w-4" /> Save</button>
                  <button onClick={() => setOpenEditor(false)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/65">
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Basics</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Pricing</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Media</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Tiers</span>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">Display</span>
              </div>
            </div>
            <form id="admin-product-editor-form" onSubmit={saveProduct} className="relative grid max-h-[82vh] grid-cols-1 gap-4 overflow-y-auto p-4 sm:p-6 xl:grid-cols-12">
              <div className="xl:col-span-12 rounded-2xl border border-[#facc15]/25 bg-[#facc15]/10 px-4 py-2.5 text-xs text-yellow-100/85">
                Fill sections top to bottom: basics, pricing, media, then tiers. If a product has tiers, add stock per tier with <span className="font-semibold text-[#facc15]">Add Keys</span> in the Products table.
              </div>
              <div className="xl:col-span-8 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="mb-1 text-sm font-black tracking-wide text-white">1. Basics</div>
                <div className="mb-3 text-xs text-yellow-200/70">Core product identity and storefront labels.</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Product Name</label>
                    <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={fieldClass} placeholder="Example: Enzo Weekly" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">URL Path (optional)</label>
                    <input value={draft.urlPath || ''} onChange={(e) => setDraft({ ...draft, urlPath: e.target.value })} className={fieldClass} placeholder="example-product-slug" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Short Description</label>
                    <textarea required rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={fieldClass} placeholder="What buyer gets in one short paragraph." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Product Type</label>
                    <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ServiceType })} className={fieldClass}>{Object.values(ServiceType).map((t) => <option key={t} value={t}>{t}</option>)}</select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Duration Label</label>
                    <input value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} className={fieldClass} placeholder="Example: 1 month / lifetime / weekly" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Card Badge Label</label>
                    <input
                      value={draft.cardBadgeLabel || ''}
                      onChange={(e) => setDraft({ ...draft, cardBadgeLabel: e.target.value })}
                      className={fieldClass}
                      placeholder="ACCOUNT / KEY / CUSTOM"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Card Badge Icon</label>
                    <select
                      value={draft.cardBadgeIcon || 'grid'}
                      onChange={(e) => setDraft({ ...draft, cardBadgeIcon: e.target.value as Product['cardBadgeIcon'] })}
                      className={fieldClass}
                    >
                      <option value="grid">grid</option>
                      <option value="key">key</option>
                      <option value="shield">shield</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="mb-1 text-sm font-black tracking-wide text-white">2. Pricing & Visibility</div>
                <div className="mb-3 text-xs text-yellow-200/70">Set pricing, stock mode, and who can see this product.</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Price</label>
                    <input type="number" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className={fieldClass} placeholder="22.99" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Original Price (optional)</label>
                    <input type="number" step="0.01" value={draft.originalPrice} onChange={(e) => setDraft({ ...draft, originalPrice: Number(e.target.value) })} className={fieldClass} placeholder="29.99" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Stock (single product only)</label>
                    <input
                      type="number"
                      value={tierDrafts.length > 0 ? tierDrafts.reduce((total, tier) => total + Number(tier.stock || 0), 0) : draft.stock}
                      onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })}
                      disabled={tierDrafts.length > 0}
                      className={`${fieldClass} disabled:opacity-50`}
                      placeholder="0"
                    />
                    {tierDrafts.length > 0 && <p className="mt-1 text-[11px] text-yellow-200/60">Tiered product: stock is managed by tier and Add Keys.</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Visibility</label>
                    <select value={draft.visibility || 'public'} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as Product['visibility'] })} className={fieldClass}><option value="public">public</option><option value="private">private</option><option value="hidden">hidden</option></select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Category</label>
                    <select value={draft.category || ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={fieldClass}><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Group</label>
                    <select value={draft.group || ''} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className={fieldClass}><option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}</select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Live Sales Counter Timespan</label>
                    <select value={draft.liveSalesTimespan || 'all_time'} onChange={(e) => setDraft({ ...draft, liveSalesTimespan: e.target.value as Product['liveSalesTimespan'] })} className={fieldClass}><option value="all_time">all_time</option><option value="30_days">30_days</option><option value="7_days">7_days</option><option value="24_hours">24_hours</option></select>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="mb-1 text-sm font-black tracking-wide text-white">3. Media & Content</div>
                <div className="mb-3 text-xs text-yellow-200/70">Card/banner images plus product highlights and long description.</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Card Image URL</label>
                    <input value={draft.image} onChange={(e) => setDraft({ ...draft, image: e.target.value })} className={fieldClass} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Banner URL (optional)</label>
                    <input value={draft.bannerImage || ''} onChange={(e) => setDraft({ ...draft, bannerImage: e.target.value })} className={fieldClass} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Feature Bullets</label>
                    <textarea rows={4} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} className={fieldClass} placeholder={"One feature per line\nFast delivery\nLifetime access"} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-yellow-200/70">Detailed Description</label>
                    <textarea rows={4} value={detailsText} onChange={(e) => setDetailsText(e.target.value)} className={fieldClass} placeholder={"One point per line\nGood for new users\nIncludes support"} />
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-black tracking-wide text-white">4. Product Tiers</div>
                    <div className="text-xs text-yellow-200/70">Create variants like Basic, Country, 4K Plan. Stock is managed per tier with Add Keys.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTierDrafts((prev) => [
                        ...prev,
                        {
                          id: `tier-${Date.now()}-${prev.length + 1}`,
                          name: `Tier ${prev.length + 1}`,
                          price: Number(draft.price || 0),
                          originalPrice: Number(draft.originalPrice || 0),
                          stock: 0,
                          description: '',
                          image: '',
                          duration: draft.duration || '',
                        },
                      ])
                    }
                    className="rounded bg-[#facc15]/20 px-2 py-1 text-xs font-semibold text-[#facc15] hover:bg-[#eab308]/30"
                  >
                    Add Tier
                  </button>
                </div>
                <div className="space-y-2">
                  {tierDrafts.length > 0 && (
                    <div className="hidden rounded border border-[#facc15]/10 bg-[#0d0d0d] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-yellow-200/55 md:grid md:grid-cols-12">
                      <span className="md:col-span-3">Tier Name</span>
                      <span className="md:col-span-2">Tier ID</span>
                      <span className="md:col-span-2">Price</span>
                      <span className="md:col-span-2">Original</span>
                      <span className="md:col-span-2">Duration</span>
                      <span className="md:col-span-1 text-right">Action</span>
                    </div>
                  )}
                  {tierDrafts.map((tier, idx) => (
                    <div key={tier.id || idx} className="grid grid-cols-1 gap-2 rounded border border-[#facc15]/20 bg-[#101010] p-2 md:grid-cols-12">
                      <input
                        value={tier.name}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item)))}
                        className={`${fieldCompactClass} md:col-span-3`}
                        placeholder="Tier name"
                      />
                      <input
                        value={tier.id}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, id: slug(e.target.value) } : item)))}
                        className={`${fieldCompactClass} md:col-span-2`}
                        placeholder="tier-id"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={tier.price}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, price: Number(e.target.value) } : item)))}
                        className={`${fieldCompactClass} md:col-span-2`}
                        placeholder="Price"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={tier.originalPrice || 0}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, originalPrice: Number(e.target.value) } : item)))}
                        className={`${fieldCompactClass} md:col-span-2`}
                        placeholder="Original"
                      />
                      <input
                        value={tier.duration || ''}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, duration: e.target.value } : item)))}
                        className={`${fieldCompactClass} md:col-span-2`}
                        placeholder="Duration"
                      />
                      <button
                        type="button"
                        onClick={() => setTierDrafts((prev) => prev.filter((_, i) => i !== idx))}
                        className="rounded bg-red-500/20 px-2 py-1 text-xs font-semibold hover:bg-red-500/30 md:col-span-1"
                      >
                        Remove
                      </button>
                      <input
                        value={tier.image || ''}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, image: e.target.value } : item)))}
                        className={`${fieldCompactClass} md:col-span-6`}
                        placeholder="Tier image URL (optional)"
                      />
                      <input
                        value={tier.description || ''}
                        onChange={(e) => setTierDrafts((prev) => prev.map((item, i) => (i === idx ? { ...item, description: e.target.value } : item)))}
                        className={`${fieldCompactClass} md:col-span-4`}
                        placeholder="Tier description (optional)"
                      />
                      <div className="rounded border border-[#facc15]/20 bg-[#090909] px-2 py-1 text-xs md:col-span-2">
                        Stock: {Number(tier.stock || 0)}
                      </div>
                    </div>
                  ))}
                  {tierDrafts.length === 0 && (
                    <div className="text-xs text-yellow-200/70">No tiers yet. Leave empty for a single product listing.</div>
                  )}
                </div>
              </div>

              <div className="xl:col-span-4 xl:self-start xl:sticky xl:top-3 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="mb-1 text-sm font-black tracking-wide text-white">5. Display & Delivery Options</div>
                <div className="mb-2 text-xs text-yellow-200/70">Control badges, counters, and delivery behavior.</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.hideStockCount)} onChange={(e) => setDraft({ ...draft, hideStockCount: e.target.checked })} /> Hide stock count</label>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.showViewsCount)} onChange={(e) => setDraft({ ...draft, showViewsCount: e.target.checked })} /> Show views count</label>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.showSalesCount)} onChange={(e) => setDraft({ ...draft, showSalesCount: e.target.checked })} /> Show sales count</label>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.popular)} onChange={(e) => setDraft({ ...draft, popular: e.target.checked })} /> Popular badge</label>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.featured)} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} /> Featured badge</label>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"><input type="checkbox" checked={Boolean(draft.verified)} onChange={(e) => setDraft({ ...draft, verified: e.target.checked })} /> Verified product</label>
                  <label className="flex items-center gap-2 rounded-lg border border-[#facc15]/25 bg-[#facc15]/10 px-3 py-2 text-sm sm:col-span-2"><input type="checkbox" checked={Boolean(draft.instantDelivery)} onChange={(e) => setDraft({ ...draft, instantDelivery: e.target.checked })} /> Instant delivery</label>
                </div>
              </div>

              <div className="xl:col-span-4 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                <div className="mb-1 text-sm font-black tracking-wide text-white">Live Summary</div>
                <div className="mb-3 text-xs text-yellow-200/70">This updates as you edit fields.</div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-white/70">Mode</span>
                    <span className="font-bold text-white">{tierDrafts.length > 0 ? 'Tiered product' : 'Single product'}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-white/70">Tier Count</span>
                    <span className="font-bold text-white">{tierDrafts.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-white/70">Effective Stock</span>
                    <span className="font-bold text-white">{tierDrafts.length > 0 ? tierDrafts.reduce((sum, tier) => sum + Number(tier.stock || 0), 0) : Number(draft.stock || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="text-white/70">Price Range</span>
                    <span className="font-bold text-white">
                      {tierDrafts.length > 0
                        ? `$${Math.min(...tierDrafts.map((tier) => Number(tier.price || 0))).toFixed(2)} - $${Math.max(...tierDrafts.map((tier) => Number(tier.price || 0))).toFixed(2)}`
                        : `$${Number(draft.price || 0).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="xl:col-span-12 sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#0d0d0d]/92 px-3 py-3 backdrop-blur-xl">
                <div className="text-xs text-yellow-200/70">
                  Mode: <span className="font-semibold text-white">{tierDrafts.length > 0 ? 'Tiered product' : 'Single product'}</span>
                </div>
                <button type="button" onClick={() => setOpenEditor(false)} className={subtleButtonClass}>Cancel</button>
                <button type="submit" className={`${primaryButtonClass} inline-flex items-center gap-2`}><Save className="w-4 h-4" /> Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};





