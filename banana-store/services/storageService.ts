import { Product, CartItem, AdminSettings } from '../types';
import { INITIAL_PRODUCTS } from '../constants';
import { BRAND_CONFIG } from '../config/brandConfig';

export interface User {
  id: string;
  email: string;
  password?: string;
  role: 'admin' | 'user';
  createdAt: string;
  discordId?: string;
  discordUsername?: string;
  discordAvatar?: string;
  discordLinkedAt?: string;
}

export interface SecurityLog {
  id: string;
  event: string;
  timestamp: string;
  status: 'SUCCESS' | 'WARNING' | 'CRITICAL';
  ip: string;
}

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  status: 'completed' | 'pending' | 'refunded' | 'cancelled';
  createdAt: string;
  credentials: Record<string, string>;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  uses: number;
  maxUses: number;
  expiresAt?: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  visibility: 'public' | 'hidden';
}

export interface ProductGroup {
  id: string;
  name: string;
  visibility: 'public' | 'hidden';
}

export interface Invoice {
  id: string;
  orderId: string;
  email: string;
  total: number;
  status: 'paid' | 'unpaid' | 'refunded';
  createdAt: string;
}

export interface Ticket {
  id: string;
  subject: string;
  customerEmail: string;
  status: 'open' | 'closed';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface Feedback {
  id: string;
  customerEmail: string;
  rating: number;
  message: string;
  createdAt: string;
}

export interface DomainRecord {
  id: string;
  domain: string;
  verified: boolean;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface BlacklistEntry {
  id: string;
  type: 'email' | 'ip' | 'user';
  value: string;
  reason: string;
  createdAt: string;
}

export interface PaymentMethodConfig {
  id: string;
  name: string;
  enabled: boolean;
  instructions: string;
}

const STORAGE_KEYS = {
  PRODUCTS: `${BRAND_CONFIG.storage.keyPrefix}_products`,
  USERS: `${BRAND_CONFIG.storage.keyPrefix}_users`,
  ORDERS: `${BRAND_CONFIG.storage.keyPrefix}_orders`,
  SETTINGS: `${BRAND_CONFIG.storage.keyPrefix}_settings`,
  SESSION: `${BRAND_CONFIG.storage.keyPrefix}_session`,
  LOGS: `${BRAND_CONFIG.storage.keyPrefix}_security_logs`,
  CATEGORIES: `${BRAND_CONFIG.storage.keyPrefix}_categories`,
  GROUPS: `${BRAND_CONFIG.storage.keyPrefix}_groups`,
  COUPONS: `${BRAND_CONFIG.storage.keyPrefix}_coupons`,
  INVOICES: `${BRAND_CONFIG.storage.keyPrefix}_invoices`,
  TICKETS: `${BRAND_CONFIG.storage.keyPrefix}_tickets`,
  FEEDBACKS: `${BRAND_CONFIG.storage.keyPrefix}_feedbacks`,
  DOMAINS: `${BRAND_CONFIG.storage.keyPrefix}_domains`,
  TEAM: `${BRAND_CONFIG.storage.keyPrefix}_team`,
  BLACKLIST: `${BRAND_CONFIG.storage.keyPrefix}_blacklist`,
  PAYMENT_METHODS: `${BRAND_CONFIG.storage.keyPrefix}_payment_methods`
};

const readJson = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const randomId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const ensureInvoicesFromOrders = () => {
  const orders = readJson<Order[]>(STORAGE_KEYS.ORDERS, []);
  const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
  const invoices = readJson<Invoice[]>(STORAGE_KEYS.INVOICES, []);
  const invoiceOrderIds = new Set(invoices.map((invoice) => invoice.orderId));

  let changed = false;
  for (const order of orders) {
    if (invoiceOrderIds.has(order.id)) continue;
    const user = users.find((u) => u.id === order.userId);
    invoices.push({
      id: randomId('inv'),
      orderId: order.id,
      email: user?.email || order.userId,
      total: order.total,
      status: order.status === 'refunded' ? 'refunded' : 'paid',
      createdAt: order.createdAt,
    });
    changed = true;
  }

  if (changed) {
    writeJson(STORAGE_KEYS.INVOICES, invoices);
  }
};

export const StorageService = {
  init: () => {
    if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) {
      writeJson(STORAGE_KEYS.PRODUCTS, INITIAL_PRODUCTS);
    }

    const users = readJson<User[]>(STORAGE_KEYS.USERS, []);
    const adminExists = users.some((u) => u.email === 'powerpoki7@gmail.com');
    if (!adminExists) {
      users.push({
        id: 'admin-1337',
        email: 'powerpoki7@gmail.com',
        // Local fallback mode only; production auth is server-side via Shop API.
        password: randomId('local-admin-password'),
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      writeJson(STORAGE_KEYS.USERS, users);
    }

    if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) writeJson(STORAGE_KEYS.ORDERS, []);
    if (!localStorage.getItem(STORAGE_KEYS.INVOICES)) writeJson(STORAGE_KEYS.INVOICES, []);

    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      const defaultSettings: AdminSettings = {
        storeName: BRAND_CONFIG.identity.storeName,
        logoUrl: BRAND_CONFIG.assets.logoUrl,
        bannerUrl: BRAND_CONFIG.assets.bannerUrl,
        faviconUrl: BRAND_CONFIG.assets.faviconUrl,
        currency: 'USD',
        paypalEmail: '',
        stripeKey: '',
        cryptoAddress: ''
      };
      writeJson(STORAGE_KEYS.SETTINGS, defaultSettings);
    }

    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      writeJson(STORAGE_KEYS.LOGS, [
        { id: '1', event: 'System core initialized', timestamp: new Date().toISOString(), status: 'SUCCESS', ip: '127.0.0.1' }
      ]);
    }

