import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Copy
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalSessionUser } from '../lib/auth';

const SewingMachineIcon = ({ size = 16, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`inline mr-2 ${className}`}
  >
    <rect x="1" y="18" width="22" height="3" rx="1.5" />
    <rect x="3" y="3" width="2" height="11" rx="1" />
    <line x1="4" y1="14" x2="4" y2="17" />
    <path d="M 4.5 5 h 11 c 2 0, 3.5 1, 3.5 3 v 10" />
    <path d="M 4.5 10 c 4 0, 7 1, 10 3.5 c 1 0.8, 1.5 2, 1.5 4.5" />
    <rect x="20" y="6" width="1" height="5" rx="0.5" />
    <line x1="16" y1="5" x2="16" y2="2" />
  </svg>
);

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
          .schema('AtlasApontamento')
          .from('processos_disponiveis')
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
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [ocorrencias, setOcorrencias] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Bloquear rolagem do corpo da página ao abrir a janela lateral
  useEffect(() => {
    if (selectedBlockKey) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedBlockKey]);

  useEffect(() => {
    const handleRefresh = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('refresh-apontamentos', handleRefresh);
    return () => window.removeEventListener('refresh-apontamentos', handleRefresh);
  }, []);

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

      // 1. Auto-cleanup check for forgotten active sessions
      try {
        const { data: activeSessData, error: activeSessError } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .select('*');

        if (!activeSessError && activeSessData && activeSessData.length > 0) {
          const agora = new Date();
          const hojeDataStr = agora.toISOString().split('T')[0];

          for (const session of activeSessData) {
            const sessaoDataStr = session.created_at ? session.created_at.split('T')[0] : hojeDataStr;
            let isForgotten = false;

            if (sessaoDataStr < hojeDataStr) {
              isForgotten = true;
            } else if (sessaoDataStr === hojeDataStr) {
              const diaSemana = agora.getDay();
              const horas = agora.getHours();
              const minutos = agora.getMinutes();
              const tempoAtualEmMinutos = horas * 60 + minutos;

              let limiteMinutos = 17 * 60; // 17:00
              if (diaSemana === 5) {
                const thresholdDate = new Date('2026-11-29T23:59:59');
                if (agora <= thresholdDate) {
                  limiteMinutos = 16 * 60 + 44; // 16h44
                } else {
                  limiteMinutos = 15 * 60 + 44; // 15h44
                }
              } else if (diaSemana >= 1 && diaSemana <= 4) {
                limiteMinutos = 17 * 60; // 17h00
              }

              if (tempoAtualEmMinutos >= limiteMinutos) {
                isForgotten = true;
              }
            }

            if (isForgotten) {
              // Determina o horário de término com base no dia da semana do registro
              let horarioTermino = "17:00:00";
              try {
                const dateObj = new Date(sessaoDataStr + 'T12:00:00');
                if (dateObj.getDay() === 5) {
                  const thresholdDate = new Date('2026-11-29T23:59:59');
                  horarioTermino = dateObj <= thresholdDate ? "16:44:00" : "15:44:00";
                }
              } catch (e) {}

              const novoRegistroDefinitivo = {
                data: sessaoDataStr,
                operadora_nome: session.operadora_nome,
                hora_extra: session.hora_extra || 'n',
                operacao_nome: session.operacao_nome,
                tipo_maquina: session.tipo_maquina,
                lote: session.lote,
                num_maquina: session.num_maquina,
                lado: session.lado || 'Único',
                codigo_manual_curto: session.codigo_manual_curto,
                horario_inicio: session.horario_inicio,
                horario_termino: horarioTermino,
                producao_conforme: 0,
                retrabalho_proprio: 0,
                retrabalho_terceiro: 0,
                refugo: 0,
                motivo_ocorrencia: 'Finalização Automática',
                user_id: session.user_id || userId,
                materia_prima_inicial: Number(session.materia_prima_inicial) || 0,
                observacao: 'Finalizado automaticamente pelo sistema (sessão esquecida)'
              };

              // Insere na tabela definitiva
              const { error: errInsert } = await supabase
                .schema('AtlasApontamento')
                .from('registros_producao_terminal')
                .insert([novoRegistroDefinitivo]);

              if (!errInsert) {
                // Delete from active sessions
                await supabase
                  .schema('AtlasApontamento')
                  .from('sessoes_ativas_terminal')
                  .delete()
                  .eq('id', session.id);
              } else {
                console.error('[Auto-Cleanup] Erro ao inserir registro finalizado:', errInsert);
              }
            }
          }
        }
      } catch (errCleanup) {
        console.error('[Auto-Cleanup] Erro durante o processo de encerramento automático:', errCleanup);
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

      // Query finalizacao_antecipada from ocorrencias_terminal
      try {
        const { data: ocorrenciasData, error: ocorrenciasError } = await supabase
          .schema('AtlasApontamento')
          .from('ocorrencias_terminal')
          .select('*')
          .eq('tipo_ocorrencia', 'finalizacao_antecipada');
        if (!ocorrenciasError && ocorrenciasData) {
          setOcorrencias(ocorrenciasData);
        }
      } catch (errOcorrencias) {
        console.error('Error fetching ocorrencias:', errOcorrencias);
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

  // Carregar dados quando a página ou refreshTrigger muda
  useEffect(() => {
    fetchHistSupabase();
  }, [page, refreshTrigger]);

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

    // Total Contado considera todas as peças contadas sem subtrações
    const itemTotalContado = pecasBrutas + rePr + reTe + refugo;
    // Prod. Conforme subtrai estritamente Refugo e Retrabalho Próprio (Retrabalho Terceiro NÃO subtrai)
    const itemProdConforme = Math.max(0, itemTotalContado - rePr - refugo);

      if (!groups[key]) {
        groups[key] = {
          key,
          data: dateStr,
          num_maquina: maquina,
          codigo_manual_curto: reg.codigo_manual_curto || '',
          operacao_nome: operacao,
          colaboradora: reg.operadora_nome || reg.operadora || 'Desconhecida',
          processo: reg.tipo_maquina || reg.processo || 'Processo',
          somaTotalContado: 0,
          somaProdConforme: 0,
          somaTotal: 0,
          somaRefugo: 0,
          somaRetrabalho: 0,
          somaRetrabalhoProprio: 0,
          somaRetrabalhoTerceiro: 0,
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
        groups[key].somaTotalContado += itemTotalContado;
        groups[key].somaProdConforme += itemProdConforme;
        groups[key].somaTotal += itemProdConforme;
        groups[key].somaRefugo += refugo;
        groups[key].somaRetrabalho += (rePr + reTe);
        groups[key].somaRetrabalhoProprio += rePr;
        groups[key].somaRetrabalhoTerceiro += reTe;
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
    setSelectedBlockKey(prev => prev === key ? null : key);
  };

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto" id="apontamentos-view">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold uppercase tracking-[0.2em] text-[#00624C]">
            APONTAMENTOS DO TURNO
          </h2>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
            REGISTRO CRONOLÓGICO DE APONTAMENTOS
          </p>
        </div>

        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-zinc-950 border border-white/60 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-[#00624C]" />
          <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-zinc-300">
            PAINEL DE PESQUISA
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
                  
                  const sortedEntries = (Object.entries(grouped) as [string, string[]][]).sort(([catA], [catB]) => {
                    const getWeight = (cat: string) => {
                      const norm = cat.toUpperCase().trim();
                      if (norm === 'FORRAÇÃO CITY' || norm === 'FORRACAO CITY') return 1;
                      if (norm === 'ORELHA CITY') return 2;
                      return 3;
                    };
                    const weightA = getWeight(catA);
                    const weightB = getWeight(catB);
                    if (weightA !== weightB) return weightA - weightB;
                    return catA.toUpperCase().localeCompare(catB.toUpperCase());
                  });
                  
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
                      {sortedEntries.map(([category, ops]) => (
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
        <div className="border border-white/60 bg-zinc-950/20 p-4 sm:p-5 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto scrollbar-thin">
          <span className="text-[10px] font-mono uppercase tracking-widest font-black text-white block mb-4">
            REGISTRAR APONTAMENTO MANUAL NO TERMINAL
          </span>

          <form onSubmit={handleCreateApontamento} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 min-w-0">
              <label className="text-[9px] font-mono uppercase tracking-wider text-zinc-500 block font-bold">Responsável Coleta</label>
              <input
                type="text"
                readOnly
                value="MANUAL (CELULAR LOGADO)"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2.5 py-2 text-xs font-mono text-zinc-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
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

            <div className="space-y-1.5 min-w-0">
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

            <div className="sm:col-span-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-900/40">
              <div className="flex flex-wrap gap-3">
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
                  className="flex-1 sm:flex-none py-2 px-3 rounded text-[10px] font-mono font-bold uppercase text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 sm:flex-none py-2 px-4 bg-[#00624C] hover:bg-[#004838] rounded text-[10px] font-mono font-bold uppercase text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
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
      <div className="border border-white/60 rounded-xl bg-zinc-950/40 p-5 flex flex-col space-y-4">
        
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-900/60">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-zinc-500" />
            <span className="text-[10px] font-mono uppercase tracking-widest font-black text-zinc-300">
              REGISTROS DE APONTAMENTO ({totalCount} REGISTROS)
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
              const isExpanded = selectedBlockKey === block.key;

              const activeSessionForBlock = activeSessions.find(
                s => {
                  const sMaq = (s.num_maquina || '').split('|')[0].trim().toLowerCase();
                  const bMaq = (block.num_maquina || '').split('|')[0].trim().toLowerCase();
                  return sMaq === bMaq && 
                         s.operacao_nome?.trim().toLowerCase() === block.operacao_nome?.trim().toLowerCase();
                }
              );
              const isSessionActive = !!activeSessionForBlock;

              const blockFinalizacoes = ocorrencias.filter(o => {
                const sMaq = (o.num_maquina || '').split('|')[0].trim().toLowerCase();
                const bMaq = (block.num_maquina || '').split('|')[0].trim().toLowerCase();
                if (sMaq !== bMaq) return false;
                if (o.operacao_nome?.trim().toLowerCase() !== block.operacao_nome?.trim().toLowerCase()) return false;
                
                const oData = o.data_ocorrencia || o.created_at || o.timestamp || o.horario_inicio;
                if (!oData) return false;
                
                let oDateStr = 'Sem Data';
                if (oData.includes('-') && !oData.includes('T')) {
                    const p = oData.split('-');
                    if (p.length === 3) oDateStr = `${p[2]}/${p[1]}/${p[0]}`;
                } else {
                    try {
                        oDateStr = new Date(oData).toLocaleDateString('pt-BR');
                    } catch (e) { }
                }
                return oDateStr === block.data;
              });

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
                const hTerm = item.horario_termino;
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

              const uniqueObsSet = new Set<string>();
              block.itens.forEach((item: any) => {
                if (item.motivo_ocorrencia !== "Finalização Antecipada" && item.motivo_ocorrencia !== "Finalização Automática") {
                  const obsStr = item.observacao || '';
                  obsStr.split('|').forEach((o: string) => {
                    const trimmed = o.trim();
                    if (trimmed && trimmed !== "EMPTY" && trimmed !== "NULL") {
                      uniqueObsSet.add(trimmed);
                    }
                  });
                }
              });
              const somaObservacoes = uniqueObsSet.size;
              const finCount = blockFinalizacoes.length;
              const hasObs = somaObservacoes > 0;
              const hasFin = finCount > 0;
              const hasFinalizacaoAutomatica = block.itens.some((i: any) => i.motivo_ocorrencia === 'Finalização Automática');
              const hasFinalizacaoAntecipada = block.itens.some((i: any) => i.motivo_ocorrencia === 'Finalização Antecipada') || finCount > 0;

              const headerBgClass = isExpanded 
                ? 'bg-emerald-900/40 text-emerald-300' 
                : 'bg-emerald-950/16 text-emerald-400';
                
              const headerBorderClass = isExpanded
                ? 'border-l-4 border-l-emerald-500 border-b border-b-emerald-500/30'
                : 'border-l-4 border-l-emerald-500/40 border-b border-b-transparent';
                
              const wrapperClass = isExpanded
                ? 'bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                : 'bg-[#141414] border-white/50 shadow-black/50';

              return (
                <div 
                  key={block.key} 
                  className={`rounded-xl border relative mb-4 transition-colors transition-shadow duration-200 overflow-clip transform-gpu backface-hidden ${wrapperClass}`}
                >
                  {/* CARD FECHADO REFORMULADO (Opção 1 com todos os dados integrados) */}
                  <button
                    onClick={() => toggleGroup(block.key)}
                    className={`w-full p-4 hover:bg-zinc-900/40 transition-colors duration-200 font-mono focus:outline-none cursor-pointer text-left ${headerBgClass} ${headerBorderClass}`}
                  >
                    {/* Alertas de Notificação (Restaurados no topo) */}
                    {hasObs && (
                      <div className="flex items-center space-x-2 mb-2 pr-8 sm:pr-32">
                        <span className="text-amber-500 bg-amber-950/30 border border-amber-500/20 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold" title={`${somaObservacoes} observações registradas`}>
                          <Mail size={12} className="inline mr-0.5" /> +{somaObservacoes}
                        </span>
                      </div>
                    )}

                    {/* Linha 1: Identificação, Linha de Máquina e Status do Processo */}
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <span className="bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 text-[9px] sm:text-xs font-mono font-bold px-1 py-0.5 sm:px-2.5 sm:py-1 rounded shrink-0 whitespace-nowrap mt-0.5 sm:mt-0">
                        {(() => {
                          const num = String(block.num_maquina || '');
                          const cleanNum = num.replace(/^(MQ[-_]0*|MÁQ:\s*0*|0*)/i, '');
                          return `MÁQ: ${cleanNum}`;
                        })()}
                      </span>
                      {isSessionActive ? (
                        <span className="text-blue-400 text-[7.5px] sm:text-xs font-bold uppercase tracking-wider bg-blue-950/20 border border-blue-500/20 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded whitespace-normal sm:truncate leading-tight text-right">
                          ● PROCESSO EM ANDAMENTO
                        </span>
                      ) : (
                        <span className="text-rose-400 text-[7.5px] sm:text-xs font-bold uppercase tracking-wider bg-rose-950/20 border border-rose-500/20 px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded whitespace-normal sm:truncate leading-tight text-right">
                          ● PROCESSO ENCERRADO
                        </span>
                      )}
                    </div>

                    {/* Linha 2: Informações do Processo (Alinhadas verticalmente sem embolar) */}
                    <div className="border-t border-zinc-900/60 pt-4 space-y-2">
                      <div>
                        <span className="text-zinc-500 text-[9px] uppercase font-bold tracking-wider block mb-0.5">Operadora</span>
                        <div className="flex justify-between items-start w-full">
                          <span className="text-[15px] font-bold text-zinc-100 flex items-center gap-1 truncate mt-0.5" title={`${block.colaboradora} - [${block.processo}]`}>
                            👤 {block.colaboradora}
                          </span>
                          <div className="flex flex-col items-end">
                            <span className="text-zinc-400 text-xs font-bold bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded shrink-0">
                              [{block.processo}]
                            </span>
                            {hasFinalizacaoAutomatica && (
                              <span className="bg-rose-950/40 border border-rose-500/20 text-rose-400 text-[8px] px-2.5 py-1 mt-2 rounded font-bold uppercase tracking-wider flex items-center gap-1 w-fit text-right">
                                ⚠ FINALIZAÇÃO AUTOMÁTICA
                              </span>
                            )}
                            {hasFinalizacaoAntecipada && !hasFinalizacaoAutomatica && (
                              <span className="bg-rose-950/40 border border-rose-500/20 text-rose-400 text-[8px] px-2.5 py-1 mt-2 rounded font-bold uppercase tracking-wider flex items-center gap-1 w-fit text-right">
                                ⚠ FINALIZAÇÃO ANTECIPADA
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[9px] uppercase font-bold tracking-wider block mb-0.5">Operação</span>
                        <span className="text-sm font-semibold text-zinc-300 flex items-center gap-1.5 break-words whitespace-normal leading-snug" title={block.operacao_nome}>
                          {/* Ícone de Máquina de Costura Real */}
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline text-emerald-500 shrink-0">
                            <rect x="1" y="18" width="22" height="3" rx="1.5" /><rect x="3" y="3" width="2" height="11" rx="1" /><line x1="4" y1="14" x2="4" y2="17" /><path d="M 4.5 5 h 11 c 2 0, 3.5 1, 3.5 3 v 10" /><path d="M 4.5 10 c 4 0, 7 1, 10 3.5 c 1 0.8, 1.5 2, 1.5 4.5" /><rect x="20" y="6" width="1" height="5" rx="0.5" /><line x1="16" y1="5" x2="16" y2="2" />
                          </svg>
                          {block.operacao_nome}
                        </span>
                      </div>
                    </div>

                    {/* Linha 3: Bloco de Dados Técnicos (Data e Cronômetro) */}
                    <div className="border-t border-zinc-900/60 pt-3.5 flex justify-between items-center gap-3 text-sm font-mono text-zinc-400">
                      {/* Coluna 1: Data do Processo */}
                      <div className="flex flex-col">
                        <span className="text-zinc-600 block text-[9px] uppercase font-bold mb-0.5">Data Processo</span>
                        <span className="text-zinc-300 truncate text-[11px] sm:text-sm">📅 {block.data}</span>
                      </div>

                      {/* Coluna 2: Tempo Corrido/Operação */}
                      <div className="flex flex-col items-end">
                        <span className="text-zinc-600 block text-[9px] uppercase font-bold mb-0.5">Tempo Operação</span>
                        <span className="text-zinc-300 font-bold bg-zinc-950 border border-zinc-900 px-1.5 py-0.5 rounded truncate text-[11px] sm:text-sm">
                          ⏱ {(() => {
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

                    {/* Linha 4: Produção Acumulada, Meta e Barra de Progresso */}
                    {(() => {
                      const somaProdConforme = block.somaProdConforme !== undefined ? block.somaProdConforme : (block.somaTotal || 0);
                      const somaTotalContado = block.somaTotalContado !== undefined ? block.somaTotalContado : somaProdConforme;
                      const refugoCount = block.somaRefugo || 0;

                      let metaAlvo = 1000;
                      let progColor = 'bg-zinc-300';
                      let textColor = 'text-emerald-400';
                      
                      if (somaProdConforme < 1000) {
                        metaAlvo = 1000;
                        if (somaProdConforme < 500) {
                          progColor = 'bg-red-500';
                          textColor = 'text-red-500';
                        } else if (somaProdConforme < 750) {
                          progColor = 'bg-orange-500';
                          textColor = 'text-orange-500';
                        } else {
                          progColor = 'bg-yellow-500';
                          textColor = 'text-yellow-500';
                        }
                      } else if (somaProdConforme < 1200) {
                        metaAlvo = 1200;
                        progColor = 'bg-emerald-500';
                        textColor = 'text-emerald-500';
                      } else {
                        metaAlvo = 1500;
                        progColor = 'bg-emerald-500';
                        textColor = 'text-emerald-500';
                      }
                      
                      const percent = Math.min(100, (somaProdConforme / metaAlvo) * 100);
                      const isMetaBatida = somaProdConforme >= metaAlvo;

                      return (
                        <div className="border-t border-zinc-900/60 pt-3 space-y-2">
                          <div className="flex justify-between items-end">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-zinc-500 text-[8px] uppercase font-bold tracking-wider">Produção Acumulada</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-sm font-black leading-none ${textColor}`} title="Prod. Conforme (Todas as peças menos refugo e retrabalho próprio)">
                                  {somaProdConforme} Pçs <span className="text-[9px] text-emerald-400/80 font-normal uppercase">(Conforme)</span>
                                </span>
                                <span className="text-xs font-bold leading-none text-zinc-400" title="Total Contado (Todas as peças contadas)">
                                  / {somaTotalContado} Pçs <span className="text-[9px] text-zinc-500 font-normal uppercase">(Total)</span>
                                </span>
                                {refugoCount > 0 && (
                                  <span className="text-[9px] text-rose-400 font-bold bg-rose-950/40 border border-rose-500/30 px-1.5 py-0.5 rounded">
                                    Refugo: {refugoCount}
                                  </span>
                                )}
                                {isMetaBatida && (
                                  <span className="text-[8px] text-emerald-500 bg-emerald-950/30 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold uppercase">✓ Meta Batida</span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end font-mono text-[9px] text-zinc-400">
                              <span className="text-zinc-600 block text-[7px] uppercase font-bold mb-0.5">Meta Diária</span>
                              <span>{somaProdConforme} / {metaAlvo} ({percent.toFixed(0)}%)</span>
                            </div>
                          </div>
                          <div className="w-full bg-zinc-950 rounded-full h-1 border border-zinc-900 overflow-clip transform-gpu backface-hidden">
                            <div className={`${progColor} h-full rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
                          </div>
                        </div>
                      );
                    })()}
                  </button>

                  {/* Detalhes expandidos movidos para a gaveta lateral */}
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

      {/* GAVETA LATERAL DE DETALHES (SIDE DRAWER) */}
      <AnimatePresence>
        {selectedBlockKey && (() => {
          const selectedBlock = groupedBlocks.find((b: any) => b.key === selectedBlockKey);
          if (!selectedBlock) return null;

          const activeSessionForBlock = activeSessions.find(
            s => {
              const sMaq = (s.num_maquina || '').split('|')[0].trim().toLowerCase();
              const bMaq = (selectedBlock.num_maquina || '').split('|')[0].trim().toLowerCase();
              return sMaq === bMaq && 
                     s.operacao_nome?.trim().toLowerCase() === selectedBlock.operacao_nome?.trim().toLowerCase();
            }
          );
          const isSessionActive = !!activeSessionForBlock;

          const blockFinalizacoes = ocorrencias.filter(o => {
            const oMaq = (o.num_maquina || '').split('|')[0].trim().toLowerCase();
            const bMaq = (selectedBlock.num_maquina || '').split('|')[0].trim().toLowerCase();
            const oOper = o.operacao_nome?.trim().toLowerCase();
            const bOper = selectedBlock.operacao_nome?.trim().toLowerCase();
            return oMaq === bMaq && oOper === bOper && o.tipo_ocorrencia === 'Finalização Antecipada';
          });

          return (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedBlockKey(null)}
                className="fixed inset-0 bg-black z-50 pointer-events-auto cursor-pointer"
              />

              {/* Drawer Panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-lg md:max-w-xl bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col pointer-events-auto"
              >
                {/* Drawer Header */}
                <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[#00624C] font-mono text-xs font-bold uppercase tracking-wider bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">
                        MÁQUINA {selectedBlock.num_maquina || 'N/A'}
                      </span>
                      <span className="text-zinc-500 font-mono text-xs">
                        {selectedBlock.data}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-white font-mono uppercase tracking-widest">
                      {selectedBlock.operacao_nome || 'PROCESSO'}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedBlockKey(null)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Content (Scrollable) */}
                <div 
                  className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-[#5A189A] scrollbar-track-transparent scrollbar-thumb-rounded-full"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#5A189A transparent'
                  }}
                >
                  {/* 1. Resumo do Bloco */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                      Resumo do Bloco
                    </h4>

                    {(() => {
                      let totalBlockMs = selectedBlock.itens.reduce((acc: number, curr: any) => {
                        const itemInicio = curr.horario_inicio;
                        const itemTermino = curr.horario_termino;
                        if (!itemInicio || !itemTermino) return acc;
                        
                        const dInicio = parseTimeToDateToday(itemInicio, curr.data);
                        const dTermino = parseTimeToDateToday(itemTermino, curr.data);
                        if (!dInicio || !dTermino) return acc;
                        
                        let diffMs = dTermino.getTime() - dInicio.getTime();
                        if (diffMs < 0) return acc;
                        
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

                      if (isSessionActive && activeSessionForBlock && activeSessionForBlock.horario_inicio) {
                        const dInicio = parseTimeToDateToday(activeSessionForBlock.horario_inicio, selectedBlock.data);
                        if (dInicio) {
                          let diffMs = now.getTime() - dInicio.getTime();
                          if (diffMs > 0) {
                            let baseDateStr = selectedBlock.data || new Date().toISOString().split('T')[0];
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

                      const todayParts = new Date().toISOString().split('T')[0].split('-');
                      const todayFormatted = `${todayParts[2]}/${todayParts[1]}/${todayParts[0]}`;
                      const isToday = selectedBlock.data === todayFormatted;

                      let earliestStart: Date | null = null;
                      let latestEnd: Date | null = null;
                      selectedBlock.itens.forEach((item: any) => {
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
                      const somaProdConforme = selectedBlock.somaProdConforme !== undefined ? selectedBlock.somaProdConforme : (selectedBlock.somaTotal || 0);
                      const somaTotalContado = selectedBlock.somaTotalContado !== undefined ? selectedBlock.somaTotalContado : somaProdConforme;
                      const rhythm = elapsedHours > 0 ? (somaProdConforme / elapsedHours) : 0;

                      let metaAlvo = 1000;
                      if (somaProdConforme >= 1000 && somaProdConforme < 1200) {
                        metaAlvo = 1200;
                      } else if (somaProdConforme >= 1200) {
                        metaAlvo = 1500;
                      }

                      const percent = Math.min(100, (somaProdConforme / metaAlvo) * 100);
                      const progColor = percent >= 100 ? 'bg-emerald-500' : percent >= 50 ? 'bg-amber-500' : 'bg-rose-500';

                      return (
                        <div className="space-y-4">
                          {/* Indicadores do Bloco */}
                          <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl space-y-4 shadow-lg">
                            <div className="grid grid-cols-3 gap-2.5">
                              <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between">
                                <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider">Prod. Conforme</span>
                                <span className="text-xs text-emerald-400 font-mono font-black mt-1">
                                  {somaProdConforme} pçs
                                </span>
                              </div>
                              <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between">
                                <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-wider">Total Contado</span>
                                <span className="text-xs text-zinc-200 font-mono font-bold mt-1">
                                  {somaTotalContado} pçs
                                </span>
                              </div>
                              <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between">
                                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Tempo Operação</span>
                                <span className="text-xs text-zinc-100 font-mono font-bold mt-1">
                                  {tempoProducaoStr}
                                </span>
                              </div>
                            </div>

                            {/* Grid 3 Colunas original */}
                            <div className="grid grid-cols-3 gap-2.5 text-center">
                              {/* Block 1: Qualidade (Red/Refugo) */}
                              <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between h-[68px]">
                                <span className="text-[8px] text-rose-500 font-bold uppercase tracking-wider">Qualidade</span>
                                <span className="text-[11px] text-zinc-300 font-mono font-bold leading-none mt-1">
                                  Refugo: <span className="text-rose-500 font-black">{selectedBlock.somaRefugo}</span>
                                </span>
                              </div>
                              
                              {/* Block 2: Ritmo de Produção (Green) */}
                              <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between h-[68px]">
                                <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-wider">Ritmo</span>
                                <span className="text-[11px] text-zinc-300 font-mono font-bold leading-none mt-1">
                                  <span className="text-emerald-500 font-black">{rhythm.toFixed(1)}</span> P/h
                                </span>
                              </div>
                              
                              {/* Block 3: Controle de Matéria-Prima (Blue/Sky) */}
                              {(() => {
                                const matInicial = Number(selectedBlock.materia_prima_inicial) || Number(selectedBlock.somaMateriaPrima) || 0;
                                const materia_prima_restante = matInicial - (selectedBlock.somaTotal || 0);
                                const isMateriaPrimaFinalizada = materia_prima_restante <= 0;
                                
                                let tempoMateriaPrimaRestante = '';
                                if (rhythm <= 0) {
                                  tempoMateriaPrimaRestante = 'Aguardando';
                                } else {
                                  const hrsRemaining = materia_prima_restante / rhythm;
                                  const estHrs = Math.floor(hrsRemaining);
                                  const estMins = Math.round((hrsRemaining - estHrs) * 60);
                                  tempoMateriaPrimaRestante = `${estHrs}h ${estMins}m`;
                                }

                                return (
                                  <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800 flex flex-col justify-between h-[68px]">
                                    <span className="text-[8px] text-sky-500 font-bold uppercase tracking-wider">M.P. Restante</span>
                                    {matInicial <= 0 ? (
                                      <span className="text-[10px] text-zinc-500 font-mono font-bold leading-none mt-1">
                                        N/A
                                      </span>
                                    ) : isMateriaPrimaFinalizada ? (
                                      <span className="text-[10px] text-rose-400 font-mono font-bold leading-none mt-1">
                                        Finalizada!
                                      </span>
                                    ) : (
                                      <div className="space-y-0.5 mt-1 leading-none">
                                        <span className="text-[11px] text-zinc-300 font-mono font-bold block">{materia_prima_restante} pçs</span>
                                        <span className="text-[8px] text-sky-500 font-bold block">Acaba: {tempoMateriaPrimaRestante}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Progress bar Meta */}
                            <div className="space-y-1 pt-1">
                              <div className="flex justify-between text-[10px] font-mono font-bold text-zinc-400">
                                <span>Progresso da Meta</span>
                                <span>{somaProdConforme} / {metaAlvo} ({percent.toFixed(0)}%)</span>
                              </div>
                              <div className="w-full bg-zinc-900 rounded-full h-1.5 border border-zinc-800 overflow-clip">
                                <div className={`${progColor} h-full rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
                              </div>
                            </div>
                            
                            {/* Bottom Reworks Row */}
                            <div className="flex justify-between text-[10px] font-mono font-bold text-zinc-500 pt-2.5 border-t border-zinc-800">
                              <span className="text-amber-500">Ret. Próprio: <span className="text-zinc-300">{selectedBlock.somaRetrabalhoProprio} pçs</span></span>
                              <span className="text-amber-500">Ret. Terceiro: <span className="text-zinc-300">{selectedBlock.somaRetrabalhoTerceiro} pçs</span></span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 2. Contagens Individuais no Bloco */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                      <Layers size={12} className="text-[#00624C]" />
                      <span>Contagens Individuais no Bloco ({selectedBlock.itens.filter((item: any) => Number(item.producao_conforme || item.quantidade || 0) > 0).length})</span>
                    </div>

                    <div className="space-y-3">
                      {(() => {
                        const sortedBlockItens = [...selectedBlock.itens].sort((a, b) => {
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
                            <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 border border-dashed border-zinc-800 rounded-lg text-zinc-500 text-center gap-2">
                              <span className="text-xs font-bold tracking-wide">
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
                            return t.slice(0, 5);
                          };

                          const hTermino = item.horario_termino;
                          const formattedTime = formatTimeStr(hTermino);
                          const hInicio = item.horario_inicio || '';
                          const formattedTimeInicio = hInicio ? formatTimeStr(hInicio) : '';
                          
                          const tempoProducaoReg = hInicio && hTermino ? getRegistroProductionTime(hInicio, hTermino, item.data) : '';

                          const conforme = item.producao_conforme || item.quantidade || 0;
                          const status = item.status || 'validado';
                          const statusStr = String(status).toLowerCase();
                          const isLegacyRealtime = statusStr === 'realtime';

                          const ocorrencia = item.motivo_ocorrencia;
                          const lote = item.lote || 'N/A';
                          const lado = item.lado || 'Único';
                          const tipoMaq = item.tipo_maquina || 'Manual';
                          const horaExtra = item.hora_extra === 's' ? 'Sim' : 'Não';

                          const regNumber = displayItens.length - itemIdx;
                          
                          const obsArray = (item.observacao || '').split('|').map((o: string) => o.trim()).filter((o: string) => o !== "" && o !== "EMPTY" && o !== "NULL");
                          const prevItem = displayItens[itemIdx + 1];
                          const prevObsArray = prevItem ? (prevItem.observacao || '').split('|').map((o: string) => o.trim()).filter((o: string) => o !== "" && o !== "EMPTY" && o !== "NULL") : [];
                          const newObs = obsArray.filter((o: string) => !prevObsArray.includes(o));

                          return (
                            <div 
                              key={item.id || itemIdx} 
                              className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 shadow-lg relative overflow-clip"
                            >
                              <div className="border-b border-zinc-900 pb-3 flex flex-col gap-3">
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex items-center gap-2.5">
                                    <span className="bg-zinc-900 text-zinc-400 text-xs font-black px-2 py-0.5 rounded border border-zinc-800 shadow-sm">
                                      #{regNumber}
                                    </span>
                                    <div className="text-base font-black text-emerald-400 tracking-wide flex items-center gap-1.5 leading-none">
                                      <span className="inline-block w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                      {conforme} Peças Conformes
                                    </div>
                                  </div>
                                  <div>
                                    {isSessionActive && itemIdx === 0 ? (
                                      <span className="text-blue-400 bg-blue-950/20 border border-blue-500/30 text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                        ÚLTIMO REGISTRO
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg w-fit">
                                  <Clock size={12} className="text-[#00624C]" />
                                  <span className="text-zinc-100 font-bold text-xs tracking-wider">
                                    {formattedTimeInicio ? `${formattedTimeInicio} - ${formattedTime}` : formattedTime}
                                  </span>
                                </div>
                              </div>

                              {((ocorrencia && ocorrencia !== 'Produção Normal') || (!isLegacyRealtime && status !== 'validado')) && (
                                <div className="flex flex-wrap gap-2">
                                  {ocorrencia && ocorrencia !== 'Produção Normal' && (
                                    <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                      Ocorrência: {ocorrencia}
                                    </span>
                                  )}
                                  {!isLegacyRealtime && status !== 'validado' && (
                                    <span className={`text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded border ${
                                      status === 'rejeitado'
                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    }`}>
                                      {status}
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] sm:text-xs text-zinc-400 font-mono">
                                <div className="flex justify-between border-b border-zinc-900 pb-1">
                                  <span className="text-zinc-600 font-bold uppercase text-[8px] sm:text-[11px]">Duração</span>
                                  <span className="text-[#00624C] font-bold text-[10px] sm:text-xs">{tempoProducaoReg || '0h 0m'}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-900 pb-1">
                                  <span className="text-zinc-600 font-bold uppercase text-[8px] sm:text-[11px]">Lote/Lado</span>
                                  <span className="text-zinc-300 text-[10px] sm:text-xs">{lote} ({lado})</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-900 pb-1">
                                  <span className="text-zinc-600 font-bold uppercase text-[8px] sm:text-[11px]">Máquina</span>
                                  <span className="text-zinc-300 text-[10px] sm:text-xs">{tipoMaq}</span>
                                </div>
                                <div className="flex justify-between border-b border-zinc-900 pb-1">
                                  <span className="text-zinc-600 font-bold uppercase text-[8px] sm:text-[11px]">Hora Extra</span>
                                  <span className="text-zinc-300 text-[10px] sm:text-xs">{horaExtra}</span>
                                </div>
                              </div>

                              {newObs.length > 0 && 
                               item.motivo_ocorrencia !== "Finalização Antecipada" &&
                               item.motivo_ocorrencia !== "Finalização Automática" && (
                                 <div className="mt-3 p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg text-[10px] text-amber-400 shadow-inner shadow-amber-900/10">
                                   <div className="font-bold uppercase text-[8px] tracking-wider mb-1 flex items-center gap-1">
                                     ✉ OBSERVAÇÃO / JUSTIFICATIVA:
                                   </div>
                                   <div className="flex flex-col gap-1.5">
                                     {newObs.map((obs: string, oIdx: number) => (
                                       <span key={oIdx} className="italic font-medium">"{obs}"</span>
                                     ))}
                                   </div>
                                 </div>
                              )}

                              {itemIdx === 0 && blockFinalizacoes.length > 0 && blockFinalizacoes.map((fin: any, fIdx: number) => (
                                <div key={`fin-${fIdx}`} className="bg-rose-950/20 border border-rose-900/50 p-3.5 rounded-lg mt-2 text-xs text-rose-100">
                                  <span className="text-rose-500 font-bold block text-[10px] uppercase tracking-wider mb-1">
                                    ✉ Motivo da Finalização Antecipada:
                                  </span>
                                  <p className="font-sans italic leading-relaxed text-rose-200 font-medium">
                                    "{fin.descricao?.trim()}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

    </div>
  );
}
