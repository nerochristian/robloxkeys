import React from 'react';
import { Search, X } from 'lucide-react';
import { Product } from '../types';
import { ProductCard } from './ProductCard';

interface ProductListProps {
  products: Product[];
  onView: (product: Product) => void;
  onBuyNow: (product: Product, quantity?: number) => void;
  themeBlend?: number;
}

export const ProductList: React.FC<ProductListProps> = ({ products, onView, onBuyNow, themeBlend = 0.62 }) => {
  const [query, setQuery] = React.useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const filteredProducts = React.useMemo(() => {
    if (!normalizedQuery) return products;
    return products.filter((product) => {
      const haystack = [
        product.name,
        product.description,
        product.duration,
        product.type,
        ...(product.features || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, products]);

  const showNoMatch = products.length > 0 && filteredProducts.length === 0;

  return (
    <section id="products" className="template-products px-4 pb-24 sm:px-6 sm:pb-32">
      <div className="mx-auto max-w-7xl">
        <div className="template-section-title">
          <h2>
            The <span className="template-section-title__accent">Goods</span>
          </h2>
        </div>
        <div className="template-section-subtitle">
          <p>Quality stuff that actually matters.</p>
        </div>

        <div className="template-search-container">
          <div className="template-search-wrapper">
            <span className="template-search-accent" aria-hidden="true" />
            <span className="template-search-icon" aria-hidden="true">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="template-search-input"
              placeholder="Search products"
              aria-label="Search products"
            />
            {query && (
              <button
                type="button"
                className="template-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:gap-8 lg:grid-cols-2">
          {filteredProducts.map((product, index) => (
            <div key={product.id} className="animate-reveal" style={{ animationDelay: `${index * 100}ms` }}>
              <ProductCard 
                product={product} 
                onView={onView}
                onBuyNow={onBuyNow}
                themeBlend={themeBlend}
              />
            </div>
          ))}
          {products.length === 0 && (
            <div className="col-span-full text-center py-32 rounded-[40px] border border-dashed border-white/5 animate-fade-in">
              <p className="text-white/20 font-black tracking-[0.2em] uppercase text-xs">Inventory is currently empty</p>
            </div>
          )}
          {showNoMatch && (
            <div className="col-span-full text-center py-20 rounded-[30px] border border-dashed border-[#facc15]/25 bg-[#facc15]/[0.03] animate-fade-in">
              <p className="text-white/40 font-black tracking-[0.18em] uppercase text-[11px]">No products found for "{query}"</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
