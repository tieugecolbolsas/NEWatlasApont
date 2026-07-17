import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRealtime } from '../lib/realtimeContext';
import { Maquina } from '../types/supervisao';
import { supabase } from '../lib/supabase';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine, 
  ResponsiveContainer 
} from 'recharts';
import { 
  Settings2, 
  Cpu, 
  User, 
  History, 
  Wrench, 
  PauseCircle, 
  PlayCircle, 
  PowerOff,
  X,
  Search,
  Filter,
  Activity,
  Clock,
  Target,
  ChevronRight,
  Sparkles,
  Layers
} from 'lucide-react';

const getNumericValue = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 999;
  const match = String(val).match(/\d+/);
  return match ? parseInt(match[0], 10) : 999;
};

// Generates dynamic hourly cumulative curves for production metrics based on database records
const generateDynamicHourlyChartData = (records: any[]) => {
  const currentHour = new Date().getHours();
  
  const hourLabels = [
    { label: '07h', hour: 7 },
    { label: '08h', hour: 8 },
    { label: '09h', hour: 9 },
    { label: '10h', hour: 10 },
    { label: '11h', hour: 11 },
    { label: '12h', hour: 12 },
    { label: '13h', hour: 13 },
    { label: '14h', hour: 14 },
    { label: '15h', hour: 15 },
    { label: '16h', hour: 16 },
    { label: '17h', hour: 17 }
  ];

  let cumConformes = 0;
  let cumRefugo = 0;
  let cumRProprio = 0;
  let cumRTerceiros = 0;

  return hourLabels.map((bucket) => {
    // Find records that occurred in this specific hour bucket (hour === bucket.hour)
    const recordsInHour = records.filter(r => {
      if (!r.horario_termino) return false;
      const hPart = String(r.horario_termino).split(':')[0];
      const hr = parseInt(hPart, 10);
      return hr === bucket.hour;
    });

    recordsInHour.forEach(r => {
      cumConformes += Number(r.producao_conforme) || 0;
      cumRefugo += Number(r.refugo) || 0;
      cumRProprio += Number(r.retrabalho_proprio) || 0;
      cumRTerceiros += Number(r.retrabalho_terceiro) || 0;
    });

    // Hide future hours to prevent lines from dropping flat unnecessarily
    const isFuture = bucket.hour > currentHour;

    return {
      name: bucket.label,
      "Conformes (Boas)": isFuture ? null : cumConformes,
      "Refugo (Sucata)": isFuture ? null : cumRefugo,
      "Retrabalho Próprio": isFuture ? null : cumRProprio,
      "Retrabalho Terceiros": isFuture ? null : cumRTerceiros,
    };
  });
};

