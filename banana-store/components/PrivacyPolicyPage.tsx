import React from 'react';
import { ArrowLeft, Database, Lock, ShieldCheck, UserCircle2 } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface PrivacyPolicyPageProps {
  onBack: () => void;
}

const EFFECTIVE_DATE = 'February 15, 2026';

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onBack }) => {
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
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#facc15] mb-3">Privacy Policy</p>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-4">
          Your Data, Locked Down.
        </h1>
        <p className="text-white/60 max-w-3xl">
          {BRAND_CONFIG.identity.storeName} only collects the minimum data needed to process orders, deliver products,
          and protect users from abuse.
        </p>
        <p className="text-white/30 text-sm mt-4">Effective date: {EFFECTIVE_DATE}</p>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <Database className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">What We Collect</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            Email address, order details, payment status metadata, and basic security logs. We do not store full card
            numbers or wallet private keys.
          </p>
        </article>

        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <ShieldCheck className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">How We Use It</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            Data is used for account access, product delivery, fraud prevention, support, and service reliability.
            We never sell your data to third parties.
          </p>
        </article>

        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <Lock className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">Security</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            We use secure API authentication, encrypted transport (HTTPS), and restricted operational access. Payment
            verification is performed by integrated providers.
          </p>
        </article>

        <article className="rounded-3xl border border-white/5 bg-[#0a0a0a] p-7">
          <div className="inline-flex items-center gap-2 mb-3 text-[#facc15]">
            <UserCircle2 className="w-4 h-4" />
            <h2 className="text-sm font-black uppercase tracking-widest">Your Rights</h2>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            You can request data correction or deletion where legally permitted. Contact support to submit a request.
            Abuse and fraud records may be retained for security.
          </p>
        </article>
      </div>

      <section className="rounded-3xl border border-yellow-500/20 bg-yellow-500/5 p-6 mt-6">
        <p className="text-sm text-white/80">
          Questions about privacy? Contact support here:{' '}
          <a
            href={BRAND_CONFIG.links.support}
            target="_blank"
            rel="noreferrer"
            className="text-[#facc15] font-bold hover:underline"
          >
            {BRAND_CONFIG.links.support}
          </a>
        </p>
      </section>
    </div>
  );
};

