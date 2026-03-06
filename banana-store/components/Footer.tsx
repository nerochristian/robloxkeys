import React from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

interface FooterProps {
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenPrivacy, onOpenTerms }) => {
  const supportHref = String(BRAND_CONFIG.links.support || '#').trim() || '#';
  const discordHref = String(BRAND_CONFIG.links.discord || '').trim();
  const communityHref = discordHref && discordHref !== '#' ? discordHref : supportHref;

  return (
    <footer className="template-footer-slim">
      <div className="template-footer-slim__row">
        <div className="template-footer-slim__left">
          <span className="template-footer-brand">{BRAND_CONFIG.identity.storeName}</span>
          <span className="template-footer-sep">&bull;</span>
          <span className="template-footer-copy">Copyright &copy; {new Date().getFullYear()} {BRAND_CONFIG.identity.storeName}</span>
        </div>

        <div className="template-footer-slim__right">
          <button
            type="button"
            onClick={onOpenTerms}
            className="template-footer-link"
          >
            Terms of Service
          </button>
          <span className="template-footer-sep">&bull;</span>
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="template-footer-link"
          >
            Privacy Policy
          </button>
          <a
            href={communityHref}
            target="_blank"
            rel="noreferrer noopener"
            className="template-footer-icon-btn"
            aria-label="Discord"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
          <a
            href={supportHref}
            target="_blank"
            rel="noreferrer noopener"
            className="template-footer-icon-btn"
            aria-label="Support"
          >
            <Send className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </footer>
  );
};
