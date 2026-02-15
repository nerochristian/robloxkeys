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

      <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-[#080a11] shadow-[0_0_80px_rgba(0,0,0,0.7)] opacity-0 translate-y-12 will-change-transform animate-[tierPanelIn_700ms_cubic-bezier(0.16,1,0.3,1)_80ms_forwards]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
          <h2 className="text-2xl font-black tracking-tight text-white">{panelTitle}</h2>
          <button onClick={onClose} className="rounded-lg border border-white/20 p-2 text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4 sm:p-6">
          {tiers.map((tier, index) => {
            const inStock = Number(tier.stock || 0) > 0;
            const isSelected = activeTierId === tier.id;
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
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  isSelected
                    ? 'border-[#facc15]/80 bg-[#10110b] shadow-[0_0_30px_rgba(250,204,21,0.2)]'
                    : 'border-white/10 bg-[#0d1118] hover:border-white/25'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-28 overflow-hidden rounded-xl border border-white/10 bg-black">
                    <img
                      src={tier.image || product.image}
                      alt={tier.name}
                      className="h-full w-full object-cover"
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
                    <div className="mt-1 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-black text-emerald-300">
                      {Number(tier.stock || 0)} in stock
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <p className="text-3xl font-black tracking-tight text-[#facc15]">${Number(tier.price || 0).toFixed(2)}</p>
                    <span className="rounded-xl border border-white/20 bg-white/5 p-2 text-white/70">
                      <ChevronRight className="h-5 w-5" />
                    </span>
                  </div>
                </div>
                {!inStock && (
                  <p className="mt-2 text-xs font-bold uppercase tracking-wider text-red-300">Out of stock</p>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-yellow-200/70 sm:px-7">
          Select a tier to open full details.
        </div>
      </div>
    </div>
  );
};
