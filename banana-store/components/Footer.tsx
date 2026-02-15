import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface FooterProps {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenPrivacy, onOpenTerms }) => {
  return (
    <footer className="py-32 border-t border-white/5 bg-[#050505]/50 relative overflow-hidden">
      {/* Subtle bottom glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-32 bg-yellow-500/5 blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-6 flex flex-col items-center relative z-10">
        <div className="flex items-center gap-3 mb-10 group cursor-pointer opacity-80 hover:opacity-100 transition-opacity">
          <div className="bg-[#facc15] p-2 rounded-xl rotate-3 group-hover:rotate-0 transition-transform">
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
          <span className="text-3xl font-black tracking-tighter text-white">{BRAND_CONFIG.identity.storeName}</span>
        </div>
        
        <p className="text-white/20 text-[11px] font-black tracking-[0.4em] uppercase mb-10 text-center max-w-sm leading-relaxed">
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
