import React from 'react';
import { BRAND_CONFIG } from '../config/brandConfig';

export const Hero: React.FC = () => {
  const supportHref = String(BRAND_CONFIG.links.support || '#').trim() || '#';
  const externalSupport = /^https?:\/\//i.test(supportHref);

  return (
    <section className="relative pt-32 pb-12 animate-reveal sm:pt-44 sm:pb-16 md:pt-52 md:pb-20">
      {BRAND_CONFIG.assets.bannerUrl && (
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img
            src={BRAND_CONFIG.assets.bannerUrl}
            alt={`${BRAND_CONFIG.identity.storeName} banner`}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
        <h1 className="mb-6 text-5xl font-black tracking-tighter brand-gradient-text sm:text-7xl md:mb-8 md:text-8xl">
          {BRAND_CONFIG.identity.storeName}
        </h1>
        
        <p className="mx-auto max-w-2xl text-xs font-medium uppercase leading-relaxed tracking-[0.14em] text-white/45 animate-slide-up sm:text-sm sm:tracking-[0.2em] md:text-base [animation-delay:200ms]">
          {BRAND_CONFIG.copy.heroTagline}
        </p>

        <div className="mx-auto mt-12 grid max-w-6xl gap-4 text-left sm:mt-16 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-md sm:p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#facc15]">Who We Are</h2>
            <p className="mt-3 text-xs font-semibold leading-relaxed text-white/70 sm:text-sm">
              We are a digital-access store focused on fast, clean delivery of premium account keys and licenses.
              Every order is built for instant fulfillment and simple vault management.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-md sm:p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#facc15]">Who We Serve</h2>
            <p className="mt-3 text-xs font-semibold leading-relaxed text-white/70 sm:text-sm">
              We serve players, resellers, and teams who need reliable key delivery, clear plan tiers, and a
              straightforward purchase flow on both desktop and mobile.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-black/35 p-5 backdrop-blur-md sm:p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#facc15]">How Our Products Work</h2>
            <p className="mt-3 text-xs font-semibold leading-relaxed text-white/70 sm:text-sm">
              These products are Roblox executor keys. Pick a tier, complete checkout, then receive your key inside
              your Member Vault.
            </p>
          </article>
        </div>

        <div className="mx-auto mt-6 max-w-6xl rounded-2xl border border-[#facc15]/30 bg-[#0b0b0b]/70 p-5 text-left backdrop-blur-md sm:mt-8 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#facc15]">Contact</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold leading-relaxed text-white/75 sm:text-sm">
              Need help before or after purchase? Contact our support team for order issues, tier guidance, and fast replacements.
            </p>
            <a
              href={supportHref}
              target={externalSupport ? '_blank' : undefined}
              rel={externalSupport ? 'noreferrer noopener' : undefined}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#facc15]/40 bg-[#facc15]/20 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#facc15] transition-all hover:bg-[#facc15]/30 sm:w-auto"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
