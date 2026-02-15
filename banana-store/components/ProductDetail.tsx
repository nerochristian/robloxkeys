
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
  const detailImage = selectedTier?.image || product.image;
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
    <div className="max-w-7xl mx-auto px-6 pt-32 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-white/40 hover:text-white mb-10 transition-colors uppercase tracking-widest text-[10px] font-black"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Catalog
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Side: Product Hero & Details */}
        <div className="lg:col-span-8 space-y-8">
          {/* Main Visual Card */}
          <div className="relative aspect-video rounded-[40px] overflow-hidden border border-white/5 bg-[#0a0a0a] group">
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
                   <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter drop-shadow-2xl mb-4">
                     {displayDuration} <br />
                     <span className="text-white/20">{product.type}</span>
                   </h1>
                   <div className="w-24 h-1 bg-white/20 rounded-full"></div>
                </div>
              </>
            )}
          </div>

          {/* Detailed Features */}
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[40px] overflow-hidden">
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="p-2 bg-white/5 rounded-xl">
                   <Globe className="w-5 h-5 text-white/40" />
                 </div>
                 <h3 className="text-lg font-black text-white tracking-tight">Product Description - English</h3>
              </div>
            </div>
            <div className="p-10 space-y-4">
              {product.detailedDescription?.length 
                ? product.detailedDescription.map((desc, idx) => renderFeature(desc, idx))
                : product.features.map((feature, idx) => renderFeature(feature, idx))
              }
              
              <div className="mt-12 pt-10 border-t border-white/5 text-[11px] font-bold text-white/20 uppercase tracking-widest leading-loose">
                {usageNotice.map((line, idx) => (
                  <div key={`${line}-${idx}`}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Buying Section */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#0a0a0a] border border-white/5 rounded-[40px] p-10 sticky top-32">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-3xl font-black text-white tracking-tighter leading-tight">{displayName}</h2>
              {product.featured && (
                <div className="bg-[#facc15]/20 text-[#facc15] border border-[#facc15]/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                  <Star className="w-3 h-3 fill-current" />
                  <span className="text-[9px] font-black uppercase">Featured</span>
                </div>
              )}
            </div>

            <div className="text-4xl font-black text-white mb-8 tracking-tighter">
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
            <div className="mb-10">
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
            <div className="flex flex-wrap gap-2 mb-10">
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
            <div className="p-6 rounded-[32px] border-2 border-dashed border-white/5 bg-black/20 mb-8">
              {isTiered && (
                <div className="mb-4 rounded-xl border border-[#facc15]/40 bg-[#facc15]/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-[#facc15]">
                  {isTierView
                    ? `Viewing tier: ${selectedTier?.name}`
                    : `This product has ${product.tiers?.length || 0} tiers. Click Buy Now or Add to Cart to open the tier panel.`}
                </div>
              )}
              <div className="space-y-4 mb-8">
                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1">Quantity</label>
                <div className="flex items-center justify-between bg-black border border-white/10 p-2 rounded-2xl">
                  <button 
                    onClick={() => updateQuantity(quantity - 1)}
                    disabled={!isTierView && isTiered}
                    className="w-12 h-12 flex items-center justify-center text-white/20 hover:text-white transition-colors"
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
                    className="w-12 h-12 flex items-center justify-center text-white/20 hover:text-white transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  disabled={isOutOfStock}
                  onClick={() => onAddToCart(product, quantity, selectedTier || undefined)}
                  className="w-full bg-[#facc15] hover:bg-yellow-300 text-black font-black py-5 rounded-2xl transition-all shadow-xl shadow-yellow-400/10 flex items-center justify-center gap-3 active:scale-[0.98] uppercase tracking-widest text-xs"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add to Cart
                </button>
                <button 
                  disabled={isOutOfStock}
                  onClick={() => onBuyNow(product, quantity, selectedTier || undefined)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/90 font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs border border-white/5"
                >
                  <Zap className="w-4 h-4 text-[#facc15]" />
                  Buy Now
                </button>
              </div>
            </div>

            {/* Dynamic Offer */}
            <div className="flex items-center gap-4 bg-[#facc15]/5 p-4 rounded-2xl border border-[#facc15]/10">
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
