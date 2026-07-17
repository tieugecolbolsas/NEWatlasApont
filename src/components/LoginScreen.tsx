/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, ShieldAlert, Loader2 } from 'lucide-react';
import { loginHibrido } from '../lib/auth';
import Logo from '../Logo';

// Importando as fontes via código para garantir o funcionamento da fonte Gugi
const fontStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Gugi&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700;800&display=swap');
  
  @keyframes orbit-cw {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes orbit-ccw {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }
  .animate-orbit-rotate {
    transform-origin: 50px 50px;
    animation: orbit-cw 12s linear infinite;
  }
  .animate-orbit-rotate-reverse {
    transform-origin: 50px 50px;
    animation: orbit-ccw 16s linear infinite;
  }
  .animate-orbit-rotate-slow {
    transform-origin: 50px 50px;
    animation: orbit-cw 32s linear infinite;
  }
`;

interface LoginScreenProps {
  onLoginSuccess: (user: { uid: string; email: string; displayName?: string; role: string; createdAt: string }) => void;
  addToast: (text: string, type: 'success' | 'error' | 'info') => void;
  mode: 'supabase' | 'sandbox';
}

export default function LoginScreen({ onLoginSuccess, addToast, mode }: LoginScreenProps) {
  // Seletor de persistência inteligente ("Lembrar meu e-mail")
  const [rememberEmail, setRememberEmail] = useState(() => {
    return localStorage.getItem('atlas_remember_email') === 'true';
  });

  const [email, setEmail] = useState(() => {
    if (localStorage.getItem('atlas_remember_email') === 'true') {
      return localStorage.getItem('atlas_saved_email') || '';
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDark = true;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Salva ou remove o e-mail no localStorage com base na opção do usuário
      if (rememberEmail) {
        localStorage.setItem('atlas_remember_email', 'true');
        localStorage.setItem('atlas_saved_email', email.trim());
      } else {
        localStorage.removeItem('atlas_remember_email');
        localStorage.removeItem('atlas_saved_email');
      }

      // Autenticação Híbrida Real de Produção
      const userSession = await loginHibrido(email, password);

      setSuccess(true);
      addToast('Login realizado com sucesso! Bem-vindo de volta.', 'success');

      setTimeout(() => {
        onLoginSuccess(userSession);
        setLoading(false);
      }, 1000);
    } catch (err: any) {
      const msg = err.message || 'E-mail ou senha incorretos.';
      setError(msg);
      addToast(msg, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md px-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{fontStyles}</style>

      {/* Centered Login Card */}
      <motion.div
        id="login-card"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`w-full rounded-2xl border p-5 md:p-6 transition-all duration-300 relative overflow-hidden
          ${isDark 
            ? 'bg-[#0a0a0a] border-neutral-800 text-white shadow-2xl shadow-neutral-950/80' 
            : 'bg-[#0a0a0a] border-neutral-800 text-white shadow-2xl shadow-neutral-950/80' // Forçado tema escuro no RH
          }`}
      >
        {/* Color accent highlights - ROXO ATLAS */}
        <div id="card-top-accent" className="absolute top-0 left-0 right-0 h-[4px] bg-[#00624C]" />

        {/* Space for Custom SVG Logo in card header */}
        <div className="flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[110px] md:min-h-[130px] mb-3 md:mb-4 mt-0.5 md:mt-1 rounded-xl bg-neutral-950/40 py-3 md:py-5 border border-neutral-900/60" id="logo-header">
          {/* Subtle Astronomy Reference (Celestial Grid, Orbits & Stars) */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center select-none z-0">
            <svg 
              className="w-28 h-28 md:w-32 md:h-32 text-neutral-500/68" 
              viewBox="0 0 100 100" 
              fill="none" 
              stroke="currentColor"
            >
              {/* Polar Grid / Concentric Orbits */}
              <circle cx="50" cy="50" r="44" strokeWidth="0.25" strokeDasharray="2 3" />
              <circle cx="50" cy="50" r="32" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="20" strokeWidth="0.35" strokeDasharray="1 2" />
              <circle cx="50" cy="50" r="8" strokeWidth="0.2" />
              
              {/* Inclined Orbital/Planetary Rings */}
              <ellipse cx="50" cy="50" rx="46" ry="14" transform="rotate(-28 50 50)" strokeWidth="0.65" strokeDasharray="3 2" />
              <ellipse cx="50" cy="50" rx="38" ry="8" transform="rotate(15 50 50)" strokeWidth="0.4" />
              
              {/* Meridian / Equator Grid Lines (Static) */}
              <line x1="50" y1="2" x2="50" y2="98" strokeWidth="0.2" strokeDasharray="4 4" />
              <line x1="2" y1="50" x2="98" y2="50" strokeWidth="0.2" strokeDasharray="4 4" />
              
              {/* Orbiting Planets & Elements - ROXO ATLAS */}
              <g className="animate-orbit-rotate-reverse">
                <circle cx="50" cy="18" r="2.2" fill="#00624C" stroke="none" /> {/* Purple glowing planet */}
                <circle cx="50" cy="18" r="3.5" stroke="#00624C" strokeWidth="0.15" fill="none" className="opacity-75" />
              </g>
              
              <g className="animate-orbit-rotate">
                <circle cx="50" cy="30" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="50" cy="30" r="2.2" stroke="currentColor" strokeWidth="0.1" fill="none" className="opacity-60" strokeDasharray="1 1" />
              </g>

              <g className="animate-orbit-rotate-slow">
                <circle cx="88" cy="50" r="1.8" fill="currentColor" stroke="none" />
              </g>
              
              {/* Stars & Constellation background particles */}
              <g className="opacity-90">
                <circle cx="18" cy="22" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="82" cy="78" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="78" cy="24" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="22" cy="76" r="1.0" fill="currentColor" stroke="none" />
                <circle cx="42" cy="18" r="0.6" fill="currentColor" stroke="none" opacity="0.5" />
                <circle cx="58" cy="82" r="0.6" fill="currentColor" stroke="none" opacity="0.5" />
              </g>
            </svg>
          </div>

          <div className="flex flex-col items-center justify-center text-center relative z-10 select-none pt-3 pb-2">
            
            {/* Título Principal */}
            <h1 
              className="text-4xl tracking-widest uppercase text-white" 
              style={{ fontFamily: "'Gugi', sans-serif", fontWeight: 400 }}
            >
              ATLAS
            </h1>
            
            {/* Novo Subtítulo do Módulo */}
            <span 
              className="mt-1 text-[11px] font-mono font-black tracking-widest uppercase" 
            >
              APONTAMENTO
            </span>

            {/* Assinatura Eugecol */}
            <span 
              className="mt-1.5 text-[9px] font-black tracking-widest text-[#00624C] uppercase opacity-90" 
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Sistema Eugecol
            </span>
            
          </div>
        </div>

        {/* Autenticação header below logo section */}
        <div className="text-center mb-3 mt-1">
          <h2 className="text-xs font-bold tracking-widest uppercase text-neutral-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            Autenticação
          </h2>
          <div className="h-[1.5px] w-8 bg-[#00624C] mx-auto mt-2 opacity-80" />
        </div>

        {/* Interactive feedback states */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              id="error-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 text-sm flex items-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="font-medium text-xs md:text-sm">{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              id="success-banner"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span className="font-medium text-xs md:text-sm">Acesso autorizado. Iniciando módulo...</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Log In Form */}
        <form onSubmit={handleLogin} className="space-y-4" id="login-form">
          <div className="space-y-1.5" id="email-field-container">
            <label 
              htmlFor="email" 
              className="text-[11px] font-bold uppercase tracking-wider text-neutral-400"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Endereço de E-mail
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@dominio.com.br"
                disabled={loading || success}
                className="block w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm transition-all duration-300 focus:outline-none focus:ring-1 bg-neutral-900 border-neutral-800 text-white placeholder-neutral-600 focus:border-[#00624C] focus:ring-[#00624C]"
              />
            </div>
          </div>

          <div className="space-y-1.5" id="password-field-container">
            <label 
              htmlFor="password" 
              className="text-[11px] font-bold uppercase tracking-wider text-neutral-400"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Senha do Sistema
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={loading || success}
                className="block w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm transition-all duration-300 focus:outline-none focus:ring-1 bg-neutral-900 border-neutral-800 text-white placeholder-neutral-600 focus:border-[#00624C] focus:ring-[#00624C]"
              />
              <button
                id="toggle-pass-visibility-btn"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading || success}
                className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer transition-colors text-neutral-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Opção de Lembrar E-mail */}
          <div className="flex items-center justify-between pb-1" id="remember-me-container">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id="remember-email-checkbox"
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                disabled={loading || success}
                className="w-4 h-4 rounded border-neutral-800 bg-neutral-900 text-[#00624C] focus:ring-[#00624C] focus:ring-offset-0 focus:ring-1"
              />
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide font-sans">
                Lembrar meu e-mail
              </span>
            </label>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading || success}
            className="w-full relative flex items-center justify-center py-3 px-4 mt-1 rounded-lg font-bold text-white bg-[#00624C] hover:bg-[#004838] active:scale-[0.98] transition-all duration-200 cursor-pointer text-sm shadow-lg shadow-[#00624C]/20 disabled:opacity-75 disabled:pointer-events-none overflow-hidden uppercase tracking-wider"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Autenticando...
              </span>
            ) : (
              <span>Entrar no Sistema</span>
            )}
          </button>
        </form>

        {/* Mandated contact line */}
        <div className="mt-5 text-center pt-4 border-t border-dashed border-neutral-800" id="contact-line-footer">
          <p className="text-[11px] text-neutral-500 font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>
            Problemas com a senha? Contacte o administrador
          </p>
        </div>
      </motion.div>
    </div>
  );
}
