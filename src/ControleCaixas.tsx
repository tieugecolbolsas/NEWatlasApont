import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Box, Plus, Search, Calendar, PackageCheck, ClipboardList, ShieldAlert, ArrowUpDown, Trash2 } from 'lucide-react';

interface CaixaLog {
  id: string;
  codigo: string;
  operadora: string;
  processo: string;
  quantidade: number;
  dataHora: string;
  status: 'validado' | 'pendente' | 'rejeitado';
}

export default function ControleCaixas() {
  const [caixas, setCaixas] = useState<CaixaLog[]>([
    { id: '1', codigo: 'CX-38910', operadora: 'ANA PAULA SILVA', processo: 'CADÊNCIA', quantidade: 24, dataHora: '13/07/2026 10:15', status: 'validado' },
    { id: '2', codigo: 'CX-38911', operadora: 'BEATRIZ SOUZA', processo: 'EMBALAGEM', quantidade: 30, dataHora: '13/07/2026 10:18', status: 'validado' },
    { id: '3', codigo: 'CX-38912', operadora: 'CAMILA REIS', processo: 'REVISÃO', quantidade: 18, dataHora: '13/07/2026 10:32', status: 'pendente' },
    { id: '4', codigo: 'CX-38913', operadora: 'CLAUDIA MARQUES', processo: 'CADÊNCIA', quantidade: 22, dataHora: '13/07/2026 10:45', status: 'validado' },
    { id: '5', codigo: 'CX-38914', operadora: 'DEBORA OLIVEIRA', processo: 'EMBALAGEM', quantidade: 28, dataHora: '13/07/2026 11:02', status: 'rejeitado' },
  ]);

  const [novoCodigo, setNovoCodigo] = useState('');
  const [novaOperadora, setNovaOperadora] = useState('');
  const [novoProcesso, setNovoProcesso] = useState('CADÊNCIA');
  const [novaQtd, setNovaQtd] = useState<number>(20);
  const [filtro, setFiltro] = useState('');

  const handleAddCaixa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoCodigo.trim() || !novaOperadora.trim()) return;

    const nova: CaixaLog = {
      id: Math.random().toString(),
      codigo: novoCodigo.toUpperCase().trim(),
      operadora: novaOperadora.toUpperCase().trim(),
      processo: novoProcesso,
      quantidade: Number(novaQtd),
      dataHora: new Date().toLocaleString('pt-BR'),
      status: 'pendente',
    };

    setCaixas([nova, ...caixas]);
    setNovoCodigo('');
    setNovaOperadora('');
    setNovaQtd(20);
  };

  const handleDelete = (id: string) => {
    setCaixas(caixas.filter(c => c.id !== id));
  };

  const toggleStatus = (id: string) => {
    setCaixas(caixas.map(c => {
      if (c.id === id) {
        const nextStatus: CaixaLog['status'] = c.status === 'validado' ? 'rejeitado' : c.status === 'rejeitado' ? 'pendente' : 'validado';
        return { ...c, status: nextStatus };
      }
      return c;
    }));
  };

  const filteredCaixas = caixas.filter(c => 
    c.codigo.toLowerCase().includes(filtro.toLowerCase().trim()) ||
    c.operadora.toLowerCase().includes(filtro.toLowerCase().trim()) ||
    c.processo.toLowerCase().includes(filtro.toLowerCase().trim())
  );

  const stats = {
    totalPecas: caixas.reduce((acc, c) => acc + (c.status === 'validado' ? c.quantidade : 0), 0),
    caixasTotais: caixas.length,
    caixasValidadas: caixas.filter(c => c.status === 'validado').length,
    caixasPendentes: caixas.filter(c => c.status === 'pendente').length,
    caixasRejeitadas: caixas.filter(c => c.status === 'rejeitado').length,
  };

  return (
    <div className="flex-1 p-4 md:p-8 space-y-8 overflow-y-auto">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold uppercase tracking-[0.2em] text-[#00624C]">
            CONTROLE DE CAIXAS
          </h2>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
            TERMINAL DE VALIDAÇÃO DE LOTES DE PEÇAS
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="border border-white/30 rounded-lg p-5 flex flex-col justify-between bg-zinc-900/60 shadow-lg shadow-[#00624C]/5 relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-15"><PackageCheck size={28} className="text-[#00624C]" /></div>
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Pecas Validadas</span>
          <span className="text-3xl font-mono font-bold text-white mt-2">{stats.totalPecas}</span>
        </div>
        <div className="border border-white/30 rounded-lg p-5 flex flex-col justify-between bg-zinc-900/60">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Lotes Registrados</span>
          <span className="text-3xl font-mono font-bold text-white mt-2">{stats.caixasTotais}</span>
        </div>
        <div className="border border-white/30 rounded-lg p-5 flex flex-col justify-between bg-zinc-900/60">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Validadas</span>
          <span className="text-3xl font-mono font-bold text-emerald-500 mt-2">{stats.caixasValidadas}</span>
        </div>
        <div className="border border-white/30 rounded-lg p-5 flex flex-col justify-between bg-zinc-900/60">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Pendentes</span>
          <span className="text-3xl font-mono font-bold text-amber-500 mt-2">{stats.caixasPendentes}</span>
        </div>
        <div className="border border-white/30 rounded-lg p-5 flex flex-col justify-between bg-zinc-900/60">
          <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">Rejeitadas</span>
          <span className="text-3xl font-mono font-bold text-rose-500 mt-2">{stats.caixasRejeitadas}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Registration Form */}
        <div className="lg:col-span-1 border border-white/30 rounded-lg p-6 bg-zinc-900/30 flex flex-col h-fit">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-[#00624C]" />
            <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-zinc-300">
              LANÇAR NOVO LOTE
            </span>
          </div>

          <form onSubmit={handleAddCaixa} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                Código de Rastreamento (Caixa)
              </label>
              <input
                type="text"
                required
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(e.target.value)}
                placeholder="EX: CX-38915"
                className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#00624C] uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                Colaboradora Responável
              </label>
              <input
                type="text"
                required
                value={novaOperadora}
                onChange={(e) => setNovaOperadora(e.target.value)}
                placeholder="NOME DA OPERADORA"
                className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#00624C] uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                  Processo
                </label>
                <select
                  value={novoProcesso}
                  onChange={(e) => setNovoProcesso(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C]"
                >
                  <option value="CADÊNCIA">CADÊNCIA</option>
                  <option value="EMBALAGEM">EMBALAGEM</option>
                  <option value="REVISÃO">REVISÃO</option>
                  <option value="DIVERSOS">DIVERSOS</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                  Qtd de Peças
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={novaQtd}
                  onChange={(e) => setNovaQtd(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C] font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 mt-2 rounded font-bold text-white transition-all cursor-pointer text-xs font-mono tracking-widest shadow-lg shadow-[#00624C]/10 uppercase"
              style={{ backgroundColor: '#00624C' }}
            >
              <Plus size={14} /> Registrar Lote
            </button>
          </form>
        </div>

        {/* List of Registered Boxes */}
        <div className="lg:col-span-2 border border-white/30 rounded-lg p-6 bg-zinc-900/30 flex flex-col">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-[#00624C]" />
              <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-zinc-300">
                HISTÓRICO DO TURNO DE TRABALHO
              </span>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Filtrar caixas ou colaboradoras..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-zinc-950 border border-white/30 rounded text-xs text-white focus:outline-none focus:border-[#00624C] transition-colors font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto min-w-0">
            <table className="w-full text-left text-xs font-mono">
              <thead className="text-[9px] uppercase tracking-wider text-zinc-500 border-b border-white/30">
                <tr>
                  <th className="py-3 px-4">LOTE (CX)</th>
                  <th className="py-3 px-4">COLABORADORA</th>
                  <th className="py-3 px-4">PROCESSO</th>
                  <th className="py-3 px-4 text-center">PEÇAS</th>
                  <th className="py-3 px-4 text-center">STATUS</th>
                  <th className="py-3 px-4 text-center">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredCaixas.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-white">{c.codigo}</td>
                    <td className="py-3.5 px-4 font-sans text-zinc-300 uppercase font-semibold text-[11px] tracking-wide">{c.operadora}</td>
                    <td className="py-3.5 px-4">
                      <span className="bg-zinc-950 border border-white/30 text-[10px] px-2 py-0.5 rounded font-bold text-zinc-400">
                        {c.processo}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center text-white font-bold">{c.quantidade}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => toggleStatus(c.id)}
                        className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded cursor-pointer border ${
                          c.status === 'validado'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : c.status === 'rejeitado'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {c.status}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-zinc-500 hover:text-rose-500 p-1 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Deletar Registro"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredCaixas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono">
                      NENHUM REGISTRO LOCALIZADO
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
