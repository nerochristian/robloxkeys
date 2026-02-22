import React from 'react';
import { KeyRound, LayoutGrid, Shield, Star } from 'lucide-react';
import { Product, ServiceType } from '../types';

interface ProductCardProps {
  product: Product;
  onView: (product: Product) => void;
  onBuyNow: (product: Product, quantity?: number) => void;
  themeBlend?: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onView, themeBlend = 0.62 }) => {
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
  const fallbackImage = React.useMemo(() => buildInlineFallback(product.name), [product.name]);
  const cardBackground = String(product.bannerImage || '').trim();
  const imageCandidates = React.useMemo(() => {
    const items = [
      // Product cards should use product image only (never tier images).
      product.image,
      // Intentionally do NOT use bannerImage as a card-icon fallback.
      // Banner assets are wide and look wrong inside the circular logo frame.
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return Array.from(new Set(items));
  }, [product.image]);
  const [imageCandidateIndex, setImageCandidateIndex] = React.useState(0);

  React.useEffect(() => {
    setImageCandidateIndex(0);
  }, [imageCandidates]);

  const currentImage = imageCandidates[imageCandidateIndex] || fallbackImage;
  
  const getHeaderGradientStyle = (type: ServiceType): React.CSSProperties => {
    const blend = Math.max(0, Math.min(1, Number(themeBlend) || 0));
    const variantByType: Record<ServiceType, [number, number, number]> = {
      [ServiceType.NETFLIX]: [253, 224, 71],
      [ServiceType.DISNEY]: [252, 211, 77],
      [ServiceType.CRUNCHYROLL]: [250, 204, 21],
      [ServiceType.BUNDLE]: [250, 204, 21],
      [ServiceType.OTHER]: [250, 204, 21],
    };
    const [r, g, b] = variantByType[type] || variantByType[ServiceType.OTHER];
    const startR = Math.round(r * blend);
    const startG = Math.round(g * blend);
    const startB = Math.round(b * blend);
    const midR = Math.round(r * blend * 0.62);
    const midG = Math.round(g * blend * 0.62);
    const midB = Math.round(b * blend * 0.62);
    const startA = 0.94;
    const midA = 0.38 + blend * 0.18;
    const endA = 0.98;

    switch (type) {
      case ServiceType.NETFLIX:
      case ServiceType.DISNEY:
      case ServiceType.CRUNCHYROLL:
      case ServiceType.BUNDLE:
      default:
        return {
          background: `linear-gradient(135deg, rgba(${startR},${startG},${startB},${startA}) 0%, rgba(${midR},${midG},${midB},${midA}) 48%, rgba(8,8,8,${endA}) 100%)`,
        };
    }
  };

  return (
    <button
      type="button"
      onClick={() => onView(product)}
      className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-[#0a0a0a]/80 text-left backdrop-blur-md transition-all duration-500 card-glow group md:flex-row"
    >
      {cardBackground && (
        <div className="pointer-events-none absolute inset-0">
          <img
            src={cardBackground}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-[0.16] saturate-125 contrast-105"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,0,0,0.86)_0%,rgba(0,0,0,0.72)_44%,rgba(0,0,0,0.9)_100%)]" />
        </div>
      )}

      {/* Featured Badge Overlay */}
      {product.featured && (
        <div className="absolute top-4 right-4 z-10 bg-[#facc15]/90 text-black p-2 rounded-xl shadow-[0_0_20px_rgba(250,204,21,0.35)] animate-pulse">
          <Star className="w-3.5 h-3.5 fill-current" />
        </div>
      )}

      {/* Visual Header - 16:9 */}
      <div
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden border-b border-white/5 md:aspect-square md:w-[42%] md:border-b-0 md:border-r"
        style={getHeaderGradientStyle(product.type)}
      >
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
            src={currentImage} 
            alt={product.name} 
            className="w-16 h-16 md:w-20 md:h-20 object-contain opacity-95 drop-shadow-2xl" 
            onError={(e) => {
              const img = e.currentTarget;
              if (imageCandidateIndex < imageCandidates.length - 1) {
                setImageCandidateIndex((prev) => prev + 1);
                return;
              }
              img.onerror = null;
              img.src = fallbackImage;
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
