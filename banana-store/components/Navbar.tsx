import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface NavbarProps {
  cartCount: number;
  onCartClick: () => void;
  onAdminClick: () => void;
  onLogoClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount, onCartClick, onAdminClick, onLogoClick }) => {
  const openExternal = (url: string) => {
    if (!url || url === '#') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const navItemClass = 'rounded-full px-4 py-2 text-sm font-bold text-white/90 transition-all hover:bg-white/10 hover:text-white';

  return (
    <nav className="fixed left-0 top-0 z-50 w-full px-2 py-2 pointer-events-none sm:px-4 sm:py-4">
      <div className="mx-auto flex max-w-[1900px] items-center gap-3 px-1 py-1 pointer-events-auto">
        <button
          className="flex items-center justify-center"
          onClick={onLogoClick}
          aria-label="Home"
        >
          {BRAND_CONFIG.assets.logoUrl ? (
            <img
              src={BRAND_CONFIG.assets.logoUrl}
              alt={`${BRAND_CONFIG.identity.storeName} logo`}
              className="h-12 w-12 object-contain"
            />
          ) : (
            <span className="text-xl font-black text-white">RK</span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-1 py-1 backdrop-blur-xl sm:gap-2">
            <button onClick={onAdminClick} className={navItemClass}>
              Account
            </button>

            <button onClick={onLogoClick} className={`${navItemClass} hidden sm:inline-flex`}>
              Guides
            </button>

            <button
              onClick={() => openExternal(BRAND_CONFIG.links.discord === '#' ? BRAND_CONFIG.links.support : BRAND_CONFIG.links.discord)}
              className={`${navItemClass} hidden sm:inline-flex`}
            >
              Discord
            </button>

            <button onClick={() => (window.location.href = '/terms')} className={`${navItemClass} hidden sm:inline-flex`}>
              Terms
            </button>

            <button onClick={() => (window.location.href = '/privacy')} className={`${navItemClass} hidden sm:inline-flex`}>
              Privacy
            </button>
          </div>

          <button
            onClick={onCartClick}
            aria-label="Open cart"
            className="relative flex items-center justify-center rounded-full border border-white/10 bg-black/40 p-2.5 backdrop-blur-xl transition-all hover:bg-white/10"
          >
            <ShoppingCart className="h-5 w-5 text-white/80" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#facc15] text-[9px] font-black text-black">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
};
