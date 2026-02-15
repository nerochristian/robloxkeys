import React from 'react';
import { AlertTriangle, ArrowLeft, BadgeCheck, CreditCard, PackageCheck, Scale } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface ServiceTermsPageProps {
  onBack: () => void;
}

const EFFECTIVE_DATE = 'February 15, 2026';

export const ServiceTermsPage: React.FC<ServiceTermsPageProps> = ({ onBack }) => {
  return (
    <div className="max-w-7xl mx-auto px-6 pt-32 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex items-center gap-2 text-white/40 hover:text-white transition-colors uppercase tracking-widest text-[10px] font-black"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Store
      </button>

      <section className="rounded-[40px] border border-white/5 bg-[#0a0a0a] p-8 md:p-12 mb-8 relative overflow-hidden">
        <div className="absolute -top-24 right-0 w-80 h-80 bg-yellow-500/10 blur-[140px] pointer-events-none" />
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#facc15] mb-3">Service Terms</p>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-4">
          Clear Rules. Zero Confusion.
        </h1>
        <p className="text-white/60 max-w-3xl">
          By using {BRAND_CONFIG.identity.storeName}, you agree to the terms below for purchases, delivery, account
          use, and dispute handling.
        </p>
        <p className="text-white/30 text-sm mt-4">Effective date: {EFFECTIVE_DATE}</p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <BadgeCheck className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">Eligibility</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            You must provide accurate checkout details and use the service lawfully. Shared, stolen, or fake identity
            details may result in immediate suspension.
          </p>
        </article>

        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <PackageCheck className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">Delivery</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            Digital goods are delivered after payment confirmation. Delivery timing may vary with network status,
            provider checks, and fraud protection steps.
          </p>
        </article>

        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <CreditCard className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">Payments & Refunds</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            All sales are for digital items. Refunds are evaluated case-by-case for invalid, non-delivered, or duplicate
            orders. Chargeback abuse may lead to permanent blacklist actions.
          </p>
        </article>

        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">Restrictions</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            Reselling, credential dumping, automation abuse, and any malicious use of purchased products are prohibited.
            Violations can void support and replacement eligibility.
          </p>
        </article>
      </div>

      <section className="rounded-3xl border border-yellow-500/20 bg-yellow-500/5 p-6 mt-6">
        <div className="inline-flex items-center gap-2 mb-2 text-[#facc15]">
          <Scale className="w-4 h-4" />
          <h3 className="text-sm font-black uppercase tracking-widest">Policy Updates</h3>
        </div>
        <p className="text-sm text-white/80">
          We may update these terms for legal, product, or risk reasons. Continued use of the service after updates
          means you accept the revised terms.
        </p>
      </section>
    </div>
  );
};

