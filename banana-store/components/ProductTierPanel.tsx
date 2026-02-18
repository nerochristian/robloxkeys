import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Product, ProductTier } from '../types';

interface ProductTierPanelProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSelectTier: (product: Product, tier: ProductTier) => void;
}

const buildInlineFallback = (name: string): string => {
  const initials = String(name || 'RK')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'RK';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="#030712"/></linearGradient></defs><rect width="320" height="220" rx="24" fill="url(#bg)"/><rect x="8" y="8" width="304" height="204" rx="18" fill="none" stroke="#facc15" stroke-opacity="0.35"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="82" font-weight="800" fill="#facc15">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const ProductTierPanel: React.FC<ProductTierPanelProps> = ({
  isOpen,
  product,
  onClose,
  onSelectTier,
}) => {
  const CLOSE_ANIMATION_MS = 360;
  const tiers = useMemo(() => (product?.tiers || []).filter((tier) => typeof tier === 'object'), [product]);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [hoveredTierId, setHoveredTierId] = useState<string>('');
  const [tierGlowPosition, setTierGlowPosition] = useState<Record<string, { x: number; y: number }>>({});
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const beginClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
      closeTimerRef.current = null;
    }, CLOSE_ANIMATION_MS);
  };

  const handleTierMouseMove = (tierId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setTierGlowPosition((prev) => {
      const existing = prev[tierId];
      if (existing && Math.abs(existing.x - x) < 0.5 && Math.abs(existing.y - y) < 0.5) return prev;
      return { ...prev, [tierId]: { x, y } };
    });
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setSelectedTierId('');
      setHoveredTierId('');
      setTierGlowPosition({});
      setIsClosing(false);
      return;
    }
    if (tiers.length > 0) {
      setSelectedTierId((current) => current || tiers[0].id);
    }
    setIsClosing(false);
  }, [isOpen, product?.id, tiers]);

  if (!isOpen || !product || tiers.length === 0) return null;

  const panelTitle = `${product.name}`;
  const activeTierId = hoveredTierId || selectedTierId;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-2 sm:items-center sm:p-8">
      <div
        className={`absolute inset-0 bg-black/85 [backdrop-filter:blur(0px)] [-webkit-backdrop-filter:blur(0px)] ${
          isClosing
            ? 'animate-[tierBackdropOut_380ms_cubic-bezier(0.4,0,0.2,1)_forwards]'
            : 'opacity-0 animate-[tierBackdropIn_620ms_cubic-bezier(0.22,1,0.36,1)_forwards]'
        }`}
        onClick={beginClose}
      />

      <div
        className={`relative w-full max-w-5xl overflow-hidden rounded-[22px] border border-white/10 bg-[#070a12] shadow-[0_40px_100px_rgba(0,0,0,0.72)] will-change-transform sm:rounded-[26px] ${
          isClosing
            ? 'animate-[tierPanelOut_420ms_cubic-bezier(0.4,0,0.2,1)_forwards]'
            : 'opacity-0 translate-y-12 animate-[tierPanelIn_700ms_cubic-bezier(0.16,1,0.3,1)_80ms_forwards]'
        }`}
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[80%] -translate-x-1/2 bg-yellow-500/10 blur-[100px]" />

        <div className="relative flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-4 sm:px-7">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{panelTitle}</h2>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200/70">
              Select your tier
            </p>
          </div>
          <button
            onClick={beginClose}
            className="rounded-xl border border-white/20 bg-white/[0.03] p-2 text-white/60 transition hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative max-h-[74vh] space-y-3 overflow-y-auto p-3 sm:max-h-[65vh] sm:p-6">
          {tiers.map((tier, index) => {
            const inStock = Number(tier.stock || 0) > 0;
            const isSelected = activeTierId === tier.id;
            const fallbackImage = buildInlineFallback(tier.name || product.name);
            const tierImage = tier.image || product.image || product.bannerImage || fallbackImage;
            const stockChipClass = inStock
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-red-400/30 bg-red-400/10 text-red-300';
            return (
              <button
                key={tier.id}
                onMouseEnter={() => setHoveredTierId(tier.id)}
                onMouseLeave={() => setHoveredTierId('')}
                onMouseMove={(event) => handleTierMouseMove(tier.id, event)}
                onFocus={() => setHoveredTierId(tier.id)}
                onClick={() => {
                  setSelectedTierId(tier.id);
                  onSelectTier(product, tier);
                  beginClose();
                }}
                style={
                  {
                    '--tier-glow-x': `${tierGlowPosition[tier.id]?.x ?? 220}px`,
                    '--tier-glow-y': `${tierGlowPosition[tier.id]?.y ?? 56}px`,
                  } as React.CSSProperties
                }
                className={`group relative w-full overflow-hidden rounded-2xl border p-2.5 text-left transition duration-300 focus:outline-none sm:p-3 ${
                  isSelected
                    ? 'border-[#facc15]/80 bg-[#11140c] shadow-[0_0_30px_rgba(250,204,21,0.2)]'
                    : 'border-white/10 bg-[#0d1118] hover:border-white/25 hover:bg-[#101522]'
                }`}
              >
                <div
                  className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                    isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{
                    background:
                      'radial-gradient(280px circle at var(--tier-glow-x) var(--tier-glow-y), rgba(250,204,21,0.22) 0%, rgba(250,204,21,0.11) 34%, rgba(250,204,21,0.03) 52%, transparent 72%)',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(250,204,21,0.0)_0%,rgba(250,204,21,0.08)_35%,rgba(250,204,21,0.0)_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                    <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black sm:h-20 sm:w-28">
                      <img
                        src={tierImage}
                        alt={tier.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          const img = e.currentTarget;
                          img.onerror = null;
                          img.src = fallbackImage;
                        }}
                      />
                      <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-black text-white">
                        {index + 1}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-black tracking-tight text-white sm:text-2xl">{tier.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black sm:text-sm ${stockChipClass}`}>
                          {inStock ? `${Number(tier.stock || 0)} in stock` : 'Out of stock'}
                        </span>
                        {(tier.duration || product.duration) && (
                          <span className="inline-flex rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-white/70 sm:text-sm">
                            {tier.duration || product.duration}
                          </span>
                        )}
                      </div>
                      {tier.description && (
                        <p className="mt-2 line-clamp-1 text-xs font-semibold text-white/50">{tier.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full items-center justify-between sm:w-auto sm:shrink-0 sm:justify-end sm:gap-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-2 sm:gap-3">
                      <p className="text-4xl font-black tracking-tight text-[#facc15] sm:text-3xl">${Number(tier.price || 0).toFixed(2)}</p>
                      {!!Number(tier.originalPrice || 0) && Number(tier.originalPrice || 0) > Number(tier.price || 0) && (
                        <p className="text-sm font-black text-white/35 line-through sm:text-sm">${Number(tier.originalPrice || 0).toFixed(2)}</p>
                      )}
                    </div>
                    <span className="rounded-xl border border-white/20 bg-white/5 p-2 text-white/70 transition group-hover:border-[#facc15]/40 group-hover:text-[#facc15]">
                      <ChevronRight className="h-5 w-5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="relative border-t border-white/10 bg-white/[0.02] px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-yellow-200/75 sm:px-7">
          Pick a tier to open full details.
        </div>
      </div>
    </div>
  );
};
