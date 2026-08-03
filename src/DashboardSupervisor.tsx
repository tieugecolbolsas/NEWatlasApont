import { useState } from 'react';
import { Menu, X, ChevronLeft, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Logo from './Logo';
import Sidebar, { menuItems } from './Sidebar';

// Real-time Supervision imports
import { RealtimeProvider } from './lib/realtimeContext';
import StatusMaquinas from './components/StatusMaquinas';
import Apontamentos from './components/Apontamentos';
import ScannerCaixas from './components/ScannerCaixas';

interface DashboardProps {
  userEmail: string;
  onLogout: () => void;
  addToast: (text: string, type: 'success' | 'error' | 'info') => void;
  mode: string;
}

export default function Dashboard({ userEmail, onLogout, addToast, mode }: DashboardProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [activePath, setActivePath] = useState<string>('/apontamentos');
  const [isQuickQRModalOpen, setIsQuickQRModalOpen] = useState(false);

  const renderContent = () => {
    switch (activePath) {
      case '/status-maquinas':
        return <StatusMaquinas />;
      case '/apontamentos':
        return <Apontamentos />;
      case '/scanner-caixas':
        return <ScannerCaixas />;
      default:
        return <Apontamentos />;
    }
  };

  return (
    <RealtimeProvider addToast={addToast}>
      <div className="w-full min-h-screen flex flex-col md:flex-row relative z-10 overflow-x-hidden md:overflow-hidden bg-transparent">
        
        {/* MOBILE BAR (Hidden on Desktop) */}
        <div 
          id="dashboard-mobile-bar"
          className="md:hidden w-full h-14 px-3 flex items-center justify-between transition-colors duration-300 sticky top-0 z-50 bg-zinc-950/95 backdrop-blur border-b border-white/60 text-white shrink-0"
        >
          <div className="relative flex items-center justify-center w-32 h-11 select-none overflow-hidden -ml-3">
            {/* Celestial Grid & Orbits Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
              <svg 
                className="w-full h-full text-white/30" 
                viewBox="0 0 100 100" 
                fill="none" 
                stroke="currentColor"
              >
                {/* Polar Grid / Concentric Orbits */}
                <circle cx="50" cy="50" r="44" strokeWidth="0.3" strokeDasharray="2 3" />
                <circle cx="50" cy="50" r="32" strokeWidth="0.5" />
                <circle cx="50" cy="50" r="20" strokeWidth="0.35" strokeDasharray="1 2" />
                <circle cx="50" cy="50" r="8" strokeWidth="0.2" />
                
                {/* Inclined Orbital/Planetary Rings */}
                <ellipse cx="50" cy="50" rx="46" ry="14" transform="rotate(-28 50 50)" strokeWidth="0.65" strokeDasharray="3 2" />
                <ellipse cx="50" cy="50" rx="38" ry="8" transform="rotate(15 50 50)" strokeWidth="0.4" />
                
                {/* Meridian / Equator Grid Lines */}
                <line x1="50" y1="2" x2="50" y2="98" strokeWidth="0.25" strokeDasharray="4 4" />
                <line x1="2" y1="50" x2="98" y2="50" strokeWidth="0.25" strokeDasharray="4 4" />
                <line x1="15" y1="15" x2="85" y2="85" strokeWidth="0.15" strokeDasharray="2 6" />
                <line x1="15" y1="85" x2="85" y2="15" strokeWidth="0.15" strokeDasharray="2 6" />
                
                {/* Orbiting Planets & Elements with Animations */}
                <g className="animate-orbit-rotate-reverse">
                  <circle cx="50" cy="18" r="2.2" fill="#00875A" stroke="none" />
                  <circle cx="50" cy="18" r="3.5" stroke="#00875A" strokeWidth="0.15" fill="none" className="opacity-75" />
                </g>

                <g className="animate-orbit-rotate">
                  <circle cx="50" cy="30" r="1.5" fill="#00875A" stroke="none" />
                  <circle cx="50" cy="30" r="2.2" stroke="#00875A" strokeWidth="0.1" fill="none" className="opacity-60" strokeDasharray="1 1" />
                </g>

                <g className="animate-orbit-rotate-slow">
                  <circle cx="88" cy="50" r="1.8" fill="#00875A" stroke="none" />
                </g>

                {/* Stars / Constellation background particles */}
                <g className="opacity-80">
                  <circle cx="18" cy="22" r="0.8" fill="currentColor" stroke="none" />
                  <circle cx="82" cy="78" r="0.8" fill="currentColor" stroke="none" />
                  <circle cx="78" cy="24" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="22" cy="76" r="1.0" fill="currentColor" stroke="none" />
                  <circle cx="88" cy="40" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="60" r="1.0" fill="currentColor" stroke="none" />
                </g>
              </svg>
            </div>

            {/* Logo Text Centered Over Orbits */}
            <div className="relative z-10 flex flex-col items-center justify-center text-center pointer-events-none">
              <h1 
                className="font-gugi text-base font-normal tracking-wider uppercase text-white leading-none opacity-95" 
                style={{ fontFamily: "'Gugi', sans-serif" }}
              >
                ATLAS
              </h1>
              <span className="mt-0.5 text-[6.5px] font-mono font-medium tracking-[0.2em] text-[#00875A] uppercase">
                APONTAMENTO
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="mobile-qr-scan-btn"
              onClick={() => setIsQuickQRModalOpen(true)}
              className="p-1.5 rounded-lg text-[#00624C] hover:bg-neutral-900 border border-neutral-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Escanear QR Code"
            >
              <QrCode className="w-5 h-5" />
            </button>
            <button 
              id="mobile-menu-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 rounded-lg text-[#00624C] hover:bg-neutral-900 border border-neutral-800"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <Sidebar 
          user={{ email: userEmail }}
          onLogout={onLogout}
          isDark={true}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          isSidebarCollapsed={isSidebarCollapsed}
          activePath={activePath}
          onNavigate={setActivePath}
        />

        {/* SIDEBAR DESKTOP TOGGLE */}
        <div 
          className="hidden md:flex absolute top-12 z-50 transition-all duration-300"
          style={{ left: isSidebarCollapsed ? '16px' : 'calc(18rem - 16px)' }}
        >
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-8 h-8 bg-[#00624C] hover:bg-[#004838] rounded-full flex items-center justify-center text-white shadow-lg shadow-[#00624C]/50 transition-transform duration-300 border border-[#00624C]/30"
            style={{ transform: isSidebarCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
            title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <main className="flex-1 flex flex-col min-h-screen md:h-screen overflow-y-auto relative" id="dashboard-viewport">
          
          {/* TOP SUSPENDED NAVIGATION PILL HEADER (Only visible on desktop when sidebar is collapsed) */}
          <AnimatePresence>
            {isSidebarCollapsed && (
              <motion.header
                initial={{ opacity: 0, y: -25 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -25 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="hidden md:flex w-full items-center justify-center p-5 sticky top-0 z-40 bg-transparent pointer-events-none shrink-0"
              >
                <div className="flex items-center gap-1.5 bg-neutral-950/70 border border-[#00624C]/50 backdrop-blur-md px-2 py-1.5 rounded-full pointer-events-auto shadow-2xl shadow-[#00624C]/10">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePath === item.path;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActivePath(item.path)}
                        className={`flex items-center gap-2 py-1.5 px-3.5 rounded-full font-sans text-[10px] font-bold tracking-wider transition-all duration-200 cursor-pointer uppercase ${
                          isActive
                            ? 'bg-[#00624C]/20 text-purple-400 border border-[#00624C]/30 shadow-[0_0_12px_rgba(175,30,89,0.15)]'
                            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/40 border border-transparent'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-purple-400' : 'text-neutral-400'}`} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.header>
            )}
          </AnimatePresence>

          {/* MAIN CONTENT */}
          <div className="flex-1 flex flex-col min-h-0">
            {renderContent()}
          </div>

          {/* FOOTER */}
          <footer className="h-12 border-t border-white/20 bg-neutral-950/30 backdrop-blur-sm text-[9px] uppercase tracking-widest font-mono font-bold flex items-center justify-between px-6 text-neutral-600 mt-auto shrink-0 animate-none">
            <span className="text-right text-[#00624C]">SISTEMA OPERACIONAL VER. 0.0.1 alpha</span>
          </footer>
        </main>

        {/* QUICK QR CODE SCANNER MODAL (MOBILE) */}
        {isQuickQRModalOpen && (
          <ScannerCaixas 
            quickScanMode={true} 
            onCloseQuickScan={() => setIsQuickQRModalOpen(false)} 
          />
        )}
      </div>
    </RealtimeProvider>
  );
}