    if (!localStorage.getItem(STORAGE_KEYS.CATEGORIES)) writeJson(STORAGE_KEYS.CATEGORIES, []);
    if (!localStorage.getItem(STORAGE_KEYS.GROUPS)) writeJson(STORAGE_KEYS.GROUPS, []);
    if (!localStorage.getItem(STORAGE_KEYS.COUPONS)) writeJson(STORAGE_KEYS.COUPONS, []);
    if (!localStorage.getItem(STORAGE_KEYS.TICKETS)) writeJson(STORAGE_KEYS.TICKETS, []);
    if (!localStorage.getItem(STORAGE_KEYS.FEEDBACKS)) writeJson(STORAGE_KEYS.FEEDBACKS, []);
    if (!localStorage.getItem(STORAGE_KEYS.DOMAINS)) writeJson(STORAGE_KEYS.DOMAINS, []);
    if (!localStorage.getItem(STORAGE_KEYS.TEAM)) writeJson(STORAGE_KEYS.TEAM, []);
    if (!localStorage.getItem(STORAGE_KEYS.BLACKLIST)) writeJson(STORAGE_KEYS.BLACKLIST, []);

    if (!localStorage.getItem(STORAGE_KEYS.PAYMENT_METHODS)) {
      writeJson(STORAGE_KEYS.PAYMENT_METHODS, [
        { id: 'pm-card', name: 'Card', enabled: true, instructions: 'Stripe/Card checkout' },
        { id: 'pm-paypal', name: 'PayPal', enabled: true, instructions: 'PayPal email checkout' },
        { id: 'pm-crypto', name: 'Crypto', enabled: true, instructions: 'Manual wallet transfer' },
      ] as PaymentMethodConfig[]);
    }

    ensureInvoicesFromOrders();
  },

  getProducts: (): Product[] => readJson<Product[]>(STORAGE_KEYS.PRODUCTS, []),
  saveProducts: (products: Product[]) => writeJson(STORAGE_KEYS.PRODUCTS, products),

  updateProductStock: (productId: string, quantity: number, tierId?: string) => {
    const products = StorageService.getProducts();
    const index = products.findIndex((p) => p.id === productId);
    if (index !== -1) {
      const product = products[index];
      if (tierId && Array.isArray(product.tiers)) {
        product.tiers = product.tiers.map((tier) =>
          tier.id === tierId
            ? { ...tier, stock: Math.max(0, Number(tier.stock || 0) - quantity) }
            : tier
        );
        product.stock = product.tiers.reduce((total, tier) => total + Number(tier.stock || 0), 0);
      } else {
        product.stock = Math.max(0, product.stock - quantity);
      }
      products[index] = product;
      StorageService.saveProducts(products);
    }
  },

  getUsers: (): User[] => readJson<User[]>(STORAGE_KEYS.USERS, []),
  addUser: (user: User) => {
    const users = StorageService.getUsers();
    users.push(user);
    writeJson(STORAGE_KEYS.USERS, users);
  },

  addLog: (event: string, status: 'SUCCESS' | 'WARNING' | 'CRITICAL') => {
    const logs = readJson<SecurityLog[]>(STORAGE_KEYS.LOGS, []);
    logs.unshift({
      id: randomId('log'),
      event,
      timestamp: new Date().toISOString(),
      status,
      ip: `192.168.1.${Math.floor(Math.random() * 255)}`
    });
    writeJson(STORAGE_KEYS.LOGS, logs.slice(0, 100));
  },

  getLogs: (): SecurityLog[] => readJson<SecurityLog[]>(STORAGE_KEYS.LOGS, []),

