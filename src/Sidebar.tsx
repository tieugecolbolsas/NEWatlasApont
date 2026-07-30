import React from 'react';
import { 
  Cpu,
  History,
  LogOut,
  X,
  Scan
} from 'lucide-react';
import { motion } from 'motion/react';
import Logo from './Logo';

interface User {
  email?: string;
}

interface SidebarProps {
  user?: User;
  onLogout: () => void;
  isDark: boolean;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  activePath?: string;
}

export const menuItems = [
  { id: 'apontamentos', label: 'Apontamentos', icon: History, path: '/apontamentos' },
  { id: 'status-maquinas', label: 'Status de Máquinas', icon: Cpu, path: '/status-maquinas' },
  { id: 'scanner-caixas', label: 'Scan QR Code', icon: Scan, path: '/scanner-caixas' },
] as const;

export default function Sidebar({
  user,
  onLogout,
  isDark,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  isSidebarCollapsed,
  activePath = '/apontamentos',
  onNavigate
}: SidebarProps & { onNavigate?: (path: string) => void }) {
  return (
    <aside
      id="dashboard-sidebar"
      className={`fixed top-14 md:top-0 bottom-0 left-0 z-40 transform md:relative h-[calc(100vh-3.5rem)] md:h-screen flex flex-col justify-between transition-all duration-300 ease-in-out select-none shrink-0 overflow-y-auto w-72
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} 
        ${isSidebarCollapsed ? 'md:-ml-72 md:opacity-0 md:border-r-0' : 'md:translate-x-0 md:ml-0 md:border-r md:opacity-100'}
        ${isDark 
          ? 'bg-[#0a0a0a] border-white/20 text-[#ffffff]' 
          : 'bg-white border-neutral-200 text-black shadow-2xl md:shadow-none shadow-neutral-400'
        }`}
    >
      <div className="flex flex-col h-full">
        {/* Logo & Banner Section */}
        <div className="px-4 py-6 border-b border-white/20 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[170px]">
          {/* Unified Celestial Logo Container */}
          <div className="relative flex items-center justify-center w-40 h-40 select-none">
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
                {/* Planet 1 on r=32 (Animate counter-clockwise) */}
                <g className="animate-orbit-rotate-reverse">
                  <circle cx="50" cy="18" r="2.2" fill="#00875A" stroke="none" />
                  <circle cx="50" cy="18" r="3.5" stroke="#00875A" strokeWidth="0.15" fill="none" className="opacity-75" />
                </g>

                {/* Planet 2 on r=20 (Animate clockwise) */}
                <g className="animate-orbit-rotate">
                  <circle cx="50" cy="30" r="1.5" fill="#00875A" stroke="none" />
                  <circle cx="50" cy="30" r="2.2" stroke="#00875A" strokeWidth="0.1" fill="none" className="opacity-60" strokeDasharray="1 1" />
                </g>

                {/* Planet 3 on inclined ring rx=38, ry=8 (Rotating galaxy plane) */}
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
                className="font-gugi text-3xl font-normal tracking-wider uppercase text-white leading-none opacity-95" 
                id="side-system-title"
                style={{ fontFamily: "'Gugi', sans-serif" }}
              >
                ATLAS
              </h1>
              <span className="mt-1.5 text-[10px] font-mono font-medium tracking-[0.22em] text-[#00875A] uppercase">
                APONTAMENTO
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-1.5 flex-1" id="sidebar-nav">
          <div className="px-2.5 mb-2.5 text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-600">
            Operações de Terminal
          </div>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePath === item.path;
            
            return (
              <button
                key={item.id}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (onNavigate) onNavigate(item.path);
                }}
                className={`w-full py-2.5 px-3.5 rounded-xl flex items-center gap-3 font-sans text-xs font-semibold tracking-wider transition-all duration-200 cursor-pointer text-left uppercase
                  ${isActive 
                    ? 'bg-[#00624C] text-white shadow-lg shadow-[#00624C]/15' 
                    : isDark 
                      ? 'text-neutral-400 hover:text-white hover:bg-neutral-900/40 border border-transparent hover:border-neutral-800/40' 
                      : 'text-neutral-600 hover:text-black hover:bg-neutral-50 border border-transparent hover:border-neutral-200'
                  }`}
              >
                <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className="uppercase truncate flex-1">{item.label}</span>
                {isActive && (
                  <motion.span 
                    layoutId="activeIndicator"
                    className="ml-auto w-1.5 h-1.5 bg-white rounded-full shrink-0"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Identity and Operations Section At Base */}
      <div className="p-4 border-t border-white/20 bg-neutral-950/20">
        <div className="flex items-center gap-3 mb-4" id="sidebar-user-block">
          <div className="w-9 h-9 rounded-full bg-[#00624C]/10 border-2 border-[#00624C] flex items-center justify-center font-sans font-black text-xs text-[#00624C]">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="overflow-hidden min-w-0 flex-1">
            <div className="text-[10px] font-bold text-neutral-500 font-mono tracking-wider uppercase">
              OPERADOR CONECTADO
            </div>
            <p className="text-xs font-bold font-mono text-neutral-200 truncate" title={user?.email || ''}>
              {user?.email || 'Usuário'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            id="sidebar-logout-btn"
            onClick={onLogout}
            className="w-full py-2.5 px-3 rounded-xl bg-[#00624C] hover:bg-[#004838] text-white flex items-center justify-center gap-2 font-mono text-xs font-bold tracking-wider transition-all duration-200 active:scale-95 shadow-md shadow-[#00624C]/15 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="uppercase">Sair do Console</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
