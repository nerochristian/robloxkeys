
import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, CreditCard, Wallet, Bitcoin, CheckCircle2, Shield } from 'lucide-react';
import { CartItem, Product } from '../types';
import type { Order, User } from '../services/storageService';
import { ShopApiService } from '../services/shopApiService';

interface CheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currentUser: User | null;
  settings: import('../types').AdminSettings;
  onSuccess: (updatedProducts?: Product[]) => void;
}

const SUCCESS_ANIMATION_MS = 2500;
const SUCCESS_ANIMATION_EXIT_MS = 350;

export const Checkout: React.FC<CheckoutProps> = ({ isOpen, onClose, items, currentUser, settings, onSuccess }) => {
  const [step, setStep] = useState<'details' | 'payment' | 'processing' | 'success'>('details');
  const [processingPhase, setProcessingPhase] = useState('Verifying Transaction...');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'crypto' | 'paypal'>('card');
  const [error, setError] = useState('');
  const [updatedProducts, setUpdatedProducts] = useState<Product[] | undefined>(undefined);
  const [successPhase, setSuccessPhase] = useState<'launch' | 'routing'>('launch');
  const [successProgressArmed, setSuccessProgressArmed] = useState(false);
  const [methodAvailability, setMethodAvailability] = useState<{
    card: { enabled: boolean; automated: boolean };
    paypal: { enabled: boolean; automated: boolean };
    crypto: { enabled: boolean; automated: boolean };
  }>({
    card: { enabled: false, automated: true },
    paypal: { enabled: false, automated: false },
    crypto: { enabled: false, automated: false },
  });

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    if (!isOpen) return;
    ShopApiService.getPaymentMethods()
      .then((methods) => {
        setMethodAvailability(methods);
      })
      .catch((methodsError) => {
        console.warn('Failed to load payment method availability:', methodsError);
        setMethodAvailability({
          card: { enabled: false, automated: true },
          paypal: { enabled: false, automated: false },
          crypto: { enabled: false, automated: false },
        });
      });
  }, [isOpen]);

  useEffect(() => {
    if (step !== 'success') return;
    setSuccessPhase('launch');
    setSuccessProgressArmed(false);

    const armTimer = window.setTimeout(() => setSuccessProgressArmed(true), 40);
    const phaseTimer = window.setTimeout(() => setSuccessPhase('routing'), SUCCESS_ANIMATION_MS);
    const closeTimer = window.setTimeout(() => {
      onSuccess(updatedProducts);
      onClose();
    }, SUCCESS_ANIMATION_MS + SUCCESS_ANIMATION_EXIT_MS);

    return () => {
      window.clearTimeout(armTimer);
      window.clearTimeout(phaseTimer);
      window.clearTimeout(closeTimer);
    };
  }, [step, updatedProducts, onSuccess, onClose]);

  const handleCheckout = () => {
    if (!currentUser) return;
    if (paymentMethod === 'card' && !methodAvailability.card.enabled) {
      setError('Card payments are not configured yet. Set STRIPE_SECRET_KEY on your API.');
      setStep('payment');
      return;
    }
    if (paymentMethod === 'paypal' && !methodAvailability.paypal.enabled) {
      setError('PayPal is not configured yet. Set PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET, or set PAYPAL_CHECKOUT_URL (or Settings > PayPal email/pay link).');
      setStep('payment');
      return;
    }
    if (paymentMethod === 'crypto' && !methodAvailability.crypto.enabled) {
      setError('Crypto checkout is not configured yet. Set OXAPAY_MERCHANT_API_KEY on your API.');
      setStep('payment');
      return;
    }

    setError('');
    setStep('processing');

    // Multi-phase security simulation
    setTimeout(() => setProcessingPhase('Encrypting Order Metadata...'), 800);
    setTimeout(() => setProcessingPhase('Securing Premium Licenses...'), 1600);

    setTimeout(async () => {
      const order: Order = {
        id: `ord-${Date.now()}`,
        userId: currentUser.id,
        items: [...items],
        total,
        status: 'pending',
        createdAt: new Date().toISOString(),
        credentials: {}
      };

      try {
        const successUrl = `${window.location.origin}${window.location.pathname}`;
        const cancelUrl = `${window.location.origin}${window.location.pathname}`;
        const payment = await ShopApiService.createPayment(order, paymentMethod, successUrl, cancelUrl);

        if (!payment.ok) {
          throw new Error('Failed to create payment session.');
        }

        // Card always redirects. PayPal redirects only when automated mode is active.
        if (paymentMethod === 'card' || ((paymentMethod === 'paypal' || paymentMethod === 'crypto') && !payment.manual)) {
          if (!payment.checkoutUrl) {
            throw new Error(`Failed to create ${paymentMethod} payment session.`);
          }
          // Store token for confirmation on return
          if (payment.token) {
            try { sessionStorage.setItem('pending_payment_token', payment.token); } catch { }
            try { sessionStorage.setItem('pending_payment_method', paymentMethod); } catch { }
          }
          if (payment.paypalOrderId) {
            try { sessionStorage.setItem('pending_paypal_order_id', payment.paypalOrderId); } catch { }
          }
          window.location.href = payment.checkoutUrl;
          return;
        }

        if (payment.checkoutUrl) {
          window.open(payment.checkoutUrl, '_blank', 'noopener,noreferrer');
        }

        // Manual payment fallback (PayPal/crypto): open checkout URL and complete purchase on backend.
        const result = await ShopApiService.buy(order, paymentMethod, true);
        if (!result.ok) {
          throw new Error('Purchase failed.');
        }

        const finalOrder: Order = result.order || {
          ...order,
          status: 'completed',
        };

        if (result.products && result.products.length > 0) {
          setUpdatedProducts(result.products);
        } else {
          setUpdatedProducts(undefined);
        }

        setStep('success');
      } catch (purchaseError) {
        console.error('Checkout failed:', purchaseError);
        const errorText = purchaseError instanceof Error ? purchaseError.message : 'Checkout failed.';
        const lowered = String(errorText || '').toLowerCase();
        const isUnauthorized = lowered.includes('(401)') || lowered.includes('401') || lowered.includes('unauthorized');
        if (isUnauthorized) {
          ShopApiService.clearSessionToken();
          try { localStorage.removeItem('robloxkeys.session'); } catch { }
          setError('Session expired. Redirecting to sign in...');
          window.setTimeout(() => {
            window.location.href = '/auth';
          }, 700);
          return;
        }
        setError(errorText);
        setStep('payment');
      }
    }, 2800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-6">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose}></div>

      <div className="relative w-full max-w-4xl overflow-hidden rounded-[26px] border border-white/5 bg-[#0a0a0a] shadow-[0_0_150px_rgba(0,0,0,0.8)] sm:rounded-[48px]">
        {step !== 'processing' && step !== 'success' && (
          <button onClick={onClose} className="absolute right-4 top-4 z-20 rounded-2xl bg-white/5 p-2.5 text-white/40 transition-all hover:text-white sm:right-8 sm:top-8 sm:p-3">
            <X className="w-6 h-6" />
          </button>
        )}

        {step === 'details' && (
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="border-b border-white/5 p-5 md:border-b-0 md:border-r md:p-12">
              <h2 className="mb-6 text-2xl font-black uppercase tracking-tighter italic text-white sm:text-3xl md:mb-8">Order <span className="text-[#facc15]">Manifest</span></h2>
              <div className="scrollbar-hide max-h-[40vh] space-y-4 overflow-y-auto pr-1 sm:space-y-6 sm:pr-4 md:max-h-[400px]">
                {items.map(item => (
                  <div key={item.id} className="flex gap-4 rounded-3xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-black flex-shrink-0">
                      <img src={item.image} className="w-full h-full object-cover opacity-60" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black uppercase tracking-tight text-white">{item.name}</p>
                      <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">{item.duration} Access × {item.quantity}</p>
                      <p className="text-[#facc15] font-black text-sm mt-1">${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-white/5 pt-5 sm:mt-10 sm:pt-8">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Consolidated Total</span>
                  <span className="text-2xl font-black italic text-[#facc15] sm:text-3xl">${total.toFixed(2)}</span>
                </div>
                <button onClick={() => setStep('payment')} className="w-full rounded-2xl bg-[#facc15] py-4 text-xs font-black uppercase tracking-widest text-black shadow-xl shadow-yellow-400/10 transition-all active:scale-[0.98] sm:py-5">
                  Initialize Transaction
                </button>
              </div>
            </div>
            <div className="relative flex flex-col items-center justify-center bg-black/30 p-6 text-center sm:p-10 md:p-12">
              <div className="absolute inset-0 bg-radial-gradient from-yellow-400/5 to-transparent"></div>
              <ShieldCheck className="w-16 h-16 text-[#facc15] mb-6 drop-shadow-[0_0_20px_rgba(250,204,21,0.3)] relative z-10" />
              <h3 className="text-xl font-black text-white mb-4 relative z-10 uppercase italic">Secure Gateway</h3>
              <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest leading-loose relative z-10">
                All purchases are protected by our <br />
                <span className="text-white">24-hour global replacement warranty</span>.<br />
                Encrypted delivery protocol active.
              </p>
            </div>
          </div>
        )}

        {step === 'payment' && (
          <div className="p-5 text-center sm:p-10 md:p-20">
            <h2 className="mb-8 text-3xl font-black uppercase tracking-tighter italic text-white sm:mb-12 sm:text-4xl">Select <span className="text-[#facc15]">Protocol</span></h2>
            <div className="mx-auto mb-10 grid max-w-3xl grid-cols-1 gap-4 sm:mb-16 sm:grid-cols-3 sm:gap-8">
              <button
                onClick={() => setPaymentMethod('card')}
                disabled={!methodAvailability.card.enabled}
                className={`group flex flex-col items-center gap-4 rounded-[26px] border p-6 transition-all sm:gap-6 sm:rounded-[40px] sm:p-10 ${paymentMethod === 'card' ? 'bg-[#facc15]/10 border-[#facc15] text-[#facc15] shadow-2xl' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'} ${!methodAvailability.card.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <CreditCard className={`w-10 h-10 transition-transform ${paymentMethod === 'card' ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[11px] font-black uppercase tracking-widest">Card</span>
              </button>
              <button
                onClick={() => setPaymentMethod('paypal')}
                disabled={!methodAvailability.paypal.enabled}
                className={`group flex flex-col items-center gap-4 rounded-[26px] border p-6 transition-all sm:gap-6 sm:rounded-[40px] sm:p-10 ${paymentMethod === 'paypal' ? 'bg-[#facc15]/10 border-[#facc15] text-[#facc15] shadow-2xl' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'} ${!methodAvailability.paypal.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Wallet className={`w-10 h-10 transition-transform ${paymentMethod === 'paypal' ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[11px] font-black uppercase tracking-widest">PayPal</span>
              </button>
              <button
                onClick={() => setPaymentMethod('crypto')}
                disabled={!methodAvailability.crypto.enabled}
                className={`group flex flex-col items-center gap-4 rounded-[26px] border p-6 transition-all sm:gap-6 sm:rounded-[40px] sm:p-10 ${paymentMethod === 'crypto' ? 'bg-[#facc15]/10 border-[#facc15] text-[#facc15] shadow-2xl' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'} ${!methodAvailability.crypto.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Bitcoin className={`w-10 h-10 transition-transform ${paymentMethod === 'crypto' ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[11px] font-black uppercase tracking-widest">Crypto</span>
              </button>
            </div>
            {paymentMethod === 'paypal' && (
              <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-200/80">
                <p className="font-bold mb-1">{methodAvailability.paypal.automated ? 'Automated PayPal Checkout' : 'Manual PayPal Checkout'}</p>
                <p>
                  {methodAvailability.paypal.automated
                    ? 'You will be redirected to PayPal and returned automatically after approval.'
                    : 'This opens your PayPal destination in a new tab before checkout finalizes.'}
                </p>
              </div>
            )}
            <button onClick={handleCheckout} className="rounded-3xl bg-[#facc15] px-8 py-4 text-xs font-black uppercase tracking-[0.2em] text-black shadow-2xl shadow-yellow-400/20 transition-all hover:bg-yellow-300 active:scale-95 sm:px-16 sm:py-6 sm:tracking-[0.3em]">
              Execute ${total.toFixed(2)} via {paymentMethod}
            </button>
            <p className="mt-4 text-white/40 text-[10px] font-black uppercase tracking-wider">
              {paymentMethod === 'card'
                ? 'Card uses Stripe.'
                : paymentMethod === 'paypal'
                  ? (methodAvailability.paypal.automated ? 'PayPal uses API verification.' : 'PayPal uses manual fallback.')
                  : (methodAvailability.crypto.automated ? 'Crypto uses OxaPay verification.' : 'Crypto uses manual fallback.')}
            </p>
            {error && (
              <p className="mt-6 text-red-400 text-xs font-black uppercase tracking-widest">
                {error}
              </p>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center p-10 text-center sm:p-16 md:p-32">
            <div className="relative mb-12">
              <div className="w-24 h-24 border-4 border-white/5 border-t-[#facc15] rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Shield className="w-8 h-8 text-[#facc15] animate-pulse" />
              </div>
            </div>
            <h2 className="mb-4 text-3xl font-black uppercase tracking-tighter italic text-white sm:text-4xl">{processingPhase}</h2>
            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em]">Secure Handshake Protocol Active</p>
          </div>
        )}

        {step === 'success' && (
          <div className={`relative overflow-hidden p-10 text-center transition-opacity duration-500 sm:p-16 md:p-24 ${successPhase === 'routing' ? 'opacity-0' : 'opacity-100'}`}>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -left-14 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-emerald-400/15 blur-3xl animate-pulse" />
              <div className="absolute -right-12 top-10 h-52 w-52 rounded-full bg-yellow-400/10 blur-3xl animate-pulse [animation-delay:260ms]" />
            </div>
            <div className="relative mx-auto mb-10 flex h-28 w-28 items-center justify-center rounded-full border border-emerald-300/45 bg-emerald-400/10 shadow-[0_0_60px_rgba(52,211,153,0.28)]">
              <div className="absolute inset-0 rounded-full border border-emerald-300/35 animate-ping" />
              <div className="absolute inset-2 rounded-full border border-emerald-300/25 animate-pulse" />
              <CheckCircle2 className="h-14 w-14 text-emerald-300" strokeWidth={3.2} />
            </div>
            <h2 className="relative mb-4 text-4xl font-black uppercase tracking-tighter italic text-white sm:text-5xl md:text-6xl">
              Vault <span className="text-emerald-300">Unlocked</span>
            </h2>
            <p className="relative text-[11px] font-black uppercase tracking-[0.38em] text-white/35">
              Routing Your Credentials
            </p>
            <div className="relative mx-auto mt-9 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
                Purchase confirmed. Securely forwarding to Member Vault.
              </p>
            </div>
            <div className="relative mx-auto mt-7 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-emerald-400 to-yellow-300 transition-[width] ease-linear"
                style={{ width: successProgressArmed ? '100%' : '0%', transitionDuration: `${SUCCESS_ANIMATION_MS}ms` }}
              />
            </div>
            <p className="relative mt-3 text-xs font-black uppercase tracking-[0.24em] text-emerald-100/75">
              {successPhase === 'routing' ? 'Opening Member Vault' : 'Syncing Vault Session'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
