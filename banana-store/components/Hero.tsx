import React from 'react';
import { ArrowRight, ShoppingBag, Sparkles } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

export const Hero: React.FC = () => {
  const supportHref = String(BRAND_CONFIG.links.support || '#').trim() || '#';
  const externalSupport = /^https?:\/\//i.test(supportHref);

  return (
    <section className="relative overflow-hidden pt-32 pb-12 animate-reveal sm:pt-44 sm:pb-16 md:pt-52 md:pb-20">
      {BRAND_CONFIG.assets.bannerUrl && (
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img
            src={BRAND_CONFIG.assets.bannerUrl}
            alt={`${BRAND_CONFIG.identity.storeName} banner`}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-0 h-[360px]">
        <div className="hero-top-glow mx-auto h-full w-[min(860px,96vw)] rounded-full" />
      </div>
      <div className="relative z-10 mx-auto max-w-5xl px-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#facc15]/35 bg-[#facc15]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-100/90 backdrop-blur-sm sm:text-[11px]">
          <Sparkles className="h-3.5 w-3.5 text-[#facc15]" />
          Digital Product Store
        </div>

        <h1 className="mt-6 text-4xl font-black tracking-tight text-white sm:text-6xl md:text-7xl">
          <span className="block">Executor & Script</span>
          <span className="hero-spotlight-text block">Roblox Keys</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-sm font-semibold leading-relaxed text-white/70 sm:text-base md:text-xl">
          {BRAND_CONFIG.copy.heroTagline}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row">
          <a
            href="#products"
            className="hero-cta-glow inline-flex min-w-[210px] items-center justify-center gap-2 rounded-2xl border border-[#facc15]/50 bg-[#facc15] px-6 py-3 text-sm font-black text-black transition-all hover:-translate-y-0.5 hover:bg-[#eab308]"
          >
            <ShoppingBag className="h-4 w-4" />
            View Products
          </a>
          <a
            href={supportHref}
            target={externalSupport ? '_blank' : undefined}
            rel={externalSupport ? 'noreferrer noopener' : undefined}
            className="inline-flex min-w-[210px] items-center justify-center gap-2 rounded-2xl border border-white/15 bg-[#101010]/70 px-6 py-3 text-sm font-black text-white transition-all hover:-translate-y-0.5 hover:border-[#facc15]/35 hover:bg-[#171717]"
          >
            Join Discord
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
};
