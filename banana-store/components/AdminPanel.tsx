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
  TrendingUp,
  ChevronRight,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { AdminSettings, Product, ProductTier, ServiceType } from '../types';
import type {
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
  buyPageDescription: '',
  urlPath: '',
  price: 0,
  originalPrice: 0,
  duration: '1 Month',
  type: ServiceType.OTHER,
  features: [],
  detailedDescription: [],
  image: '',
  bannerImage: '',
  cardBackdropImage: '',
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
  return `$${Math.min(...tierPrices).toFixed(2)} – $${Math.max(...tierPrices).toFixed(2)}`;
};

// ─── DESIGN SYSTEM ───────────────────────────────────────────────────────────
// Card / surface
const card = 'rounded-2xl bg-[#0C0C16] border border-white/[0.07]';
const cardP = `${card} p-6`;
// Inputs
const field = 'w-full rounded-xl border border-white/[0.08] bg-[#080810] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:ring-1 focus:ring-[#FACC15]/30 focus:border-[#FACC15]/20 hover:border-white/[0.14]';
const fieldSm = 'rounded-lg border border-white/[0.08] bg-[#080810] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:ring-1 focus:ring-[#FACC15]/30 focus:border-[#FACC15]/20';
// Buttons
const btnY = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#FACC15] px-5 py-2.5 text-sm font-bold text-black transition-all hover:bg-[#FDE047] active:scale-[0.97] whitespace-nowrap';
const btnG = 'inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/60 transition-all hover:bg-white/[0.07] hover:text-white active:scale-[0.97] whitespace-nowrap';
const btnR = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 py-2 text-sm font-medium text-red-400/80 transition-all hover:bg-red-500/[0.14] hover:text-red-300 whitespace-nowrap';
const btnE = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-sm font-medium text-emerald-400/80 transition-all hover:bg-emerald-500/[0.14] hover:text-emerald-300 whitespace-nowrap';
// Misc
const lbl = 'block mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30';
const sec = `${card} p-5`;
const uploadCls = 'flex h-10 w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/[0.1] px-4 text-xs font-medium text-white/35 transition-all hover:border-[#FACC15]/35 hover:text-[#FACC15]/70';
const removeCls = 'flex h-10 w-full items-center justify-center rounded-xl border border-red-500/[0.12] px-4 text-xs font-medium text-red-400/50 transition-all hover:border-red-500/25 hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed';
// ─────────────────────────────────────────────────────────────────────────────

const navItems: Array<{
  id: Tab; label: string; icon: React.ElementType;
  group: 'overview' | 'commerce' | 'operations' | 'system';
  desc: string;
}> = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, group: 'overview', desc: 'Revenue & performance' },
    { id: 'products', label: 'Products', icon: Package, group: 'commerce', desc: 'Products & stock' },
    { id: 'categories', label: 'Categories', icon: Layers, group: 'commerce', desc: 'Organize products' },
    { id: 'groups', label: 'Groups', icon: Layers, group: 'commerce', desc: 'Group visibility' },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, group: 'commerce', desc: 'Order status' },
    { id: 'invoices', label: 'Invoices', icon: FileText, group: 'commerce', desc: 'Billing records' },
    { id: 'customers', label: 'Customers', icon: Users, group: 'commerce', desc: 'Customer accounts' },
    { id: 'coupons', label: 'Coupons', icon: Tag, group: 'commerce', desc: 'Discount campaigns' },
    { id: 'tickets', label: 'Tickets', icon: Ticket, group: 'operations', desc: 'Support tickets' },
    { id: 'feedbacks', label: 'Feedbacks', icon: MessageSquare, group: 'operations', desc: 'Customer ratings' },
    { id: 'domains', label: 'Domains', icon: Globe, group: 'operations', desc: 'Storefront domains' },
    { id: 'payment_methods', label: 'Payment Methods', icon: CreditCard, group: 'operations', desc: 'Gateway setup' },
    { id: 'team', label: 'Team', icon: UserRound, group: 'system', desc: 'Staff & roles' },
    { id: 'blacklist', label: 'Blacklist', icon: Ban, group: 'system', desc: 'Block bad actors' },
    { id: 'settings', label: 'Settings', icon: Settings, group: 'system', desc: 'Store config' },
    { id: 'security', label: 'Security', icon: ShieldAlert, group: 'system', desc: 'Event logs' },
  ];

const NAV_GROUPS: Array<{ id: 'overview' | 'commerce' | 'operations' | 'system'; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'operations', label: 'Operations' },
  { id: 'system', label: 'System' },
];