  getSettings: (): AdminSettings => {
    const fallback: AdminSettings = {
      storeName: BRAND_CONFIG.identity.storeName,
      logoUrl: BRAND_CONFIG.assets.logoUrl,
      bannerUrl: BRAND_CONFIG.assets.bannerUrl,
      faviconUrl: BRAND_CONFIG.assets.faviconUrl,
      currency: 'USD',
      paypalEmail: '',
      stripeKey: '',
      cryptoAddress: ''
    };
    return readJson<AdminSettings>(STORAGE_KEYS.SETTINGS, fallback);
  },

  saveSettings: (settings: AdminSettings) => {
    writeJson(STORAGE_KEYS.SETTINGS, settings);
    StorageService.addLog('Store settings updated', 'SUCCESS');
  },

  setSession: (user: User | null) => {
    if (user) writeJson(STORAGE_KEYS.SESSION, user);
    else localStorage.removeItem(STORAGE_KEYS.SESSION);
  },

  getSession: (): User | null => {
    const data = localStorage.getItem(STORAGE_KEYS.SESSION);
    return data ? (JSON.parse(data) as User) : null;
  },

  getOrders: (): Order[] => readJson<Order[]>(STORAGE_KEYS.ORDERS, []),

  createOrder: (order: Order, applyStock: boolean = true) => {
    const orders = StorageService.getOrders();
    orders.push(order);
    writeJson(STORAGE_KEYS.ORDERS, orders);

    if (applyStock) {
      order.items.forEach((item) => {
        const productId = item.productId || item.id;
        StorageService.updateProductStock(productId, item.quantity, item.tierId);
      });
    }

    ensureInvoicesFromOrders();
    StorageService.addLog(`Transaction #${order.id.split('-')[1] || order.id} verified and cleared`, 'SUCCESS');
  },

  updateOrderStatus: (orderId: string, status: Order['status']) => {
    const orders = StorageService.getOrders().map((order) =>
      order.id === orderId ? { ...order, status } : order
    );
    writeJson(STORAGE_KEYS.ORDERS, orders);

    const invoices = StorageService.getInvoices().map((invoice) => {
      if (invoice.orderId !== orderId) return invoice;
      if (status === 'refunded') return { ...invoice, status: 'refunded' as const };
      if (status === 'cancelled') return { ...invoice, status: 'unpaid' as const };
      return { ...invoice, status: 'paid' as const };
    });
    writeJson(STORAGE_KEYS.INVOICES, invoices);

    StorageService.addLog(`Order ${orderId} marked as ${status}`, 'WARNING');
  },

  getUserOrders: (userId: string): Order[] => StorageService.getOrders().filter((o) => o.userId === userId),

  getCategories: (): Category[] => readJson<Category[]>(STORAGE_KEYS.CATEGORIES, []),
  saveCategories: (categories: Category[]) => writeJson(STORAGE_KEYS.CATEGORIES, categories),
  upsertCategory: (category: Category) => {
    const categories = StorageService.getCategories();
    const index = categories.findIndex((c) => c.id === category.id);
    if (index >= 0) categories[index] = category;
    else categories.unshift(category);
    StorageService.saveCategories(categories);
  },
  deleteCategory: (categoryId: string) => {
    StorageService.saveCategories(StorageService.getCategories().filter((category) => category.id !== categoryId));
  },

  getGroups: (): ProductGroup[] => readJson<ProductGroup[]>(STORAGE_KEYS.GROUPS, []),
  saveGroups: (groups: ProductGroup[]) => writeJson(STORAGE_KEYS.GROUPS, groups),
  upsertGroup: (group: ProductGroup) => {
    const groups = StorageService.getGroups();
    const index = groups.findIndex((g) => g.id === group.id);
    if (index >= 0) groups[index] = group;
    else groups.unshift(group);
    StorageService.saveGroups(groups);
  },
  deleteGroup: (groupId: string) => {
    StorageService.saveGroups(StorageService.getGroups().filter((group) => group.id !== groupId));
  },

  getCoupons: (): Coupon[] => readJson<Coupon[]>(STORAGE_KEYS.COUPONS, []),
  saveCoupons: (coupons: Coupon[]) => writeJson(STORAGE_KEYS.COUPONS, coupons),
  upsertCoupon: (coupon: Coupon) => {
    const coupons = StorageService.getCoupons();
    const index = coupons.findIndex((c) => c.id === coupon.id);
    if (index >= 0) coupons[index] = coupon;
    else coupons.unshift(coupon);
    StorageService.saveCoupons(coupons);
  },
  deleteCoupon: (couponId: string) => {
    StorageService.saveCoupons(StorageService.getCoupons().filter((coupon) => coupon.id !== couponId));
  },

