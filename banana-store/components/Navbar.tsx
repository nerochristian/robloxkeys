import React from 'react';
import { Menu, ShoppingCart, X } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface NavbarProps {
  cartCount: number;
  onCartClick: () => void;
  onAdminClick: () => void;
  onLogoClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ cartCount, onCartClick, onAdminClick, onLogoClick }) => {
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setLogoFailed(false);
  }, [BRAND_CONFIG.assets.logoUrl]);

  React.useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openExternal = (url: string) => {
    if (!url || url === '#') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const navigateTo = (path: string) => {
    window.location.href = path;
  };

  const goHome = () => {
    onLogoClick();
    setMobileOpen(false);
  };

  const goProducts = () => {
    if (window.location.pathname !== '/') {
      onLogoClick();
      window.setTimeout(() => {
        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } else {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMobileOpen(false);
  };

  const goGuides = () => {
    if (window.location.pathname !== '/') {
      onLogoClick();
      window.setTimeout(() => {
        document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    } else {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setMobileOpen(false);
  };

  const navLinkClass =
    'template-nav-link rounded-xl px-3 py-2 text-sm font-bold text-white/85 transition-colors hover:text-white';
  const navActionClass =
    'template-nav-btn inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.08em]';

  return (
    <header className={`template-header ${isScrolled ? 'is-scrolled' : ''}`}>
      <nav className="template-navbar">
        <div className="template-navbar__brand">
          <button
            className="template-brand-btn"
            onClick={goHome}
            aria-label="Home"
          >
            {BRAND_CONFIG.assets.logoUrl && !logoFailed ? (
              <img
                src={BRAND_CONFIG.assets.logoUrl}
                alt={`${BRAND_CONFIG.identity.storeName} logo`}
                className="h-9 w-9 rounded-lg object-cover"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <span className="template-brand-fallback">RK</span>
            )}
            <span className="template-brand-text">{BRAND_CONFIG.identity.storeName}</span>
          </button>
        </div>

        <ul className="template-navbar__links">
          <li><button type="button" className={navLinkClass} onClick={goHome}>Home</button></li>
          <li><button type="button" className={navLinkClass} onClick={goProducts}>Products</button></li>
          <li><button type="button" className={navLinkClass} onClick={goGuides}>Guides</button></li>
          <li><button type="button" className={navLinkClass} onClick={() => navigateTo('/terms')}>Terms</button></li>
          <li><button type="button" className={navLinkClass} onClick={() => navigateTo('/privacy')}>Privacy</button></li>
        </ul>

        <div className="template-navbar__actions">
          <button
            type="button"
            onClick={() => openExternal(BRAND_CONFIG.links.discord === '#' ? BRAND_CONFIG.links.support : BRAND_CONFIG.links.discord)}
            className={`${navActionClass} template-nav-btn--secondary hidden md:inline-flex`}
          >
            Discord
          </button>
          <button
            type="button"
            onClick={onAdminClick}
            className={`${navActionClass} template-nav-btn--primary hidden md:inline-flex`}
          >
            Account
          </button>
          <button
            onClick={onCartClick}
            aria-label="Open cart"
            className="template-cart-btn group relative flex items-center justify-center"
          >
            <ShoppingCart className="h-[18px] w-[18px] text-white/85 transition-transform duration-300 ease-out group-hover:scale-110" />
            {cartCount > 0 && (
              <span className="template-cart-badge absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black text-black">
                {cartCount > 9 ? '9+' : cartCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            className="template-mobile-toggle inline-flex md:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      <div className={`template-mobile-menu ${mobileOpen ? 'is-open' : ''}`}>
        <div className="template-mobile-menu__content">
          <button type="button" className={navLinkClass} onClick={goHome}>Home</button>
          <button type="button" className={navLinkClass} onClick={goProducts}>Products</button>
          <button type="button" className={navLinkClass} onClick={goGuides}>Guides</button>
          <button type="button" className={navLinkClass} onClick={() => navigateTo('/terms')}>Terms</button>
          <button type="button" className={navLinkClass} onClick={() => navigateTo('/privacy')}>Privacy</button>
          <div className="template-mobile-menu__actions">
            <button
              type="button"
              onClick={() => {
                openExternal(BRAND_CONFIG.links.discord === '#' ? BRAND_CONFIG.links.support : BRAND_CONFIG.links.discord);
                setMobileOpen(false);
              }}
              className={`${navActionClass} template-nav-btn--secondary w-full`}
            >
              Discord
            </button>
            <button
              type="button"
              onClick={() => {
                onAdminClick();
                setMobileOpen(false);
              }}
              className={`${navActionClass} template-nav-btn--primary w-full`}
            >
              Account
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
