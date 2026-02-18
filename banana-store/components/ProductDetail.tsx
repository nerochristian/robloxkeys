
import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  ShoppingCart, 
  Zap, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle,
  Plus, 
  Minus,
  Star,
  RefreshCw,
  Globe
} from 'lucide-react';
import { Product, ProductTier, ServiceType } from '../types';
import { BRAND_CONFIG } from '../config/brandConfig';

interface ProductDetailProps {
  product: Product;
  selectedTier?: ProductTier | null;
  onBack: () => void;
  onAddToCart: (product: Product, quantity: number, tier?: ProductTier) => void;
  onBuyNow: (product: Product, quantity: number, tier?: ProductTier) => void;
}

const buildInlineFallback = (name: string): string => {
  const initials = String(name || 'RK')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'RK';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#020617"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><rect x="24" y="24" width="1152" height="627" fill="none" stroke="#facc15" stroke-opacity="0.25" stroke-width="4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="220" font-weight="900" fill="#facc15">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const ProductDetail: React.FC<ProductDetailProps> = ({ product, selectedTier = null, onBack, onAddToCart, onBuyNow }) => {
  const [quantity, setQuantity] = useState(1);
  const [quantityDirection, setQuantityDirection] = useState<'up' | 'down'>('up');
  const [quantityAnimationKey, setQuantityAnimationKey] = useState(0);
  const tierPrices = (product.tiers || []).map((tier) => Number(tier.price || 0)).filter((value) => value > 0);
  const isTiered = tierPrices.length > 0;
  const isTierView = Boolean(selectedTier);
  const minTierPrice = isTiered ? Math.min(...tierPrices) : Number(product.price || 0);
  const maxTierPrice = isTiered ? Math.max(...tierPrices) : Number(product.price || 0);
  const currentStock = Number(selectedTier?.stock ?? product.stock ?? 0);
  const isOutOfStock = currentStock <= 0;
  const displayName = selectedTier ? `${product.name} (${selectedTier.name})` : product.name;
  const displayDuration = selectedTier?.duration || product.duration;
  const displayPrice = selectedTier ? Number(selectedTier.price || 0) : Number(product.price || 0);
  const displayOriginalPrice = selectedTier ? Number(selectedTier.originalPrice || 0) : Number(product.originalPrice || 0);
  const detailImage =
    selectedTier?.image ||
    product.image ||
    product.bannerImage ||
    buildInlineFallback(selectedTier?.name || product.name);
  const usageNotice = (BRAND_CONFIG.copy.productUsageNotice || [])
    .map((line) => line.replace(/\{service\}/gi, product.type));
  const discountTarget = 10;
  const remainingForDiscount = Math.max(0, discountTarget - quantity);
  const discountUnlocked = remainingForDiscount === 0;
  const directionAnimationClass =
    quantityDirection === 'up'
      ? 'animate-[qtySlideUp_420ms_cubic-bezier(0.22,1,0.36,1)]'
      : 'animate-[qtySlideDown_420ms_cubic-bezier(0.22,1,0.36,1)]';

  useEffect(() => {
    setQuantity(1);
    setQuantityDirection('up');
    setQuantityAnimationKey((prev) => prev + 1);
  }, [product.id, selectedTier?.id]);

  const updateQuantity = (nextQuantity: number) => {
    const clamped = Math.max(1, Math.min(currentStock || 1, nextQuantity));
    if (clamped === quantity) return;
    setQuantityDirection(clamped > quantity ? 'up' : 'down');
    setQuantity(clamped);
    setQuantityAnimationKey((prev) => prev + 1);
  };

  const getHeaderGradient = (type: ServiceType) => {
    switch (type) {
      case ServiceType.NETFLIX: return 'from-yellow-500/40 to-yellow-900/90';
      case ServiceType.DISNEY: return 'from-amber-500/40 to-yellow-950/90';
      case ServiceType.CRUNCHYROLL: return 'from-yellow-400/40 to-amber-900/90';
      default: return 'from-yellow-500/40 to-yellow-950/90';
    }
  };

  const renderFeature = (feature: string, idx: number) => {
    // If feature starts with [x] or !, it's a negative feature
    const isNegative = feature.startsWith('[x]') || feature.startsWith('!');
    const cleanText = isNegative 
      ? feature.replace(/^(\[x\]|!)\s*/, '') 
      : feature;

    return (
      <div key={idx} className="flex items-start gap-4 group">
        <div className="mt-1">
          {isNegative ? (
            <XCircle className="w-4 h-4 text-red-500" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
          )}
        </div>
        <p className="text-sm font-medium text-white/60 leading-relaxed">
          <span className="text-white font-black">{cleanText.split('–')[0]}</span>
          {cleanText.includes('–') && ` – ${cleanText.split('–')[1]}`}
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500 sm:px-6 sm:pt-32 sm:pb-40">
      <button 
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 transition-colors hover:text-white sm:mb-10"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Catalog
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10">
        {/* Left Side: Product Hero & Details */}
        <div className="space-y-6 lg:col-span-8 lg:space-y-8">
          {/* Main Visual Card */}
          <div className="group relative aspect-video overflow-hidden rounded-[28px] border border-white/5 bg-[#0a0a0a] sm:rounded-[40px]">
            {product.bannerImage ? (
               <img 
                src={product.bannerImage} 
                alt={product.name} 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
              />
            ) : (
              <>
                <div className={`absolute inset-0 bg-gradient-to-br ${getHeaderGradient(product.type)} opacity-60`}></div>
                <img 
                  src={detailImage} 
                  alt="" 
                  className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40 transition-transform duration-700 group-hover:scale-110" 
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
                   <h1 className="mb-4 text-4xl font-black uppercase tracking-tighter text-white drop-shadow-2xl md:text-7xl">
                     {displayDuration} <br />
                     <span className="text-white/20">{product.type}</span>
                   </h1>
                   <div className="w-24 h-1 bg-white/20 rounded-full"></div>
                </div>
              </>
            )}
          </div>

          {/* Detailed Features */}
          <div className="overflow-hidden rounded-[28px] border border-white/5 bg-[#0a0a0a] sm:rounded-[40px]">
            <div className="flex items-center justify-between border-b border-white/5 p-5 sm:p-8">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-white/5 rounded-xl">
                   <Globe className="w-5 h-5 text-white/40" />
                 </div>
                 <h3 className="text-lg font-black text-white tracking-tight">Product Description - English</h3>
              </div>
            </div>
            <div className="space-y-4 p-5 sm:p-10">
              {product.detailedDescription?.length 
                ? product.detailedDescription.map((desc, idx) => renderFeature(desc, idx))
                : product.features.map((feature, idx) => renderFeature(feature, idx))
              }
              
              <div className="mt-8 border-t border-white/5 pt-6 text-[11px] font-bold uppercase leading-loose tracking-widest text-white/20 sm:mt-12 sm:pt-10">
                {usageNotice.map((line, idx) => (
                  <div key={`${line}-${idx}`}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Buying Section */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-[28px] border border-white/5 bg-[#0a0a0a] p-5 sm:rounded-[40px] sm:p-8 lg:sticky lg:top-32 lg:p-10">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-2xl font-black leading-tight tracking-tighter text-white sm:text-3xl">{displayName}</h2>
              {product.featured && (
                <div className="bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                  <Star className="w-3 h-3 fill-current" />
                  <span className="text-[9px] font-black uppercase">Featured</span>
                </div>
              )}
            </div>

            <div className="mb-8 text-3xl font-black tracking-tighter text-white sm:text-4xl">
              {isTierView
                ? `$${displayPrice.toFixed(2)}`
                : isTiered
                ? `$${minTierPrice.toFixed(2)} - $${maxTierPrice.toFixed(2)}`
                : `$${Number(product.price || 0).toFixed(2)}`}
              {isTierView && displayOriginalPrice > displayPrice && (
                <span className="ml-3 text-xl font-bold text-white/35 line-through">${displayOriginalPrice.toFixed(2)}</span>
              )}
            </div>

            {/* Stock Bar */}
            <div className="mb-8 sm:mb-10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Stock Status</span>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                    isOutOfStock
                      ? 'text-red-300 bg-red-500/10'
                      : 'text-[#22c55e] bg-[#22c55e]/10'
                  }`}
                >
                  {isOutOfStock ? 'Empty' : `${currentStock} In Stock`}
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${isOutOfStock ? 'bg-red-500' : 'bg-[#22c55e]'}`}
                  style={{ width: `${Math.min(100, (currentStock / 50) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Badges */}
            <div className="mb-8 flex flex-wrap gap-2 sm:mb-10">
              <div className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-white/40" />
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Verified Quality</span>
              </div>
              <div className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl flex items-center gap-2">
                <Zap className="w-3 h-3 text-white/40" />
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Instant Delivery</span>
              </div>
              <div className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl flex items-center gap-2">
                <ShieldCheck className="w-3 h-3 text-white/40" />
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Fresh</span>
              </div>
            </div>

            {/* Quantity & Buy Section */}
            <div className="mb-8 rounded-[24px] border-2 border-dashed border-white/5 bg-black/20 p-4 sm:rounded-[32px] sm:p-6">
              {isTiered && (
                <div className="mb-4 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-[#facc15]">
                  {isTierView
                    ? `Viewing tier: ${selectedTier?.name}`
                    : `This product has ${product.tiers?.length || 0} tiers. Click Buy Now or Add to Cart to open the tier panel.`}
                </div>
              )}
              <div className="space-y-4 mb-8">
                <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-white/20">Quantity</label>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black p-2">
                  <button 
                    onClick={() => updateQuantity(quantity - 1)}
                    disabled={!isTierView && isTiered}
                    className="flex h-10 w-10 items-center justify-center text-white/20 transition-colors hover:text-white sm:h-12 sm:w-12"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span
                    key={`${quantity}-${quantityAnimationKey}`}
                    className={`inline-block text-xl font-black text-white ${directionAnimationClass}`}
                  >
                    {quantity}
                  </span>
                  <button 
                    onClick={() => updateQuantity(quantity + 1)}
                    disabled={(!isTierView && isTiered) || isOutOfStock || quantity >= currentStock}
                    className="flex h-10 w-10 items-center justify-center text-white/20 transition-colors hover:text-white sm:h-12 sm:w-12"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  disabled={isOutOfStock}
                  onClick={() => onAddToCart(product, quantity, selectedTier || undefined)}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#facc15] py-4 text-xs font-black uppercase tracking-widest text-black shadow-xl shadow-yellow-400/10 transition-all active:scale-[0.98] hover:bg-yellow-300 sm:py-5"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add to Cart
                </button>
                <button 
                  disabled={isOutOfStock}
                  onClick={() => onBuyNow(product, quantity, selectedTier || undefined)}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/5 bg-white/5 py-4 text-xs font-black uppercase tracking-widest text-white/90 transition-all hover:bg-white/10 sm:py-5"
                >
                  <Zap className="w-4 h-4 text-[#facc15]" />
                  Buy Now
                </button>
              </div>
            </div>

            {/* Dynamic Offer */}
            <div className="flex items-center gap-4 rounded-2xl border border-[#facc15]/10 bg-[#facc15]/5 p-4">
               <div className="w-10 h-10 rounded-full bg-[#facc15]/20 flex items-center justify-center">
                 <RefreshCw className="w-5 h-5 text-[#facc15]" />
               </div>
               <p className="text-[10px] font-bold text-white/40 uppercase leading-relaxed tracking-wider">
                 {discountUnlocked ? (
                   <>
                     <span className="text-white">Discount unlocked.</span> <span className="text-[#facc15]">3% off</span> active.
                   </>
                 ) : (
                   <>
                     Add{' '}
                     <span
                       key={`remaining-num-${remainingForDiscount}-${quantityAnimationKey}`}
                       className={`inline-block text-white ${directionAnimationClass}`}
                     >
                       {remainingForDiscount}
                     </span>{' '}
                     more item{remainingForDiscount === 1 ? '' : 's'} to unlock <span className="text-[#facc15]">3% off</span> (at {discountTarget} pcs).
                   </>
                 )}
               </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
