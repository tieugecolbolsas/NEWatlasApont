import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { Funcionaria, StatusFuncionaria } from './types/rh';

interface FuncionariaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    nome: string;
    cargo: string;
    status: StatusFuncionaria;
    data_saida: string | null;
    data_volta: string | null;
  }) => Promise<void>;
  funcionariaToEdit: Funcionaria | null;
}

export default function FuncionariaModal({
  isOpen,
  onClose,
  onSave,
  funcionariaToEdit,
}: FuncionariaModalProps) {
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('OPERADORA');
  const [status, setStatus] = useState<StatusFuncionaria>('ativa');
  const [dataSaida, setDataSaida] = useState('');
  const [dataVolta, setDataVolta] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (funcionariaToEdit) {
      setNome(funcionariaToEdit.nome || '');
      setCargo(funcionariaToEdit.cargo || 'OPERADORA');
      setStatus(funcionariaToEdit.status || 'ativa');
      setDataSaida(funcionariaToEdit.data_saida || '');
      setDataVolta(funcionariaToEdit.data_volta || '');
    } else {
      setNome('');
      setCargo('OPERADORA');
      setStatus('ativa');
      setDataSaida('');
      setDataVolta('');
    }
  }, [funcionariaToEdit, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !cargo.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        nome: nome.trim().toUpperCase(),
        cargo: cargo.trim(),
        status,
        data_saida: dataSaida ? dataSaida : null,
        data_volta: dataVolta ? dataVolta : null,
      });
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const cargosPredefinidos = [
    'OPERADORA',
    'OP. DE EMBALAGEM',
    'OP. DE CADÊNCIA',
    'OP. DE REVISÃO',
    'LÍDER DE SETOR',
    'SUPERVISORA',
    'AUXILIAR DE PRODUÇÃO',
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="relative bg-zinc-900 border border-white/60 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl z-10 text-zinc-100 font-sans"
          >
            {/* Upper Blue/Purple accent bar */}
            <div className="h-1 w-full bg-[#00624C]" />

            {/* Header */}
            <div className="p-6 border-b border-white/30 flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-[#00624C] font-bold">
                {funcionariaToEdit ? 'ALTERAR COLABORADORA' : 'CADASTRAR NOVA COLABORADORA'}
              </h2>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                  Nome Completo
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="EX: CLAUDIA MARQUES"
                  className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C] font-mono uppercase"
                />
              </div>

              {/* Cargo / Role */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                  Cargo / Setor
                </label>
                <div className="flex gap-2">
                  <select
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C]"
                  >
                    {cargosPredefinidos.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    {!cargosPredefinidos.includes(cargo) && (
                      <option value={cargo}>{cargo}</option>
                    )}
                  </select>
                  <input
                    type="text"
                    placeholder="Outro Cargo"
                    className="w-1/3 bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C] font-mono uppercase"
                    onChange={(e) => {
                      if (e.target.value) setCargo(e.target.value.toUpperCase());
                    }}
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                  Status Operacional
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['ativa', 'ferias', 'afastamento', 'inativa'] as StatusFuncionaria[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setStatus(st);
                        if (st === 'ativa') {
                          setDataSaida('');
                          setDataVolta('');
                        }
                      }}
                      className={`py-2 rounded border text-[10px] font-mono font-bold uppercase transition-all ${
                        status === st
                          ? 'border-[#00624C] bg-[#00624C]/10 text-white shadow-[0_0_10px_rgba(90,24,154,0.15)]'
                          : 'border-white/30 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {st === 'ferias' ? 'FÉRIAS' : st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date pickers (for non-active status) */}
              {status !== 'ativa' && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dashed border-white/30">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                      Data de Saída
                    </label>
                    <input
                      type="date"
                      value={dataSaida}
                      onChange={(e) => setDataSaida(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C] font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold block">
                      Previsão de Retorno
                    </label>
                    <input
                      type="date"
                      value={dataVolta}
                      onChange={(e) => setDataVolta(e.target.value)}
                      className="w-full bg-zinc-950 border border-white/30 rounded px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00624C] font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Form Action buttons */}
              <div className="flex gap-3 pt-4 border-t border-white/30 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded border border-white/30 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded text-white text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: '#00624C' }}
                >
                  <Save size={14} />
                  {isSaving ? 'SALVANDO...' : 'SALVAR REGISTRO'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
