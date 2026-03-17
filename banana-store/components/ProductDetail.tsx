import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Globe,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Star,
  XCircle,
  Zap,
} from 'lucide-react';
import { Product, ProductTier } from '../types';
import { BRAND_CONFIG } from '../config/brandConfig';

interface ProductDetailProps {
  product: Product;
  selectedTier?: ProductTier | null;
  onBack: () => void;
  onAddToCart: (product: Product, quantity: number, tier?: ProductTier) => void;
  onBuyNow: (product: Product, quantity: number, tier?: ProductTier) => void;
  onSelectTier?: (product: Product, tier: ProductTier) => void;
}

const ACCENT_RGB = '250,204,21';
const ACCENT_SECONDARY_RGB = '234,179,8';

const buildInlineFallback = (name: string): string => {
  const initials = String(name || 'RK')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'RK';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#09090f"/><stop offset="100%" stop-color="#05050a"/></linearGradient></defs><rect width="1200" height="675" fill="url(#bg)"/><rect x="24" y="24" width="1152" height="627" fill="none" stroke="#facc15" stroke-opacity="0.28" stroke-width="4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="220" font-weight="900" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const splitPlainTextBlocks = (value: string): string[] =>
  String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('\n')
        .trim()
    )
    .filter(Boolean);

const extractTextBlocks = (value: string): string[] => {
  const raw = String(value || '').trim();
  if (!raw) return [];
  if (!/[<>]/.test(raw)) return splitPlainTextBlocks(raw);

  const fallback = splitPlainTextBlocks(
    raw
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|blockquote|h[1-6]|pre)>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
  );

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return fallback;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${raw}</div>`, 'text/html');
    const wrapper = doc.body.firstElementChild;
    if (!wrapper) return fallback;

    const blocks = Array.from(wrapper.childNodes)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return String(node.textContent || '').trim();
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return '';
        }
        const element = node as HTMLElement;
        return String(element.innerText || element.textContent || '')
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .join('\n')
          .trim();
      })
      .filter(Boolean);

    return blocks.length > 0 ? blocks : fallback;
  } catch {
    return fallback;
  }
};

const totalTierStock = (tiers: ProductTier[]): number =>
  tiers.reduce((sum, tier) => sum + Math.max(0, Number(tier.stock || 0)), 0);

export const ProductDetail: React.FC<ProductDetailProps> = ({
  product,
  selectedTier = null,
  onBack,
  onAddToCart,
  onBuyNow,
  onSelectTier,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [quantityDirection, setQuantityDirection] = useState<'up' | 'down'>('up');
  const [quantityAnimationKey, setQuantityAnimationKey] = useState(0);
  const [openDescription, setOpenDescription] = useState(true);
  const [openHighlights, setOpenHighlights] = useState(true);

  const tiers = product.tiers || [];
  const isTiered = tiers.length > 0;
  const isTierView = Boolean(selectedTier);
  const tierPrices = tiers.map((tier) => Number(tier.price || 0)).filter((value) => value > 0);
  const minTierPrice = tierPrices.length > 0 ? Math.min(...tierPrices) : Number(product.price || 0);
  const maxTierPrice = tierPrices.length > 0 ? Math.max(...tierPrices) : Number(product.price || 0);
  const tierStockTotal = totalTierStock(tiers);
  const displayName = selectedTier ? `${product.name} ${selectedTier.name}` : product.name;
  const displayDuration = selectedTier?.duration || product.duration;
  const displayPrice = selectedTier ? Number(selectedTier.price || 0) : Number(product.price || 0);
  const displayOriginalPrice = selectedTier ? Number(selectedTier.originalPrice || 0) : Number(product.originalPrice || 0);
  const currentStock = selectedTier
    ? Math.max(0, Number(selectedTier.stock || 0))
    : isTiered
      ? tierStockTotal
      : Math.max(0, Number(product.stock || 0));
  const isOutOfStock = currentStock <= 0;
  const stockMeterWidth = isOutOfStock ? 0 : Math.max(12, Math.min(100, currentStock));
  const detailImage =
    product.bannerImage ||
    selectedTier?.image ||
    product.image ||
    product.cardBackdropImage ||
    buildInlineFallback(selectedTier?.name || product.name);
  const heroFallbackImage = buildInlineFallback(selectedTier?.name || product.name);
  const panelBackdrop =
    product.cardBackdropImage ||
    selectedTier?.image ||
    product.bannerImage ||
    product.image ||
    '';
  const savePercent =
    displayOriginalPrice > displayPrice && displayPrice > 0
      ? Math.round((1 - displayPrice / displayOriginalPrice) * 100)
      : 0;
  const usageNotice = (BRAND_CONFIG.copy.productUsageNotice || [])
    .map((line) => line.replace(/\{service\}/gi, product.type))
    .filter(Boolean);
  const descriptionBlocks = useMemo(() => {
    const buyPageBlocks = extractTextBlocks(String(product.buyPageDescription || ''));
    if (buyPageBlocks.length > 0) return buyPageBlocks;
    return extractTextBlocks(String(product.description || ''));
  }, [product.buyPageDescription, product.description]);
  const highlightRows = useMemo(() => {
    const detailed = (product.detailedDescription || []).map((line) => String(line || '').trim()).filter(Boolean);
    if (detailed.length > 0) return detailed;
    return (product.features || []).map((line) => String(line || '').trim()).filter(Boolean);
  }, [product.detailedDescription, product.features]);
  const trustChips = [
    {
      label: product.verified ? 'Verified Quality' : 'Store Checked',
      icon: CheckCircle2,
    },
    {
      label: product.instantDelivery === false ? 'Manual Delivery' : 'Instant Delivery',
      icon: Zap,
    },
    {
      label: isOutOfStock ? 'Restock Pending' : 'Fresh Stock',
      icon: ShieldCheck,
    },
  ];
  const discountTarget = 10;
  const remainingForDiscount = Math.max(0, discountTarget - quantity);
  const discountUnlocked = remainingForDiscount === 0;
  const directionAnimationClass =
    quantityDirection === 'up'
      ? 'animate-[qtySlideUp_420ms_cubic-bezier(0.22,1,0.36,1)]'
      : 'animate-[qtySlideDown_420ms_cubic-bezier(0.22,1,0.36,1)]';
  const quantityLocked = isTiered && !selectedTier;
  const quantityCap = quantityLocked ? 1 : Math.max(1, currentStock || 1);
  const stockToneClass = isOutOfStock
    ? 'border-red-400/35 bg-red-500/10 text-red-200'
    : currentStock < 10
      ? 'border-amber-300/35 bg-amber-400/10 text-amber-100'
      : 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100';
  const stockFillColor = isOutOfStock
    ? '#ef4444'
    : currentStock < 10
      ? '#f59e0b'
      : '#22c55e';
  const stockLabel = isOutOfStock
    ? 'Out of Stock'
    : product.hideStockCount
      ? 'In Stock'
      : `${currentStock} In Stock`;

  useEffect(() => {
    setQuantity(1);
    setQuantityDirection('up');
    setQuantityAnimationKey((prev) => prev + 1);
  }, [product.id, selectedTier?.id]);

  const updateQuantity = (nextQuantity: number) => {
    const clamped = Math.max(1, Math.min(quantityCap, nextQuantity));
    if (clamped === quantity) return;
    setQuantityDirection(clamped > quantity ? 'up' : 'down');
    setQuantity(clamped);
    setQuantityAnimationKey((prev) => prev + 1);
  };

  const renderHighlight = (feature: string, index: number) => {
    const isNegative = feature.startsWith('[x]') || feature.startsWith('!');
    const cleanText = isNegative ? feature.replace(/^(\[x\]|!)\s*/, '').trim() : feature.trim();
    const Icon = isNegative ? XCircle : CheckCircle2;
    const iconClass = isNegative ? 'text-red-400' : 'text-emerald-400';

    return (
      <div
        key={`${cleanText}-${index}`}
        className="flex items-start gap-4 rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3"
      >
        <div className="mt-0.5 rounded-full bg-white/5 p-1.5">
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-white/72">{cleanText}</p>
      </div>
    );
  };

  return (
    <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6 sm:pb-40 sm:pt-32">
      <div
        className="pointer-events-none absolute inset-x-0 top-4 -z-10 h-[34rem] blur-3xl"
        style={{
          background: `
            radial-gradient(56% 62% at 18% 18%, rgba(${ACCENT_RGB},0.22) 0%, rgba(${ACCENT_RGB},0.08) 38%, transparent 72%),
            radial-gradient(62% 70% at 82% 12%, rgba(${ACCENT_SECONDARY_RGB},0.18) 0%, rgba(${ACCENT_SECONDARY_RGB},0.06) 34%, transparent 70%)
          `,
        }}
      />

      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/45 transition-colors hover:text-white sm:mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Return to Catalog
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:gap-8">
        <div className="space-y-6">
          <div className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-[#07070c]/92 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `
                  radial-gradient(65% 55% at 20% 18%, rgba(${ACCENT_RGB},0.2) 0%, transparent 64%),
                  radial-gradient(68% 60% at 82% 16%, rgba(${ACCENT_SECONDARY_RGB},0.18) 0%, transparent 68%)
                `,
              }}
            />
            <div className="relative aspect-[16/10] sm:aspect-[16/9]">
              <img
                src={detailImage}
                alt={displayName}
                className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105"
                onError={(e) => {
                  const image = e.currentTarget;
                  image.onerror = null;
                  image.src = heroFallbackImage;
                }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,8,0.1)_0%,rgba(4,4,8,0.32)_34%,rgba(4,4,8,0.9)_100%)]" />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background: `
                    linear-gradient(135deg, rgba(${ACCENT_RGB},0.16) 0%, transparent 34%, transparent 100%),
                    linear-gradient(315deg, rgba(${ACCENT_SECONDARY_RGB},0.14) 0%, transparent 30%, transparent 100%)
                  `,
                }}
              />

              <div className="absolute left-5 top-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/80 backdrop-blur-md">
                  {product.type}
                </span>
                {displayDuration && (
                  <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/80 backdrop-blur-md">
                    {displayDuration}
                  </span>
                )}
                {product.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/85 backdrop-blur-md">
                    <Star className="h-3.5 w-3.5 fill-current text-[#fde047]" />
                    Featured
                  </span>
                )}
              </div>

              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
                <div className="max-w-2xl rounded-[28px] border border-white/10 bg-black/35 p-5 backdrop-blur-xl sm:p-6">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/55">
                    {product.cardBadgeLabel || 'Buy Page'}
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white sm:text-5xl">
                    {product.name}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm font-semibold leading-relaxed text-white/72 sm:text-base">
                    {selectedTier?.description || product.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.03] shadow-[0_24px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="divide-y divide-white/10">
              <div>
                <button
                  type="button"
                  onClick={() => setOpenDescription((value) => !value)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded-2xl border border-white/10 p-3"
                      style={{ background: `rgba(${ACCENT_RGB},0.12)` }}
                    >
                      <Globe className="h-5 w-5 text-white/80" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">Content</p>
                      <h3 className="text-lg font-black tracking-tight text-white">Product Description</h3>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-white/55 transition-transform ${openDescription ? 'rotate-180' : ''}`}
                  />
                </button>
                {openDescription && (
                  <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                    {descriptionBlocks.length > 0 ? (
                      descriptionBlocks.map((block, index) => (
                        <div
                          key={`description-${index}`}
                          className="rounded-[24px] border border-white/6 bg-white/[0.02] px-4 py-4"
                        >
                          <p className="whitespace-pre-line text-sm font-medium leading-7 text-white/72 sm:text-[15px]">
                            {block}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-white/6 bg-white/[0.02] px-4 py-4 text-sm font-medium leading-7 text-white/60">
                        Product description will appear here after you add it in the admin panel.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(highlightRows.length > 0 || usageNotice.length > 0) && (
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenHighlights((value) => !value)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                        <ShieldCheck className="h-5 w-5 text-white/80" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">Signals</p>
                        <h3 className="text-lg font-black tracking-tight text-white">Highlights</h3>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 shrink-0 text-white/55 transition-transform ${openHighlights ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {openHighlights && (
                    <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                      {highlightRows.map((feature, index) => renderHighlight(feature, index))}
                      {usageNotice.length > 0 && (
                        <div className="rounded-[24px] border border-white/6 bg-black/25 px-4 py-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/42">
                            Usage Notice
                          </p>
                          <div className="mt-3 space-y-2 text-xs font-bold uppercase leading-relaxed tracking-[0.16em] text-white/38">
                            {usageNotice.map((line, index) => (
                              <div key={`usage-${index}`}>{line}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#08080e]/94 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            {panelBackdrop && (
              <img
                src={panelBackdrop}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.12]"
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `
                  linear-gradient(180deg, rgba(9,9,15,0.66) 0%, rgba(9,9,15,0.9) 100%),
                  radial-gradient(72% 62% at 16% 12%, rgba(${ACCENT_RGB},0.15) 0%, transparent 60%)
                `,
              }}
            />

            <div className="relative p-6 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-3xl font-black leading-none tracking-[-0.05em] text-white sm:text-[2.35rem]">
                    {displayName}
                  </h1>
                  <p className="mt-3 text-sm font-semibold leading-relaxed text-white/68">
                    {selectedTier?.description || product.description}
                  </p>
                </div>
                {product.featured && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-2xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white"
                    style={{
                      borderColor: `rgba(${ACCENT_RGB},0.4)`,
                      background: `rgba(${ACCENT_RGB},0.12)`,
                      boxShadow: `0 0 24px rgba(${ACCENT_RGB},0.18)`,
                    }}
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                    Featured
                  </span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-3">
                <div className="text-4xl font-black tracking-[-0.05em] text-white sm:text-5xl">
                  {isTierView
                    ? `$${displayPrice.toFixed(2)}`
                    : isTiered
                      ? `$${minTierPrice.toFixed(2)} - $${maxTierPrice.toFixed(2)}`
                      : `$${Number(product.price || 0).toFixed(2)}`}
                </div>
                {isTierView && displayOriginalPrice > displayPrice && (
                  <div className="pb-1 text-lg font-bold text-white/35 line-through">
                    ${displayOriginalPrice.toFixed(2)}
                  </div>
                )}
              </div>
              {savePercent > 0 && (
                <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-300/90">
                  Save {savePercent}% on this tier
                </p>
              )}

              <div className="mt-6">
                <div className="flex items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
                  <span>Stock Status</span>
                  <span className={`rounded-full border px-3 py-1 text-[10px] ${stockToneClass}`}>{stockLabel}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${stockMeterWidth}%`,
                      background: stockFillColor,
                      boxShadow: `0 0 20px ${stockFillColor}`,
                    }}
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {trustChips.map(({ label, icon: Icon }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/72"
                  >
                    <Icon className="h-3.5 w-3.5 text-white/55" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[#09090f]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-6">
            {isTiered && (
              <div className="mb-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/45">Variants</p>
                    <h3 className="mt-1 text-lg font-black tracking-tight text-white">Choose a Tier</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/72">
                    {selectedTier ? selectedTier.name : 'Select one'}
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {tiers.map((tier) => {
                    const inStock = Number(tier.stock || 0) > 0;
                    const active = selectedTier?.id === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => onSelectTier?.(product, tier)}
                        className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
                          active
                            ? 'border-white/30 bg-white/[0.08] shadow-[0_0_28px_rgba(250,204,21,0.16)]'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-white">{tier.name}</p>
                            {(tier.description || tier.duration || product.duration) && (
                              <p className="mt-1 truncate text-xs font-semibold text-white/55">
                                {tier.description || tier.duration || product.duration}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black tracking-tight text-white">${Number(tier.price || 0).toFixed(2)}</p>
                            <p className={`mt-1 text-[10px] font-black uppercase tracking-[0.16em] ${inStock ? 'text-emerald-300/80' : 'text-red-300/80'}`}>
                              {inStock ? `${Number(tier.stock || 0)} in stock` : 'Out'}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!selectedTier && (
                  <p className="mt-3 text-xs font-semibold leading-relaxed text-white/48">
                    Pick a tier above to lock the exact price, quantity, and stock for checkout.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-[26px] border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="mb-5">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-white/42">
                  Quantity
                </label>
                <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-black/50 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => updateQuantity(quantity - 1)}
                    disabled={quantityLocked || quantity <= 1}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/35 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-white/35"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span
                    key={`${quantity}-${quantityAnimationKey}`}
                    className={`inline-block text-2xl font-black text-white ${directionAnimationClass}`}
                  >
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(quantity + 1)}
                    disabled={quantityLocked || isOutOfStock || quantity >= quantityCap}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-white/35 transition hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-white/35"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  disabled={isOutOfStock}
                  onClick={() => onAddToCart(product, quantity, selectedTier || undefined)}
                  className="flex w-full items-center justify-center gap-3 rounded-[20px] py-4 text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_14px_34px_rgba(250,204,21,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: `linear-gradient(90deg, rgba(${ACCENT_RGB},1) 0%, rgba(${ACCENT_SECONDARY_RGB},1) 100%)` }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Add to Cart
                </button>
                <button
                  disabled={isOutOfStock}
                  onClick={() => onBuyNow(product, quantity, selectedTier || undefined)}
                  className="flex w-full items-center justify-center gap-3 rounded-[20px] border border-white/10 bg-white/[0.05] py-4 text-xs font-black uppercase tracking-[0.18em] text-white/92 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Zap className="h-4 w-4 text-[#facc15]" />
                  Buy Now
                </button>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: `rgba(${ACCENT_RGB},0.14)` }}
              >
                <RefreshCw className="h-5 w-5 text-white/80" />
              </div>
              <p className="text-[11px] font-bold uppercase leading-relaxed tracking-[0.12em] text-white/48">
                {discountUnlocked ? (
                  <>
                    <span className="text-white">Discount unlocked.</span> <span className="text-[#facc15]">3% off</span> active.
                  </>
                ) : (
                  <>
                    Add{' '}
                    <span
                      key={`remaining-${remainingForDiscount}-${quantityAnimationKey}`}
                      className={`inline-block text-white ${directionAnimationClass}`}
                    >
                      {remainingForDiscount}
                    </span>{' '}
                    more item{remainingForDiscount === 1 ? '' : 's'} to unlock <span className="text-[#facc15]">3% off</span> at {discountTarget} units.
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
