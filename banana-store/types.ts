export enum ServiceType {
  NETFLIX = 'NETFLIX',
  DISNEY = 'DISNEY',
  CRUNCHYROLL = 'CRUNCHYROLL',
  BUNDLE = 'BUNDLE',
  OTHER = 'OTHER'
}

export interface ProductTier {
  id: string;
  name: string;
  description?: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image?: string;
  duration?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  urlPath?: string;
  price: number;
  originalPrice: number;
  duration: string;
  type: ServiceType;
  features: string[];
  detailedDescription?: string[];
  image: string;
  bannerImage?: string;
  category?: string;
  group?: string;
  visibility?: 'public' | 'private' | 'hidden';
  cardBadgeLabel?: string;
  cardBadgeIcon?: 'grid' | 'key' | 'shield';
  hideStockCount?: boolean;
  showViewsCount?: boolean;
  showSalesCount?: boolean;
  liveSalesTimespan?: 'all_time' | '30_days' | '7_days' | '24_hours';
  popular?: boolean;
  featured?: boolean;
  stock: number;
  verified?: boolean;
  instantDelivery?: boolean;
  tiers?: ProductTier[];
}

export interface CartItem extends Product {
  quantity: number;
  productId?: string;
  tierId?: string;
  tierName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface AdminSettings {
  storeName: string;
  currency: string;
  paypalEmail: string;
  stripeKey: string;
  cryptoAddress: string;
}
