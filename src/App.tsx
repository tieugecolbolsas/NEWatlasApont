/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import DashboardSupervisor from './DashboardSupervisor';
import { getLocalSessionUser, setLocalSessionUser, UserSession } from './lib/auth';
import { supabase } from './lib/supabase';

interface Toast {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Sincronização automática em segundo plano para restaurar a sessão ativa sem flickeio
  useEffect(() => {
    const checkActiveSession = async () => {
      try {
        // Tenta recuperar do localStorage primeiro para manter o estado completo (com role e displayName)
        const localUser = getLocalSessionUser();
        if (localUser) {
          let sessionStart = localStorage.getItem('atlas_session_start_time');
          if (!sessionStart) {
            sessionStart = localUser.sessionStart || new Date().toISOString();
            localStorage.setItem('atlas_session_start_time', sessionStart);
          }
          const userWithStart = {
            ...localUser,
            sessionStart
          };
          setUser(userWithStart);
          return;
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          handleLogout(false);
        } else {
          // Mapeia tanto a sessão local customizada quanto o formato padrão do Supabase
          const sessionUser = (session as any).user || session;
          if (sessionUser && (sessionUser.email || sessionUser.uid)) {
            const email = (sessionUser.email || 'operator@eugecol.com').toLowerCase();
            const calculatedRole = email.includes('apontamento') ? 'colaboradora' : 'admin';

            let sessionStart = localStorage.getItem('atlas_session_start_time');
            if (!sessionStart) {
              sessionStart = new Date().toISOString();
              localStorage.setItem('atlas_session_start_time', sessionStart);
            }

            const restoredUser = {
              ...sessionUser,
              uid: sessionUser.id || sessionUser.uid || 'local-user',
              email: email,
              role: calculatedRole,
              createdAt: sessionUser.created_at || sessionUser.createdAt || new Date().toISOString(),
              sessionStart
            } as UserSession;

            setUser(restoredUser);
            setLocalSessionUser(restoredUser);
          } else {
            handleLogout(false);
          }
        }
      } catch (err) {
        handleLogout(false);
      }
    };
    checkActiveSession();
  }, []);

  const handleLoginSuccess = (userObj: UserSession) => {
    const sessionStart = userObj.sessionStart || new Date().toISOString();
    localStorage.setItem('atlas_session_start_time', sessionStart);
    const userWithStart = {
      ...userObj,
      sessionStart
    };
    setUser(userWithStart);
    setLocalSessionUser(userWithStart);
  };

  const handleLogout = async (showToast = true) => {
    setUser(null);
    setLocalSessionUser(null);
    localStorage.removeItem('atlas_session_start_time');
    try {
      if (supabase && supabase.auth && typeof supabase.auth.signOut === 'function') {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('[Atlas Auth] Erro ao deslogar do Supabase:', err);
    }
    if (showToast) {
      addToast('Sessão encerrada com sucesso.', 'info');
    }
  };

  // Monitoramento de Ociosidade (Idle Timeout) para deslogar automaticamente após 1 hora de inatividade
  useEffect(() => {
    if (!user) return;

    // Tempo limite de inatividade (1 hora)
    const IDLE_TIMEOUT = 60 * 60 * 1000; 
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout(false);
        addToast('Sessão encerrada automaticamente por inatividade.', 'info');
      }, IDLE_TIMEOUT);
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

    resetTimer();
    
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      clearTimeout(timeoutId);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  // Tempo limite absoluto de sessão de 1 hora (Segurança e controle de sessão do Atlas)
  useEffect(() => {
    if (!user) return;

    const sessionStart = user.sessionStart || localStorage.getItem('atlas_session_start_time') || new Date().toISOString();
    const sessionStartTime = new Date(sessionStart).getTime();
    const oneHourMs = 60 * 60 * 1000;
    const elapsedTime = Date.now() - sessionStartTime;
    const remainingTime = oneHourMs - elapsedTime;

    if (remainingTime <= 0) {
      handleLogout(false);
      addToast('Sessão expirada após tempo limite de 1 hora.', 'info');
      return;
    }

    const absoluteTimeoutId = setTimeout(() => {
      handleLogout(false);
      addToast('Sessão encerrada por tempo limite de 1 hora.', 'info');
    }, remainingTime);

    return () => clearTimeout(absoluteTimeoutId);
  }, [user]);

  const addToast = (text: string, type: 'success' | 'error' | 'info') => {
    const id = Math.random().toString();
    setToasts((prev) => [...prev, { id, text, type }]);
    
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col items-center justify-center relative overflow-x-hidden md:overflow-hidden font-sans">
      
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-950/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute top-1/3 left-1/4 w-[300px] h-[300px] bg-blue-950/10 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Primary content area */}
      <div className="w-full min-h-screen flex flex-col items-center justify-center relative z-10">
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="w-full flex items-center justify-center p-4"
            >
              <LoginScreen 
                onLoginSuccess={handleLoginSuccess}
                addToast={addToast}
                mode="supabase"
              />
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full min-h-screen md:h-screen"
            >
              <DashboardSupervisor 
                userEmail={user.email}
                onLogout={handleLogout}
                addToast={addToast}
                mode="supabase"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stacked Floating Toasts Banner Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                className="w-full pointer-events-auto bg-zinc-950/95 border border-white/60 rounded-lg p-4 shadow-2xl flex items-start gap-3 backdrop-blur-md"
              >
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : isError ? (
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                )}
                
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 block font-bold">
                    {isSuccess ? 'Sucesso' : isError ? 'Erro' : 'Notificação'}
                  </span>
                  <p className="text-xs text-zinc-200 mt-1 font-sans leading-relaxed">{toast.text}</p>
                </div>

                <button
                  onClick={() => removeToast(toast.id)}
                  className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
