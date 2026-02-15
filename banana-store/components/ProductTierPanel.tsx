import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Product, ProductTier } from '../types';

interface ProductTierPanelProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSelectTier: (product: Product, tier: ProductTier) => void;
}

export const ProductTierPanel: React.FC<ProductTierPanelProps> = ({
  isOpen,
  product,
  onClose,
  onSelectTier,
}) => {
  const tiers = useMemo(() => (product?.tiers || []).filter((tier) => typeof tier === 'object'), [product]);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [hoveredTierId, setHoveredTierId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      setSelectedTierId('');
      setHoveredTierId('');
      return;
    }
    if (tiers.length > 0) {
      setSelectedTierId((current) => current || tiers[0].id);
    }
  }, [isOpen, product?.id, tiers]);

  if (!isOpen || !product || tiers.length === 0) return null;

  const panelTitle = `${product.name}`;
  const activeTierId = hoveredTierId || selectedTierId;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8">
      <div
        className="absolute inset-0 bg-black/85 opacity-0 [backdrop-filter:blur(0px)] [-webkit-backdrop-filter:blur(0px)] animate-[tierBackdropIn_620ms_cubic-bezier(0.22,1,0.36,1)_forwards]"
        onClick={onClose}
      />

      <div className="relative w-full max-w-5xl overflow-hidden rounded-[26px] border border-white/10 bg-[#070a12] shadow-[0_40px_100px_rgba(0,0,0,0.72)] opacity-0 translate-y-12 will-change-transform animate-[tierPanelIn_700ms_cubic-bezier(0.16,1,0.3,1)_80ms_forwards]">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[80%] -translate-x-1/2 bg-yellow-500/10 blur-[100px]" />

        <div className="relative flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white">{panelTitle}</h2>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-yellow-200/70">
              Select your tier
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/20 bg-white/[0.03] p-2 text-white/60 transition hover:border-white/40 hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative max-h-[65vh] space-y-3 overflow-y-auto p-4 sm:p-6">
          {tiers.map((tier, index) => {
            const inStock = Number(tier.stock || 0) > 0;
            const isSelected = activeTierId === tier.id;
            const stockChipClass = inStock
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-red-400/30 bg-red-400/10 text-red-300';
            return (
              <button
                key={tier.id}
                onMouseEnter={() => setHoveredTierId(tier.id)}
                onMouseLeave={() => setHoveredTierId('')}
                onFocus={() => setHoveredTierId(tier.id)}
                onBlur={() => setHoveredTierId('')}
                onClick={() => {
                  setSelectedTierId(tier.id);
                  onSelectTier(product, tier);
                  onClose();
                }}
                className={`group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition duration-300 focus:outline-none ${
                  isSelected
                    ? 'border-[#facc15]/80 bg-[#11140c] shadow-[0_0_30px_rgba(250,204,21,0.2)]'
                    : 'border-white/10 bg-[#0d1118] hover:border-white/25 hover:bg-[#101522]'
                }`}
              >
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(250,204,21,0.0)_0%,rgba(250,204,21,0.08)_35%,rgba(250,204,21,0.0)_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="relative flex items-center gap-4">
                  <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                    <img
                      src={tier.image || product.image}
                      alt={tier.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + tier.name;
                      }}
                    />
                    <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-black text-white">
                      {index + 1}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-2xl font-black tracking-tight text-white">{tier.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-black ${stockChipClass}`}>
                        {inStock ? `${Number(tier.stock || 0)} in stock` : 'Out of stock'}
                      </span>
                      {(tier.duration || product.duration) && (
                        <span className="inline-flex rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white/65">
                          {tier.duration || product.duration}
                        </span>
                      )}
                    </div>
                    {tier.description && (
                      <p className="mt-2 line-clamp-1 text-xs font-semibold text-white/50">{tier.description}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-3xl font-black tracking-tight text-[#facc15]">${Number(tier.price || 0).toFixed(2)}</p>
                    {!!Number(tier.originalPrice || 0) && Number(tier.originalPrice || 0) > Number(tier.price || 0) && (
                      <p className="text-sm font-black text-white/35 line-through">${Number(tier.originalPrice || 0).toFixed(2)}</p>
                    )}
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
