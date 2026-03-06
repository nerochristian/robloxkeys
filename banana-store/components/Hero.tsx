import React from 'react';
import { ArrowRight, ShieldCheck, ShoppingBag, Sparkles, Star, Zap } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brandConfig';

export const Hero: React.FC = () => {
  const supportHref = String(BRAND_CONFIG.links.support || '#').trim() || '#';
  const externalSupport = /^https?:\/\//i.test(supportHref);
  const starfield = React.useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => ({
        id: `star-${index}`,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${(Math.random() * 3).toFixed(2)}s`,
        duration: `${(3 + Math.random() * 2.7).toFixed(2)}s`,
      })),
    []
  );

  return (
    <section className="template-hero">
      {BRAND_CONFIG.assets.bannerUrl && (
        <div className="template-hero__banner absolute inset-0 pointer-events-none">
          <img
            src={BRAND_CONFIG.assets.bannerUrl}
            alt={`${BRAND_CONFIG.identity.storeName} banner`}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="template-hero__bg-overlay" />
      <div className="template-hero__bottom-gradient" />
      <div className="template-hero__starfield" aria-hidden="true">
        {starfield.map((star) => (
          <span
            key={star.id}
            className="template-hero__star"
            style={{
              left: star.left,
              top: star.top,
              animationDelay: star.delay,
              animationDuration: star.duration,
            }}
          />
        ))}
      </div>
      <div className="template-hero__blob template-hero__blob--one" />
      <div className="template-hero__blob template-hero__blob--two" />
      <div className="template-hero__blob template-hero__blob--three" />

      <div className="template-hero__container">
        <div className="template-hero__badge">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Premium Digital Products</span>
        </div>

        <h1 className="template-hero__title">
          <span className="template-hero__title-line">Experience Quality with</span>
          <span className="template-hero__title-accent">{BRAND_CONFIG.identity.storeName}</span>
        </h1>

        <p className="template-hero__subtitle">
          {BRAND_CONFIG.copy.heroTagline}
        </p>

        <div className="template-hero__tags" aria-label="Store strengths">
          <span className="template-hero__tag">
            <Star className="h-3.5 w-3.5" />
            High Quality
          </span>
          <span className="template-hero__tag">
            <Zap className="h-3.5 w-3.5" />
            Instant Delivery
          </span>
          <span className="template-hero__tag">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified Products
          </span>
          <span className="template-hero__tag">
            <Sparkles className="h-3.5 w-3.5" />
            24/7 Support
          </span>
        </div>

        <div className="template-hero__ctas">
          <a
            href="#products"
            className="template-hero__cta template-hero__cta--secondary"
          >
            <ShoppingBag className="h-4 w-4" />
            Browse Products
          </a>
          <a
            href={supportHref}
            target={externalSupport ? '_blank' : undefined}
            rel={externalSupport ? 'noreferrer noopener' : undefined}
            className="template-hero__cta template-hero__cta--primary"
          >
            Join Discord
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      <a href="#products" className="template-hero__scroll-indicator">
        <span className="template-hero__scroll-mouse">
          <span className="template-hero__scroll-dot" />
        </span>
        <span>Scroll</span>
      </a>
    </section>
  );
};
