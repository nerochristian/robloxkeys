
import React from 'react';
import { ShoppingCart, User, MessageCircle, LayoutGrid } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface NavbarProps {
  cartCount: number;
  onCartClick: () => void;
  onAdminClick: () => void;
  onLogoClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount, onCartClick, onAdminClick, onLogoClick }) => {
  return (
    <nav className="fixed top-0 left-0 z-50 w-full px-3 py-3 pointer-events-none sm:px-4 sm:py-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 pointer-events-auto sm:gap-4">
        <button
          className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/5 bg-black/40 px-3 py-2 shadow-2xl backdrop-blur-xl transition-all active:scale-95 group hover:border-yellow-400/30 sm:gap-3 sm:px-5"
          onClick={onLogoClick}
        >
          <div className="flex items-center justify-center rounded-lg bg-[#facc15] p-1.5 transition-transform rotate-3 group-hover:rotate-0">
            {BRAND_CONFIG.assets.logoUrl ? (
              <img
                src={BRAND_CONFIG.assets.logoUrl}
                alt={`${BRAND_CONFIG.identity.storeName} logo`}
                className="h-5 w-5 rounded-sm object-cover"
              />
            ) : (
              <LayoutGrid className="h-5 w-5 text-black" strokeWidth={3} />
            )}
          </div>
          <span className="hidden truncate text-xl font-black tracking-tighter text-white sm:block">{BRAND_CONFIG.identity.storeName}</span>
          <span className="text-sm font-black tracking-tight text-white sm:hidden">RK</span>
        </button>

        <div className="flex items-center justify-end gap-1.5 sm:gap-4">
          <button
            onClick={onAdminClick}
            className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/5 hover:text-white sm:px-0 sm:py-0"
            aria-label="Account"
          >
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">Account</span>
          </button>

          <button className="hidden items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/40 transition-colors hover:text-white sm:flex">
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Support</span>
          </button>

          <button
            onClick={onCartClick}
            className="flex items-center gap-2 rounded-xl bg-[#facc15] px-3 py-2 text-[11px] font-black uppercase tracking-tight text-black transition-all shadow-[0_0_20px_rgba(250,204,21,0.3)] hover:scale-105 hover:bg-[#eab308] sm:px-4"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="sm:hidden">{cartCount}</span>
            <span className="hidden sm:inline">Cart ({cartCount})</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
