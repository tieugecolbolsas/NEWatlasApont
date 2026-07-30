import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Users, UserPlus, Search, Edit2, ArrowRightLeft, Calendar, LogOut, ChevronRight, CheckCircle, Info } from 'lucide-react';
import { Funcionaria, StatusFuncionaria } from './types/rh';

interface GestaoColaboradoresProps {
  addToast: (text: string, type: 'success' | 'error' | 'info') => void;
  funcionarias: Funcionaria[];
  loading: boolean;
  activeTab: StatusFuncionaria;
  setActiveTab: (tab: StatusFuncionaria) => void;
  onEdit: (f: Funcionaria) => void;
  onAdd: () => void;
  onStatusChange: (id: string, newStatus: StatusFuncionaria) => void;
  stats: {
    total: number;
    ativas: number;
    ferias: number;
    afastamento: number;
    inativas: number;
  };
}

export default function GestaoColaboradores({
  addToast,
  funcionarias,
  loading,
  activeTab,
  setActiveTab,
  onEdit,
  onAdd,
  onStatusChange,
  stats,
}: GestaoColaboradoresProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCargo, setSelectedCargo] = useState('TODOS');

  // Format date helper: YYYY-MM-DD -> DD/MM/YYYY
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/D';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  };

  const THEME = {
    primary: '#00624C',
    bg: '#09090b', // zinc-950
    card: '#18181b', // zinc-900
    border: '#27272a', // zinc-800
  };

  // Extract unique roles for filtration
  const uniqueCargos = ['TODOS', ...Array.from(new Set(funcionarias.map(f => f.cargo || 'OPERADORA')))];

  // Apply filters strictly
  const filteredList = funcionarias.filter(f => {
    const statusMatch = f.status === activeTab;
    const roleMatch = selectedCargo === 'TODOS' || (f.cargo || 'OPERADORA').toLowerCase().trim() === selectedCargo.toLowerCase().trim();
    
    const query = searchTerm.toLowerCase().trim();
    const nameMatch = (f.nome || '').toLowerCase().trim().includes(query);
    const cargoMatchStr = (f.cargo || 'OPERADORA').toLowerCase().trim().includes(query);
    
    return statusMatch && roleMatch && (nameMatch || cargoMatchStr);
  });

  return (
    <div className="flex-1 p-4 md:p-8 space-y-6 overflow-y-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold uppercase tracking-[0.2em] text-[#00624C]">
            GESTÃO DE COLABORADORES
          </h2>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
            Painel de Controle e Status Operacional do Setor
          </p>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Glow card total */}
        <div 
          className="col-span-2 md:col-span-1 border rounded-lg p-5 flex flex-col items-center justify-center shadow-[0_0_20px_rgba(90,24,154,0.15)] relative overflow-hidden bg-zinc-900/40" 
          style={{ borderColor: THEME.primary }}
        >
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-300 mb-1">Total Geral</span>
          <span className="text-3xl font-mono font-bold text-white">{stats.total}</span>
        </div>

        <button 
          onClick={() => setActiveTab('ativa')}
          className={`border rounded-lg p-5 flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeTab === 'ativa' 
              ? 'border-[#00624C] bg-[#00624C]/5 shadow-[0_0_15px_rgba(90,24,154,0.15)]' 
              : 'border-white/30 bg-zinc-900/20 hover:border-white/50'
          }`}
        >
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1">Ativas</span>
          <span className="text-3xl font-mono font-bold text-[#00624C]">{stats.ativas}</span>
        </button>

        <button 
          onClick={() => setActiveTab('ferias')}
          className={`border rounded-lg p-5 flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeTab === 'ferias' 
              ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
              : 'border-white/30 bg-zinc-900/20 hover:border-white/50'
          }`}
        >
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1">Férias</span>
          <span className="text-3xl font-mono font-bold text-emerald-500">{stats.ferias}</span>
        </button>

        <button 
          onClick={() => setActiveTab('afastamento')}
          className={`border rounded-lg p-5 flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeTab === 'afastamento' 
              ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
              : 'border-white/30 bg-zinc-900/20 hover:border-white/50'
          }`}
        >
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1">Afastamento</span>
          <span className="text-3xl font-mono font-bold text-amber-500">{stats.afastamento}</span>
        </button>

        <button 
          onClick={() => setActiveTab('inativa')}
          className={`border rounded-lg p-5 flex flex-col items-center justify-center transition-all cursor-pointer ${
            activeTab === 'inativa' 
              ? 'border-rose-500 bg-rose-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
              : 'border-white/30 bg-zinc-900/20 hover:border-white/50'
          }`}
        >
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 mb-1">Inativas</span>
          <span className="text-3xl font-mono font-bold text-rose-500">{stats.inativas}</span>
        </button>
      </div>

      {/* Action and Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-zinc-900/20 border border-white/60 p-4 rounded-lg">
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {/* Role selector */}
          <div className="flex flex-col gap-1">
            <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Filtro de Cargo</span>
            <select
              value={selectedCargo}
              onChange={(e) => setSelectedCargo(e.target.value)}
              className="bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-[#00624C]"
            >
              {uniqueCargos.map((cargo) => (
                <option key={cargo} value={cargo}>
                  {cargo}
                </option>
              ))}
            </select>
          </div>

          {/* Search bar */}
          <div className="flex flex-col gap-1 flex-1 sm:w-80">
            <span className="text-[8px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Busca Textual</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome ou cargo..."
                className="w-full pl-9 pr-4 py-2.5 bg-zinc-950 border border-white/30 rounded text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-[#00624C]"
              />
            </div>
          </div>
        </div>

        {/* Create Collaborator button */}
        <button
          onClick={onAdd}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded text-white text-xs font-mono font-bold uppercase tracking-widest shadow-lg shadow-[#00624C]/15 transition-all hover:scale-105 cursor-pointer bg-[#00624C] hover:bg-[#4a1082]"
        >
          <UserPlus size={16} />
          NOVA FUNCIONÁRIA
        </button>
      </div>

      {/* Main List Table */}
      <div className="border border-white/60 rounded-lg p-6 bg-zinc-900/40 relative">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <div className="w-8 h-8 border-2 border-t-transparent border-[#00624C] rounded-full animate-spin" />
            <span className="font-mono text-zinc-500 text-xs uppercase tracking-widest">Acessando Banco de Dados...</span>
          </div>
        ) : (
          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[9px] uppercase tracking-wider text-zinc-500 border-b border-white/30">
                <tr>
                  <th className="py-3 px-4">NOME COMPLETO</th>
                  <th className="py-3 px-4">CARGO / SETOR</th>
                  <th className="py-3 px-4 text-center">STATUS</th>
                  {activeTab !== 'ativa' && (
                    <>
                      <th className="py-3 px-4 text-center">DATA SAÍDA</th>
                      <th className="py-3 px-4 text-center">RETORNO PREVISTO</th>
                    </>
                  )}
                  <th className="py-3 px-4 text-center">MUDAR STATUS</th>
                  <th className="py-3 px-4 text-center">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredList.map((f) => (
                  <tr key={f.id} className="hover:bg-zinc-900/30 transition-colors">
                    {/* Name */}
                    <td className="py-3.5 px-4 font-sans text-xs font-semibold text-white tracking-wide">
                      {f.nome.toUpperCase()}
                    </td>
                    
                    {/* Cargo */}
                    <td className="py-3.5 px-4">
                      <span className="bg-zinc-950 border border-zinc-800 text-[10px] px-2 py-0.5 rounded font-bold text-zinc-400">
                        {f.cargo || 'OPERADORA'}
                      </span>
                    </td>

                    {/* Status Pill */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${
                        f.status === 'ativa'
                          ? 'bg-[#00624C]/10 text-purple-400 border-[#00624C]/30'
                          : f.status === 'ferias'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : f.status === 'afastamento'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {f.status}
                      </span>
                    </td>

                    {/* Dynamic leave info dates */}
                    {activeTab !== 'ativa' && (
                      <>
                        <td className="py-3.5 px-4 text-center text-zinc-300 font-bold">
                          {formatDate(f.data_saida)}
                        </td>
                        <td className="py-3.5 px-4 text-center text-zinc-300 font-bold">
                          {formatDate(f.data_volta)}
                        </td>
                      </>
                    )}

                    {/* Quick status transition actions */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex gap-1 bg-zinc-950 border border-zinc-800 p-0.5 rounded">
                        {f.status !== 'ativa' && (
                          <button
                            onClick={() => onStatusChange(f.id, 'ativa')}
                            className="text-[8px] uppercase tracking-widest font-bold font-mono px-1.5 py-0.5 rounded text-purple-400 hover:bg-[#00624C]/10 transition-colors cursor-pointer"
                            title="Reativar Colaboradora"
                          >
                            ATIVA
                          </button>
                        )}
                        {f.status !== 'ferias' && (
                          <button
                            onClick={() => onStatusChange(f.id, 'ferias')}
                            className="text-[8px] uppercase tracking-widest font-bold font-mono px-1.5 py-0.5 rounded text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                            title="Lançar Férias"
                          >
                            FÉRIAS
                          </button>
                        )}
                        {f.status !== 'afastamento' && (
                          <button
                            onClick={() => onStatusChange(f.id, 'afastamento')}
                            className="text-[8px] uppercase tracking-widest font-bold font-mono px-1.5 py-0.5 rounded text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                            title="Afastar"
                          >
                            AFASTAR
                          </button>
                        )}
                        {f.status !== 'inativa' && (
                          <button
                            onClick={() => onStatusChange(f.id, 'inativa')}
                            className="text-[8px] uppercase tracking-widest font-bold font-mono px-1.5 py-0.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Inativar/Desligar"
                          >
                            INATIVAR
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Edit controls */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onEdit(f)}
                        className="text-[#00624C] hover:text-white p-1.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Editar Detalhes"
                      >
                        <Edit2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan={activeTab !== 'ativa' ? 8 : 6} className="py-12 text-center text-zinc-500 font-mono">
                      NENHUM REGISTRO OPERACIONAL ENCONTRADO NESTA ABA
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Information footer */}
      <div className="flex gap-2.5 items-start p-4 bg-zinc-900/25 border border-zinc-800 rounded text-[11px] text-zinc-400 font-sans leading-relaxed">
        <Info size={14} className="text-[#00624C] shrink-0 mt-0.5" />
        <div>
          <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-zinc-300 block mb-1">
            INTEGRIDADE DO MONITOR ATLAS
          </span>
          Todas as alterações feitas neste painel refletem instantaneamente no banco de dados e nos registros de cadência do chão de fábrica. Certifique-se de preencher as datas de saída e previsão de retorno corretamente.
        </div>
      </div>
    </div>
  );
}
