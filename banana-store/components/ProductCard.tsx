import React from 'react';
import { KeyRound, LayoutGrid, Shield, Star } from 'lucide-react';
import { Product, ServiceType } from '../types';

interface ProductCardProps {
  product: Product;
  onView: (product: Product) => void;
  onBuyNow: (product: Product, quantity?: number) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onView }) => {
  const buildInlineFallback = (name: string) => {
    const initials = String(name || 'RK')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('') || 'RK';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="20" fill="#111827"/><rect x="6" y="6" width="148" height="148" rx="16" fill="none" stroke="#facc15" stroke-opacity="0.35"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="56" font-weight="800" fill="#facc15">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const tierPrices = (product.tiers || []).map((tier) => Number(tier.price || 0)).filter((value) => value > 0);
  const isTiered = tierPrices.length > 0;
  const minTierPrice = isTiered ? Math.min(...tierPrices) : product.price;
  const maxTierPrice = isTiered ? Math.max(...tierPrices) : product.price;
  const totalTierStock = (product.tiers || []).reduce((sum, tier) => sum + Math.max(0, Number(tier.stock || 0)), 0);
  const effectiveStock = isTiered ? totalTierStock : Math.max(0, Number(product.stock || 0));
  const isOutOfStock = effectiveStock <= 0;
  const isLowStock = !isOutOfStock && effectiveStock <= 5;
  const stockLabel = isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock';
  const stockLabelClass = isOutOfStock
    ? 'text-red-300 border-red-500/35 bg-red-500/10 shadow-[0_0_18px_rgba(239,68,68,0.2)]'
    : isLowStock
    ? 'text-orange-200 border-orange-400/35 bg-orange-500/10 shadow-[0_0_18px_rgba(251,146,60,0.2)]'
    : 'text-[#86efac] border-emerald-400/35 bg-emerald-500/10 shadow-[0_0_18px_rgba(34,197,94,0.2)]';
  const stockDotClass = isOutOfStock
    ? 'bg-red-400'
    : isLowStock
    ? 'bg-orange-300'
    : 'bg-[#22c55e]';
  const badgeIcon = (product.cardBadgeIcon || 'grid').toLowerCase();
  const badgeLabel = (product.cardBadgeLabel || (product.type === ServiceType.BUNDLE ? 'BUNDLE' : 'ACCOUNT')).trim();
  
  const getHeaderGradient = (type: ServiceType) => {
    switch (type) {
      case ServiceType.NETFLIX: return 'from-yellow-300/70 to-yellow-700/90';
      case ServiceType.DISNEY: return 'from-amber-300/70 to-yellow-800/90';
      case ServiceType.CRUNCHYROLL: return 'from-yellow-400/70 to-amber-700/90';
      case ServiceType.BUNDLE: return 'from-yellow-300/80 to-yellow-600/90';
      default: return 'from-yellow-500/70 to-zinc-900/90';
    }
  };

  return (
    <button
      type="button"
      onClick={() => onView(product)}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/80 text-left backdrop-blur-md transition-all duration-500 card-glow group md:flex-row"
    >
      {/* Featured Badge Overlay */}
      {product.featured && (
        <div className="absolute top-4 right-4 z-10 bg-[#facc15]/90 text-black p-2 rounded-xl shadow-[0_0_20px_rgba(250,204,21,0.35)] animate-pulse">
          <Star className="w-3.5 h-3.5 fill-current" />
        </div>
      )}

      {/* Visual Header - 16:9 */}
      <div className={`relative flex aspect-video w-full items-center justify-center overflow-hidden border-b border-white/5 bg-gradient-to-br ${getHeaderGradient(product.type)} md:aspect-auto md:w-[42%] md:border-b-0 md:border-r`}>
        {/* Top-Left Category Badge */}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur-lg transition-transform duration-500 group-hover:translate-x-1 sm:left-4 sm:top-4">
          {badgeIcon === 'key' ? (
            <KeyRound className="w-3.5 h-3.5 text-[#facc15]" />
          ) : badgeIcon === 'shield' ? (
            <Shield className="w-3.5 h-3.5 text-[#facc15]" />
          ) : (
            <LayoutGrid className="w-3.5 h-3.5 text-[#facc15]" />
          )}
          <span className="text-[10px] font-black text-[#facc15] uppercase tracking-widest">{badgeLabel || 'ACCOUNT'}</span>
        </div>
        
        {/* Central Logo Circle */}
        <div className="w-28 h-28 md:w-32 md:h-32 bg-black/20 backdrop-blur-2xl rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] transform transition-all duration-700 group-hover:scale-125 group-hover:rotate-[15deg]">
           <img 
            src={product.image || buildInlineFallback(product.name)} 
            alt={product.name} 
            className="w-16 h-16 md:w-20 md:h-20 object-contain opacity-95 drop-shadow-2xl" 
            onError={(e) => {
              const img = e.currentTarget;
              img.onerror = null;
              img.src = buildInlineFallback(product.name);
            }}
          />
        </div>
      </div>

      {/* Details Section */}
      <div className="flex flex-1 flex-col p-4 sm:p-6">
        <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="w-full min-w-0 flex-1">
            <h3 className="mb-1 truncate text-xl font-black leading-tight tracking-tight text-white transition-colors group-hover:text-[#facc15]">{product.name}</h3>
            <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-all ${stockLabelClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${stockDotClass}`}></span>
              <span>{stockLabel}</span>
            </div>
          </div>
          <div className="w-full text-left sm:ml-4 sm:w-auto sm:text-right">
             <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{isTiered ? 'Range' : 'Starts at'}</p>
             <div className="flex items-center gap-1 sm:justify-end">
               <div className="w-1 h-1 rounded-full bg-[#facc15]"></div>
               <p className="text-lg font-black text-white sm:text-lg">
                 {isTiered ? `$${minTierPrice.toFixed(2)} - $${maxTierPrice.toFixed(2)}` : `$${product.price.toFixed(2)}`}
               </p>
             </div>
          </div>
        </div>

        <p className="mb-5 text-[10px] font-bold uppercase tracking-widest text-white/40 sm:mb-6">{product.duration} Access</p>

        {/* Status Pills */}
        <div className="mb-6 flex flex-wrap items-center gap-2 sm:mb-8">
           <div className="bg-[#facc15]/10 text-[#facc15] px-3 py-1.5 rounded-lg border border-[#facc15]/20 text-[9px] font-black uppercase tracking-widest group-hover:bg-[#facc15]/20 transition-colors">
             UNDETECTED
           </div>
           <div className="bg-white/5 text-white/60 px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest group-hover:border-white/20 transition-colors">
             {isOutOfStock ? 'RESTOCKING' : isTiered ? `${product.tiers?.length || 0} TIERS` : '100% SECURE'}
           </div>
        </div>

        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/70">
            Click anywhere to open
          </p>
        </div>
      </div>
    </button>
  );
};
