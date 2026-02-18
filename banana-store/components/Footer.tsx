import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface FooterProps {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenPrivacy, onOpenTerms }) => {
  return (
    <footer className="relative overflow-hidden border-t border-white/5 bg-[#050505]/50 py-20 sm:py-32">
      {/* Subtle bottom glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-32 bg-yellow-500/5 blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-4 sm:px-6">
        <div className="group mb-8 flex cursor-pointer items-center gap-3 opacity-80 transition-opacity hover:opacity-100 sm:mb-10">
          <div className="bg-[#facc15] rounded-xl rotate-3 group-hover:rotate-0 transition-transform overflow-hidden">
            {BRAND_CONFIG.assets.logoUrl ? (
              <img
                src={BRAND_CONFIG.assets.logoUrl}
                alt={`${BRAND_CONFIG.identity.storeName} logo`}
                className="w-6 h-6 rounded object-cover"
              />
            ) : (
              <LayoutGrid className="w-6 h-6 text-black" strokeWidth={3} />
            )}
          </div>
          <span className="text-2xl font-black tracking-tighter text-white sm:text-3xl">{BRAND_CONFIG.identity.storeName}</span>
        </div>

        <p className="mb-8 max-w-sm text-center text-[10px] font-black uppercase leading-relaxed tracking-[0.25em] text-white/20 sm:mb-10 sm:text-[11px] sm:tracking-[0.4em]">
          {BRAND_CONFIG.copy.footerTagline}
        </p>

        <div className="flex flex-wrap justify-center gap-x-12 gap-y-4 text-[10px] font-black text-white/30 uppercase tracking-[0.25em]">
          <a
            href={BRAND_CONFIG.links.support}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[#facc15] transition-colors"
          >
            Contact Support
          </a>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="bg-transparent border-0 p-0 hover:text-[#facc15] transition-colors"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={onOpenTerms}
            className="bg-transparent border-0 p-0 hover:text-[#facc15] transition-colors"
          >
            Service Terms
          </button>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 w-full flex justify-center">
          <p className="text-white/10 text-[9px] font-bold uppercase tracking-[0.2em]">
            &copy; {new Date().getFullYear()} {BRAND_CONFIG.identity.storeName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
