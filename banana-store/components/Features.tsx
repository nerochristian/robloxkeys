import React from 'react';
import { Zap, Shield, Headphones } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

export const Features: React.FC = () => {
  const supportHref = String(BRAND_CONFIG.links.support || '#').trim() || '#';
  const externalSupport = /^https?:\/\//i.test(supportHref);
  const features = [
    {
      icon: <Zap className="h-6 w-6 text-[#facc15]" />,
      title: 'Who We Are',
      description: 'We run a Roblox executor key store built for fast delivery, secure checkout, and dependable key access.'
    },
    {
      icon: <Shield className="h-6 w-6 text-[#facc15]" />,
      title: 'Who We Serve',
      description: 'Designed for Roblox users, resellers, and teams who need clear tiers, stable keys, and responsive support.'
    },
    {
      icon: <Headphones className="h-6 w-6 text-[#facc15]" />,
      title: 'How Our Products Work',
      description: 'Choose a tier, complete payment, and your Roblox executor key is delivered instantly to your Member Vault.'
    }
  ];

  return (
    <section id="features" className="relative overflow-hidden px-4 pb-20 pt-8 sm:px-6 sm:pb-28 sm:pt-12">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-5xl">
            Why Choose <span className="text-[#facc15]">{BRAND_CONFIG.identity.storeName}</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-semibold leading-relaxed text-white/60 sm:text-base">
            Instant key delivery, secure checkout, and direct support for your Roblox executor key needs.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {features.map((feature, index) => (
            <article
              key={index}
              className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,20,0.95),rgba(16,16,16,0.96))] p-6 transition-all duration-300 hover:border-[#facc15]/40 hover:shadow-[0_0_45px_rgba(250,204,21,0.08)] sm:p-7"
            >
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-[#facc15]/30 bg-[#facc15]/10">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-black tracking-tight text-white">{feature.title}</h3>
              <p className="mt-3 text-base font-medium leading-relaxed text-white/60">{feature.description}</p>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-5 max-w-7xl rounded-2xl border border-[#facc15]/30 bg-[#0b0b0b]/70 p-5 text-center backdrop-blur-md sm:mt-6 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#facc15]">Contact</p>
          <div className="mt-3 flex flex-col items-center gap-4">
            <p className="max-w-3xl text-xs font-semibold leading-relaxed text-white/75 sm:text-sm">
              Need help before or after purchase? Contact support for order issues, tier guidance, or key delivery help.
            </p>
            <a
              href={supportHref}
              target={externalSupport ? '_blank' : undefined}
              rel={externalSupport ? 'noreferrer noopener' : undefined}
              className="inline-flex min-w-[200px] items-center justify-center rounded-xl border border-[#facc15]/40 bg-[#facc15]/20 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#facc15] transition-all hover:bg-[#facc15]/30"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
