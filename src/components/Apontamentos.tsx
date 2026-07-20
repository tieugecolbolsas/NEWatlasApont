import React, { useState, useEffect } from 'react';
import { useRealtime } from '../lib/realtimeContext';
import { 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown,
  Download,
  Loader2,
  Calendar,
  Layers,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Mail,
  X,
  Copy,
  Cpu
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalSessionUser } from '../lib/auth';

const getShortCode = (block: any) => {
  if (block.codigo_manual_curto) return block.codigo_manual_curto;
  // Generate a deterministic 6-char fallback code based on block key so it looks realistic
  const keyStr = block.key || '';
  let hash = 0;
  for (let i = 0; i < keyStr.length; i++) {
    hash = keyStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  let tempHash = Math.abs(hash);
  for (let i = 0; i < 6; i++) {
    code += chars[tempHash % chars.length];
    tempHash = Math.floor(tempHash / chars.length);
  }
  return code;
};

const parseTimeToDateToday = (timeStr: string, regData: string) => {
  if (!timeStr) return null;
  if (timeStr.includes('T') || timeStr.includes('-')) {
    return new Date(timeStr);
  }
  let baseDateStr = regData || new Date().toISOString().split('T')[0];
  if (baseDateStr.includes('/')) {
    const parts = baseDateStr.split('/');
    if (parts.length === 3) {
      baseDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    }
  }
  let formattedTime = timeStr;
  if (timeStr.split(':').length === 2) {
    formattedTime = `${timeStr}:00`;
  }
  return new Date(`${baseDateStr}T${formattedTime}`);
};

const formatTimer = (secs: number) => {
  if (secs <= 0) return '00:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0')
  ].join(':');
};

const formatProductionTime = (ms: number) => {
  if (!ms || ms <= 0) return '00:00:00';
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return [
    h.toString().padStart(2, '0'),
    m.toString().padStart(2, '0'),
    s.toString().padStart(2, '0')
  ].join(':');
};

const getTempoRestanteMateriaPrima = (somaMateriaPrima: number, somaTotal: number, tempoTotalMs: number, itens: any[]) => {
  const rest = Math.max(0, somaMateriaPrima - somaTotal);
  if (rest <= 0) return 'Concluído';
  
  // Let's compute actual rhythm
  let rhythm = 0;
  if (somaTotal > 0 && tempoTotalMs > 0) {
    const horas = tempoTotalMs / (1000 * 60 * 60);
    rhythm = somaTotal / horas;
  } else {
    // Fallback to earliest/latest span
    let earliestStart: Date | null = null;
    let latestEnd: Date | null = null;
    itens.forEach((item: any) => {
      const hIni = item.horario_inicio;
      if (hIni) {
        const d = parseTimeToDateToday(hIni, item.data);
        if (d && (!earliestStart || d < earliestStart)) earliestStart = d;
      }
      const hTerm = item.horario_termino || item.created_at || item.timestamp;
      if (hTerm) {
        const d = parseTimeToDateToday(hTerm, item.data);
        if (d && (!latestEnd || d > latestEnd)) latestEnd = d;
      }
    });
    
    if (earliestStart) {
      const baseEnd = latestEnd || new Date();
      const elapsedMs = Math.max(60 * 1000, baseEnd.getTime() - earliestStart.getTime());
      const elapsedHours = elapsedMs / (3600 * 1000);
      rhythm = elapsedHours > 0 ? (somaTotal / elapsedHours) : 0;
    }
  }
  
  if (rhythm <= 0) {
    return 'Aguardando prod.';
  }
  
  const hrsRestantes = rest / rhythm;
  const h = Math.floor(hrsRestantes);
  const m = Math.round((hrsRestantes - h) * 60);
  if (h === 0 && m === 0) return 'Menos de 1 min';
  if (h === 0) return `${m} min restantes`;
  return `${h}h ${m}m restantes`;
};

const getTurnoTimerRemaining = (currentDate: Date) => {
  const hours = currentDate.getHours();
  const minutes = currentDate.getMinutes();
  const seconds = currentDate.getSeconds();
  
  if (hours >= 17) {
    return 0; // zera automaticamente às 17:00
  }
  
  if (hours < 7) {
    return 8 * 3600 + 40 * 60; // 8h40m (10h - 1h20m de almoço)
  }
  
  const nowInSecs = hours * 3600 + minutes * 60 + seconds;
  const endInSecs = 17 * 3600;
  const lunchStartInSecs = 12 * 3600; // 12:00
  const lunchEndInSecs = 13 * 3600 + 20 * 60; // 13:20
  
  if (nowInSecs < lunchStartInSecs) {
    const rawRemaining = endInSecs - nowInSecs;
    return Math.max(0, rawRemaining - (80 * 60)); // desconta 1h20
  } else if (nowInSecs >= lunchStartInSecs && nowInSecs < lunchEndInSecs) {
    return endInSecs - lunchEndInSecs; // tempo restante de trabalho fixo (13:20 às 17:00 = 3h40m)
  } else {
    return endInSecs - nowInSecs; // tempo restante bruto posterior ao almoço
  }
};

