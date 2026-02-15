
import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Zap, CreditCard, Wallet, Bitcoin, CheckCircle2, ArrowRight, Shield } from 'lucide-react';
import { CartItem, Product } from '../types';
import { Order, User } from '../services/storageService';
import { BotBridgeService } from '../services/botBridgeService';
import { ShopApiService } from '../services/shopApiService';

interface CheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currentUser: User | null;
  onSuccess: (updatedProducts?: Product[]) => void;
}

export const Checkout: React.FC<CheckoutProps> = ({ isOpen, onClose, items, currentUser, onSuccess }) => {
  const [step, setStep] = useState<'details' | 'payment' | 'processing' | 'success'>('details');
  const [processingPhase, setProcessingPhase] = useState('Verifying Transaction...');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'crypto' | 'paypal'>('card');
  const [error, setError] = useState('');
  const [updatedProducts, setUpdatedProducts] = useState<Product[] | undefined>(undefined);
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
      .then((methods) => setMethodAvailability(methods))
      .catch((methodsError) => {
        console.warn('Failed to load payment method availability:', methodsError);
        setMethodAvailability({
          card: { enabled: false, automated: true },
          paypal: { enabled: false, automated: false },
          crypto: { enabled: false, automated: false },
        });
      });
  }, [isOpen]);

  const handleCheckout = () => {
    if (!currentUser) return;
    if (paymentMethod === 'card' && !methodAvailability.card.enabled) {
      setError('Card payments are not configured yet. Set STRIPE_SECRET_KEY on your API.');
      setStep('payment');
      return;
    }
    if (paymentMethod === 'paypal' && !methodAvailability.paypal.enabled) {
      setError('PayPal is not configured yet. Set PAYPAL_CHECKOUT_URL on your API.');
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
        const payment = await ShopApiService.createPayment(order, currentUser, paymentMethod, successUrl, cancelUrl);
        if (!payment.ok) {
          throw new Error('Failed to create payment session.');
        }
        if (paymentMethod === 'card') {
          if (!payment.checkoutUrl) {
            throw new Error('Failed to create card payment session.');
          }
          window.location.href = payment.checkoutUrl;
          return;
        }

        if (paymentMethod === 'crypto' && !payment.manual) {
          if (!payment.checkoutUrl) {
            throw new Error('Failed to create OxaPay payment session.');
          }
          window.location.href = payment.checkoutUrl;
          return;
        }

        if (payment.checkoutUrl) {
          window.open(payment.checkoutUrl, '_blank', 'noopener,noreferrer');
        }

        const result = await ShopApiService.buy(order, currentUser, paymentMethod, true);
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

        BotBridgeService.sendOrder(finalOrder, currentUser, paymentMethod).catch((bridgeError) => {
          console.error('Failed to notify bot about completed order:', bridgeError);
        });
        setStep('success');
      } catch (purchaseError) {
        console.error('Checkout failed:', purchaseError);
        const errorText = purchaseError instanceof Error ? purchaseError.message : 'Checkout failed.';
        setError(errorText);
        setStep('payment');
      }
    }, 2800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={onClose}></div>
      
      <div className="relative w-full max-w-4xl bg-[#0a0a0a] border border-white/5 rounded-[48px] overflow-hidden shadow-[0_0_150px_rgba(0,0,0,0.8)]">
        {step !== 'processing' && step !== 'success' && (
          <button onClick={onClose} className="absolute top-8 right-8 p-3 bg-white/5 rounded-2xl text-white/40 hover:text-white transition-all z-20">
            <X className="w-6 h-6" />
          </button>
        )}

        {step === 'details' && (
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-12 border-r border-white/5">
              <h2 className="text-3xl font-black text-white tracking-tighter mb-8 italic uppercase">Order <span className="text-[#facc15]">Manifest</span></h2>
              <div className="space-y-6 max-h-[400px] overflow-y-auto pr-4 scrollbar-hide">
                {items.map(item => (
                  <div key={item.id} className="flex gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-black flex-shrink-0">
                      <img src={item.image} className="w-full h-full object-cover opacity-60" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white uppercase tracking-tight">{item.name}</p>
                      <p className="text-[10px] text-white/40 font-black uppercase tracking-widest">{item.duration} Access × {item.quantity}</p>
                      <p className="text-[#facc15] font-black text-sm mt-1">${(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 pt-8 border-t border-white/5">
                 <div className="flex justify-between items-center mb-6">
                   <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Consolidated Total</span>
                   <span className="text-3xl font-black text-[#facc15] italic">${total.toFixed(2)}</span>
                 </div>
                 <button onClick={() => setStep('payment')} className="w-full bg-[#facc15] text-black font-black py-5 rounded-2xl uppercase tracking-widest text-xs shadow-xl shadow-yellow-400/10 active:scale-[0.98] transition-all">
                   Initialize Transaction
                 </button>
              </div>
            </div>
            <div className="p-12 bg-black/30 flex flex-col items-center justify-center text-center relative">
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
          <div className="p-20 text-center">
            <h2 className="text-4xl font-black text-white tracking-tighter mb-12 italic uppercase">Select <span className="text-[#facc15]">Protocol</span></h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto mb-16">
              <button
                onClick={() => setPaymentMethod('card')}
                disabled={!methodAvailability.card.enabled}
                className={`p-10 rounded-[40px] border transition-all flex flex-col items-center gap-6 group ${paymentMethod === 'card' ? 'bg-[#facc15]/10 border-[#facc15] text-[#facc15] shadow-2xl' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'} ${!methodAvailability.card.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <CreditCard className={`w-10 h-10 transition-transform ${paymentMethod === 'card' ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[11px] font-black uppercase tracking-widest">Card</span>
              </button>
              <button
                onClick={() => setPaymentMethod('paypal')}
                disabled={!methodAvailability.paypal.enabled}
                className={`p-10 rounded-[40px] border transition-all flex flex-col items-center gap-6 group ${paymentMethod === 'paypal' ? 'bg-[#facc15]/10 border-[#facc15] text-[#facc15] shadow-2xl' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'} ${!methodAvailability.paypal.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Wallet className={`w-10 h-10 transition-transform ${paymentMethod === 'paypal' ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[11px] font-black uppercase tracking-widest">PayPal</span>
              </button>
              <button
                onClick={() => setPaymentMethod('crypto')}
                disabled={!methodAvailability.crypto.enabled}
                className={`p-10 rounded-[40px] border transition-all flex flex-col items-center gap-6 group ${paymentMethod === 'crypto' ? 'bg-[#facc15]/10 border-[#facc15] text-[#facc15] shadow-2xl' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'} ${!methodAvailability.crypto.enabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <Bitcoin className={`w-10 h-10 transition-transform ${paymentMethod === 'crypto' ? 'scale-110' : 'group-hover:scale-110'}`} />
                <span className="text-[11px] font-black uppercase tracking-widest">Crypto</span>
              </button>
            </div>
            <button onClick={handleCheckout} className="bg-[#facc15] text-black font-black px-16 py-6 rounded-3xl uppercase tracking-[0.3em] text-xs shadow-2xl shadow-yellow-400/20 hover:bg-yellow-300 active:scale-95 transition-all">
              Execute ${total.toFixed(2)} via {paymentMethod}
            </button>
            <p className="mt-4 text-white/40 text-[10px] font-black uppercase tracking-wider">
              Card uses Stripe. Crypto uses OxaPay verification before delivery.
            </p>
            {error && (
              <p className="mt-6 text-red-400 text-xs font-black uppercase tracking-widest">
                {error}
              </p>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="p-32 flex flex-col items-center justify-center text-center">
            <div className="relative mb-12">
               <div className="w-24 h-24 border-4 border-white/5 border-t-[#facc15] rounded-full animate-spin"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                  <Shield className="w-8 h-8 text-[#facc15] animate-pulse" />
               </div>
            </div>
            <h2 className="text-4xl font-black text-white tracking-tighter mb-4 italic uppercase">{processingPhase}</h2>
            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em]">Secure Handshake Protocol Active</p>
          </div>
        )}

        {step === 'success' && (
          <div className="p-24 text-center animate-in zoom-in-95 duration-700">
             <div className="w-28 h-28 bg-[#22c55e] rounded-[40px] mx-auto flex items-center justify-center mb-12 rotate-12 shadow-[0_0_60px_rgba(34,197,94,0.4)] border-4 border-black/20">
               <CheckCircle2 className="w-14 h-14 text-black" strokeWidth={4} />
             </div>
             <h2 className="text-6xl font-black text-white tracking-tighter mb-4 italic uppercase">Clearance <span className="text-[#22c55e]">Granted</span></h2>
             <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em] mb-16">Credentials generated and assigned to vault</p>
             <button onClick={() => { onSuccess(updatedProducts); onClose(); }} className="bg-white text-black font-black px-14 py-6 rounded-3xl uppercase tracking-[0.3em] text-xs flex items-center gap-4 mx-auto hover:bg-gray-200 transition-all active:scale-95">
               Access Decrypted Vault <ArrowRight className="w-5 h-5" />
             </button>
          </div>
        )}
      </div>
    </div>
  );
};