// ─── METRIC CARD ─────────────────────────────────────────────────────────────
const MetricCard = ({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string; sub: string; icon: React.ElementType; accent: string }) => (
  <div className={`${card} p-6 flex flex-col gap-4 relative overflow-hidden`}>
    <div className={`absolute top-0 left-0 right-0 h-[2px]`} style={{ background: accent }} />
    <div className="flex items-start justify-between">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</p>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${accent}18` }}>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
    </div>
    <div>
      <p className="text-3xl font-extrabold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-white/35">{sub}</p>
    </div>
  </div>
);

// ─── SECTION HEADER ──────────────────────────────────────────────────────────
const SectionHeader = ({ num, title, sub }: { num: string; title: string; sub: string }) => (
  <div className="mb-4 flex items-center gap-3">
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#FACC15]/15 text-[11px] font-black text-[#FACC15]">
      {num}
    </div>
    <div>
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="text-[11px] text-white/35">{sub}</p>
    </div>
  </div>
);

// ─── TABLE WRAPPERS ───────────────────────────────────────────────────────────
const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30 ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
);
const Td = ({ children, right, mono }: { children: React.ReactNode; right?: boolean; mono?: boolean }) => (
  <td className={`py-3 text-sm ${right ? 'text-right' : ''} ${mono ? 'font-mono text-xs' : ''}`}>{children}</td>
);

// ─── PILL / BADGE ─────────────────────────────────────────────────────────────
const Pill = ({ children, color = 'default' }: { children: React.ReactNode; color?: 'green' | 'red' | 'yellow' | 'blue' | 'default' }) => {
  const cls = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    yellow: 'bg-[#FACC15]/10 text-[#FACC15] border-[#FACC15]/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    default: 'bg-white/[0.06] text-white/50 border-white/[0.08]',
  }[color];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
};

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
    revenue: number; unitsSold: number; pendingOrders: number; totalOrders: number; customers: number;
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
  const [uploadingField, setUploadingField] = useState('');

  const [categoryDraft, setCategoryDraft] = useState({ name: '', slug: '', visibility: 'public' as Category['visibility'] });
  const [groupDraft, setGroupDraft] = useState({ name: '', visibility: 'public' as ProductGroup['visibility'] });
  const [couponDraft, setCouponDraft] = useState({ code: '', type: 'percent' as Coupon['type'], value: 10, maxUses: 100, expiresAt: '' });
  const [ticketDraft, setTicketDraft] = useState({ subject: '', customerEmail: '', priority: 'medium' as SupportTicket['priority'] });
  const [feedbackDraft, setFeedbackDraft] = useState({ customerEmail: '', rating: 5, message: '' });
  const [domainDraft, setDomainDraft] = useState({ domain: '' });
  const [teamDraft, setTeamDraft] = useState({ email: '', role: 'support' });
  const [blacklistDraft, setBlacklistDraft] = useState({ type: 'email' as BlacklistEntry['type'], value: '', reason: '' });

  // ── font injection ──────────────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const setRemoteState = async <K extends ShopStateKey>(key: K, value: ShopStateMap[K]) => {
    await ShopApiService.setState(key, value);
  };

  const handleAuthError = (error: unknown): boolean => {
    const msg = String(error instanceof Error ? error.message : error || '').toLowerCase();
    const unauth = msg.includes('401') || msg.includes('unauthorized') || msg.includes('forbidden');
    if (!unauth) return false;
    setMessage('Session expired. Please sign in again.');
    window.setTimeout(() => onLogout(), 500);
    return true;
  };

  const appendSecurityLog = async (event: string, status: SecurityLog['status']) => {
    const entry: SecurityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      event, timestamp: new Date().toISOString(), status, ip: 'api',
    };
    const nextLogs = [entry, ...logs].slice(0, 100);
    setLogs(nextLogs);
    try { await setRemoteState('logs', nextLogs); } catch { /* non-critical */ }
  };

  const refresh = async () => {
    try {
      const [
        summary, methods, usersState, logsState, categoriesState, groupsState,
        couponsState, invoicesState, ticketsState, feedbacksState, domainsState,
        paymentMethodsState, teamState, blacklistState, settingsState,
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
      setUsers(usersState); setLogs(logsState);
      setCategories(categoriesState); setGroups(groupsState);
      setCoupons(couponsState); setInvoices(invoicesState);
      setTickets(ticketsState); setFeedbacks(feedbacksState);
      setDomains(domainsState); setPaymentMethods(paymentMethodsState);
      setTeam(teamState); setBlacklist(blacklistState);
      setSettings(settingsState);

      if (Array.isArray(summary.orders)) setOrders(summary.orders);
      if (Array.isArray(summary.customers)) {
        const nextStats: Record<string, { orders: number; spent: number }> = {};
        summary.customers.forEach((c: any, idx: number) => {
          const id = String(c.id || c.email || `customer-${idx + 1}`);
          nextStats[id] = { orders: Number(c.orders || 0), spent: Number(c.totalSpent || 0) };
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
      setSummaryTopProducts((summary.topProducts || []).map((r: AdminSummaryTopProduct) => ({
        name: String(r.name || r.id || 'Unknown'),
        units: Number(r.units || 0),
        revenue: Number(r.revenue || 0),
      })));
    } catch (error) {
      if (handleAuthError(error)) return;
      setSummaryMetrics(null);
      setSummaryTopProducts([]);
      setSummaryCustomerStats({});
      setMessage('Failed to load admin data.');
    }
  };

  useEffect(() => { void refresh(); }, [tab, products]);
  useEffect(() => {
    if (!['dashboard', 'orders', 'customers'].includes(tab)) return;
    const t = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(t);
  }, [tab]);
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(t);
  }, [message]);

  const usersById = useMemo(() => {
    const m = new Map<string, User>();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const localRevenue = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total, 0);
  const localUnitsSold = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + o.items.reduce((x, i) => x + i.quantity, 0), 0);
  const customers = users.filter((u) => u.role === 'user');
  const localPending = orders.filter((o) => o.status === 'pending').length;
  const revenue = summaryMetrics?.revenue ?? localRevenue;
  const unitsSold = summaryMetrics?.unitsSold ?? localUnitsSold;
  const pendingOrders = summaryMetrics?.pendingOrders ?? localPending;
  const totalOrders = summaryMetrics?.totalOrders ?? orders.length;
  const customersCount = summaryMetrics?.customers ?? customers.length;
  const openTickets = tickets.filter((t) => t.status === 'open').length;
  const lowStockCount = products.filter((p) => { const s = totalStock(p); return s > 0 && s <= 5; }).length;
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  );
  const currentNav = navItems.find((i) => i.id === tab) || navItems[0];
  const inventoryProduct = products.find((p) => p.id === inventoryProductId) || null;
  const inventoryItemsCount = inventoryKeysInput.split('\n').map((x) => x.trim()).filter(Boolean).length;
  const navBadges: Partial<Record<Tab, number>> = {
    products: lowStockCount,
    orders: pendingOrders,
    tickets: openTickets,
  };

  const computedTopProducts = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number }>();
    orders.filter((o) => o.status === 'completed').forEach((o) =>
      o.items.forEach((i) => {
        const p = map.get(i.id) || { name: i.name, units: 0, revenue: 0 };
        p.units += i.quantity; p.revenue += i.quantity * i.price;
        map.set(i.id, p);
      })
    );
    return [...map.values()].sort((a, b) => b.units - a.units).slice(0, 5);
  }, [orders]);
  const topProducts = summaryTopProducts.length > 0 ? summaryTopProducts : computedTopProducts;

  // ── product editor helpers ──────────────────────────────────────────────────
  const openCreate = () => {
    setDraft(newProduct()); setFeaturesText(''); setDetailsText('');
    setTierDrafts([]); setOpenEditor(true);
  };
  const openEdit = (p: Product) => {
    setDraft({ ...newProduct(), ...p });
    setFeaturesText((p.features || []).join('\n'));
    setDetailsText((p.detailedDescription || []).join('\n'));
    setTierDrafts((p.tiers || []).map((t) => ({
      id: String(t.id || `tier-${Date.now()}`),
      name: String(t.name || ''), description: String(t.description || ''),
      price: Number(t.price || 0), originalPrice: Number(t.originalPrice || 0),
      stock: Number(t.stock || 0), image: String(t.image || ''),
      duration: String(t.duration || ''),
      durationSeconds: Math.max(0, Number(t.durationSeconds || 0)),
    })));
    setOpenEditor(true);
  };

  const uploadDraftImage = async (file: File, target: 'image' | 'bannerImage' | 'cardBackdropImage') => {
    if (!file || file.size <= 0) { setMessage('Selected image is empty.'); return; }
    setUploadingField(target);
    try {
      const up = await ShopApiService.uploadImage(file);
      setDraft((p) => ({ ...p, [target]: up.url }));
      setMessage(`Uploaded ${file.name}.`);
    } catch (e) { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setUploadingField(''); }
  };
  const uploadTierImage = async (file: File, idx: number) => {
    if (!file || file.size <= 0) { setMessage('Selected image is empty.'); return; }
    setUploadingField(`tier-${idx}`);
    try {
      const up = await ShopApiService.uploadImage(file);
      setTierDrafts((p) => p.map((t, i) => i === idx ? { ...t, image: up.url } : t));
      setMessage(`Uploaded ${file.name}.`);
    } catch (e) { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setUploadingField(''); }
  };
  const clearDraftImage = (target: 'image' | 'bannerImage' | 'cardBackdropImage') => {
    setDraft((p) => ({ ...p, [target]: '' }));
    setMessage(`${target === 'image' ? 'Card image' : target === 'bannerImage' ? 'Banner' : 'Backdrop'} removed.`);
  };
  const clearTierImage = (idx: number) => {
    setTierDrafts((p) => p.map((t, i) => i === idx ? { ...t, image: '' } : t));
    setMessage('Tier image removed.');
  };
  const uploadSettingsImage = async (file: File, target: 'logoUrl' | 'bannerUrl' | 'faviconUrl') => {
    if (!file || file.size <= 0) { setMessage('Selected image is empty.'); return; }
    setUploadingField(`settings-${target}`);
    try {
      const up = await ShopApiService.uploadImage(file);
      setSettings((p) => ({ ...p, [target]: up.url }));
      setMessage(`Uploaded ${file.name}.`);
    } catch (e) { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Upload failed.'); }
    finally { setUploadingField(''); }
  };
  const clearSettingsImage = (target: 'logoUrl' | 'bannerUrl' | 'faviconUrl') => {
    setSettings((p) => ({ ...p, [target]: '' }));
    const labels = { logoUrl: 'Logo', bannerUrl: 'Banner', faviconUrl: 'Favicon' };
    setMessage(`${labels[target]} removed.`);
  };

  const saveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedTiers = tierDrafts
      .map((t, idx) => {
        const id = slug(t.id || t.name || `tier-${idx + 1}`) || `tier-${Date.now()}-${idx + 1}`;
        return {
          id, name: (t.name || '').trim(), description: (t.description || '').trim(),
          price: Number(t.price || 0), originalPrice: Number(t.originalPrice || 0),
          stock: Math.max(0, Number(t.stock || 0)), image: (t.image || '').trim(),
          duration: (t.duration || '').trim(),
          durationSeconds: Math.max(0, Math.round(Number(t.durationSeconds || 0))),
        } satisfies ProductTier;
      })
      .filter((t) => t.name && t.id);

    const usesTiers = normalizedTiers.length > 0;
    const normalized: Product = {
      ...draft,
      name: draft.name.trim(), description: draft.description.trim(),
      urlPath: (draft.urlPath || '').trim(),
      stock: usesTiers ? normalizedTiers.reduce((s, t) => s + t.stock, 0) : Math.max(0, Number(draft.stock || 0)),
      price: usesTiers ? Math.min(...normalizedTiers.map((t) => t.price)) : Number(draft.price || 0),
      originalPrice: usesTiers ? Math.max(...normalizedTiers.map((t) => t.originalPrice || t.price)) : Number(draft.originalPrice || 0),
      features: lines(featuresText), detailedDescription: lines(detailsText),
      category: (draft.category || '').trim(), group: (draft.group || '').trim(),
      visibility: draft.visibility || 'public',
      liveSalesTimespan: draft.liveSalesTimespan || 'all_time',
      tiers: normalizedTiers,
    };
    if (!normalized.name || !normalized.description) { setMessage('Name and description are required.'); return; }
    if (usesTiers && normalizedTiers.some((t) => t.price <= 0)) { setMessage('Tier price must be greater than zero.'); return; }
    const exists = products.some((p) => p.id === normalized.id);
    ShopApiService.upsertProduct(normalized)
      .then(async (res) => {
        if (res.products) setProducts(res.products);
        else if (res.product) setProducts((prev) => exists ? prev.map((x) => x.id === res.product!.id ? res.product! : x) : [res.product!, ...prev]);
        else setProducts((prev) => exists ? prev.map((x) => x.id === normalized.id ? normalized : x) : [normalized, ...prev]);
        await appendSecurityLog(`${exists ? 'Updated' : 'Created'} product ${normalized.name}`, 'SUCCESS');
        setMessage(`Product ${exists ? 'updated' : 'created'}.`);
        setOpenEditor(false);
      })
      .catch((e) => { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Failed to save.'); });
  };

  const deleteProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p || !confirm(`Delete "${p.name}"?`)) return;
    ShopApiService.deleteProduct(id)
      .then(async (res) => {
        if (res.products) setProducts(res.products);
        else setProducts((prev) => prev.filter((x) => x.id !== id));
        await appendSecurityLog(`Deleted product ${p.name}`, 'WARNING');
        setMessage(`Deleted ${p.name}.`);
      })
      .catch((e) => { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Delete failed.'); });
  };
  const cloneProduct = (p: Product) => {
    const copy: Product = { ...p, id: `prod-${Date.now()}`, name: `${p.name} (Copy)` };
    ShopApiService.upsertProduct(copy)
      .then(async (res) => {
        if (res.products) setProducts(res.products); else setProducts((prev) => [copy, ...prev]);
        await appendSecurityLog(`Cloned product ${p.name}`, 'SUCCESS');
        setMessage(`Cloned ${p.name}.`);
      })
      .catch((e) => { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Clone failed.'); });
  };
  const adjustStock = (productId: string, delta: number, tierId?: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (hasTiers(p) && !tierId) { setMessage('Adjust stock on a specific tier.'); return; }
    ShopApiService.updateStock(productId, delta, 'admin_adjustment', tierId)
      .then((res) => {
        if (res.products) setProducts(res.products);
        else if (res.product) setProducts((prev) => prev.map((x) => x.id === productId ? res.product! : x));
        setMessage(`Stock updated (${delta > 0 ? '+' : ''}${delta}).`);
      })
      .catch((e) => { if (handleAuthError(e)) return; setMessage(e instanceof Error ? e.message : 'Stock update failed.'); });
  };
  const promptSetStock = (p: Product) => {
    if (hasTiers(p)) { setMessage('Use Add Keys for each tier.'); return; }
    const input = window.prompt(`Set stock for "${p.name}"`, String(p.stock));
    if (input === null) return;
    const target = Number.parseInt(input, 10);
    if (Number.isNaN(target) || target < 0) { setMessage('Stock must be ≥ 0.'); return; }
    if (target > p.stock) { setMessage('Use "Add Keys" to increase stock.'); return; }
    const delta = target - p.stock;
    if (delta === 0) return;
    adjustStock(p.id, delta);
  };
  const addStockKeys = (p: Product) => {
    const tiers = p.tiers || [];
    if (hasTiers(p) && tiers.length === 0) { setMessage('No tier rows found.'); return; }
    setInventoryProductId(p.id);
    setInventoryTierId(hasTiers(p) ? tiers[0].id : '');
    setInventoryKeysInput('');
    setOpenInventoryModal(true);
  };
  const closeInventoryModal = () => {
    setOpenInventoryModal(false); setInventoryBusy(false);
    setInventoryProductId(''); setInventoryTierId(''); setInventoryKeysInput('');
  };
  const submitInventoryKeys = () => {
    if (!inventoryProduct) { setMessage('Product no longer exists.'); closeInventoryModal(); return; }
    const tierId = hasTiers(inventoryProduct) ? inventoryTierId : '';
    if (hasTiers(inventoryProduct) && !(inventoryProduct.tiers || []).find((t) => t.id === tierId)) {
      setMessage('Choose a tier first.'); return;
    }
    const items = inventoryKeysInput.split('\n').map((x) => x.trim()).filter(Boolean);
    if (items.length === 0) { setMessage('Add at least one key line.'); return; }
    setInventoryBusy(true);
    ShopApiService.addInventory(inventoryProduct.id, items, tierId || undefined)
      .then((res) => {
        if (res.products) setProducts(res.products);
        setMessage(`Added ${items.length} keys for ${inventoryProduct.name}.`);
        closeInventoryModal();
      })
      .catch((e) => { setMessage(e instanceof Error ? e.message : 'Failed to add keys.'); setInventoryBusy(false); });
  };

  const saveSettings = async () => {
    try {
      await setRemoteState('settings', settings);
      await appendSecurityLog('Store settings updated', 'SUCCESS');
      setMessage('Settings saved.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Save failed.'); }
  };

  const addCategory = async () => {
    const name = categoryDraft.name.trim();
    if (!name) return;
    const s = (categoryDraft.slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const next = [{ id: `cat-${Date.now()}`, name, slug: s, visibility: categoryDraft.visibility } as Category, ...categories];
    try { await setRemoteState('categories', next); await appendSecurityLog(`Created category ${name}`, 'SUCCESS'); setCategoryDraft({ name: '', slug: '', visibility: 'public' }); await refresh(); setMessage('Category added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addGroup = async () => {
    const name = groupDraft.name.trim();
    if (!name) return;
    const next = [{ id: `grp-${Date.now()}`, name, visibility: groupDraft.visibility } as ProductGroup, ...groups];
    try { await setRemoteState('groups', next); await appendSecurityLog(`Created group ${name}`, 'SUCCESS'); setGroupDraft({ name: '', visibility: 'public' }); await refresh(); setMessage('Group added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addCoupon = async () => {
    const code = couponDraft.code.trim().toUpperCase();
    if (!code) return;
    const next = [{ id: `cp-${Date.now()}`, code, type: couponDraft.type, value: Number(couponDraft.value), uses: 0, maxUses: Number(couponDraft.maxUses), expiresAt: couponDraft.expiresAt || undefined, active: true } as Coupon, ...coupons];
    try { await setRemoteState('coupons', next); await appendSecurityLog(`Created coupon ${code}`, 'SUCCESS'); setCouponDraft({ code: '', type: 'percent', value: 10, maxUses: 100, expiresAt: '' }); await refresh(); setMessage('Coupon added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addTicket = async () => {
    if (!ticketDraft.subject.trim() || !ticketDraft.customerEmail.trim()) return;
    const next = [{ id: `tic-${Date.now()}`, subject: ticketDraft.subject.trim(), customerEmail: ticketDraft.customerEmail.trim(), status: 'open', priority: ticketDraft.priority, createdAt: new Date().toISOString() } as SupportTicket, ...tickets];
    try { await setRemoteState('tickets', next); setTicketDraft({ subject: '', customerEmail: '', priority: 'medium' }); await refresh(); setMessage('Ticket added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addFeedback = async () => {
    if (!feedbackDraft.customerEmail.trim() || !feedbackDraft.message.trim()) return;
    const next = [{ id: `fb-${Date.now()}`, customerEmail: feedbackDraft.customerEmail.trim(), rating: Math.max(1, Math.min(5, feedbackDraft.rating)), message: feedbackDraft.message.trim(), createdAt: new Date().toISOString() } as Feedback, ...feedbacks];
    try { await setRemoteState('feedbacks', next); setFeedbackDraft({ customerEmail: '', rating: 5, message: '' }); await refresh(); setMessage('Feedback added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addDomain = async () => {
    const domain = domainDraft.domain.trim().toLowerCase();
    if (!domain) return;
    const next = [{ id: `dom-${Date.now()}`, domain, verified: false, createdAt: new Date().toISOString() } as DomainRecord, ...domains];
    try { await setRemoteState('domains', next); setDomainDraft({ domain: '' }); await refresh(); setMessage('Domain added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addTeamMember = async () => {
    const email = teamDraft.email.trim().toLowerCase();
    if (!email) return;
    const next = [{ id: `team-${Date.now()}`, email, role: teamDraft.role || 'support', createdAt: new Date().toISOString() } as TeamMember, ...team];
    try { await setRemoteState('team', next); setTeamDraft({ email: '', role: 'support' }); await refresh(); setMessage('Team member added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const addBlacklistEntry = async () => {
    if (!blacklistDraft.value.trim()) return;
    const next = [{ id: `bl-${Date.now()}`, type: blacklistDraft.type, value: blacklistDraft.value.trim(), reason: blacklistDraft.reason.trim() || 'manual', createdAt: new Date().toISOString() } as BlacklistEntry, ...blacklist];
    try { await setRemoteState('blacklist', next); setBlacklistDraft({ type: 'email', value: '', reason: '' }); await refresh(); setMessage('Entry added.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };

  const deleteCategoryById = async (id: string) => { try { await setRemoteState('categories', categories.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteGroupById = async (id: string) => { try { await setRemoteState('groups', groups.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteCouponById = async (id: string) => { try { await setRemoteState('coupons', coupons.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteTicketById = async (id: string) => { try { await setRemoteState('tickets', tickets.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteFeedbackById = async (id: string) => { try { await setRemoteState('feedbacks', feedbacks.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteDomainById = async (id: string) => { try { await setRemoteState('domains', domains.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteTeamMemberById = async (id: string) => { try { await setRemoteState('team', team.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const deleteBlacklistById = async (id: string) => { try { await setRemoteState('blacklist', blacklist.filter((x) => x.id !== id)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };

  const updateOrderStatus = async (id: string, status: Order['status']) => {
    try { await ShopApiService.updateOrderStatus(id, status); await refresh(); setMessage(`Order updated to ${status}.`); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };
  const toggleCoupon = async (c: Coupon) => { try { await setRemoteState('coupons', coupons.map((x) => x.id === c.id ? { ...x, active: !x.active } : x)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const toggleTicket = async (t: SupportTicket) => { try { await setRemoteState('tickets', tickets.map((x) => x.id === t.id ? { ...x, status: x.status === 'open' ? 'closed' : 'open' } : x)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const toggleDomain = async (d: DomainRecord) => { try { await setRemoteState('domains', domains.map((x) => x.id === d.id ? { ...x, verified: !x.verified } : x)); await refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); } };
  const updatePaymentMethod = async (m: PaymentMethodConfig) => {
    try { await setRemoteState('payment_methods', paymentMethods.map((x) => x.id === m.id ? m : x)); await refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Failed.'); }
  };

  const resolveGatewayKey = (id: string): 'card' | 'paypal' | 'crypto' | null => {
    const n = id.trim().toLowerCase();
    if (n === 'pm-card' || n === 'card') return 'card';
    if (n === 'pm-paypal' || n === 'paypal') return 'paypal';
    if (n === 'pm-crypto' || n === 'crypto') return 'crypto';
    return null;
  };
  const isMethodEnabled = (key: 'card' | 'paypal' | 'crypto') => {
    const mid = key === 'card' ? 'pm-card' : key === 'paypal' ? 'pm-paypal' : 'pm-crypto';
    const row = paymentMethods.find((x) => resolveGatewayKey(x.id) === key || x.id === mid);
    return row ? Boolean(row.enabled) : true;
  };
  const getMethodStatus = (key: 'card' | 'paypal' | 'crypto') => {
    const gw = gatewayMethods[key];
    const adminOn = isMethodEnabled(key);
    const modeLabel = key === 'card' ? 'Stripe Auto' : gw.automated ? (key === 'paypal' ? 'PayPal API' : 'OxaPay') : 'Manual';
    if (!adminOn) return { label: 'Disabled', pill: 'red' as const, modeLabel };
    if (!gw.enabled) return { label: 'Not configured', pill: 'default' as const, modeLabel };
    return { label: 'Live', pill: 'green' as const, modeLabel };
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex min-h-screen bg-[#07070C] text-white"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Background subtle noise */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }}
      />

      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col h-screen w-[260px] shrink-0 sticky top-0 bg-[#090912] border-r border-white/[0.06] z-20">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.05]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FACC15] text-sm font-black text-black">
              {BRAND_INITIALS}
            </div>
            <div>
              <p className="text-[15px] font-bold leading-tight text-white">{BRAND_CONFIG.identity.shortName}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Admin Panel</p>
            </div>
          </div>
        </div>

        {/* Status chips */}
        <div className="px-5 py-3 border-b border-white/[0.05] flex items-center gap-2">
          {lowStockCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 text-[10px] font-bold text-orange-400">
              <AlertTriangle className="h-3 w-3" />{lowStockCount} low stock
            </span>
          )}
          {pendingOrders > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#FACC15]/10 border border-[#FACC15]/20 px-2.5 py-1 text-[10px] font-bold text-[#FACC15]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FACC15]" />{pendingOrders} pending
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6"
          style={{ scrollbarWidth: 'none' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/20">{group.label}</p>
              <div className="space-y-0.5">
                {navItems.filter((x) => x.group === group.id).map((item) => {
                  const active = tab === item.id;
                  const badge = navBadges[item.id] || 0;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setTab(item.id)}
                      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${active
                          ? 'bg-white/[0.05] text-white'
                          : 'text-white/40 hover:bg-white/[0.03] hover:text-white/70'
                        }`}
                    >
                      {active && (
                        <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#FACC15]" />
                      )}
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${active
                          ? 'bg-[#FACC15]/15 text-[#FACC15]'
                          : 'bg-white/[0.04] group-hover:bg-white/[0.07]'
                        }`}>
                        {React.createElement(item.icon, { className: 'w-3.5 h-3.5' })}
                      </div>
                      <span className={`flex-1 text-sm font-${active ? 'semibold' : 'medium'}`}>{item.label}</span>
                      {badge > 0 && (
                        <span className="rounded-full bg-[#FACC15]/15 border border-[#FACC15]/25 px-1.5 py-0.5 text-[9px] font-black text-[#FACC15]">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-white/[0.05]">
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-2.5 text-sm font-semibold text-red-400/70 transition-all hover:bg-red-500/[0.12] hover:text-red-300"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1300px] px-4 pb-12 sm:px-6 lg:px-8">

          {/* Page header */}
          <div className="flex items-center justify-between py-7 border-b border-white/[0.05] mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white/30 text-sm">{BRAND_CONFIG.identity.shortName}</span>
                <ChevronRight className="h-3 w-3 text-white/20" />
                <span className="text-sm text-white/60">{currentNav.label}</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white">{currentNav.label}</h1>
              <p className="mt-0.5 text-sm text-white/35">{currentNav.desc}</p>
            </div>
            {/* User pill */}
            <div className="hidden sm:flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FACC15] text-sm font-black text-black">
                {BRAND_INITIALS}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Administrator</p>
                <div className="flex items-center gap-1.5 text-[10px] text-[#FACC15] font-bold uppercase tracking-wide">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FACC15] opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FACC15]" />
                  </span>
                  Live
                </div>
              </div>
            </div>
          </div>

          {/* Mobile nav strip */}
          <div className="flex gap-1.5 overflow-x-auto pb-4 mb-5 lg:hidden" style={{ scrollbarWidth: 'none' }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${tab === item.id
                    ? 'border-[#FACC15]/30 bg-[#FACC15]/10 text-[#FACC15]'
                    : 'border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/70'
                  }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Toast */}
          {message && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-3 text-sm font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
              {message}
            </div>
          )}

          {/* ─── DASHBOARD ─────────────────────────────────────────────────── */}
          {tab === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <MetricCard label="Revenue" value={`$${revenue.toFixed(2)}`} sub="Completed orders" icon={TrendingUp} accent="#FACC15" />
                <MetricCard label="Orders" value={String(totalOrders)} sub={`${pendingOrders} pending`} icon={ShoppingBag} accent="#60A5FA" />
                <MetricCard label="Customers" value={String(customersCount)} sub="Registered accounts" icon={Users} accent="#A78BFA" />
                <MetricCard label="Units Sold" value={String(unitsSold)} sub="Delivered quantity" icon={Package} accent="#34D399" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className={`${card} p-5`}>
                  <p className={lbl}>Products</p>
                  <p className="text-2xl font-extrabold">{products.length}</p>
                  {lowStockCount > 0 && <p className="mt-1 text-xs text-orange-400">{lowStockCount} near depletion</p>}
                </div>
                <div className={`${card} p-5`}>
                  <p className={lbl}>Coupons</p>
                  <p className="text-2xl font-extrabold">{coupons.length}</p>
                  <p className="mt-1 text-xs text-white/30">{coupons.filter((c) => c.active).length} active</p>
                </div>
                <div className={`${card} p-5`}>
                  <p className={lbl}>Open Tickets</p>
                  <p className="text-2xl font-extrabold">{openTickets}</p>
                  <p className="mt-1 text-xs text-white/30">Awaiting response</p>
                </div>
              </div>

              <div className={cardP}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-bold">Top Products</h2>
                  <ArrowUpRight className="h-4 w-4 text-white/25" />
                </div>
                {topProducts.length === 0 ? (
                  <p className="text-sm text-white/25 py-6 text-center">No completed sales yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topProducts.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-4 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                        <span className="w-5 text-center text-xs font-black text-white/20">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          <p className="text-xs text-white/30">{p.units} units</p>
                        </div>
                        <p className="text-sm font-bold text-[#FACC15]">${p.revenue.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── PRODUCTS ──────────────────────────────────────────────────── */}
          {tab === 'products' && (
            <div className={cardP}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className={`${field} pl-9`} />
                </div>
                <button onClick={openCreate} className={btnY}><Plus className="h-4 w-4" /> New Product</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      <Th>ID</Th><Th>Name</Th><Th>Category</Th><Th>Group</Th><Th right>Price</Th><Th right>Stock</Th><Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="group hover:bg-white/[0.02] transition-colors">
                        <Td mono>
                          <span className="font-['JetBrains_Mono',monospace] text-white/40">{p.id}</span>
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold">{p.name}</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {hasTiers(p) && <Pill color="blue">{p.tiers?.length} tiers</Pill>}
                              {p.visibility !== 'public' && <Pill>{p.visibility}</Pill>}
                            </div>
                          </div>
                        </Td>
                        <Td><span className="text-white/50">{p.category || '—'}</span></Td>
                        <Td><span className="text-white/50">{p.group || '—'}</span></Td>
                        <Td right><span className="font-semibold">{priceLabel(p)}</span></Td>
                        <Td right>
                          <Pill color={totalStock(p) <= 5 ? 'red' : 'green'}>{totalStock(p)}</Pill>
                        </Td>
                        <Td right>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {!hasTiers(p) && <button onClick={() => adjustStock(p.id, -5)} className={btnG}>−5</button>}
                            {!hasTiers(p) && <button onClick={() => promptSetStock(p)} className={btnG}>Set</button>}
                            <button onClick={() => addStockKeys(p)} className={btnE}>+ Keys</button>
                            <button onClick={() => openEdit(p)} className={btnG}>Edit</button>
                            <button onClick={() => cloneProduct(p)} className={btnG}>Clone</button>
                            <button onClick={() => deleteProduct(p.id)} className={btnR}>Delete</button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredProducts.length === 0 && (
                <div className="py-16 text-center border border-dashed border-white/[0.08] rounded-xl mt-4">
                  <Package className="mx-auto h-8 w-8 text-white/15 mb-3" />
                  <p className="text-sm text-white/25">No products found. Create one to start selling.</p>
                </div>
              )}
            </div>
          )}

          {/* ─── CATEGORIES ────────────────────────────────────────────────── */}
          {tab === 'categories' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={categoryDraft.name} onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })} placeholder="Category name" className={field} />
                  <input value={categoryDraft.slug} onChange={(e) => setCategoryDraft({ ...categoryDraft, slug: e.target.value })} placeholder="Slug (optional)" className={field} />
                  <select value={categoryDraft.visibility} onChange={(e) => setCategoryDraft({ ...categoryDraft, visibility: e.target.value as Category['visibility'] })} className={field}>
                    <option value="public">public</option><option value="hidden">hidden</option>
                  </select>
                  <button onClick={addCategory} className={btnY}>Add Category</button>
                </div>
              </div>
              <div className={cardP}>
                <div className="space-y-2">
                  {categories.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-white/30 font-['JetBrains_Mono',monospace]">{c.slug} · {c.visibility}</p>
                      </div>
                      <button onClick={() => void deleteCategoryById(c.id)} className={btnR}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {categories.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No categories yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── GROUPS ────────────────────────────────────────────────────── */}
          {tab === 'groups' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={groupDraft.name} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} placeholder="Group name" className={field} />
                  <select value={groupDraft.visibility} onChange={(e) => setGroupDraft({ ...groupDraft, visibility: e.target.value as ProductGroup['visibility'] })} className={field}>
                    <option value="public">public</option><option value="hidden">hidden</option>
                  </select>
                  <button onClick={addGroup} className={btnY}>Add Group</button>
                </div>
              </div>
              <div className={cardP}>
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">{g.name}</p>
                        <p className="text-xs text-white/30">{g.visibility}</p>
                      </div>
                      <button onClick={() => void deleteGroupById(g.id)} className={btnR}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {groups.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No groups yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── ORDERS ────────────────────────────────────────────────────── */}
          {tab === 'orders' && (
            <div className={`${cardP} overflow-x-auto`}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    <Th>Order</Th><Th>Customer</Th><Th right>Total</Th><Th>Date</Th><Th right>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {orders.map((o) => {
                    const userPayload = (o as any).user;
                    const customerLabel = usersById.get(o.userId)?.email || userPayload?.email || o.userId;
                    return (
                      <tr key={o.id} className="hover:bg-white/[0.02]">
                        <Td mono>{o.id}</Td>
                        <Td><span className="text-sm">{customerLabel}</span></Td>
                        <Td right><span className="font-semibold">${o.total.toFixed(2)}</span></Td>
                        <Td><span className="text-xs text-white/35">{new Date(o.createdAt).toLocaleString()}</span></Td>
                        <Td right>
                          <select value={o.status} onChange={(e) => void updateOrderStatus(o.id, e.target.value as Order['status'])} className={fieldSm}>
                            <option value="pending">pending</option>
                            <option value="completed">completed</option>
                            <option value="refunded">refunded</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {orders.length === 0 && <p className="text-sm text-white/25 py-10 text-center">No orders yet.</p>}
            </div>
          )}

          {/* ─── INVOICES ──────────────────────────────────────────────────── */}
          {tab === 'invoices' && (
            <div className={`${cardP} overflow-x-auto`}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    <Th>Invoice</Th><Th>Order</Th><Th>Email</Th><Th right>Total</Th><Th>Date</Th><Th right>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {invoices.map((i) => (
                    <tr key={i.id} className="hover:bg-white/[0.02]">
                      <Td mono>{i.id}</Td>
                      <Td mono>{i.orderId}</Td>
                      <Td>{i.email}</Td>
                      <Td right><span className="font-semibold">${i.total.toFixed(2)}</span></Td>
                      <Td><span className="text-xs text-white/35">{new Date(i.createdAt).toLocaleString()}</span></Td>
                      <Td right><Pill>{i.status}</Pill></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length === 0 && <p className="text-sm text-white/25 py-10 text-center">No invoices yet.</p>}
            </div>
          )}

          {/* ─── CUSTOMERS ─────────────────────────────────────────────────── */}
          {tab === 'customers' && (
            <div className={`${cardP} overflow-x-auto`}>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.07]">
                    <Th>Email</Th><Th>Joined</Th><Th right>Orders</Th><Th right>Spent</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {customers.map((c) => {
                    const remote = summaryCustomerStats[c.id];
                    const lo = orders.filter((o) => o.userId === c.id);
                    const lc = lo.filter((o) => o.status === 'completed');
                    const cnt = remote?.orders ?? lo.length;
                    const spent = remote?.spent ?? lc.reduce((s, o) => s + o.total, 0);
                    return (
                      <tr key={c.id} className="hover:bg-white/[0.02]">
                        <Td><span className="font-medium">{c.email}</span></Td>
                        <Td><span className="text-xs text-white/35">{new Date(c.createdAt).toLocaleDateString()}</span></Td>
                        <Td right>{cnt}</Td>
                        <Td right><span className="font-semibold text-[#FACC15]">${spent.toFixed(2)}</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {customers.length === 0 && <p className="text-sm text-white/25 py-10 text-center">No customers yet.</p>}
            </div>
          )}

          {/* ─── COUPONS ───────────────────────────────────────────────────── */}
          {tab === 'coupons' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                  <input value={couponDraft.code} onChange={(e) => setCouponDraft({ ...couponDraft, code: e.target.value })} placeholder="CODE" className={field} />
                  <select value={couponDraft.type} onChange={(e) => setCouponDraft({ ...couponDraft, type: e.target.value as Coupon['type'] })} className={field}>
                    <option value="percent">percent</option><option value="fixed">fixed</option>
                  </select>
                  <input type="number" value={couponDraft.value} onChange={(e) => setCouponDraft({ ...couponDraft, value: Number(e.target.value) })} placeholder="Value" className={field} />
                  <input type="number" value={couponDraft.maxUses} onChange={(e) => setCouponDraft({ ...couponDraft, maxUses: Number(e.target.value) })} placeholder="Max uses" className={field} />
                  <input type="datetime-local" value={couponDraft.expiresAt} onChange={(e) => setCouponDraft({ ...couponDraft, expiresAt: e.target.value })} className={field} />
                  <button onClick={addCoupon} className={btnY}>Add Coupon</button>
                </div>
              </div>
              <div className={`${cardP} overflow-x-auto`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      <Th>Code</Th><Th>Type</Th><Th right>Value</Th><Th right>Uses</Th><Th>Expires</Th><Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {coupons.map((c) => (
                      <tr key={c.id} className="hover:bg-white/[0.02]">
                        <Td><span className="font-bold font-['JetBrains_Mono',monospace] text-[#FACC15]">{c.code}</span></Td>
                        <Td><Pill>{c.type}</Pill></Td>
                        <Td right>{c.value}</Td>
                        <Td right><span className="text-white/50">{c.uses}/{c.maxUses}</span></Td>
                        <Td><span className="text-xs text-white/35">{c.expiresAt ? new Date(c.expiresAt).toLocaleString() : '—'}</span></Td>
                        <Td right>
                          <div className="inline-flex gap-2">
                            <button onClick={() => void toggleCoupon(c)} className={btnG}>{c.active ? 'Disable' : 'Enable'}</button>
                            <button onClick={() => void deleteCouponById(c.id)} className={btnR}>Delete</button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {coupons.length === 0 && <p className="text-sm text-white/25 py-10 text-center">No coupons yet.</p>}
              </div>
            </div>
          )}

          {/* ─── TICKETS ───────────────────────────────────────────────────── */}
          {tab === 'tickets' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={ticketDraft.subject} onChange={(e) => setTicketDraft({ ...ticketDraft, subject: e.target.value })} placeholder="Subject" className={field} />
                  <input value={ticketDraft.customerEmail} onChange={(e) => setTicketDraft({ ...ticketDraft, customerEmail: e.target.value })} placeholder="Customer email" className={field} />
                  <select value={ticketDraft.priority} onChange={(e) => setTicketDraft({ ...ticketDraft, priority: e.target.value as SupportTicket['priority'] })} className={field}>
                    <option value="low">low</option><option value="medium">medium</option><option value="high">high</option>
                  </select>
                  <button onClick={addTicket} className={btnY}>Add Ticket</button>
                </div>
              </div>
              <div className={`${cardP} overflow-x-auto`}>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.07]">
                      <Th>Subject</Th><Th>Customer</Th><Th>Priority</Th><Th>Date</Th><Th right>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-white/[0.02]">
                        <Td><span className="font-medium">{t.subject}</span></Td>
                        <Td>{t.customerEmail}</Td>
                        <Td>
                          <Pill color={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'default'}>{t.priority}</Pill>
                        </Td>
                        <Td><span className="text-xs text-white/35">{new Date(t.createdAt).toLocaleString()}</span></Td>
                        <Td right>
                          <div className="inline-flex gap-2">
                            <button onClick={() => void toggleTicket(t)} className={btnG}>{t.status === 'open' ? 'Close' : 'Reopen'}</button>
                            <button onClick={() => void deleteTicketById(t.id)} className={btnR}>Delete</button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tickets.length === 0 && <p className="text-sm text-white/25 py-10 text-center">No tickets yet.</p>}
              </div>
            </div>
          )}

          {/* ─── FEEDBACKS ─────────────────────────────────────────────────── */}
          {tab === 'feedbacks' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={feedbackDraft.customerEmail} onChange={(e) => setFeedbackDraft({ ...feedbackDraft, customerEmail: e.target.value })} placeholder="Customer email" className={field} />
                  <input type="number" min={1} max={5} value={feedbackDraft.rating} onChange={(e) => setFeedbackDraft({ ...feedbackDraft, rating: Number(e.target.value) })} placeholder="Rating 1–5" className={field} />
                  <input value={feedbackDraft.message} onChange={(e) => setFeedbackDraft({ ...feedbackDraft, message: e.target.value })} placeholder="Message" className={field} />
                  <button onClick={addFeedback} className={btnY}>Add Feedback</button>
                </div>
              </div>
              <div className={cardP}>
                <div className="space-y-2">
                  {feedbacks.map((f) => (
                    <div key={f.id} className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold">{f.customerEmail}</p>
                          <Pill color={f.rating >= 4 ? 'green' : f.rating >= 3 ? 'yellow' : 'red'}>{f.rating}/5</Pill>
                        </div>
                        <p className="text-sm text-white/60">{f.message}</p>
                        <p className="mt-1 text-xs text-white/25">{new Date(f.createdAt).toLocaleString()}</p>
                      </div>
                      <button onClick={() => void deleteFeedbackById(f.id)} className={`${btnR} shrink-0`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {feedbacks.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No feedbacks yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── DOMAINS ───────────────────────────────────────────────────── */}
          {tab === 'domains' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={domainDraft.domain} onChange={(e) => setDomainDraft({ domain: e.target.value })} placeholder="example.com" className={field} />
                  <button onClick={addDomain} className={btnY}>Add Domain</button>
                </div>
              </div>
              <div className={cardP}>
                <div className="space-y-2">
                  {domains.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold font-['JetBrains_Mono',monospace]">{d.domain}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Pill color={d.verified ? 'green' : 'default'}>{d.verified ? 'Verified' : 'Unverified'}</Pill>
                          <span className="text-xs text-white/25">{new Date(d.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => void toggleDomain(d)} className={btnG}>{d.verified ? 'Unverify' : 'Verify'}</button>
                        <button onClick={() => void deleteDomainById(d.id)} className={btnR}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                  {domains.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No domains yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── PAYMENT METHODS ───────────────────────────────────────────── */}
          {tab === 'payment_methods' && (
            <div className="space-y-4">
              <div className={`${card} p-4 flex items-start gap-3`}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <p className="text-xs text-white/40 leading-relaxed">
                  Card: <code className="text-white/60">STRIPE_SECRET_KEY</code> · PayPal auto: <code className="text-white/60">PAYPAL_CLIENT_ID + SECRET</code> · Crypto: <code className="text-white/60">OXAPAY_MERCHANT_API_KEY</code>
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(['card', 'paypal', 'crypto'] as const).map((key) => {
                  const s = getMethodStatus(key);
                  const label = key === 'card' ? 'Card (Stripe)' : key === 'paypal' ? 'PayPal' : 'Crypto';
                  return (
                    <div key={key} className={`${card} p-4`}>
                      <p className={lbl}>{label}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Pill color={s.pill}>{s.label}</Pill>
                        <span className="text-xs text-white/30">{s.modeLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                {paymentMethods.map((m) => (
                  <div key={m.id} className={`${card} p-4 flex items-center gap-4`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm font-semibold">{m.name}</p>
                        {(() => {
                          const key = resolveGatewayKey(m.id);
                          if (!key) return null;
                          const s = getMethodStatus(key);
                          return <Pill color={s.pill}>{s.label}</Pill>;
                        })()}
                      </div>
                      <input
                        value={m.instructions}
                        onChange={(e) => setPaymentMethods((prev) => prev.map((x) => x.id === m.id ? { ...x, instructions: e.target.value } : x))}
                        onBlur={() => { const latest = paymentMethods.find((x) => x.id === m.id) || m; void updatePaymentMethod(latest); }}
                        className={`${field} text-xs`}
                        placeholder="Instructions / payment details"
                      />
                    </div>
                    <button onClick={() => void updatePaymentMethod({ ...m, enabled: !m.enabled })} className={m.enabled ? btnE : btnG}>
                      {m.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── TEAM ──────────────────────────────────────────────────────── */}
          {tab === 'team' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input value={teamDraft.email} onChange={(e) => setTeamDraft({ ...teamDraft, email: e.target.value })} placeholder="staff@example.com" className={field} />
                  <input value={teamDraft.role} onChange={(e) => setTeamDraft({ ...teamDraft, role: e.target.value })} placeholder="Role (e.g. support)" className={field} />
                  <button onClick={addTeamMember} className={btnY}>Add Member</button>
                </div>
              </div>
              <div className={cardP}>
                <div className="space-y-2">
                  {team.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">{m.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Pill>{m.role}</Pill>
                          <span className="text-xs text-white/25">{new Date(m.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button onClick={() => void deleteTeamMemberById(m.id)} className={btnR}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {team.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No team members yet.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── BLACKLIST ─────────────────────────────────────────────────── */}
          {tab === 'blacklist' && (
            <div className="space-y-4">
              <div className={cardP}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <select value={blacklistDraft.type} onChange={(e) => setBlacklistDraft({ ...blacklistDraft, type: e.target.value as BlacklistEntry['type'] })} className={field}>
                    <option value="email">email</option><option value="ip">ip</option><option value="user">user</option>
                  </select>
                  <input value={blacklistDraft.value} onChange={(e) => setBlacklistDraft({ ...blacklistDraft, value: e.target.value })} placeholder="Value" className={field} />
                  <input value={blacklistDraft.reason} onChange={(e) => setBlacklistDraft({ ...blacklistDraft, reason: e.target.value })} placeholder="Reason (optional)" className={field} />
                  <button onClick={addBlacklistEntry} className={btnY}>Block Entry</button>
                </div>
              </div>
              <div className={cardP}>
                <div className="space-y-2">
                  {blacklist.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-xl border border-red-500/[0.1] bg-red-500/[0.03] px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold font-['JetBrains_Mono',monospace]">{b.value}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Pill color="red">{b.type}</Pill>
                          <span className="text-xs text-white/30">{b.reason}</span>
                        </div>
                      </div>
                      <button onClick={() => void deleteBlacklistById(b.id)} className={btnR}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {blacklist.length === 0 && <p className="text-sm text-white/25 py-6 text-center">No blacklist entries.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ─── SETTINGS ──────────────────────────────────────────────────── */}
          {tab === 'settings' && (
            <div className="max-w-2xl space-y-4">
              <div className={cardP + ' space-y-3'}>
                <div>
                  <label className={lbl}>Store Name</label>
                  <input value={settings.storeName} onChange={(e) => setSettings({ ...settings, storeName: e.target.value })} className={field} placeholder="Store name" />
                </div>
                <div>
                  <label className={lbl}>Currency</label>
                  <input value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} className={field} placeholder="USD" />
                </div>
              </div>

              {/* Images */}
              {(['logoUrl', 'bannerUrl', 'faviconUrl'] as const).map((key) => {
                const labels = { logoUrl: 'Logo URL', bannerUrl: 'Banner URL', faviconUrl: 'Favicon URL' };
                const btnLabels = { logoUrl: 'Upload Logo', bannerUrl: 'Upload Banner', faviconUrl: 'Upload Favicon' };
                const rmLabels = { logoUrl: 'Remove Logo', bannerUrl: 'Remove Banner', faviconUrl: 'Remove Favicon' };
                return (
                  <div key={key} className={cardP + ' space-y-2'}>
                    <label className={lbl}>{labels[key]}</label>
                    <input value={(settings as any)[key] || ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className={field} placeholder="https://…" />
                    <div className="grid grid-cols-2 gap-2">
                      <label className={uploadCls}>
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSettingsImage(f, key); e.currentTarget.value = ''; }} />
                        {uploadingField === `settings-${key}` ? 'Uploading…' : btnLabels[key]}
                      </label>
                      <button type="button" onClick={() => clearSettingsImage(key)} disabled={!String((settings as any)[key] || '').trim()} className={removeCls}>{rmLabels[key]}</button>
                    </div>
                  </div>
                );
              })}

              <div className={cardP + ' space-y-3'}>
                <div>
                  <label className={lbl}>Product Usage Notice</label>
                  <textarea rows={4} value={settings.productUsageNotice ?? ''} onChange={(e) => setSettings({ ...settings, productUsageNotice: e.target.value })} className={field} placeholder="Shown on product pages. Use {service} for product type." />
                </div>
                <div>
                  <label className={lbl}>PayPal Email / Link</label>
                  <input value={settings.paypalEmail} onChange={(e) => setSettings({ ...settings, paypalEmail: e.target.value })} className={field} placeholder="paypal@example.com" />
                </div>
                <div>
                  <label className={lbl}>Stripe Key</label>
                  <input value={settings.stripeKey} onChange={(e) => setSettings({ ...settings, stripeKey: e.target.value })} className={field} placeholder="sk_live_…" />
                </div>
                <div>
                  <label className={lbl}>Crypto Address</label>
                  <input value={settings.cryptoAddress} onChange={(e) => setSettings({ ...settings, cryptoAddress: e.target.value })} className={field} placeholder="0x…" />
                </div>
              </div>

              <button onClick={saveSettings} className={`${btnY} w-full justify-center`}><Save className="h-4 w-4" /> Save Settings</button>
            </div>
          )}

          {/* ─── SECURITY ──────────────────────────────────────────────────── */}
          {tab === 'security' && (
            <div className={cardP}>
              <div className="space-y-2 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{log.event}</p>
                      <p className="text-xs text-white/30 font-['JetBrains_Mono',monospace]">{new Date(log.timestamp).toLocaleString()} · {log.ip}</p>
                    </div>
                    <Pill color={log.status === 'SUCCESS' ? 'green' : log.status === 'WARNING' ? 'yellow' : 'red'}>
                      {log.status}
                    </Pill>
                  </div>
                ))}
                {logs.length === 0 && <p className="text-sm text-white/25 py-10 text-center">No security events logged.</p>}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── INVENTORY MODAL ──────────────────────────────────────────────────── */}
      {openInventoryModal && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/[0.09] bg-[#0C0C16] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <h3 className="text-lg font-bold">Add Stock Keys</h3>
                <p className="text-xs text-white/35 mt-0.5">
                  Product: <span className="font-semibold text-white">{inventoryProduct?.name || '—'}</span>
                </p>
              </div>
              <button onClick={closeInventoryModal} disabled={inventoryBusy} className="rounded-lg p-1.5 text-white/30 hover:bg-white/[0.07] hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Tier selector */}
              {inventoryProduct && hasTiers(inventoryProduct) && (
                <div>
                  <p className={lbl}>Select Tier</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(inventoryProduct.tiers || []).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setInventoryTierId(t.id)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all ${inventoryTierId === t.id
                            ? 'border-[#FACC15]/40 bg-[#FACC15]/10'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{t.name}</span>
                          <span className="text-xs text-[#FACC15]">${Number(t.price || 0).toFixed(2)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-white/30 font-['JetBrains_Mono',monospace]">Stock: {t.stock} · {t.id}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Keys textarea */}
              <div>
                <p className={lbl}>Keys / Accounts <span className="text-white/20 normal-case font-normal tracking-normal">(one per line)</span></p>
                <textarea
                  rows={8}
                  value={inventoryKeysInput}
                  onChange={(e) => setInventoryKeysInput(e.target.value)}
                  disabled={inventoryBusy}
                  placeholder={'email:password\nemail2:password2\nlicense-key-12345'}
                  className={`${field} font-['JetBrains_Mono',monospace] text-xs resize-none`}
                />
                <p className="mt-1.5 text-xs text-white/30">
                  Ready to add: <span className="font-semibold text-white">{inventoryItemsCount}</span> line{inventoryItemsCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
              <button type="button" onClick={closeInventoryModal} disabled={inventoryBusy} className={btnG}>Cancel</button>
              <button type="button" onClick={submitInventoryKeys} disabled={inventoryBusy} className={btnY}>
                {inventoryBusy ? 'Adding…' : inventoryItemsCount > 0 ? `Add ${inventoryItemsCount} Key${inventoryItemsCount !== 1 ? 's' : ''}` : 'Add Keys'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCT EDITOR MODAL ─────────────────────────────────────────────── */}
      {openEditor && (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/75 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative my-6 w-full max-w-[1200px] rounded-2xl border border-white/[0.09] bg-[#0B0B14] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#0B0B14] px-6 py-4 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-extrabold tracking-tight">{draft.id && products.some((p) => p.id === draft.id) ? 'Edit Product' : 'New Product'}</h3>
                <p className="text-xs text-white/30 mt-0.5">Fill each section — basics → pricing → media → tiers</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpenEditor(false)} className={btnG}>Cancel</button>
                <button type="submit" form="product-form" className={btnY}><Save className="h-4 w-4" /> Save Product</button>
                <button onClick={() => setOpenEditor(false)} className="ml-1 rounded-lg p-1.5 text-white/30 hover:bg-white/[0.06] hover:text-white transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form id="product-form" onSubmit={saveProduct} className="grid grid-cols-1 gap-4 p-6 xl:grid-cols-12">
              {/* Notice banner */}
              <div className="xl:col-span-12 rounded-xl border border-[#FACC15]/20 bg-[#FACC15]/[0.06] px-4 py-2.5">
                <p className="text-xs text-[#FACC15]/80">
                  Tiered products manage stock per tier — use <span className="font-bold">Add Keys</span> in the Products table after saving.
                </p>
              </div>

              {/* ── LEFT (sections 1-4) ──────────────────────────────── */}
              <div className="space-y-4 xl:col-span-8">
                {/* 1. Basics */}
                <div className={sec}>
                  <SectionHeader num="01" title="Basics" sub="Product identity and storefront labels" />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className={lbl}>Product Name *</label>
                      <input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} placeholder="e.g. Enzo Weekly Plan" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={lbl}>URL Path</label>
                      <input value={draft.urlPath || ''} onChange={(e) => setDraft({ ...draft, urlPath: e.target.value })} className={field} placeholder="enzo-weekly-plan" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={lbl}>Short Description *</label>
                      <textarea required rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={field} placeholder="What the buyer gets in a single paragraph." />
                    </div>
                    <div>
                      <label className={lbl}>Product Type</label>
                      <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ServiceType })} className={field}>
                        {Object.values(ServiceType).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Duration Label</label>
                      <input value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: e.target.value })} className={field} placeholder="1 Month / Lifetime / Weekly" />
                    </div>
                    <div>
                      <label className={lbl}>Card Badge Label</label>
                      <input value={draft.cardBadgeLabel || ''} onChange={(e) => setDraft({ ...draft, cardBadgeLabel: e.target.value })} className={field} placeholder="ACCOUNT / KEY" />
                    </div>
                    <div>
                      <label className={lbl}>Card Badge Icon</label>
                      <select value={draft.cardBadgeIcon || 'grid'} onChange={(e) => setDraft({ ...draft, cardBadgeIcon: e.target.value as Product['cardBadgeIcon'] })} className={field}>
                        <option value="grid">grid</option>
                        <option value="key">key</option>
                        <option value="shield">shield</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. Pricing & Visibility */}
                <div className={sec}>
                  <SectionHeader num="02" title="Pricing & Visibility" sub="Set price, stock, and access level" />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className={lbl}>Price ($)</label>
                      <input type="number" step="0.01" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className={field} placeholder="22.99" />
                    </div>
                    <div>
                      <label className={lbl}>Original Price (optional)</label>
                      <input type="number" step="0.01" value={draft.originalPrice} onChange={(e) => setDraft({ ...draft, originalPrice: Number(e.target.value) })} className={field} placeholder="29.99" />
                    </div>
                    <div>
                      <label className={lbl}>Stock {tierDrafts.length > 0 && <span className="normal-case font-normal text-white/20 tracking-normal">(managed by tiers)</span>}</label>
                      <input
                        type="number"
                        value={tierDrafts.length > 0 ? tierDrafts.reduce((s, t) => s + Number(t.stock || 0), 0) : draft.stock}
                        onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })}
                        disabled={tierDrafts.length > 0}
                        className={`${field} disabled:opacity-40`}
                      />
                    </div>
                    <div>
                      <label className={lbl}>Visibility</label>
                      <select value={draft.visibility || 'public'} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as Product['visibility'] })} className={field}>
                        <option value="public">public</option>
                        <option value="private">private</option>
                        <option value="hidden">hidden</option>
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Category</label>
                      <select value={draft.category || ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={field}>
                        <option value="">No category</option>
                        {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={lbl}>Group</label>
                      <select value={draft.group || ''} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className={field}>
                        <option value="">No group</option>
                        {groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className={lbl}>Live Sales Counter Timespan</label>
                      <select value={draft.liveSalesTimespan || 'all_time'} onChange={(e) => setDraft({ ...draft, liveSalesTimespan: e.target.value as Product['liveSalesTimespan'] })} className={field}>
                        <option value="all_time">all_time</option>
                        <option value="30_days">30_days</option>
                        <option value="7_days">7_days</option>
                        <option value="24_hours">24_hours</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 3. Media & Content */}
                <div className={sec}>
                  <SectionHeader num="03" title="Media & Content" sub="Images, buy-page description, and feature lists" />
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(['image', 'bannerImage', 'cardBackdropImage'] as const).map((key) => {
                      const labels = { image: 'Card Image', bannerImage: 'Banner Image', cardBackdropImage: 'Card Backdrop' };
                      return (
                        <div key={key}>
                          <label className={lbl}>{labels[key]} URL</label>
                          <input value={(draft as any)[key] || ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={`${field} mb-2`} placeholder="https://… or upload below" />
                          <div className="grid grid-cols-2 gap-2">
                            <label className={uploadCls}>
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadDraftImage(f, key); e.currentTarget.value = ''; }} />
                              {uploadingField === key ? 'Uploading…' : `Upload ${labels[key]}`}
                            </label>
                            <button type="button" onClick={() => clearDraftImage(key)} disabled={!String((draft as any)[key] || '').trim()} className={removeCls}>Remove</button>
                          </div>
                        </div>
                      );
                    })}
                    <div>
                      <label className={lbl}>Buy Page Description</label>
                      <textarea rows={6} value={draft.buyPageDescription || ''} onChange={(e) => setDraft({ ...draft, buyPageDescription: e.target.value })} className={field} placeholder="Shown on the product buy page." />
                    </div>
                    <div>
                      <label className={lbl}>Feature Bullets <span className="normal-case font-normal tracking-normal text-white/20">(one per line)</span></label>
                      <textarea rows={4} value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} className={field} placeholder={"Fast delivery\nLifetime access\nPremium support"} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={lbl}>Detailed Description <span className="normal-case font-normal tracking-normal text-white/20">(one point per line)</span></label>
                      <textarea rows={3} value={detailsText} onChange={(e) => setDetailsText(e.target.value)} className={field} placeholder={"Great for new users\nIncludes support\nInstant activation"} />
                    </div>
                  </div>
                </div>

                {/* 4. Tiers */}
                <div className={sec}>
                  <div className="flex items-start justify-between mb-4">
                    <SectionHeader num="04" title="Product Tiers" sub="Optional variants like Basic, 4K, Country-specific. Stock managed via Add Keys." />
                    <button
                      type="button"
                      onClick={() => setTierDrafts((p) => [...p, { id: `tier-${Date.now()}-${p.length + 1}`, name: `Tier ${p.length + 1}`, price: Number(draft.price || 0), originalPrice: Number(draft.originalPrice || 0), stock: 0, description: '', image: '', duration: draft.duration || '', durationSeconds: 0 }])}
                      className={`${btnY} shrink-0`}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Tier
                    </button>
                  </div>

                  {tierDrafts.length === 0 && (
                    <p className="text-xs text-white/25 py-4 text-center">No tiers. Leave empty for a single-product listing.</p>
                  )}

                  <div className="space-y-3">
                    {tierDrafts.map((tier, idx) => (
                      <div key={tier.id || idx} className="rounded-xl border border-white/[0.08] bg-[#0A0A13] p-4">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 mb-3">
                          <div className="sm:col-span-2">
                            <label className={lbl}>Name</label>
                            <input value={tier.name} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))} className={fieldSm} placeholder="Tier name" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={lbl}>ID</label>
                            <input value={tier.id} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, id: slug(e.target.value) } : x))} className={`${fieldSm} font-['JetBrains_Mono',monospace] text-xs`} placeholder="tier-id" />
                          </div>
                          <div>
                            <label className={lbl}>Price</label>
                            <input type="number" step="0.01" value={tier.price} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, price: Number(e.target.value) } : x))} className={fieldSm} />
                          </div>
                          <div>
                            <label className={lbl}>Original</label>
                            <input type="number" step="0.01" value={tier.originalPrice || 0} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, originalPrice: Number(e.target.value) } : x))} className={fieldSm} />
                          </div>
                          <div>
                            <label className={lbl}>Duration</label>
                            <input value={tier.duration || ''} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, duration: e.target.value } : x))} className={fieldSm} placeholder="1 mo" />
                          </div>
                          <div>
                            <label className={lbl}>Expiry (s)</label>
                            <input type="number" min={0} value={Math.max(0, Number(tier.durationSeconds || 0))} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, durationSeconds: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x))} className={fieldSm} />
                          </div>
                          <div className="sm:col-span-3">
                            <label className={lbl}>Description</label>
                            <input value={tier.description || ''} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} className={fieldSm} placeholder="Optional tier description" />
                          </div>
                          <div className="flex items-end justify-between sm:col-span-3">
                            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-white/40 font-['JetBrains_Mono',monospace]">
                              Stock: {Number(tier.stock || 0)}
                            </div>
                            <button type="button" onClick={() => setTierDrafts((p) => p.filter((_, i) => i !== idx))} className={btnR}>
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                        </div>
                        {/* Tier image row */}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div className="sm:col-span-1">
                            <input value={tier.image || ''} onChange={(e) => setTierDrafts((p) => p.map((x, i) => i === idx ? { ...x, image: e.target.value } : x))} className={`${fieldSm} w-full`} placeholder="Tier image URL" />
                          </div>
                          <label className={uploadCls}>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadTierImage(f, idx); e.currentTarget.value = ''; }} />
                            {uploadingField === `tier-${idx}` ? 'Uploading…' : 'Upload Tier Image'}
                          </label>
                          <button type="button" onClick={() => clearTierImage(idx)} disabled={!String(tier.image || '').trim()} className={removeCls}>Remove Image</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── RIGHT (section 5 + live summary) ──────────────────── */}
              <div className="space-y-4 xl:col-span-4 xl:sticky xl:top-[73px] xl:self-start">
                {/* 5. Display Options */}
                <div className={sec}>
                  <SectionHeader num="05" title="Display & Delivery" sub="Badges, counters, and delivery mode" />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {([
                      ['hideStockCount', 'Hide stock count'],
                      ['showViewsCount', 'Show views count'],
                      ['showSalesCount', 'Show sales count'],
                      ['popular', 'Popular badge'],
                      ['featured', 'Featured badge'],
                      ['verified', 'Verified product'],
                    ] as [keyof Product, string][]).map(([key, label]) => (
                      <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm hover:border-white/[0.1] transition-colors">
                        <input
                          type="checkbox"
                          checked={Boolean((draft as any)[key])}
                          onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                          className="h-3.5 w-3.5 rounded accent-[#FACC15]"
                        />
                        <span className="text-white/60 text-xs font-medium">{label}</span>
                      </label>
                    ))}
                    <label className="col-span-1 sm:col-span-2 flex cursor-pointer items-center gap-2.5 rounded-xl border border-[#FACC15]/20 bg-[#FACC15]/[0.06] px-3 py-2.5 text-sm hover:border-[#FACC15]/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.instantDelivery)}
                        onChange={(e) => setDraft({ ...draft, instantDelivery: e.target.checked })}
                        className="h-3.5 w-3.5 rounded accent-[#FACC15]"
                      />
                      <span className="text-[#FACC15]/80 text-xs font-semibold">⚡ Instant Delivery</span>
                    </label>
                  </div>
                </div>

                {/* Live Summary */}
                <div className={sec}>
                  <p className="text-sm font-bold mb-3">Live Summary</p>
                  <div className="space-y-2">
                    {[
                      ['Mode', tierDrafts.length > 0 ? 'Tiered product' : 'Single product'],
                      ['Tiers', String(tierDrafts.length)],
                      ['Effective Stock', String(tierDrafts.length > 0 ? tierDrafts.reduce((s, t) => s + Number(t.stock || 0), 0) : Number(draft.stock || 0))],
                      ['Price Range', tierDrafts.length > 0
                        ? `$${Math.min(...tierDrafts.map((t) => Number(t.price || 0))).toFixed(2)} – $${Math.max(...tierDrafts.map((t) => Number(t.price || 0))).toFixed(2)}`
                        : `$${Number(draft.price || 0).toFixed(2)}`
                      ],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                        <span className="text-xs text-white/35">{k}</span>
                        <span className="text-xs font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};