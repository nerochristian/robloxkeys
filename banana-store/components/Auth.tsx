import React, { useMemo, useState } from 'react';
import { Mail, Lock, UserPlus, ArrowLeft, LayoutGrid, LogIn, ShieldCheck, KeyRound } from 'lucide-react';
import type { User } from '../services/storageService';
import { BRAND_CONFIG } from '../config/brandConfig';
import { ShopApiService } from '../services/shopApiService';

interface AuthProps {
  onAuthComplete: (user: User) => void;
  onBack: () => void;
}

const JUST_SIGNED_IN_KEY = 'robloxkeys.just_signed_in';

export const Auth: React.FC<AuthProps> = ({ onAuthComplete, onBack }) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpNotice, setOtpNotice] = useState('');
  const [error, setError] = useState('');

  const isOtpStep = useMemo(() => isLogin && Boolean(otpToken), [isLogin, otpToken]);

  const resetOtpStep = () => {
    setOtpToken('');
    setOtpCode('');
    setOtpNotice('');
  };

  React.useEffect(() => {
    setLogoFailed(false);
  }, [BRAND_CONFIG.assets.logoUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      if (isLogin) {
        if (isOtpStep) {
          const cleanCode = otpCode.trim();
          if (!cleanCode) {
            setError('Verification code is required');
            return;
          }

          const verified = await ShopApiService.authVerifyOtp(otpToken, cleanCode);
          sessionStorage.setItem(JUST_SIGNED_IN_KEY, '1');
          onAuthComplete(verified.user);
          return;
        }

        if (!cleanEmail || !cleanPassword) {
          setError('Email and password are required');
          return;
        }

        const loginResult = await ShopApiService.authLogin(cleanEmail, cleanPassword);
        if (loginResult.requires2fa) {
          setOtpToken(loginResult.otpToken);
          setOtpNotice(loginResult.message);
          setOtpCode('');
          return;
        }

        sessionStorage.setItem(JUST_SIGNED_IN_KEY, '1');
        onAuthComplete(loginResult.user);
        return;
      }

      if (!cleanEmail || !cleanPassword) {
        setError('Email and password are required');
        return;
      }

      const user: User = await ShopApiService.authRegister(cleanEmail, cleanPassword);
      onAuthComplete(user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed');
    }
  };

  return (
    <div className="page-motion relative flex min-h-screen items-center justify-center bg-[#050505] px-3 sm:px-4">
      <div className="ambient-orb pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-500/5 blur-[120px] sm:h-[600px] sm:w-[600px]"></div>

      <button
        onClick={onBack}
        className="absolute left-4 top-5 z-50 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 transition-colors hover:text-white sm:left-10 sm:top-10"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Store
      </button>

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-[32px] border border-white/5 bg-[#0a0a0a] p-6 shadow-2xl animate-reveal sm:rounded-[48px] sm:p-12">
        <div className="absolute right-0 top-0 p-8 opacity-10">
          <ShieldCheck className="h-24 w-24 text-[#facc15]" />
        </div>

        <div className="relative mb-10 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 rotate-3 items-center justify-center overflow-hidden rounded-2xl bg-[#facc15] shadow-xl shadow-yellow-400/20">
            {BRAND_CONFIG.assets.logoUrl && !logoFailed ? (
              <img
                src={BRAND_CONFIG.assets.logoUrl}
                alt={`${BRAND_CONFIG.identity.storeName} logo`}
                className="h-full w-full object-cover"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <LayoutGrid className="h-10 w-10 text-black" strokeWidth={3} />
            )}
          </div>
          <h2 className="text-2xl font-black tracking-tighter text-white sm:text-3xl">
            {isOtpStep ? 'Email Verification' : isLogin ? 'Welcome Back' : BRAND_CONFIG.copy.authJoinHeading}
          </h2>
          <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/30">
            {isOtpStep ? 'Enter your one-time code to continue' : isLogin ? 'Access your digital vault' : 'Start your premium journey'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-6">
          {!isOtpStep ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="ml-2 block text-[10px] font-black uppercase tracking-widest text-white/20">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-white/5 bg-black px-12 py-4 font-bold text-white outline-none transition-all focus:border-[#facc15]"
                    placeholder="name@email.com"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="ml-2 block text-[10px] font-black uppercase tracking-widest text-white/20">Secure Password</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    className="w-full rounded-2xl border border-white/5 bg-black px-12 py-4 font-bold text-white outline-none transition-all focus:border-[#facc15]"
                    style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' }}
                    placeholder="Password"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#facc15]/20 bg-[#facc15]/5 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#facc15]/80">
                {otpNotice || `Verification code sent to ${email}`}
              </div>
              <div className="space-y-1.5">
                <label className="ml-2 block text-[10px] font-black uppercase tracking-widest text-white/20">One-Time Verification Code</label>
                <div className="relative">
                  <KeyRound className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/20" />
                  <input
                    required
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-2xl border border-white/5 bg-black px-12 py-4 font-bold tracking-[0.28em] text-white outline-none transition-all focus:border-[#facc15] sm:tracking-[0.35em]"
                    placeholder="000000"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={resetOtpStep}
                className="w-full rounded-2xl border border-white/10 bg-black py-3 text-[10px] font-black uppercase tracking-widest text-white/60 transition-all hover:border-white/20 hover:text-white/90"
              >
                Use a Different Login
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-500/10 bg-red-500/5 py-3 text-center text-[10px] font-black uppercase text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#facc15] py-5 text-xs font-black uppercase tracking-widest text-black shadow-xl shadow-yellow-400/10 transition-all hover:bg-yellow-300"
          >
            {isLogin ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {isOtpStep ? 'Verify Code' : isLogin ? 'Authenticate' : 'Create Account'}
          </button>
        </form>

        <div className="relative mt-8 border-t border-white/5 pt-8 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              resetOtpStep();
              setError('');
            }}
            className="text-[10px] font-black uppercase tracking-widest text-white/30 transition-colors hover:text-white"
          >
            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Login'}
          </button>
        </div>
      </div>

      <div className="fixed bottom-7 hidden text-[9px] font-black uppercase tracking-[0.4em] text-white/10 sm:block">
        Encrypted AES-256 Session Layer Active
      </div>
    </div>
  );
};