  getInvoices: (): Invoice[] => {
    ensureInvoicesFromOrders();
    return readJson<Invoice[]>(STORAGE_KEYS.INVOICES, []);
  },
  saveInvoices: (invoices: Invoice[]) => writeJson(STORAGE_KEYS.INVOICES, invoices),

  getTickets: (): Ticket[] => readJson<Ticket[]>(STORAGE_KEYS.TICKETS, []),
  saveTickets: (tickets: Ticket[]) => writeJson(STORAGE_KEYS.TICKETS, tickets),
  upsertTicket: (ticket: Ticket) => {
    const tickets = StorageService.getTickets();
    const index = tickets.findIndex((t) => t.id === ticket.id);
    if (index >= 0) tickets[index] = ticket;
    else tickets.unshift(ticket);
    StorageService.saveTickets(tickets);
  },
  deleteTicket: (ticketId: string) => {
    StorageService.saveTickets(StorageService.getTickets().filter((ticket) => ticket.id !== ticketId));
  },

  getFeedbacks: (): Feedback[] => readJson<Feedback[]>(STORAGE_KEYS.FEEDBACKS, []),
  saveFeedbacks: (feedbacks: Feedback[]) => writeJson(STORAGE_KEYS.FEEDBACKS, feedbacks),
  upsertFeedback: (feedback: Feedback) => {
    const feedbacks = StorageService.getFeedbacks();
    const index = feedbacks.findIndex((item) => item.id === feedback.id);
    if (index >= 0) feedbacks[index] = feedback;
    else feedbacks.unshift(feedback);
    StorageService.saveFeedbacks(feedbacks);
  },
  deleteFeedback: (feedbackId: string) => {
    StorageService.saveFeedbacks(StorageService.getFeedbacks().filter((feedback) => feedback.id !== feedbackId));
  },

  getDomains: (): DomainRecord[] => readJson<DomainRecord[]>(STORAGE_KEYS.DOMAINS, []),
  saveDomains: (domains: DomainRecord[]) => writeJson(STORAGE_KEYS.DOMAINS, domains),
  upsertDomain: (domain: DomainRecord) => {
    const domains = StorageService.getDomains();
    const index = domains.findIndex((item) => item.id === domain.id);
    if (index >= 0) domains[index] = domain;
    else domains.unshift(domain);
    StorageService.saveDomains(domains);
  },
  deleteDomain: (domainId: string) => {
    StorageService.saveDomains(StorageService.getDomains().filter((domain) => domain.id !== domainId));
  },

  getTeamMembers: (): TeamMember[] => readJson<TeamMember[]>(STORAGE_KEYS.TEAM, []),
  saveTeamMembers: (members: TeamMember[]) => writeJson(STORAGE_KEYS.TEAM, members),
  upsertTeamMember: (member: TeamMember) => {
    const members = StorageService.getTeamMembers();
    const index = members.findIndex((item) => item.id === member.id);
    if (index >= 0) members[index] = member;
    else members.unshift(member);
    StorageService.saveTeamMembers(members);
  },
  deleteTeamMember: (memberId: string) => {
    StorageService.saveTeamMembers(StorageService.getTeamMembers().filter((member) => member.id !== memberId));
  },

  getBlacklist: (): BlacklistEntry[] => readJson<BlacklistEntry[]>(STORAGE_KEYS.BLACKLIST, []),
  saveBlacklist: (entries: BlacklistEntry[]) => writeJson(STORAGE_KEYS.BLACKLIST, entries),
  upsertBlacklistEntry: (entry: BlacklistEntry) => {
    const entries = StorageService.getBlacklist();
    const index = entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) entries[index] = entry;
    else entries.unshift(entry);
    StorageService.saveBlacklist(entries);
  },
  deleteBlacklistEntry: (entryId: string) => {
    StorageService.saveBlacklist(StorageService.getBlacklist().filter((entry) => entry.id !== entryId));
  },

  getPaymentMethods: (): PaymentMethodConfig[] => readJson<PaymentMethodConfig[]>(STORAGE_KEYS.PAYMENT_METHODS, []),
  savePaymentMethods: (methods: PaymentMethodConfig[]) => writeJson(STORAGE_KEYS.PAYMENT_METHODS, methods),
  upsertPaymentMethod: (method: PaymentMethodConfig) => {
    const methods = StorageService.getPaymentMethods();
    const index = methods.findIndex((item) => item.id === method.id);
    if (index >= 0) methods[index] = method;
    else methods.unshift(method);
    StorageService.savePaymentMethods(methods);
  },
  deletePaymentMethod: (methodId: string) => {
    StorageService.savePaymentMethods(StorageService.getPaymentMethods().filter((method) => method.id !== methodId));
  },
};