export default function StatusMaquinas() {
  const {
    apontamentos,
    addToast
  } = useRealtime();

  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [machines, setMachines] = useState<Maquina[]>([]);
  const [todayRegistros, setTodayRegistros] = useState<any[]>([]);
  const [colaboradoras, setColaboradoras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Optimistic Cache to avoid reverting to old status
  const [optimisticUpdates, setOptimisticUpdates] = useState<Record<string, {
    status?: string;
    operadora?: string;
    processo?: string;
  }>>({});
  const optimisticUpdatesRef = useRef<Record<string, {
    status?: string;
    operadora?: string;
    processo?: string;
  }>>({});

  const updateOptimistic = (machineNum: string, data: { status?: string, operadora?: string, processo?: string }) => {
    optimisticUpdatesRef.current = {
      ...optimisticUpdatesRef.current,
      [machineNum]: {
        ...optimisticUpdatesRef.current[machineNum],
        ...data
      }
    };
    setOptimisticUpdates({ ...optimisticUpdatesRef.current });
  };

  // Sorting State
  const [sortField, setSortField] = useState<string>('numero');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Terminal editing fields
  const [terminalOperator, setTerminalOperator] = useState('');
  const [terminalProcess, setTerminalProcess] = useState('CADÊNCIA');
  const [terminalEfficiency, setTerminalEfficiency] = useState<number>(0);
  const [terminalPecas, setTerminalPecas] = useState<number>(0);
  const [terminalDropdownOpen, setTerminalDropdownOpen] = useState(false);

  // Active production stopwatch string state
  const [elapsedTimeStr, setElapsedTimeStr] = useState('00:00:00');

  const fetchColaboradoras = async () => {
    try {
      const { data, error } = await supabase
        .schema('SupervisorProd')
        .from('maquinas_operadoras_base')
        .select('*');

      if (error) throw error;

      if (data) {
        const names = Array.from(
          new Set(
            data
              .map((row: any) => {
                const nameVal = row.operadora_nome || row.operadora_padrao || row.operadora || '';
                return String(nameVal).trim().toUpperCase();
              })
              .filter(Boolean)
          )
        ).sort();
        setColaboradoras(names);
      }
    } catch (err: any) {
      console.warn('[StatusMaquinas] Erro ao carregar operadoras da tabela base:', err.message || err);
    }
  };  const fetchData = async () => {
    try {
      // 1. Fetch master machines list from SupervisorProd (MQ-01 to MQ-53)
      const { data: baseData, error: baseError } = await supabase
        .schema('SupervisorProd')
        .from('maquinas_operadoras_base')
        .select('*');

      if (baseError) throw baseError;

      // 2. Fetch active sessions from AtlasApontamento schema
      const { data: sessoesData, error: sessoesError } = await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .select('*');

      if (sessoesError) throw sessoesError;

      // 3. Fetch today's production records from AtlasApontamento schema
      const hojeStr = new Date().toISOString().split('T')[0];
      const { data: registrosData, error: registrosError } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .select('*')
        .eq('data', hojeStr);

      if (registrosError) throw registrosError;

      const recordsList = registrosData || [];
      setTodayRegistros(recordsList);

      // Create lookup maps
      const sessoesMap = new Map();
      (sessoesData || []).forEach((row: any) => {
        const num = String(row.num_maquina || '').trim().toUpperCase();
        if (num) {
          sessoesMap.set(num, row);
        }
      });

      const pecasMap = new Map();
      recordsList.forEach((row: any) => {
        const num = String(row.num_maquina || '').trim().toUpperCase();
        if (num) {
          const current = pecasMap.get(num) || 0;
          pecasMap.set(num, current + (Number(row.producao_conforme) || 0));
        }
      });

      // 4. Combine master list with active sessions and today's pieces
      const parsedRows: Maquina[] = (baseData || []).map((baseRow: any) => {
        const numero = String(baseRow.num_maquina !== undefined ? baseRow.num_maquina : '').trim().toUpperCase();
        const activeSessao = sessoesMap.get(numero);

        const status = activeSessao ? 'produzindo' : 'offline';
        const pecas = pecasMap.get(numero) || 0;
        const oee = Math.min(100, (pecas / 1200) * 100);

        // Operator name: active session name if exists, otherwise fallback to master default operator
        const operadora = activeSessao 
          ? String(activeSessao.operadora_nome || '').toUpperCase().trim()
          : String(baseRow.operadora_nome || '').toUpperCase().trim();

        // Process: active session operation_nome if exists, otherwise default to CADÊNCIA
        const processo = activeSessao
          ? String(activeSessao.operacao_nome || '').toUpperCase().trim()
          : 'CADÊNCIA';

        return {
          id: numero, // Using numero as stable unique ID
          numero,
          operadora,
          processo,
          status: status as any,
          ultima_atualizacao: (activeSessao && activeSessao.created_at) || new Date().toISOString(),
          eficiencia: Number(oee),
          pecas_produzidas: Number(pecas)
        };
      });

      // Merge with optimistic updates
      const mergedRows = parsedRows.map(m => {
        const opt = optimisticUpdatesRef.current[m.numero];
        if (opt) {
          return {
            ...m,
            status: opt.status !== undefined ? (opt.status as any) : m.status,
            operadora: opt.operadora !== undefined ? opt.operadora : m.operadora,
            processo: opt.processo !== undefined ? opt.processo : m.processo,
          };
        }
        return m;
      });

      // Sort machines numerically by machine number by default
      const sorted = mergedRows.sort((a: any, b: any) => {
        const numA = getNumericValue(a.numero);
        const numB = getNumericValue(b.numero);
        return numA - numB;
      });

      setMachines(sorted);

      // Clean up synchronized optimistic updates
      const nextOpt = { ...optimisticUpdatesRef.current };
      let optChanged = false;
      parsedRows.forEach(row => {
        const opt = nextOpt[row.numero];
        if (opt) {
          const statusMatch = opt.status === undefined || opt.status === row.status;
          const operadoraMatch = opt.operadora === undefined || opt.operadora === row.operadora;
          const processoMatch = opt.processo === undefined || opt.processo === row.processo;
          if (statusMatch && operadoraMatch && processoMatch) {
            delete nextOpt[row.numero];
            optChanged = true;
          }
        }
      });
      if (optChanged) {
        optimisticUpdatesRef.current = nextOpt;
        setOptimisticUpdates(nextOpt);
      }
    } catch (err: any) {
      console.warn('[StatusMaquinas] Erro ao carregar Supabase:', err.message || err);
      setMachines([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchColaboradoras();

    // Setup Realtime Subscriptions to sessoes_ativas_terminal and registros_producao_terminal
    const statusChannel = supabase
      .channel('sessoes_ativas_channel_status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'AtlasApontamento',
          table: 'sessoes_ativas_terminal'
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    const caixasChannel = supabase
      .channel('registros_producao_channel_status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'AtlasApontamento',
          table: 'registros_producao_terminal'
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    // Fallback polling for instant local interaction inside web sandboxes
    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => {
      supabase.removeChannel(statusChannel);
      supabase.removeChannel(caixasChannel);
      clearInterval(interval);
    };
  }, []);

  const selectedMachine = machines.find(m => m.id === selectedMachineId);

  // Active stopwatch effect updated in real time
  useEffect(() => {
    if (!selectedMachine) return;
    
    const calculateElapsed = () => {
      if (selectedMachine.status !== 'produzindo') {
        setElapsedTimeStr(
          selectedMachine.status === 'pausada' ? 'PAUSADA' :
          selectedMachine.status === 'manutencao' ? 'EM MANUTENÇÃO' : 'OFFLINE'
        );
        return;
      }
      
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      let startLimit = new Date(`${todayStr}T07:00:00`); // Fallback standard shift start
      
      // Calculate from earliest apontamento today or fallback to machine's last updated_at or 07:00 AM
      const machineAps = todayRegistros.filter(r => 
        String(r.num_maquina).toLowerCase().trim() === selectedMachine.numero.toLowerCase().trim()
      );
      
      if (machineAps.length > 0) {
        const earliestApTime = new Date(Math.min(...machineAps.map(r => {
          if (r.horario_inicio) {
            const [h, m, s] = r.horario_inicio.split(':');
            const d = new Date();
            d.setHours(parseInt(h, 10), parseInt(m, 10), parseInt(s, 10), 0);
            return d.getTime();
          }
          return new Date(r.created_at || r.timestamp || now).getTime();
        })));
        if (earliestApTime < now) {
          startLimit = earliestApTime;
        }
      } else {
        const machineUpdate = new Date(selectedMachine.ultima_atualizacao);
        if (machineUpdate.getDate() === now.getDate() && machineUpdate < now) {
          startLimit = machineUpdate < startLimit ? machineUpdate : startLimit;
        }
      }
      
      const diffMs = now.getTime() - startLimit.getTime();
      if (diffMs <= 0) {
        setElapsedTimeStr('00:00:00');
        return;
      }
      
      const totalSecs = Math.floor(diffMs / 1000);
      const hrs = Math.floor(totalSecs / 3600);
      const mins = Math.floor((totalSecs % 3600) / 60);
      const secs = totalSecs % 60;
      
      setElapsedTimeStr(
        `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    };
    
    calculateElapsed();
    const timer = setInterval(calculateElapsed, 1000);
    return () => clearInterval(timer);
  }, [selectedMachine, todayRegistros, machines]);

  const handleSelectMachine = (m: Maquina) => {
    setSelectedMachineId(m.id);
    setTerminalOperator(m.operadora);
    setTerminalProcess(m.processo);
    setTerminalEfficiency(m.eficiencia);
    setTerminalPecas(m.pecas_produzidas);
  };

  const handleUpdateStatus = async (machineId: string, machineNum: string, newStatus: string) => {
    try {
      const upperStatus = newStatus.toUpperCase();

      // Write to optimistic updates first
      updateOptimistic(machineNum, { status: newStatus });

      if (upperStatus === 'OFFLINE') {
        // Delete active session
        const { error } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .delete()
          .eq('num_maquina', machineNum);

        if (error) throw error;
      } else {
        // Find if active session exists
        const { data: existing, error: findError } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .select('id')
          .eq('num_maquina', machineNum);

        if (findError) throw findError;

        if (!existing || existing.length === 0) {
          // Create new active session with default params
          const { error } = await supabase
            .schema('AtlasApontamento')
            .from('sessoes_ativas_terminal')
            .insert([{
              num_maquina: machineNum,
              operadora_nome: 'OPERADORA',
              operacao_nome: 'CADÊNCIA',
              lote: 'L-01',
              lado: 'Único',
              tipo_maquina: 'RETA',
              hora_extra: 'n',
              horario_inicio: new Date().toTimeString().split(' ')[0],
              materia_prima_inicial: 500
            }]);

          if (error) throw error;
        }
      }

      addToast(`Status da Máquina ${machineNum} atualizado para ${upperStatus}.`, 'success');
      
      // Update local state temporarily to keep things snappy
      setMachines(prev => prev.map(m => m.numero === machineNum ? { ...m, status: newStatus as any } : m));
      
      fetchData();
    } catch (err: any) {
      console.error("Erro ao atualizar status:", err);
      addToast(`Erro ao atualizar no banco: ${err.message}`, 'error');
    }
  };

  const handleUpdateMachineDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine) return;

    try {
      // Set optimistic updates
      updateOptimistic(selectedMachine.numero, {
        operadora: terminalOperator.toUpperCase().trim(),
        processo: terminalProcess
      });

      const updatePayload = {
        operadora_nome: terminalOperator.toUpperCase().trim(),
        operacao_nome: terminalProcess
      };

      // Find if active session exists
      const { data: existing, error: findError } = await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .select('id')
        .eq('num_maquina', selectedMachine.numero);

      if (findError) throw findError;

      if (existing && existing.length > 0) {
        const { error } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .update(updatePayload)
          .eq('num_maquina', selectedMachine.numero);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .insert([{
            num_maquina: selectedMachine.numero,
            operadora_nome: terminalOperator.toUpperCase().trim(),
            operacao_nome: terminalProcess,
            lote: 'L-01',
            lado: 'Único',
            tipo_maquina: 'RETA',
            hora_extra: 'n',
            horario_inicio: new Date().toTimeString().split(' ')[0],
            materia_prima_inicial: 500
          }]);

        if (error) throw error;
      }

      addToast(`Configurações da Máquina ${selectedMachine.numero} salvas com sucesso!`, 'success');
      
      // Update local state temporarily
      setMachines(prev => prev.map(m => m.id === selectedMachine.id ? { 
        ...m, 
        operadora: terminalOperator.toUpperCase().trim(),
        processo: terminalProcess
      } : m));

      fetchData();
    } catch (err: any) {
      console.error("Erro ao salvar configurações:", err);
      addToast(`Erro ao salvar no banco: ${err.message}`, 'error');
    }
  };

  // Sort and filter machines based on search terms, selectors, and interactive column sorting
  const sortedAndFilteredMachines = React.useMemo(() => {
    const filtered = machines.filter((m) => {
      const matchesSearch = 
        m.numero.toLowerCase().trim().includes(searchTerm.toLowerCase().trim()) ||
        m.operadora.toLowerCase().trim().includes(searchTerm.toLowerCase().trim());
        
      const matchesProcess = filterProcess ? m.processo.toLowerCase().trim() === filterProcess.toLowerCase().trim() : true;
      
      const matchesStatus = filterStatus ? m.status.toLowerCase().trim() === filterStatus.toLowerCase().trim() : true;

      return matchesSearch && matchesProcess && matchesStatus;
    });

    return filtered.sort((a, b) => {
      let valA: any = a[sortField as keyof Maquina];
      let valB: any = b[sortField as keyof Maquina];

      // Handle null/undefined fallbacks
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      // Special handling for numeric machine number
      if (sortField === 'numero') {
        const numA = getNumericValue(a.numero);
        const numB = getNumericValue(b.numero);
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      // Numeric comparisons
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }

      // String comparisons
      const strA = String(valA).toLowerCase().trim();
      const strB = String(valB).toLowerCase().trim();

      if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
      if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [machines, searchTerm, filterProcess, filterStatus, sortField, sortDirection]);

  const machineApontamentos = selectedMachine 
    ? todayRegistros.filter(r => String(r.num_maquina || '').toLowerCase().trim() === selectedMachine.numero.toLowerCase().trim())
    : [];

  const chartData = selectedMachine ? generateDynamicHourlyChartData(machineApontamentos) : [];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-[400px]" id="status-maquinas-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#00624C] border-t-transparent rounded-full animate-spin"></div>
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500 font-bold">
            Carregando Telemetria...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto" id="status-maquinas-view">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans text-xl font-black uppercase tracking-widest text-[#00624C] flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-500" />
            CONTROLE DE MÁQUINAS E TELEMETRIA
          </h2>
          <p className="text-zinc-500 text-xs font-sans uppercase tracking-widest mt-1">
            PAINEL DE COMANDO E SUPERVISÃO DO CHÃO DE FÁBRICA
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-400 bg-zinc-950/80 border border-zinc-900 rounded-lg px-3.5 py-1.5 self-start sm:self-auto">
          <Activity size={12} className="text-emerald-500 animate-pulse shrink-0" />
          <span className="uppercase tracking-wider font-bold">TELEMETRIA ATIVA // 53 MÁQUINAS</span>
        </div>
      </div>

      {/* FILTERS PANEL */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-sans uppercase tracking-widest font-black text-zinc-400">
          <Filter className="w-3.5 h-3.5 text-purple-500" />
          <span>PAINEL DE BUSCA E FILTRAGEM</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="PESQUISAR MÁQUINA OU OPERADORA..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-9 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#00624C] placeholder-zinc-600 uppercase"
            />
          </div>

          <div>
            <select
              value={filterProcess}
              onChange={(e) => setFilterProcess(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-sans text-zinc-300 focus:outline-none focus:border-[#00624C] uppercase tracking-wider"
            >
              <option value="">TODOS OS PROCESSOS</option>
              <option value="CADÊNCIA">CADÊNCIA</option>
              <option value="EMBALAGEM">EMBALAGEM</option>
              <option value="REVISÃO">REVISÃO</option>
              <option value="DIVERSOS">DIVERSOS</option>
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-sans text-zinc-300 focus:outline-none focus:border-[#00624C] uppercase tracking-wider"
            >
              <option value="">TODOS OS STATUS</option>
              <option value="produzindo">PRODUZINDO</option>
              <option value="pausada">PAUSADA</option>
              <option value="manutencao">MANUTENÇÃO</option>
              <option value="offline">OFFLINE</option>
            </select>
          </div>
        </div>
      </div>

      {/* COMPACT INDUSTRIAL LIST/TABLE */}
      <div className="border border-zinc-900 rounded-xl bg-zinc-950/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="telemetria-compact-table">
            <thead>
              <tr className="border-b border-zinc-900 bg-zinc-950/70 text-[9px] font-sans font-black uppercase tracking-widest text-zinc-400 select-none">
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    <span>STATUS</span>
                    {sortField === 'status' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('numero')}>
                  <div className="flex items-center gap-1">
                    <span>MÁQUINA</span>
                    {sortField === 'numero' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('processo')}>
                  <div className="flex items-center gap-1">
                    <span>PROCESSO</span>
                    {sortField === 'processo' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('operadora')}>
                  <div className="flex items-center gap-1">
                    <span>COLABORADORA</span>
                    {sortField === 'operadora' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('eficiencia')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>OEE %</span>
                    {sortField === 'eficiencia' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-colors text-right" onClick={() => handleSort('pecas_produzidas')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>PEÇAS ACUMULADAS</span>
                    {sortField === 'pecas_produzidas' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                  </div>
                </th>
                <th className="py-4 px-6 text-right">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/40 text-xs">
              {sortedAndFilteredMachines.map((m) => {
                const isProducing = m.status === 'produzindo';
                const isPaused = m.status === 'pausada';
                const isMaintenance = m.status === 'manutencao';
                const isSelected = selectedMachineId === m.id;

                return (
                  <tr
                    key={m.id}
                    onClick={() => handleSelectMachine(m)}
                    className={`cursor-pointer transition-all duration-150 hover:bg-zinc-900/30 group ${
                      isSelected ? 'bg-purple-950/10 hover:bg-purple-950/15' : ''
                    }`}
                  >
                    {/* Status Dot */}
                    <td className="py-3 px-6 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          {isProducing && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                          {isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>}
                          {isMaintenance && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>}
                          <span className={`relative inline-flex rounded-full h-2 w-2 ${
                            isProducing ? 'bg-emerald-500' :
                            isPaused ? 'bg-amber-500' :
                            isMaintenance ? 'bg-rose-500' :
                            'bg-zinc-700'
                          }`} />
                        </span>
                        <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-zinc-500">
                          {m.status === 'offline' ? 'DESLIGADA' : m.status.toUpperCase()}
                        </span>
                      </div>
                    </td>

                    {/* Machine Number */}
                    <td className="py-3 px-6 whitespace-nowrap font-mono font-black text-white">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-zinc-600" />
                        <span>{m.numero}</span>
                      </div>
                    </td>

                    {/* Process */}
                    <td className="py-3 px-6 whitespace-nowrap uppercase tracking-wider font-sans text-[10px] text-zinc-400 font-bold">
                      {m.processo}
                    </td>

                    {/* Operator */}
                    <td className="py-3 px-6 whitespace-nowrap font-sans font-bold text-zinc-200 uppercase tracking-wide">
                      {m.operadora || 'NÃO DESIGNADA'}
                    </td>

                    {/* Efficiency (OEE) */}
                    <td className={`py-3 px-6 whitespace-nowrap text-right font-mono font-bold ${
                      m.status === 'offline' ? 'text-zinc-600' :
                      m.eficiencia >= 85 ? 'text-emerald-400' :
                      m.eficiencia >= 70 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {m.status === 'offline' ? '0.0%' : `${m.eficiencia.toFixed(1)}%`}
                    </td>

                    {/* Total Pieces */}
                    <td className="py-3 px-6 whitespace-nowrap text-right font-mono font-black text-zinc-100">
                      {m.status === 'offline' ? 0 : m.pecas_produzidas.toLocaleString('pt-BR')} Pçs
                    </td>

                    {/* Trigger Actions Icon */}
                    <td className="py-3 px-6 whitespace-nowrap text-right text-purple-400">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectMachine(m);
                        }}
                        className="text-[10px] font-sans font-black uppercase tracking-wider text-[#00624C] hover:text-[#ec76a2] px-2.5 py-1 transition-colors"
                      >
                        + DETALHES
                      </button>
                    </td>
                  </tr>
                );
              })}

              {sortedAndFilteredMachines.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500 font-sans uppercase tracking-widest text-xs">
                    Nenhum registro de produção ativo para os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIDEBAR DETAILED TELEMETRY DRAWER (SLIDE-OVER PANEL) */}
      <AnimatePresence>
        {selectedMachine && (
          <>
            {/* Dark Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMachineId(null)}
              className="fixed inset-0 bg-black z-40 cursor-pointer"
            />

            {/* Sliding Drawer Body */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 h-screen w-full sm:w-[540px] md:w-[600px] bg-zinc-950 border-l border-zinc-900 z-50 flex flex-col shadow-2xl shadow-purple-900/20"
            >
              {/* Drawer Header */}
              <div className="p-5 md:p-6 border-b border-zinc-900 flex items-center justify-between shrink-0 bg-zinc-950/90 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-purple-950/30 border border-purple-500/20 rounded-lg flex items-center justify-center text-purple-400">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-sans text-base font-black uppercase tracking-widest text-white flex items-center gap-2">
                      {selectedMachine.numero}
                      <span className="text-[10px] text-zinc-500 font-mono font-normal">
                        ({selectedMachine.processo})
                      </span>
                    </h3>
                    <p className="text-[10px] font-sans font-bold uppercase tracking-wider text-zinc-400 mt-0.5">
                      OPERADORA: {selectedMachine.operadora || 'NÃO DESIGNADA'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Status indicator on header */}
                  <span className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold uppercase tracking-widest flex items-center gap-1.5 ${
                    selectedMachine.status === 'produzindo' ? 'bg-emerald-500/10 text-emerald-400' :
                    selectedMachine.status === 'pausada' ? 'bg-amber-500/10 text-amber-400' :
                    selectedMachine.status === 'manutencao' ? 'bg-rose-500/10 text-rose-400' :
                    'bg-zinc-800 text-zinc-400'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      selectedMachine.status === 'produzindo' ? 'bg-emerald-500' :
                      selectedMachine.status === 'pausada' ? 'bg-amber-500' :
                      selectedMachine.status === 'manutencao' ? 'bg-rose-500' :
                      'bg-zinc-500'
                    }`} />
                    {selectedMachine.status === 'offline' ? 'DESLIGADA' : selectedMachine.status.toUpperCase()}
                  </span>

                  <button
                    onClick={() => setSelectedMachineId(null)}
                    className="p-1.5 border border-zinc-800 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Drawer Content Area (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6 md:space-y-8 min-h-0">
                
                {/* 1. Dynamic Stopwatch (Active production time today) */}
                <div className="border border-zinc-900 bg-zinc-950 p-5 rounded-xl text-center flex flex-col justify-center items-center relative overflow-hidden group">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-60" />
                  
                  <span className="text-[8px] font-sans uppercase tracking-[0.2em] text-zinc-500 font-black flex items-center gap-1.5">
                    <Clock size={10} className="text-purple-400 animate-pulse" />
                    TEMPO DE PRODUÇÃO ATIVO HOJE
                  </span>

                  <h1 className="text-3xl md:text-4xl font-mono font-black text-white tracking-widest mt-2 bg-gradient-to-b from-white to-zinc-300 bg-clip-text text-transparent">
                    {elapsedTimeStr}
                  </h1>

                  <span className="text-[8px] font-mono text-zinc-500 mt-1 uppercase">
                    {selectedMachine.status === 'produzindo' 
                      ? 'CRONÔMETRO DE OPERAÇÃO ATIVO DESDE O PRIMEIRO REGISTRO DE PRODUÇÃO HOJE' 
                      : 'CONTAGEM DE TEMPO PAUSADA - TELEMETRIA AGUARDANDO STATUS OPERACIONAL'}
                  </span>
                </div>

                {/* 2. Recharts Daily Evolution Chart */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-sans uppercase tracking-widest text-zinc-400 font-black flex items-center gap-1.5">
                      <Activity size={12} className="text-purple-500" />
                      GRÁFICO DE EVOLUÇÃO DIÁRIA (HORA A HORA)
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase font-semibold">
                      Metas Acumulativas
                    </span>
                  </div>

                  <div className="h-[210px] w-full border border-zinc-900/80 bg-zinc-950 p-2.5 rounded-xl">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#18181b" />
                        <XAxis 
                          dataKey="name" 
                          stroke="#52525b" 
                          fontSize={9} 
                          fontFamily="JetBrains Mono, SFMono-Regular, monospace" 
                        />
                        <YAxis 
                          stroke="#52525b" 
                          fontSize={9} 
                          fontFamily="JetBrains Mono, SFMono-Regular, monospace" 
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#09090b',
                            border: '1px solid #27272a',
                            borderRadius: '6px',
                            fontSize: '10px',
                            fontFamily: 'JetBrains Mono, monospace'
                          }}
                        />
                        <Legend 
                          iconSize={8}
                          wrapperStyle={{
                            fontSize: '8px',
                            fontFamily: 'Inter, sans-serif',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            fontWeight: '600',
                            paddingTop: '6px'
                          }}
                        />
                        {/* 4 Trend Lines with explicit colors */}
                        <Line
                          type="monotone"
                          dataKey="Conformes (Boas)"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false} // Prevent animation flickering on update
                        />
                        <Line
                          type="monotone"
                          dataKey="Refugo (Sucata)"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          dot={{ r: 1 }}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="Retrabalho Próprio"
                          stroke="#eab308"
                          strokeWidth={1.5}
                          dot={{ r: 1 }}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="Retrabalho Terceiros"
                          stroke="#f97316"
                          strokeWidth={1.5}
                          dot={{ r: 1 }}
                          isAnimationActive={false}
                        />
                        
                        {/* 3 Blue Reference Target Lines */}
                        <ReferenceLine 
                          y={1000} 
                          stroke="#3b82f6" 
                          strokeDasharray="4 4" 
                          label={{ 
                            value: 'Meta Mín: 1000', 
                            fill: '#3b82f6', 
                            fontSize: 7, 
                            position: 'insideLeft',
                            fontFamily: 'JetBrains Mono'
                          }} 
                        />
                        <ReferenceLine 
                          y={1200} 
                          stroke="#2563eb" 
                          strokeDasharray="4 4" 
                          label={{ 
                            value: 'Meta Nom: 1200', 
                            fill: '#2563eb', 
                            fontSize: 7, 
                            position: 'insideLeft',
                            fontFamily: 'JetBrains Mono'
                          }} 
                        />
                        <ReferenceLine 
                          y={1500} 
                          stroke="#1d4ed8" 
                          strokeDasharray="4 4" 
                          label={{ 
                            value: 'Meta Max: 1500', 
                            fill: '#1d4ed8', 
                            fontSize: 7, 
                            position: 'insideLeft',
                            fontFamily: 'JetBrains Mono'
                          }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 3. Status Switcher Actions */}
                <div className="space-y-2.5">
                  <span className="text-[9px] font-sans uppercase tracking-widest text-zinc-400 font-black block">
                    MUDAR STATUS OPERACIONAL DA MÁQUINA
                  </span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleUpdateStatus(selectedMachine.id, selectedMachine.numero, 'produzindo')}
                      className={`py-2.5 px-3 rounded flex items-center justify-center gap-2 font-sans text-[9px] font-black tracking-widest uppercase cursor-pointer border transition-colors ${
                        selectedMachine.status === 'produzindo'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <PlayCircle size={12} /> Produzindo
                    </button>

                    <button
                      onClick={() => handleUpdateStatus(selectedMachine.id, selectedMachine.numero, 'pausada')}
                      className={`py-2.5 px-3 rounded flex items-center justify-center gap-2 font-sans text-[9px] font-black tracking-widest uppercase cursor-pointer border transition-colors ${
                        selectedMachine.status === 'pausada'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <PauseCircle size={12} /> Pausada
                    </button>

                    <button
                      onClick={() => handleUpdateStatus(selectedMachine.id, selectedMachine.numero, 'manutencao')}
                      className={`py-2.5 px-3 rounded flex items-center justify-center gap-2 font-sans text-[9px] font-black tracking-widest uppercase cursor-pointer border transition-colors ${
                        selectedMachine.status === 'manutencao'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Wrench size={12} /> Manutenção
                    </button>

                    <button
                      onClick={() => handleUpdateStatus(selectedMachine.id, selectedMachine.numero, 'offline')}
                      className={`py-2.5 px-3 rounded flex items-center justify-center gap-2 font-sans text-[9px] font-black tracking-widest uppercase cursor-pointer border transition-colors ${
                        selectedMachine.status === 'offline'
                          ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <PowerOff size={12} /> Offline
                    </button>
                  </div>
                </div>

                {/* 4. Edit details parameters */}
                <form onSubmit={handleUpdateMachineDetails} className="space-y-4 pt-4 border-t border-zinc-900/60">
                  <span className="text-[9px] font-sans uppercase tracking-widest text-zinc-400 font-black block">
                    ATUALIZAR PARÂMETROS DA MÁQUINA
                  </span>

                  {/* Operator dropdown field */}
                  <div className="space-y-1.5 relative">
                    <label className="text-[9px] font-sans uppercase tracking-widest text-zinc-400 font-bold block">
                      Colaboradora Alocada
                    </label>
                    <div className="relative">
                      <User size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 z-10" />
                      <input
                        type="text"
                        required
                        value={terminalOperator}
                        onChange={(e) => {
                          setTerminalOperator(e.target.value);
                          setTerminalDropdownOpen(true);
                        }}
                        onFocus={() => setTerminalDropdownOpen(true)}
                        onBlur={() => {
                          setTimeout(() => {
                            setTerminalDropdownOpen(false);
                          }, 250);
                        }}
                        placeholder="BUSCAR COLABORADORA..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded pl-9 pr-4 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#00624C] uppercase"
                      />
                      {terminalDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded shadow-2xl z-50">
                          {colaboradoras
                            .filter(name => name.toLowerCase().includes(terminalOperator.toLowerCase()))
                            .map(name => (
                              <div
                                key={name}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={() => {
                                  setTerminalOperator(name);
                                  setTerminalDropdownOpen(false);
                                }}
                                className="px-3 py-2 hover:bg-purple-950/40 text-xs font-mono text-zinc-100 cursor-pointer uppercase transition-colors"
                              >
                                {name}
                              </div>
                            ))}
                          {colaboradoras.filter(name => name.toLowerCase().includes(terminalOperator.toLowerCase())).length === 0 && (
                            <div className="px-3 py-2 text-[10px] text-zinc-500 font-mono uppercase">
                              Sem resultados para "{terminalOperator}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-sans uppercase tracking-widest text-zinc-400 font-bold block">
                        Processo Ativo
                      </label>
                      <select
                        value={terminalProcess}
                        onChange={(e) => setTerminalProcess(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-2 text-xs font-sans text-white focus:outline-none focus:border-[#00624C]"
                      >
                        <option value="CADÊNCIA">CADÊNCIA</option>
                        <option value="EMBALAGEM">EMBALAGEM</option>
                        <option value="REVISÃO">REVISÃO</option>
                        <option value="DIVERSOS">DIVERSOS</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-sans uppercase tracking-widest text-zinc-500 font-bold block">
                        Eficiência (%) [Automático]
                      </label>
                      <input
                        type="number"
                        readOnly
                        value={terminalEfficiency}
                        className="w-full bg-zinc-900/60 border border-zinc-800/50 rounded px-3 py-2 text-xs font-mono text-zinc-500 cursor-not-allowed focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-sans uppercase tracking-widest text-zinc-500 font-bold block">
                      Peças Produzidas Acumuladas [Automático]
                    </label>
                    <input
                      type="number"
                      readOnly
                      value={terminalPecas}
                      className="w-full bg-zinc-900/60 border border-zinc-800/50 rounded px-3 py-2 text-xs font-mono text-zinc-500 cursor-not-allowed focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#00624C] hover:bg-[#004838] text-white rounded text-[10px] font-sans font-black tracking-widest uppercase transition-colors cursor-pointer"
                  >
                    Salvar Configurações
                  </button>
                </form>

                {/* 5. Chronological pointer history */}
                <div className="pt-4 border-t border-zinc-900">
                  <div className="flex items-center gap-2 mb-3">
                    <History size={12} className="text-zinc-500" />
                    <span className="text-[9px] font-sans uppercase tracking-widest text-zinc-400 font-black">
                      HISTÓRICO INDIVIDUAL DE APONTAMENTOS
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {machineApontamentos.slice(0, 5).map((ap) => (
                      <div 
                        key={ap.id}
                        className="p-2 border border-zinc-900 bg-zinc-900/10 rounded flex items-center justify-between text-[9px] font-mono"
                      >
                        <div>
                          <span className="text-zinc-500 font-bold">
                            {new Date(ap.timestamp).toLocaleTimeString()}
                          </span>
                          <p className="text-zinc-300 font-bold mt-0.5">
                            +{ap.quantidade} Peças ({ap.processo})
                          </p>
                        </div>
                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                          ap.status === 'validado' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {ap.status}
                        </span>
                      </div>
                    ))}
                    {machineApontamentos.length === 0 && (
                      <p className="text-center py-4 text-zinc-600 text-[9px] font-mono uppercase">
                        Sem apontamentos para esta máquina hoje
                      </p>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