const getRegistroProductionTimeMs = (inicio: string, termino: string, regData: string): number => {
  if (!inicio || !termino) return 0;
  try {
    const dInicio = parseTimeToDateToday(inicio, regData);
    const dTermino = parseTimeToDateToday(termino, regData);
    if (!dInicio || !dTermino) return 0;
    
    let diffMs = dTermino.getTime() - dInicio.getTime();
    if (diffMs < 0) return 0;
    
    let baseDateStr = regData || new Date().toISOString().split('T')[0];
    if (baseDateStr.includes('/')) {
      const parts = baseDateStr.split('/');
      if (parts.length === 3) {
        baseDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    const dAlmocoInicio = new Date(`${baseDateStr}T12:00:00`);
    const dAlmocoFim = new Date(`${baseDateStr}T13:20:00`);
    
    const startBeforeLunch = dInicio < dAlmocoInicio;
    const endAfterLunch = dTermino > dAlmocoFim;
    const overlapsLunch = startBeforeLunch && endAfterLunch;
    if (overlapsLunch) {
      diffMs -= (dAlmocoFim.getTime() - dAlmocoInicio.getTime());
    }
    return diffMs > 0 ? diffMs : 0;
  } catch (e) {
    return 0;
  }
};

const getRegistroProductionTime = (inicio: string, termino: string, regData: string) => {
  if (!inicio || !termino) return '';
  try {
    const dInicio = parseTimeToDateToday(inicio, regData);
    const dTermino = parseTimeToDateToday(termino, regData);
    if (!dInicio || !dTermino) return '';
    
    let diffMs = dTermino.getTime() - dInicio.getTime();
    if (diffMs < 0) return '0h 0m';
    
    // Almoço: 12:00:00 às 13:20:00
    let baseDateStr = regData || new Date().toISOString().split('T')[0];
    if (baseDateStr.includes('/')) {
      const parts = baseDateStr.split('/');
      if (parts.length === 3) {
        baseDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    const dAlmocoInicio = new Date(`${baseDateStr}T12:00:00`);
    const dAlmocoFim = new Date(`${baseDateStr}T13:20:00`);
    
    // Se o intervalo do registro passa pelo almoço
    if (dInicio <= dAlmocoInicio && dTermino >= dAlmocoFim) {
      diffMs = Math.max(0, diffMs - (80 * 60 * 1000));
    }
    
    const diffMin = Math.round(diffMs / 60000);
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    
    return `${hrs}h ${mins}m`;
  } catch (e) {
    return '';
  }
};

export default function Apontamentos() {
  const {
    machines,
    addToast
  } = useRealtime();

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Search/Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Estados de Filtros Dinâmicos do Banco com Autocomplete e Categorias
  const [dinamicMaquinas, setDinamicMaquinas] = useState<string[]>([]);
  const [dinamicProcessos, setDinamicProcessos] = useState<string[]>([]);
  const [dinamicProcessosObj, setDinamicProcessosObj] = useState<{ operacao_nome: string, categoria_nome: string }[]>([]);
  const [searchProcessInput, setSearchProcessInput] = useState('');
  const [showProcessDropdown, setShowProcessDropdown] = useState(false);

  useEffect(() => {
    async function carregarFiltrosDinamicos() {
      try {
        const { data: maqData, error: maqError } = await supabase
          .schema('AtlasApontamento')
          .from('maquinas_config')
          .select('num_maquina');
        if (!maqError && maqData) {
          const distinctMaqs = Array.from(new Set(maqData.map((item: any) => item.num_maquina).filter(Boolean))) as string[];
          setDinamicMaquinas(distinctMaqs.sort());
        }
      } catch (err) {
        console.error('Erro ao carregar maquinas para filtros:', err);
      }

      try {
        const { data: procData, error: procError } = await supabase
          .schema('public')
          .from('costureiras_funcoes')
          .select('operacao_nome, categoria_nome');
        if (!procError && procData) {
          const opsMap = new Map();
          procData.forEach((item: any) => {
            if (item.operacao_nome) {
              opsMap.set(item.operacao_nome, {
                operacao_nome: item.operacao_nome,
                categoria_nome: item.categoria_nome || 'DIVERSOS'
              });
            }
          });
          const uniqueOpsObj = Array.from(opsMap.values()) as { operacao_nome: string, categoria_nome: string }[];
          setDinamicProcessosObj(uniqueOpsObj);

          const distinctProcs = uniqueOpsObj.map(o => o.operacao_nome);
          setDinamicProcessos(distinctProcs.sort());
        }
      } catch (err) {
        console.error('Erro ao carregar processos para filtros:', err);
      }
    }
    carregarFiltrosDinamicos();
  }, []);

  // Form state for new simulated apuntamento
  const [showForm, setShowForm] = useState(false);
  const [newMaquina, setNewMaquina] = useState('MQ-01');
  const [newQtd, setNewQtd] = useState(24);
  const [newRegistroTipo, setNewRegistroTipo] = useState<'PRODUCAO' | 'MATERIA_PRIMA'>('PRODUCAO');
  const [newStatus, setNewStatus] = useState<'validado' | 'rejeitado' | 'analise'>('validado');
  const [isSaving, setIsSaving] = useState(false);

  // Pagination and Supabase state
  const [registros, setRegistros] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  // Accordion expanded blocks keys
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);

  const handleInjectTestData = () => {
    const formatToTimeString = (date: Date) => {
      return date.toTimeString().split(' ')[0];
    };
    const nowTime = new Date();
    const twoHoursAgoTime = new Date(nowTime.getTime() - 2 * 60 * 60 * 1000);

    const testObject = {
      id: 'debug-test-' + Date.now(),
      data: new Date().toISOString().split('T')[0].split('-').reverse().join('/'),
      materia_prima_inicial: 500,
      producao_conforme: 150,
      horario_inicio: formatToTimeString(twoHoursAgoTime),
      horario_termino: formatToTimeString(nowTime),
      num_maquina: "MQ-03",
      operadora_nome: "OPERADORA TESTE",
      operacao_nome: "OPERACAO TESTE",
      lote: "L-TESTE",
      lado: "Único",
      tipo_maquina: "TESTE",
      hora_extra: "n",
      status: "validado"
    };

    setRegistros(prev => [testObject, ...prev]);
    setTotalCount(prev => prev + 1);
    addToast('Dados de teste injetados com sucesso!', 'success');
  };

  // Carregar histórico do Supabase
  const fetchHistSupabase = async () => {
    setIsLoading(true);
    try {
      const userObj = getLocalSessionUser() as any;
      const userId = userObj?.id || userObj?.uid;

      if (!userId) {
        setRegistros([]);
        setTotalCount(0);
        return;
      }

      // Query standard supported fields
      const { data, error } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      // Query active sessions to check which machines are active
      try {
        const { data: activeSessData, error: activeSessError } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .select('*');
        if (!activeSessError && activeSessData) {
          setActiveSessions(activeSessData);
        }
      } catch (errActive) {
        console.error('Error fetching active sessions:', errActive);
      }

      // Filter and process on client side to work flawlessly with both real Supabase and Atlas Server wrapper
      let processed = [...(data || [])];

      // 1. Text Search (Case-insensitive)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        processed = processed.filter(item => {
          const opName = (item.operadora_nome || item.operadora || '').toLowerCase();
          const numMaq = (item.num_maquina || item.maquina || '').toLowerCase();
          const operName = (item.operacao_nome || item.processo || '').toLowerCase();
          return opName.includes(term) || numMaq.includes(term) || operName.includes(term);
        });
      }

      // 2. Machine Filter
      if (filterMachine) {
        processed = processed.filter(item => (item.num_maquina || item.maquina) === filterMachine);
      }

      // 3. Process Filter
      if (filterProcess) {
        processed = processed.filter(item => (item.operacao_nome || item.processo) === filterProcess);
      }

      // 4. Status Filter (Qualidade / Status)
      if (filterStatus) {
        if (filterStatus === 'VALIDADO') {
          processed = processed.filter(item => Number(item.producao_conforme || item.quantidade || 0) > 0);
        } else if (filterStatus === 'REFUGO') {
          processed = processed.filter(item => Number(item.refugo || 0) > 0);
        } else if (filterStatus === 'RETRABALHO PRÓPRIO') {
          processed = processed.filter(item => Number(item.retrabalho_proprio || 0) > 0);
        } else if (filterStatus === 'RETRABALHO TERCEIRO') {
          processed = processed.filter(item => Number(item.retrabalho_terceiro || 0) > 0);
        } else {
          processed = processed.filter(item => (item.status || 'validado') === filterStatus);
        }
      }

      // 5. Sort by time descending (Most recent first)
      processed.sort((a, b) => {
        const dateA = new Date(a.horario_termino || a.created_at || a.timestamp || 0).getTime();
        const dateB = new Date(b.horario_termino || b.created_at || b.timestamp || 0).getTime();
        return dateB - dateA;
      });

      // Total count of filtered items
      setTotalCount(processed.length);

      // 6. Paginate
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      const paginated = processed.slice(from, to);

      setRegistros(paginated);
    } catch (err: any) {
      console.error('[Apontamentos] Erro ao carregar histórico:', err);
      addToast(`Erro ao carregar histórico: ${err.message || err}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Resetar página quando os filtros mudam
  useEffect(() => {
    setPage(0);
    // If page is already 0, manual trigger is needed to refresh
    if (page === 0) {
      fetchHistSupabase();
    }
  }, [searchTerm, filterMachine, filterProcess, filterStatus]);

  // Carregar dados quando a página muda
  useEffect(() => {
    fetchHistSupabase();
  }, [page]);

  // Lógica de criação de apontamento manual
  const handleCreateApontamento = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedMac = machines.find(m => m.numero === newMaquina);
    if (!selectedMac) return;

    setIsSaving(true);
    const userObj = getLocalSessionUser() as any;
    const userId = userObj?.id || userObj?.uid;
    const nowTime = new Date().toTimeString().split(' ')[0];

    const novoApontamento = {
      data: new Date().toISOString().split('T')[0],
      operadora_nome: selectedMac.operadora,
      hora_extra: 'n',
      operacao_nome: selectedMac.processo,
      tipo_maquina: 'MANUAL',
      lote: 'L-MANUAL',
      num_maquina: newMaquina,
      lado: 'Único',
      horario_inicio: nowTime,
      horario_termino: nowTime,
      producao_conforme: Number(newQtd),
      retrabalho_proprio: 0,
      retrabalho_terceiro: 0,
      motivo_ocorrencia: newRegistroTipo === 'MATERIA_PRIMA' ? 'MATERIA_PRIMA' : 'Apontamento Manual',
      refugo: 0,
      user_id: userId
    };

    try {
      const { error } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .insert([novoApontamento]);

      if (error) throw error;

      addToast(`Apontamento manual gravado com sucesso!`, 'success');
      setShowForm(false);
      setPage(0);
      await fetchHistSupabase();
    } catch (err: any) {
      console.error('[Apontamentos] Erro ao salvar apontamento manual:', err);
      addToast(`Falha ao salvar apontamento: ${err.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Exportar dados filtrados para CSV
  const exportToCSV = () => {
    try {
      const headers = ['ID', 'Data Hora', 'Apontadora', 'Maquina', 'Operadora', 'Processo', 'Quantidade', 'Status'];
      const rows = registros.map(reg => [
        reg.id,
        new Date(reg.horario_termino || reg.created_at || reg.timestamp).toLocaleString('pt-BR'),
        reg.apontadora_nome || reg.apontadora || 'MANUAL',
        reg.num_maquina || reg.maquina || '',
        reg.operadora_nome || reg.operadora || '',
        reg.operacao_nome || reg.processo || '',
        reg.producao_conforme || reg.quantidade || 0,
        reg.status || 'validado'
      ]);

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `ATLAS_APONTAMENTOS_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast('Exportação de dados CSV iniciada!', 'success');
    } catch (e) {
      addToast('Falha ao exportar CSV.', 'error');
    }
  };

  // Agrupamento por Data (data) + Máquina (num_maquina) + Operação (operacao_nome)
  const obterDataGrupo = (reg: any) => {
    const dataField = reg.data;
    if (dataField) {
      if (dataField.includes('-')) {
        const parts = dataField.split('-');
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      return dataField;
    }
    const dataStr = reg.horario_termino || reg.created_at || reg.timestamp;
    if (!dataStr) return 'Sem Data';
    try {
      return new Date(dataStr).toLocaleDateString('pt-BR');
    } catch (e) {
      return 'Sem Data';
    }
  };

  const groups: { [key: string]: any } = {};

  registros.forEach((reg) => {
    const dateStr = obterDataGrupo(reg);
    const maquina = reg.num_maquina || reg.maquina || 'S/M';
    const operacao = reg.operacao_nome || reg.processo || 'S/O';
    const key = `${dateStr}_${maquina}_${operacao}`;

    const pecasBrutas = Number(reg.producao_conforme || reg.quantidade || 0);
    const rePr = Number(reg.retrabalho_proprio || 0);
    const reTe = Number(reg.retrabalho_terceiro || 0);
    const refugo = Number(reg.refugo || 0);
    const pecasLiquidas = Math.max(0, pecasBrutas - (rePr + reTe + refugo));

    if (!groups[key]) {
      groups[key] = {
        key,
        data: dateStr,
        num_maquina: maquina,
        codigo_manual_curto: reg.codigo_manual_curto || '',
        operacao_nome: operacao,
        colaboradora: reg.operadora_nome || reg.operadora || 'Desconhecida',
        processo: reg.tipo_maquina || reg.processo || 'Processo',
        somaTotal: 0,
        somaRefugo: 0,
        somaRetrabalho: 0,
        somaMateriaPrima: 0,
        materia_prima_inicial: Number(reg.materia_prima_inicial) || 0,
        tempoTotalMs: 0,
        itens: []
      };
    } else {
      if (Number(reg.materia_prima_inicial) > 0 && !groups[key].materia_prima_inicial) {
        groups[key].materia_prima_inicial = Number(reg.materia_prima_inicial);
      }
    }

    const isMateriaPrima = reg.motivo_ocorrencia === 'MATERIA_PRIMA';
    if (isMateriaPrima) {
      groups[key].somaMateriaPrima += pecasBrutas;
    } else {
      groups[key].somaTotal += pecasLiquidas;
      groups[key].somaRefugo += refugo;
      groups[key].somaRetrabalho += (rePr + reTe);
      if (reg.horario_inicio && (reg.horario_termino || reg.created_at || reg.timestamp)) {
         const term = reg.horario_termino || reg.created_at || reg.timestamp;
         groups[key].tempoTotalMs += getRegistroProductionTimeMs(reg.horario_inicio, term, reg.data);
      }
    }
    groups[key].itens.push(reg);
  });

  const groupedBlocks = Object.values(groups).sort((a: any, b: any) => {
    const isSessionActiveA = activeSessions.some(
      s => {
        const sMaq = (s.num_maquina || '').split('|')[0].trim().toLowerCase();
        const bMaq = (a.num_maquina || '').split('|')[0].trim().toLowerCase();
        return sMaq === bMaq && 
               s.operacao_nome?.trim().toLowerCase() === a.operacao_nome?.trim().toLowerCase();
      }
    );
    const isSessionActiveB = activeSessions.some(
      s => {
        const sMaq = (s.num_maquina || '').split('|')[0].trim().toLowerCase();
        const bMaq = (b.num_maquina || '').split('|')[0].trim().toLowerCase();
        return sMaq === bMaq && 
               s.operacao_nome?.trim().toLowerCase() === b.operacao_nome?.trim().toLowerCase();
      }
    );
    
    if (isSessionActiveA && !isSessionActiveB) return -1;
    if (!isSessionActiveA && isSessionActiveB) return 1;
    return 0;
  });

  const toggleGroup = (key: string) => {
    setExpandedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto" id="apontamentos-view">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold uppercase tracking-[0.2em] text-[#00624C]">
            AUDITORIA E APONTAMENTOS DO TURNO
          </h2>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
            REGISTRO CRONOLÓGICO DE APONTAMENTOS DE LEITURA DE BARRAS DAS APONTADORAS
          </p>
        </div>

        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#00624C]" />
          <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-zinc-300">
            PAINEL DE FILTROS DE PESQUISA
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Text Search */}
          <div className="space-y-1">
            <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Pesquisa de Texto</label>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Operadora, Apontadora, Máquina..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-8 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00624C] transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Machine Filter */}
          <div className="space-y-1">
            <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Máquina</label>
            <div className="relative">
              <select
                value={filterMachine}
                onChange={(e) => setFilterMachine(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 pr-8 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#00624C]"
              >
                <option value="">TODAS AS MÁQUINAS</option>
                {dinamicMaquinas.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              {filterMachine && (
                <button
                  type="button"
                  onClick={() => setFilterMachine('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 transition-colors z-10"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Process Filter */}
          <div className="space-y-1 relative">
            <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Processo / Operação</label>
            <div className="relative">
              <input
                type="text"
                placeholder={filterProcess || "TODOS OS PROCESSOS"}
                value={searchProcessInput}
                onChange={(e) => {
                  setSearchProcessInput(e.target.value);
                  setShowProcessDropdown(true);
                }}
                onFocus={() => setShowProcessDropdown(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setShowProcessDropdown(false);
                    setSearchProcessInput('');
                  }, 250);
                }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#00624C] placeholder-zinc-500"
              />
              {filterProcess && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterProcess('');
                    setSearchProcessInput('');
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 transition-colors z-10"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {showProcessDropdown && (
              <div className="absolute left-0 right-0 mt-1 bg-zinc-950 border border-zinc-800 rounded z-50 shadow-2xl p-1 max-h-56 overflow-y-auto">
                {(() => {
                  const query = searchProcessInput.toLowerCase();
                  const filtered = dinamicProcessosObj.filter(item => 
                    item.operacao_nome.toLowerCase().includes(query) ||
                    item.categoria_nome.toLowerCase().includes(query)
                  );
                  
                  const grouped = filtered.reduce((acc, curr) => {
                    const cat = curr.categoria_nome || 'DIVERSOS';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(curr.operacao_nome);
                    return acc;
                  }, {} as Record<string, string[]>);
                  
                  const totalFiltered = filtered.length;
                  if (totalFiltered === 0) {
                    return <div className="p-2 text-zinc-500 text-xs font-mono">Nenhum processo encontrado</div>;
                  }
                  
                  return (
                    <select
                      size={Math.min(8, totalFiltered + Object.keys(grouped).length)}
                      className="w-full bg-transparent text-zinc-300 font-mono text-xs focus:outline-none border-none cursor-pointer"
                      value={filterProcess}
                      onChange={(e) => {
                        if (e.target.value !== undefined) {
                          setFilterProcess(e.target.value);
                          setSearchProcessInput('');
                          setShowProcessDropdown(false);
                        }
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <option value="" className="text-zinc-400 bg-zinc-950 py-1 font-bold">TODOS OS PROCESSOS</option>
                      {(Object.entries(grouped) as [string, string[]][]).map(([category, ops]) => (
                        <optgroup key={category} label={category.toUpperCase()} className="text-[#00624C] font-extrabold bg-zinc-950 px-2 py-1">
                          {ops.map(op => (
                            <option 
                              key={op} 
                              value={op} 
                              className="text-zinc-300 font-mono text-xs bg-zinc-900 px-3 py-1.5 hover:bg-[#00624C] hover:text-white cursor-pointer"
                              onClick={() => {
                                setFilterProcess(op);
                                setSearchProcessInput('');
                                setShowProcessDropdown(false);
                              }}
                            >
                              {op}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Status Filter */}
          <div className="space-y-1">
            <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Qualidade / Status</label>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded p-1.5 pr-8 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#00624C]"
              >
                <option value="">TODOS OS STATUS</option>
                <option value="VALIDADO">VALIDADO</option>
                <option value="REFUGO">REFUGO</option>
                <option value="RETRABALHO PRÓPRIO">RETRABALHO PRÓPRIO</option>
                <option value="RETRABALHO TERCEIRO">RETRABALHO TERCEIRO</option>
              </select>
              {filterStatus && (
                <button
                  type="button"
                  onClick={() => setFilterStatus('')}
                  className="absolute right-7 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer p-0.5 rounded-full hover:bg-zinc-800 transition-colors z-10"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* POINTING REGISTRATION DRAWER (COLLAPSIBLE FORM) */}
      {showForm && (
        <div className="border border-zinc-900 bg-zinc-950/20 p-5 rounded-xl max-w-2xl">
          <span className="text-[10px] font-mono uppercase tracking-widest font-black text-white block mb-4">
            REGISTRAR APONTAMENTO MANUAL NO TERMINAL
          </span>

          <form onSubmit={handleCreateApontamento} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Responsável Coleta</label>
              <input
                type="text"
                readOnly
                value="MANUAL (CELULAR LOGADO)"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2.5 py-2 text-xs font-mono text-zinc-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Máquina Destino</label>
              <select
                value={newMaquina}
                onChange={(e) => setNewMaquina(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-2 text-xs font-mono text-zinc-300 focus:outline-none focus:border-[#00624C]"
              >
                {machines.map(m => (
                  <option key={m.id} value={m.numero}>{m.numero} ({m.operadora.split(' ')[0]})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">
                {newRegistroTipo === 'MATERIA_PRIMA' ? 'Qtd Matéria Prima Entregue' : 'Qtd Peças (Volume)'}
              </label>
              <input
                type="number"
                min="1"
                required
                value={newQtd}
                onChange={(e) => setNewQtd(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#00624C]"
              />
            </div>

            <div className="sm:col-span-3 flex items-center justify-between pt-3 border-t border-zinc-900/40">
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono cursor-pointer">
                  <input
                    type="radio"
                    name="newStatus"
                    checked={newStatus === 'validado'}
                    onChange={() => setNewStatus('validado')}
                    className="accent-emerald-500 animate-none"
                  />
                  Validado (Sem Refugo)
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono cursor-pointer">
                  <input
                    type="radio"
                    name="newStatus"
                    checked={newStatus === 'rejeitado'}
                    onChange={() => setNewStatus('rejeitado')}
                    className="accent-rose-500 animate-none"
                  />
                  Rejeitado (Refugo)
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="py-1.5 px-3 rounded text-[10px] font-mono font-bold uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-1.5 px-4 bg-[#00624C] hover:bg-[#004838] rounded text-[10px] font-mono font-bold uppercase text-white transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isSaving && <Loader2 className="animate-spin" size={12} />}
                  Confirmar Apontamento
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* AUDIT LOG COLLAPSIBLE LIST */}
      <div className="border border-zinc-900 rounded-xl bg-zinc-950/40 p-5 flex flex-col space-y-4">
        
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-900/60">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-zinc-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest font-black text-zinc-300">
              REGISTROS DE AUDITORIA ({totalCount} REGISTROS)
            </span>
          </div>
          <button
            onClick={fetchHistSupabase}
            disabled={isLoading}
            className="p-1.5 hover:bg-zinc-900/50 text-zinc-500 hover:text-white transition-all cursor-pointer rounded"
            title="Recarregar"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-[#00624C]' : ''} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3 font-mono text-xs">
            <Loader2 className="animate-spin text-[#00624C]" size={24} />
            <span>CARREGANDO HISTÓRICO...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedBlocks.map((block: any) => {
              const isExpanded = expandedKeys.includes(block.key);

              const activeSessionForBlock = activeSessions.find(
                s => {
                  const sMaq = (s.num_maquina || '').split('|')[0].trim().toLowerCase();
                  const bMaq = (block.num_maquina || '').split('|')[0].trim().toLowerCase();
                  return sMaq === bMaq && 
                         s.operacao_nome?.trim().toLowerCase() === block.operacao_nome?.trim().toLowerCase();
                }
              );
              const isSessionActive = !!activeSessionForBlock;

              const blockSoma = block.somaTotal || 0;
              let blockMetaAlvo = 1000;
              if (blockSoma >= 1000 && blockSoma < 1200) {
                blockMetaAlvo = 1200;
              } else if (blockSoma >= 1200) {
                blockMetaAlvo = 1500;
              }
              const blockIsMetaBatida = blockSoma >= blockMetaAlvo;
              const blockFaltam = Math.max(0, blockMetaAlvo - blockSoma);

              const todayParts = new Date().toISOString().split('T')[0].split('-');
              const todayFormatted = `${todayParts[2]}/${todayParts[1]}/${todayParts[0]}`;
              const isToday = block.data === todayFormatted;

              let earliestStart: Date | null = null;
              let latestEnd: Date | null = null;
              block.itens.forEach((item: any) => {
                const hIni = item.horario_inicio;
                if (hIni) {
                  const d = parseTimeToDateToday(hIni, item.data);
                  if (d && (!earliestStart || d < earliestStart)) earliestStart = d;
                }
                const hTerm = item.horario_termino || item.created_at || item.timestamp;
                if (hTerm) {
                  const d = parseTimeToDateToday(hTerm, item.data);
                  if (d && (!latestEnd || d > latestEnd)) latestEnd = d;
                }
              });

              if (isSessionActive && activeSessionForBlock && activeSessionForBlock.horario_inicio) {
                const d = parseTimeToDateToday(activeSessionForBlock.horario_inicio, block.data);
                if (d && (!earliestStart || d < earliestStart)) {
                  earliestStart = d;
                }
              }

              const horaAtual = (isToday || isSessionActive) ? now : (latestEnd || now);
              const elapsedMs = earliestStart ? Math.max(60 * 1000, horaAtual.getTime() - earliestStart.getTime()) : 0;
              const elapsedHours = elapsedMs / (3600 * 1000);
              const blockRhythm = elapsedHours > 0 ? (blockSoma / elapsedHours) : 0;

              let blockEstimativaLabel = 'Tempo estimado para bater meta: ';
              let blockEstimativaValue: React.ReactNode = '';

              if (blockIsMetaBatida) {
                blockEstimativaLabel = '';
                blockEstimativaValue = <span className="text-emerald-500 font-extrabold">Meta Batida!</span>;
              } else if (blockRhythm <= 0) {
                blockEstimativaLabel = '';
                blockEstimativaValue = <span className="text-zinc-400 font-bold">Sem produção ativa para estimar</span>;
              } else {
                const hoursRemaining = blockFaltam / blockRhythm;
                const estHrs = Math.floor(hoursRemaining);
                const estMins = Math.round((hoursRemaining - estHrs) * 60);
                blockEstimativaLabel = 'Tempo estimado para bater meta: ';
                blockEstimativaValue = (
                  <span className="text-emerald-500 font-extrabold whitespace-nowrap">
                    {estHrs}h {estMins}min
                  </span>
                );
              }

              return (
                <div 
                  key={block.key} 
                  className={`border rounded-xl overflow-hidden transition-all duration-200 border-[#00624C]/25 bg-transparent`}
                >
                  {/* Linha principal fechada */}
                  <button
                    onClick={() => toggleGroup(block.key)}
                    className="w-full p-5 hover:bg-[#00624C]/20 transition-colors font-mono focus:outline-none cursor-pointer border-b border-[#00624C]/25 text-left bg-[#00624C]/16"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
                      {/* Coluna 1: Identificação de Máquina e Data */}
                      <div className="flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block">POSTO / MÁQUINA</span>
                            
                            {/* Selos de Status */}
                            <div className="flex items-center gap-1.5">
                              {isSessionActive ? (
                                <span className="text-[9px] font-black uppercase tracking-wider text-blue-400 bg-blue-950/40 border border-blue-500/30 px-2 py-0.5 rounded">
                                  ● PROCESSO EM ANDAMENTO
                                </span>
                              ) : (
                                <span className="text-[9px] font-black uppercase tracking-wider text-rose-400 bg-rose-950/40 border border-rose-500/30 px-2 py-0.5 rounded">
                                  ● PROCESSO ENCERRADO
                                </span>
                              )}

                              {/* Contador de Observação */}
                              {(() => {
                                const obsCount = block.itens.filter((item: any) => item.observacao && item.observacao.trim().length > 0).length;
                                if (obsCount > 0) {
                                  return (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1" title={`${obsCount} observações registradas`}>
                                      <Mail size={10} /> +{obsCount}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                          <span className="inline-flex px-3 py-1 bg-[#00624C]/15 border border-[#00624C]/35 text-[#00624C] text-base font-extrabold rounded-lg shadow-sm shadow-[#00624C]/10 font-mono">
                            {(() => {
                              const num = String(block.num_maquina || '');
                              const cleanNum = num.replace(/^(MQ[-_]0*|MÁQ:\s*0*|0*)/i, '');
                              return `MÁQ: ${cleanNum}`;
                            })()}
                          </span>
                        </div>

                        {(() => {
                          const shortCode = getShortCode(block);
                          const statusDoCard = isSessionActive ? '● PROCESSO EM ANDAMENTO' : '● PROCESSO ENCERRADO';
                          const codigo = shortCode;
                          const handleCopyCode = (cod: string) => {
                            navigator.clipboard.writeText(cod);
                            addToast(`Código ${cod} copiado para a área de transferência!`, 'success');
                          };
                          return (
                            <div className="space-y-1">
                              <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block">CÓDIGO CURTO</span>
                              <div 
                                role="button"
                                onClick={(e) => {
                                  e.stopPropagation(); // Evita que o clique abra/feche o card de histórico ao tentar copiar o código
                                  if (statusDoCard !== '● PROCESSO ENCERRADO') {
                                    handleCopyCode(codigo);
                                  }
                                }}
                                title={isSessionActive ? "Copiar Código" : "Cópia Desabilitada (Processo Encerrado)"}
                                className={`inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 border text-xs font-mono font-black rounded-md shadow-md shadow-emerald-950/10 transition-colors ${
                                  isSessionActive 
                                    ? 'border-emerald-500/40 text-emerald-400 hover:border-emerald-500/80 hover:bg-emerald-500/10 cursor-pointer group' 
                                    : 'border-zinc-800 text-zinc-500 cursor-not-allowed'
                                }`}
                              >
                                <span>COD: {shortCode}</span>
                                <span
                                  className={`p-1 flex items-center justify-center transition-colors ${
                                    isSessionActive 
                                      ? 'text-zinc-400 group-hover:text-emerald-400' 
                                      : 'opacity-30 text-zinc-600'
                                  }`}
                                >
                                  <Copy size={12} className={isSessionActive ? "group-hover:scale-110 transition-transform" : ""} />
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                        
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block">DATA DO PROCESSO</span>
                          <span className="text-sm text-zinc-200 flex items-center gap-2 font-bold bg-zinc-900 border border-zinc-800/80 px-2.5 py-1 rounded-md w-fit">
                            <Calendar size={14} className="text-[#00624C]" /> {block.data}
                          </span>
                        </div>
                      </div>

                      {/* Coluna 2: Operadora, Operação e Fluxo de Matéria Prima */}
                      <div className="flex flex-col justify-between space-y-3 md:border-l md:border-zinc-900/60 md:pl-6">
                        <div className="space-y-3">
                          <div>
                            <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block leading-relaxed">COLABORADORA ATIVA</span>
                            <h4 className="text-sm font-extrabold text-zinc-100 flex items-center gap-1.5 mt-0.5 leading-relaxed">
                              <User size={13} className="text-[#00624C]" /> {block.colaboradora}
                            </h4>
                          </div>
                          <div className="text-xs text-zinc-400 space-y-3 mt-3">
                            <div>
                              <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider block leading-relaxed">OPERAÇÃO ATRIBUÍDA</span>
                              <span className="text-zinc-200 font-semibold text-xs leading-relaxed flex items-center gap-1">
                                <Cpu size={14} className="inline mr-1 text-[#00624C]" /> {block.operacao_nome}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider block leading-relaxed">TIPO DE MÁQUINA</span>
                              <span className="text-zinc-300 uppercase text-xs bg-zinc-900 border border-zinc-800 px-3 py-1 rounded-md w-fit block mt-1 font-bold leading-relaxed tracking-wide">
                                {block.processo}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Monitoramento de Matéria Prima Restante e Tempo Estimado */}
                        {block.somaMateriaPrima > 0 && (() => {
                          const matTotal = block.somaMateriaPrima;
                          const prod = block.somaTotal;
                          const rest = Math.max(0, matTotal - prod);
                          const tempoRestante = getTempoRestanteMateriaPrima(matTotal, prod, block.tempoTotalMs, block.itens);
                          
                          return (
                            <div className="pt-2.5 border-t border-zinc-900/60 mt-1.5">
                              <span className="text-[#00624C] font-black uppercase text-[10px] tracking-widest block mb-1">MATÉRIA-PRIMA</span>
                              <div className="grid grid-cols-2 gap-2 bg-zinc-900/40 border border-zinc-800/60 p-2 rounded-lg">
                                <div>
                                  <span className="text-[8px] text-zinc-500 uppercase font-bold block">RESTANTE</span>
                                  <span className="text-blue-400 font-extrabold text-xs">{rest} pçs</span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-zinc-500 uppercase font-bold block">DURAÇÃO EST.</span>
                                  <span className="text-amber-500 font-bold text-[10px] font-mono block leading-tight mt-0.5">
                                    {tempoRestante}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Coluna 3: Produção Acumulada, Metas & Tempo de Operação */}
                      <div className="flex flex-col justify-between space-y-3 md:border-l md:border-zinc-900/60 md:pl-6">
                        {/* Produção Acumulada */}
                        <div className="space-y-1">
                          <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest block">PRODUÇÃO ACUMULADA</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-emerald-400 font-black text-xl md:text-2xl">{block.somaTotal} Pçs</span>
                            {(() => {
                              const soma = block.somaTotal || 0;
                              let metaAlvo = 1000;
                              if (soma >= 1000 && soma < 1200) {
                                metaAlvo = 1200;
                              } else if (soma >= 1200) {
                                metaAlvo = 1500;
                              }
                              if (soma >= metaAlvo) {
                                return (
                                  <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 text-[9px] px-2 py-0.5 rounded-md font-black uppercase tracking-wider flex items-center gap-1 shrink-0 animate-pulse">
                                    ✓ META BATIDA
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>

                        {/* Metas Progressivas com Barra de Progresso Clássica */}
                        {(() => {
                          const soma = block.somaTotal || 0;
                          let metaAlvo = 1000;
                          let progColor = 'text-zinc-300';
                          
                          if (soma < 1000) {
                            metaAlvo = 1000;
                            if (soma < 500) {
                              progColor = 'text-red-500';
                            } else if (soma < 750) {
                              progColor = 'text-orange-500';
                            } else {
                              progColor = 'text-yellow-500';
                            }
                          } else if (soma < 1200) {
                            metaAlvo = 1200;
                            progColor = 'text-emerald-500';
                          } else {
                            metaAlvo = 1500;
                            progColor = 'text-emerald-500';
                          }
                          
                          const percent = Math.min(100, (soma / metaAlvo) * 100);
                          
                          return (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="text-zinc-500 uppercase tracking-wider">META DO BLOCO</span>
                                <span className="text-zinc-400 font-mono">
                                  <span className={progColor}>{soma}</span> / <span className="text-emerald-500">{metaAlvo} Pçs</span> ({percent.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full bg-zinc-900 border border-zinc-800/80 h-2 rounded-full overflow-hidden">
                                <div 
                                  className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <div className="text-xs font-bold text-zinc-300 mt-1">
                                {blockEstimativaLabel}{blockEstimativaValue}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Tempo Ativo de Operação */}
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-900/40">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">TEMPO DE OPERAÇÃO</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock size={12} className="text-[#00624C] animate-pulse" />
                              <span className="text-zinc-200 font-mono font-bold text-xs bg-zinc-900 border border-zinc-800/60 px-2.5 py-0.5 rounded shadow-inner">
                                {(() => {
                                  let baseMs = block.tempoTotalMs || 0;
                                  if (isSessionActive && activeSessionForBlock && activeSessionForBlock.horario_inicio) {
                                    const dInicio = parseTimeToDateToday(activeSessionForBlock.horario_inicio, block.data);
                                    if (dInicio) {
                                      const liveMs = Math.max(0, now.getTime() - dInicio.getTime());
                                      baseMs += liveMs;
                                    }
                                  }

                                  if (baseMs <= 0) {
                                    let earliestStart: Date | null = null;
                                    let latestEnd: Date | null = null;
                                    block.itens.forEach((item: any) => {
                                      const hIni = item.horario_inicio;
                                      if (hIni) {
                                        const d = parseTimeToDateToday(hIni, item.data);
                                        if (d && (!earliestStart || d < earliestStart)) earliestStart = d;
                                      }
                                      const hTerm = item.horario_termino || item.created_at || item.timestamp;
                                      if (hTerm) {
                                        const d = parseTimeToDateToday(hTerm, item.data);
                                        if (d && (!latestEnd || d > latestEnd)) latestEnd = d;
                                      }
                                    });
                                    if (earliestStart) {
                                      const baseEnd = latestEnd || now;
                                      const diffMs = Math.max(0, baseEnd.getTime() - earliestStart.getTime());
                                      return formatProductionTime(diffMs);
                                    }
                                    return '00:00:00';
                                  }
                                  return formatProductionTime(baseMs);
                                })()}
                              </span>
                            </div>
                          </div>

                          {/* Chevron Indicator */}
                          <div className="hidden md:block self-end pb-1">
                            {isExpanded ? (
                              <ChevronDown size={20} className="text-[#00624C] transition-transform duration-200 bg-[#00624C]/10 p-1 rounded border border-[#00624C]/25 hover:bg-[#00624C]/20" />
                            ) : (
                              <ChevronRight size={20} className="text-zinc-500 transition-transform duration-200 bg-zinc-900 p-1 rounded border border-zinc-800 hover:text-white" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Detalhes expandidos (Accordion/Sanfona) */}
                  {isExpanded && (
                    <div className="border-t border-zinc-900/60 bg-transparent px-5 py-5 space-y-4 font-mono text-xs">
                      {/* Tempo de Produção Destacado */}
                      {(() => {
                        let totalBlockMs = block.itens.reduce((acc: number, curr: any) => {
                          const itemInicio = curr.horario_inicio;
                          const itemTermino = curr.horario_termino;
                          if (!itemInicio || !itemTermino) return acc;
                          
                          const dInicio = parseTimeToDateToday(itemInicio, curr.data);
                          const dTermino = parseTimeToDateToday(itemTermino, curr.data);
                          if (!dInicio || !dTermino) return acc;
                          
                          let diffMs = dTermino.getTime() - dInicio.getTime();
                          if (diffMs < 0) return acc;
                          
                          // Refeição padrão: 12:00:00 to 13:20:00
                          let baseDateStr = curr.data || new Date().toISOString().split('T')[0];
                          if (baseDateStr.includes('/')) {
                            const parts = baseDateStr.split('/');
                            if (parts.length === 3) {
                              baseDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                            }
                          }
                          const dAlmocoInicio = new Date(`${baseDateStr}T12:00:00`);
                          const dAlmocoFim = new Date(`${baseDateStr}T13:20:00`);
                          
                          if (dInicio <= dAlmocoInicio && dTermino >= dAlmocoFim) {
                            diffMs = Math.max(0, diffMs - (80 * 60 * 1000));
                          }
                          
                          return acc + diffMs;
                        }, 0);

                        // Se a sessão está ativa, adiciona o tempo decorrido ao vivo
                        if (isSessionActive && activeSessionForBlock && activeSessionForBlock.horario_inicio) {
                          const dInicio = parseTimeToDateToday(activeSessionForBlock.horario_inicio, block.data);
                          if (dInicio) {
                            let diffMs = now.getTime() - dInicio.getTime();
                            if (diffMs > 0) {
                              let baseDateStr = block.data || new Date().toISOString().split('T')[0];
                              if (baseDateStr.includes('/')) {
                                const parts = baseDateStr.split('/');
                                if (parts.length === 3) {
                                  baseDateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
                                }
                              }
                              const dAlmocoInicio = new Date(`${baseDateStr}T12:00:00`);
                              const dAlmocoFim = new Date(`${baseDateStr}T13:20:00`);
                              if (dInicio <= dAlmocoInicio && now >= dAlmocoFim) {
                                diffMs = Math.max(0, diffMs - (80 * 60 * 1000));
                              }
                              totalBlockMs += diffMs;
                            }
                          }
                        }

                        const totalMinutes = Math.round(totalBlockMs / 60000);
                        const hrs = Math.floor(totalMinutes / 60);
                        const mins = totalMinutes % 60;
                        const tempoProducaoStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;

                        // Ritmo e Estimativa
                        const todayParts = new Date().toISOString().split('T')[0].split('-');
                        const todayFormatted = `${todayParts[2]}/${todayParts[1]}/${todayParts[0]}`;
                        const isToday = block.data === todayFormatted;

                        let earliestStart: Date | null = null;
                        let latestEnd: Date | null = null;
                        block.itens.forEach((item: any) => {
                          const hIni = item.horario_inicio;
                          if (hIni) {
                            const d = parseTimeToDateToday(hIni, item.data);
                            if (d && (!earliestStart || d < earliestStart)) {
                              earliestStart = d;
                            }
                          }
                          const hTerm = item.horario_termino || item.created_at || item.timestamp;
                          if (hTerm) {
                            const d = parseTimeToDateToday(hTerm, item.data);
                            if (d && (!latestEnd || d > latestEnd)) {
                              latestEnd = d;
                            }
                          }
                        });

                        const horaAtual = isToday ? now : (latestEnd || now);
                        const elapsedMs = earliestStart ? Math.max(60 * 1000, horaAtual.getTime() - earliestStart.getTime()) : 0;
                        const elapsedHours = elapsedMs / (3600 * 1000);
                        const soma = block.somaTotal || 0;
                        const rhythm = elapsedHours > 0 ? (soma / elapsedHours) : 0;

                        let metaAlvo = 1000;
                        if (soma >= 1000 && soma < 1200) {
                          metaAlvo = 1200;
                        } else if (soma >= 1200) {
                          metaAlvo = 1500;
                        }

                        const faltam = Math.max(0, metaAlvo - soma);
                        const isMetaBatida = soma >= metaAlvo;

                        let estimativaStr = '';
                        if (isMetaBatida) {
                          estimativaStr = 'Meta Batida!';
                        } else if (rhythm <= 0) {
                          estimativaStr = 'Sem produção ativa para estimar';
                        } else {
                          const hoursRemaining = faltam / rhythm;
                          const estHrs = Math.floor(hoursRemaining);
                          const estMins = Math.round((hoursRemaining - estHrs) * 60);
                          estimativaStr = `Tempo estimado para bater meta: ${estHrs}h ${estMins}min`;
                        }

                        return (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                              {/* Boletim da Qualidade */}
                              <div className="bg-[#1a1a1a] border border-zinc-800 shadow-md shadow-black/40 rounded-lg p-3.5 flex flex-col justify-between">
                                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1">
                                  Boletim da Qualidade
                                </span>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-rose-400 text-xs font-bold">
                                    Refugo: {block.somaRefugo} pçs
                                  </span>
                                  <span className="text-amber-400 text-xs font-bold">
                                    Retrabalhos: {block.somaRetrabalho} pçs
                                  </span>
                                </div>
                              </div>

                              {/* Ritmo Atual */}
                              <div className="bg-[#1a1a1a] border border-zinc-800 shadow-md shadow-black/40 rounded-lg p-3.5 flex flex-col justify-between">
                                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1">
                                  Ritmo de Produção
                                </span>
                                <span className="text-zinc-200 text-xs font-bold sm:text-sm">
                                  Ritmo Atual: <span className="text-emerald-500 font-extrabold">{rhythm.toFixed(1)}</span> Pçs/h
                                </span>
                              </div>

                              {/* Controle de Matéria-Prima */}
                              <div className="bg-[#1a1a1a] border border-zinc-800 shadow-md shadow-black/40 rounded-lg p-3.5 flex flex-col justify-between">
                                <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-1">
                                  Controle de Matéria-Prima
                                </span>
                                {(() => {
                                  const matInicial = Number(block.materia_prima_inicial) || Number(block.somaMateriaPrima) || 0;
                                  const materia_prima_restante = matInicial - (block.somaTotal || 0);

                                  if (matInicial <= 0) {
                                    return (
                                      <span className="text-zinc-400 text-xs font-bold sm:text-sm">
                                        Nenhuma matéria-prima alimentada
                                      </span>
                                    );
                                  }

                                  if (materia_prima_restante <= 0) {
                                    return (
                                      <span className="text-rose-500 text-xs font-black sm:text-sm animate-pulse">
                                        Matéria-Prima Finalizada!
                                      </span>
                                    );
                                  }

                                  if (rhythm <= 0) {
                                    return (
                                      <span className="text-zinc-300 text-xs font-bold sm:text-sm">
                                        {materia_prima_restante} pçs restantes (Aguardando prod.)
                                      </span>
                                    );
                                  }

                                  const hrsRemaining = materia_prima_restante / rhythm;
                                  const estHrs = Math.floor(hrsRemaining);
                                  const estMins = Math.round((hrsRemaining - estHrs) * 60);

                                  return (
                                    <span className="text-blue-400 text-xs font-bold sm:text-sm">
                                      {materia_prima_restante} pçs restantes (Acaba em: {estHrs}h {estMins}min)
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider mb-2 flex items-center gap-1.5 pt-1">
                        <Layers size={11} className="text-[#00624C]" /> Contagens Individuais no Bloco ({block.itens.filter((item: any) => Number(item.producao_conforme || item.quantidade || 0) > 0).length})
                      </div>
                      <div className="pt-2">
                        {(() => {
                          const sortedBlockItens = [...block.itens].sort((a, b) => {
                            const getTimeString = (item: any) => {
                              const t = item.horario_termino || item.created_at || item.timestamp || item.horario_inicio || '';
                              if (!t) return '00:00';
                              if (t.includes('T') || t.includes('-')) {
                                try {
                                  const d = new Date(t);
                                  if (!isNaN(d.getTime())) {
                                    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                  }
                                } catch (e) {}
                              }
                              return t;
                            };
                            return getTimeString(b).localeCompare(getTimeString(a));
                          });
                          const displayItens = sortedBlockItens.filter((item: any) => {
                            const conforme = Number(item.producao_conforme || item.quantidade || 0);
                            return conforme > 0;
                          });

                          if (displayItens.length === 0) {
                            return (
                              <div key="empty-counts" className="flex flex-col items-center justify-center p-8 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-center gap-2">
                                <span className="text-xs font-bold font-sans tracking-wide">
                                  Aguardando primeira contagem do processo...
                                </span>
                              </div>
                            );
                          }

                          return displayItens.map((item: any, itemIdx: number) => {
                            const formatTimeStr = (t: string) => {
                              if (!t) return '-';
                              if (t.includes('T') || t.includes('-')) {
                                try {
                                  return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                } catch (e) {
                                  return t;
                                }
                              }
                              return t.slice(0, 5); // display "HH:MM"
                            };

                            const hTermino = item.horario_termino || item.created_at || item.timestamp;
                            const formattedTime = formatTimeStr(hTermino);
                            const hInicio = item.horario_inicio || '';
                            const formattedTimeInicio = hInicio ? formatTimeStr(hInicio) : '';
                            
                            // Cálculo estático com lógica de almoço para o registro específico
                            const tempoProducaoReg = hInicio && hTermino ? getRegistroProductionTime(hInicio, hTermino, item.data) : '';

                          const conforme = item.producao_conforme || item.quantidade || 0;
                          const status = item.status || 'validado';
                          const statusStr = String(status).toLowerCase();
                          const isLegacyRealtime = statusStr === 'realtime';

                          const rePr = item.retrabalho_proprio || 0;
                          const reTe = item.retrabalho_terceiro || 0;
                          const ocorrencia = item.motivo_ocorrencia;
                          const lote = item.lote || 'N/A';
                          const lado = item.lado || 'Único';
                          const tipoMaq = item.tipo_maquina || 'Manual';
                          
                          // Hora extra vem sempre "Não" por padrão, exceto se banco retornar exatamente 's'
                          const horaExtra = item.hora_extra === 's' ? 'Sim' : 'Não';

                          return (
                            <div 
                              key={item.id || itemIdx} 
                              className="p-4 bg-[#1a1a1a] border border-zinc-800 shadow-md shadow-black/40 rounded-lg mb-3 last:mb-0 space-y-3"
                            >
                              {/* Registro de Contagem - Nova Organização das Contagens em Duas Linhas para Tablet */}
                              <div className="flex flex-col gap-2.5 w-full">
                                {/* Linha 1 (Superior): Horário, duração, Produção Conforme na esquerda, selo azul na extrema direita */}
                                <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                                  <div className="flex flex-wrap items-center gap-2.5">
                                    <span className="text-zinc-300 font-bold bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800 flex items-center gap-1.5 text-xs">
                                      <Clock size={11} /> {formattedTimeInicio ? `${formattedTimeInicio} - ${formattedTime}` : formattedTime}
                                    </span>
                                    {tempoProducaoReg && (
                                      <span className="text-[#00624C] font-bold text-xs bg-[#00624C]/5 border border-[#00624C]/10 px-2 py-0.5 rounded">
                                        Tempo: {tempoProducaoReg}
                                      </span>
                                    )}
                                    <span className="text-emerald-500 font-bold text-xs bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded">
                                      Produção Conforme: {conforme} Pçs
                                    </span>
                                    {ocorrencia && ocorrencia !== 'Produção Normal' && (
                                      <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded font-bold uppercase tracking-wider">
                                        Ocorrência: {ocorrencia}
                                      </span>
                                    )}
                                    {!isLegacyRealtime && status !== 'validado' && (
                                      <span className={`text-[10px] uppercase font-black tracking-widest px-2.5 py-1 rounded border ${
                                        status === 'rejeitado'
                                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      }`}>
                                        {status}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {isSessionActive && itemIdx === 0 ? (
                                      <span className="text-blue-400 bg-blue-950/20 border border-blue-500/30 text-[10px] px-2.5 py-1 rounded font-bold uppercase tracking-wider">
                                        ÚLTIMO REGISTRO
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              {/* Grid de 4 colunas bem distribuídas, fontes legíveis (~text-sm / 14px), sem cor de fundo */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-transparent border border-zinc-900 p-3.5 rounded-lg text-sm">
                                <div className="flex flex-col">
                                  <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Lote</span>
                                  <span className="text-zinc-200 font-medium">{lote}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Lado</span>
                                  <span className="text-zinc-200 font-medium">{lado}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Tipo Máquina</span>
                                  <span className="text-zinc-200 font-medium">{tipoMaq}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Hora Extra</span>
                                  <span className="text-zinc-200 font-medium">{horaExtra}</span>
                                </div>
                              </div>

                              {/* Observação correspondente no log */}
                              {item.observacao && item.observacao.trim() && (
                                <div className="bg-zinc-950/40 border border-zinc-900/60 p-3.5 rounded-lg mt-2 text-xs text-zinc-300">
                                  <span className="text-amber-500 font-bold block text-[10px] uppercase tracking-wider mb-1">
                                    ✉ Observação / Justificativa:
                                  </span>
                                  <p className="font-sans italic leading-relaxed text-zinc-100 font-medium">
                                    "{item.observacao.trim()}"
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {groupedBlocks.length === 0 && (
              <div className="text-center py-16 text-zinc-600 font-mono text-xs uppercase tracking-widest border border-dashed border-zinc-900 rounded-lg">
                Nenhum apontamento localizado com os filtros selecionados
              </div>
            )}
          </div>
        )}

        {/* Controles de Paginação */}
        {totalCount > PAGE_SIZE && (
          <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-zinc-900/80 gap-3 font-mono text-xs text-zinc-400">
            <div>
              Mostrando <span className="text-white font-bold">{page * PAGE_SIZE + 1}</span> a{' '}
              <span className="text-white font-bold">
                {Math.min((page + 1) * PAGE_SIZE, totalCount)}
              </span>{' '}
              de <span className="text-white font-bold">{totalCount}</span> registros
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 0 || isLoading}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 hover:text-white rounded transition-colors uppercase text-[10px] font-bold cursor-pointer"
              >
                Anterior
              </button>
              <button
                disabled={(page + 1) * PAGE_SIZE >= totalCount || isLoading}
                onClick={() => setPage(p => p + 1)}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 hover:text-white rounded transition-colors uppercase text-[10px] font-bold cursor-pointer"
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
