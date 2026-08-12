import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X,
  Camera, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Save, 
  ScanLine, 
  Clock, 
  History, 
  AlertCircle, 
  RefreshCw,
  User,
  Settings,
  ArrowRight,
  ClipboardList,
  Layers,
  FileText,
  Sparkles,
  Check,
  ChevronLeft,
  Percent,
  Play,
  Cpu
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLocalSessionUser } from '../lib/auth';

// Tema Rosa Berry (Identidade Visual #00624C)
const THEME = {
  primary: '#00624C',
  primaryHover: '#004838',
  bg: '#09090b',
  card: '#18181b',
  border: '#27272a',
};

// Helper para gerar o código curto alfanumérico de 6 caracteres
function gerarCodigoManualCurto() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helpers para exibição de data e horas
const parseToDate = (timeStr: string) => {
  if (!timeStr) return new Date();
  if (timeStr.includes('T') || timeStr.includes('-')) {
    return new Date(timeStr);
  }
  const today = new Date().toISOString().split('T')[0];
  return new Date(`${today}T${timeStr}`);
};

const formatarHora = (isoStr: string) => {
  if (!isoStr) return '-';
  if (!isoStr.includes('T') && !isoStr.includes('-') && isoStr.includes(':')) {
    return isoStr.slice(0, 5);
  }
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) {
      if (isoStr.includes(':')) return isoStr.slice(0, 5);
      return '-';
    }
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    if (isoStr.includes(':')) return isoStr.slice(0, 5);
    return '-';
  }
};

const formatarData = (isoStr: string) => {
  if (!isoStr) return '-';
  if (isoStr.includes('-') && isoStr.length === 10) {
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }
  try {
    return new Date(isoStr).toLocaleDateString('pt-BR');
  } catch (e) {
    return '-';
  }
};

const calcularDuracao = (inicio: string, fim: string) => {
  if (!inicio || !fim) return '';
  try {
    const dateInicio = parseToDate(inicio);
    const dateFim = parseToDate(fim);
    const diffMs = dateFim.getTime() - dateInicio.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 0) return '0 min';
    if (diffMin < 60) return `${diffMin} min`;
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  } catch (e) {
    return '';
  }
};

const sanitizeInput = (text: string, maxLength: number) => {
  if (!text) return '';
  return text
    .trim()
    .replace(/[<>]/g, '') // Basic XSS prevention
    .substring(0, maxLength);
};

const getSafeErrorMessage = (err: any) => {
  const msg = err?.message || String(err);
  if (msg.includes('violates NOT NULL') || msg.includes('null value in column')) {
    return 'Erro de validação: Campos obrigatórios não foram preenchidos.';
  }
  if (msg.includes('foreign key constraint') || msg.includes('violates foreign key')) {
    return 'Erro de validação: Referência a um registro inexistente no sistema.';
  }
  if (msg.includes('unique constraint') || msg.includes('duplicate key')) {
    return 'Erro de validação: Um registro com estas informações já existe.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('fetch')) {
    return 'Erro de conexão: Não foi possível sincronizar com o banco de dados no momento.';
  }
  return 'Ocorreu um erro interno ao processar a operação. Os dados foram salvos offline se possível.';
};

export interface ScannerCaixasProps {
  pendingScanCode?: string;
  onClearPendingScanCode?: () => void;
  isOverlayMode?: boolean;
  onCloseOverlay?: () => void;
}

export default function ScannerCaixas({ pendingScanCode, onClearPendingScanCode, isOverlayMode, onCloseOverlay }: ScannerCaixasProps = {}) {
  // Estados do Banco e Histórico de registros
  const [historicoHoje, setHistoricoHoje] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Estados do Alerta Customizado e Offline
  const [customAlert, setCustomAlert] = useState<{show: boolean, type: 'success' | 'warning' | 'error', message: string} | null>(null);
  const [offlineSessoes, setOfflineSessoes] = useState<any[]>([]);

  const showAlert = (type: 'success' | 'warning' | 'error', message: string) => {
    setCustomAlert({ show: true, type, message });
  };
  
  // Estados do Scanner Lente
  const [readerId] = useState(() => `reader-${Math.random().toString(36).substring(2, 9)}`);
  const [isScanning, setIsScanning] = useState(true);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [isSearchingSessao, setIsSearchingSessao] = useState(false);
  
  // Ref da Câmera
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingScan = useRef(false);

  // Estados dos Modais / Fluxo
  const [activeSession, setActiveSession] = useState<any | null>(null); // Se houver, abre Apontamento de Contagem
  const [showScenarioA, setShowScenarioA] = useState(false); // Abre Novo Processo (Formulário Completo)
  const [scannedTarget, setScannedTarget] = useState(''); // num_maquina ou código escaneado

  // Campos do Formulário - Novo Processo (Novo Início de Processo)
  const [formMaquina, setFormMaquina] = useState('');
  const [formCodigoCurto, setFormCodigoCurto] = useState('');
  const [formOperadora, setFormOperadora] = useState('');
  const [formOperacao, setFormOperacao] = useState('');
  const [formLote, setFormLote] = useState('');
  const [formLado, setFormLado] = useState<'Esquerdo' | 'Direito' | 'Único'>('Único');
  const [formTipoMaquina, setFormTipoMaquina] = useState('');
  const [formHoraExtra, setFormHoraExtra] = useState<boolean>(false); // toggle que salva 's' ou 'n'
  const [formMateriaPrima, setFormMateriaPrima] = useState<number | ''>(0);

  // Estados de Confirmação Individual de Segurança (Novo Processo)
  const [confirmaOperadora, setConfirmaOperadora] = useState(false);
  const [confirmaOperacao, setConfirmaOperacao] = useState(false);
  const [confirmaLote, setConfirmaLote] = useState(false);
  const [confirmaLado, setConfirmaLado] = useState(false);
  const [confirmaTipoMaquina, setConfirmaTipoMaquina] = useState(false);
  const [confirmaMateriaPrima, setConfirmaMateriaPrima] = useState(false);

  // Estado do Lado no Apontamento (Apontamento de Contagem - Editável)
  const [cenarioBLado, setCenarioBLado] = useState<'Esquerdo' | 'Direito' | 'Único'>('Único');

  // Campo Observação em ambos os modais (limite de 150 caracteres)
  const [formObservacao, setFormObservacao] = useState('');
  const [cenarioBObservacao, setCenarioBObservacao] = useState('');

  // Estados adicionais para chamado de manutenção e finalização antecipada de turno
  const [showManutencaoForm, setShowManutencaoForm] = useState(false);
  const [manutencaoDesc, setManutencaoDesc] = useState('');
  const [showJustificativaModal, setShowJustificativaModal] = useState(false);
  const [justificativaMotivo, setJustificativaMotivo] = useState('');

  // Estados de Confirmação Individual de Segurança (Apontamento de Contagem)
  const [confirmaBProdConforme, setConfirmaBProdConforme] = useState(false);
  const [confirmaBRefugo, setConfirmaBRefugo] = useState(false);
  const [confirmaBLado, setConfirmaBLado] = useState(false);
  const [confirmaBRetrabalhoProprio, setConfirmaBRetrabalhoProprio] = useState(false);
  const [confirmaBRetrabalhoTerceiro, setConfirmaBRetrabalhoTerceiro] = useState(false);
  const [confirmaBMotivoOcorrencia, setConfirmaBMotivoOcorrencia] = useState(false);
  const [confirmaBObservacao, setConfirmaBObservacao] = useState(false);
  const [lastCheckedFieldB, setLastCheckedFieldB] = useState<string | null>(null);

  // Estado para Janelas Sequenciais (Contagem)
  const [activeWindow, setActiveWindow] = useState<'conforme' | 'retProprio' | 'retTerceiro' | 'refugo' | 'final'>('conforme');
  const [activeWindowA, setActiveWindowA] = useState<'operadora' | 'operacao' | 'lote' | 'materia' | 'extras' | 'resumo'>('operadora');

  // Body scroll lock on modal open
  


  useEffect(() => {
    const isAnyModalOpen = showScenarioA || !!activeSession || showManutencaoForm || showJustificativaModal || !!customAlert;
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none'; // Prevents elastic scrolling/dragging on iOS
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.touchAction = 'unset';
    };
  }, [showScenarioA, activeSession, showManutencaoForm, showJustificativaModal, customAlert]);

  // Resetar confirmações ao carregar formulário Novo Processo
  useEffect(() => {
    if (showScenarioA) {
      setConfirmaOperadora(false);
      setConfirmaOperacao(false);
      setConfirmaLote(false);
      setConfirmaLado(false);
      setConfirmaTipoMaquina(!!formTipoMaquina);
      setConfirmaMateriaPrima(false);
      setFormObservacao('');
    }
  }, [showScenarioA, formTipoMaquina]);

  // Sincronizar lado da sessão ativa para o estado editável do Apontamento de Contagem e resetar confirmações
  useEffect(() => {
    if (activeSession) {
      setCenarioBLado(activeSession.lado || 'Único');
      setCenarioBObservacao('');
      setProdConforme('');
      setRefugo('');
      setRetrabalhoProprio('');
      setRetrabalhoTerceiro('');
      setConfirmaBProdConforme(false);
      setConfirmaBRefugo(false);
      setConfirmaBLado(false);
      setConfirmaBRetrabalhoProprio(false);
      setConfirmaBRetrabalhoTerceiro(false);
      setConfirmaBMotivoOcorrencia(false);
      setConfirmaBObservacao(false);
    }
  }, [activeSession]);

  // Sincronizar leitura enviada externamente (ex: do botão rápido mobile)
  useEffect(() => {
    if (pendingScanCode && pendingScanCode.trim()) {
      processarTextoQR(pendingScanCode.trim());
      if (onClearPendingScanCode) {
        onClearPendingScanCode();
      }
    }
  }, [pendingScanCode, onClearPendingScanCode]);
  
  // Autocomplete de Operações e Operadoras com categorias
  const [listaOperacoesObj, setListaOperacoesObj] = useState<{ operacao_nome: string, categoria_nome: string }[]>([]);
  const [listaOperacoes, setListaOperacoes] = useState<string[]>([]);
  const [showOperacaoSuggestions, setShowOperacaoSuggestions] = useState(false);
  const [listaOperadoras, setListaOperadoras] = useState<string[]>([]);
  const [showOperadoraSuggestions, setShowOperadoraSuggestions] = useState(false);

  // Mapeamento de tipo de máquina e operações compatíveis
  const [machineOpsMapping, setMachineOpsMapping] = useState<{ tipo_maquina: string, operacao_nome: string }[]>([]);

  useEffect(() => {
    async function carregarAuxiliares() {
      try {
        const { data: mapData, error: mapError } = await supabase
          .schema('AtlasApontamento')
          .from('maquinas_operacoes_compativeis')
          .select('tipo_maquina, operacao_nome');
        if (!mapError && mapData) {
          setMachineOpsMapping(mapData);
        }

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
          setListaOperacoesObj(uniqueOpsObj);

          const distinctOps = uniqueOpsObj.map(o => o.operacao_nome);
          setListaOperacoes(distinctOps as string[]);
        }

        const { data: opeData, error: opeError } = await supabase
          .schema('public')
          .from('costureiras_funcoes')
          .select('operadora_nome');
        if (!opeError && opeData) {
          const distinctOpe = Array.from(new Set(opeData.map((item: any) => item.operadora_nome).filter(Boolean)));
          setListaOperadoras(distinctOpe as string[]);
        }
      } catch (err) {
        console.error('Erro ao carregar dados auxiliares:', err);
      }
    }
    carregarAuxiliares();
  }, []);

  // Operações filtradas dinamicamente com base no tipo de máquina ativo
  const filteredOperations = useMemo(() => {
    if (!formTipoMaquina) return []; // Se nenhum tipo de máquina estiver ativo, retorna lista vazia
    
    const currentTypeUpper = formTipoMaquina.trim().toUpperCase();
    
    // Filtra as operações mapeadas que correspondem ao tipo de máquina específico (case-insensitive)
    const compOps = machineOpsMapping
      .filter(item => item.tipo_maquina.toUpperCase() === currentTypeUpper)
      .map(item => item.operacao_nome);
      
    // Cruza com a lista de operações predefinidas para manter categorias intactas
    return listaOperacoesObj.filter(op => 
      compOps.some(comp => comp.toUpperCase() === op.operacao_nome.toUpperCase())
    );
  }, [formTipoMaquina, machineOpsMapping, listaOperacoesObj]);
  
  // Campos do Formulário - Apontamento de Contagem (Apontamento de Produção de Sessão Ativa)
  const [prodConforme, setProdConforme] = useState<number | ''>('');
  const [refugo, setRefugo] = useState<number | ''>('');
  const [retrabalhoProprio, setRetrabalhoProprio] = useState<number | ''>('');
  const [retrabalhoTerceiro, setRetrabalhoTerceiro] = useState<number | ''>('');
  const [motivoOcorrencia, setMotivoOcorrencia] = useState<string>('Produção Normal');

  // Campos do Formulário - Ajuste de Qualidade
  const [showQualidadeForm, setShowQualidadeForm] = useState(false);
  const [qualidadeRefugo, setQualidadeRefugo] = useState<number>(0);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showBConfirmationModal, setShowBConfirmationModal] = useState(false);
  const [cameraDisponivel, setCameraDisponivel] = useState(false);
  const [permissaoNegada, setPermissaoNegada] = useState(false);

  // ==========================================
  // CARREGAMENTO INICIAL DO SCANNER
  // ==========================================
  useEffect(() => {
    let isMounted = true;

    async function init() {
      await carregarBaseDeDados();
    }

    init();
    
    if (isOverlayMode) return; // Do not start camera in overlay mode

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(readerId);
      
      const startCamera = async () => {
        try {
          if (isMounted) setPermissaoNegada(false);
          await scannerRef.current!.start(
            { facingMode: "environment" },
            {
              fps: 10,
              aspectRatio: 1.333334,
            },
            (decodedText) => {
              processarTextoQR(decodedText);
            },
            (errorMessage) => {
              // Ignorar erros de leitura de frame
            }
          );
          if (isMounted) setCameraDisponivel(true);
        } catch (err: any) {
          console.warn("Erro ao iniciar a câmera traseira:", err);
          if (err?.name === 'NotAllowedError') {
            if (isMounted) {
              setPermissaoNegada(true);
              setCameraDisponivel(false);
            }
            return;
          }

          try {
            await scannerRef.current!.start(
              {},
              {
                fps: 10,
                aspectRatio: 1.333334,
              },
              (decodedText) => {
                processarTextoQR(decodedText);
              },
              (errorMessage) => {}
            );
            if (isMounted) setCameraDisponivel(true);
          } catch (fallbackErr: any) {
            console.error("Erro total ao acessar câmera:", fallbackErr);
            if (isMounted) {
              if (fallbackErr?.name === 'NotAllowedError') {
                setPermissaoNegada(true);
              }
              setCameraDisponivel(false);
            }
          }
        }
      };
      
      startCamera();
    }

    return () => {
      isMounted = false;
      const currentScanner = scannerRef.current;
      scannerRef.current = null;
      if (currentScanner && currentScanner.getState() === 2) {
        currentScanner.stop().catch(err => console.warn("Erro ao parar no unmount:", err));
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca histórico de registros de produção salvos hoje
  async function carregarBaseDeDados() {
    setIsLoadingHistory(true);
    try {
      const userObj = getLocalSessionUser() as any;
      const userId = userObj?.id || userObj?.uid;

      let query = supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .select('*');

      const userEmail = (userObj?.email || '').toLowerCase();
      const isColaboradora = userEmail.includes('apontamento') || userObj?.role === 'colaboradora';
      if (userId && isColaboradora) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        // Ordena para exibir o mais recente no topo usando parseToDate
        const sorted = [...data].sort((a: any, b: any) => {
          const dateA = parseToDate(a.horario_termino || a.created_at);
          const dateB = parseToDate(b.horario_termino || b.created_at);
          return dateB.getTime() - dateA.getTime();
        });
        setHistoricoHoje(sorted);
      } else {
        setHistoricoHoje([]);
      }
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao carregar dados do Supabase:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(1050, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn('Som bloqueado pelo navegador.');
    }
  }

  // ==========================================
  // LÓGICA DE DETECÇÃO INSTANTÂNEA E BUSCA DE SESSÃO
  // ==========================================
  const processarTextoQR = async (textoLido: string) => {
    if (isProcessingScan.current) return;
    isProcessingScan.current = true;
    setIsSearchingSessao(true);

    const codigoCru = textoLido.trim().toUpperCase();
    let codigo = codigoCru;
    let tipoMaquinaPadrao = '';
    if (codigoCru.includes('|')) {
      const partes = codigoCru.split('|');
      codigo = partes[0].trim();
      tipoMaquinaPadrao = partes[1] ? partes[1].trim() : '';
    }

    if (codigo === 'Y7') {
      try {
        await supabase.schema('AtlasApontamento').from('sessoes_ativas_terminal').delete().eq('lote', 'L-TESTE-Y6');
        await supabase.schema('AtlasApontamento').from('registros_producao_terminal').delete().eq('lote', 'L-TESTE-Y6');
        showAlert('success', 'SUCESSO: Simulação Y6 limpa do banco de dados com sucesso!');
      } catch (e: any) {
        showAlert('error', `Erro ao limpar Y7: ${e.message}`);
      } finally {
        if (scannerRef.current && scannerRef.current.getState() === 2) {
          scannerRef.current.resume();
        }
        setIsScanning(true);
        isProcessingScan.current = false;
        setIsSearchingSessao(false);
        setManualCodeInput('');
      }
      return;
    }

    if (codigo === 'Y6') {
      try {
        const { data: sessoesTestes, error: errSessoes } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .select('*')
          .eq('lote', 'L-TESTE-Y6');

        if (errSessoes) throw errSessoes;

        // Obter user_id válido para o banco de dados
        const userObj = getLocalSessionUser() as any;
        let userId = userObj?.id || userObj?.uid;
        if (!userId) {
          const { data: authData } = await supabase.auth.getUser();
          userId = authData?.user?.id;
        }
        if (!userId) {
          const { data: existingSess } = await supabase.schema('AtlasApontamento').from('sessoes_ativas_terminal').select('user_id').not('user_id', 'is', null).limit(1);
          userId = existingSess?.[0]?.user_id;
        }
        if (!userId) {
          const { data: existingProd } = await supabase.schema('AtlasApontamento').from('registros_producao_terminal').select('user_id').not('user_id', 'is', null).limit(1);
          userId = existingProd?.[0]?.user_id;
        }

        if (!sessoesTestes || sessoesTestes.length === 0) {
          // Busca máquinas reais cadastradas na tabela base do Supervisor ou em tabelas de configuração
          let realMachines: any[] = [];
          const { data: baseData } = await supabase
            .schema('SupervisorProd')
            .from('maquinas_operadoras_base')
            .select('*');

          if (baseData && baseData.length > 0) {
            realMachines = baseData;
          } else {
            const { data: cfgData } = await supabase
              .schema('AtlasApontamento')
              .from('maquinas_config')
              .select('*');
            if (cfgData && cfgData.length > 0) {
              realMachines = cfgData;
            } else {
              const { data: recData } = await supabase
                .schema('AtlasApontamento')
                .from('vw_maquinas_operadoras_recentes')
                .select('*');
              if (recData && recData.length > 0) {
                realMachines = recData;
              }
            }
          }

          // Busca processos reais disponíveis no schema AtlasApontamento
          const { data: procData } = await supabase
            .schema('AtlasApontamento')
            .from('processos_disponiveis')
            .select('operacao_nome');
          
          const realProcessos = procData?.map((p: any) => p.operacao_nome).filter(Boolean) || [
            'CADÊNCIA', 'PRESPONTO TECIDO FRONTAL', 'FECHAMENTO', 'BAINHA', 'COSTURA LATERAL'
          ];

          const maquinasFakes = [];
          const totalCriar = 30;
          const usedOperadoras = new Set<string>();

          for (let i = 0; i < totalCriar; i++) {
            const realRow = realMachines[i % Math.max(1, realMachines.length)] || {};
            
            // Garantir número real de máquina ou sequência
            const num_maq = String(realRow.num_maquina || realRow.numero || (i + 1)).trim();
            let baseOperadora = String(realRow.operadora_nome || realRow.operadora_padrao || realRow.operadora || '').trim().toUpperCase();

            // Garantir operadoras 100% únicas para cada uma das 30 máquinas de teste de simulação
            if (!baseOperadora || usedOperadoras.has(baseOperadora)) {
              const candidate = listaOperadoras.find(op => op && !usedOperadoras.has(op.toUpperCase()));
              if (candidate) {
                baseOperadora = candidate.toUpperCase();
              } else if (baseOperadora) {
                baseOperadora = `${baseOperadora} (${i + 1})`;
              } else {
                baseOperadora = `OPERADORA SIMULADA ${i + 1}`;
              }
            }

            let finalOperadora = baseOperadora;
            let counter = 1;
            while (usedOperadoras.has(finalOperadora)) {
              finalOperadora = `${baseOperadora} ${counter}`;
              counter++;
            }
            usedOperadoras.add(finalOperadora);

            const tipo = String(realRow.tipo_maquina || 'RETA').trim().toUpperCase();
            const operacao = String(realRow.operacao_nome || realProcessos[i % realProcessos.length] || 'CADÊNCIA').trim().toUpperCase();
            const codCurto = realRow.codigo_manual_curto || realRow.codigo_curto || `C${num_maq.padStart(2, '0')}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

            maquinasFakes.push({
              codigo_manual_curto: codCurto,
              num_maquina: num_maq,
              operadora_nome: finalOperadora,
              hora_extra: 'n',
              tipo_maquina: tipo,
              lado: 'Único',
              lote: 'L-TESTE-Y6',
              operacao_nome: operacao,
              materia_prima_inicial: 1000,
              horario_inicio: '07:00:00',
              user_id: userId,
              observacao: 'Sessão simulada (Y6)'
            });
          }

          const { error: errInsert } = await supabase
            .schema('AtlasApontamento')
            .from('sessoes_ativas_terminal')
            .insert(maquinasFakes);

          if (errInsert) throw errInsert;
          showAlert('success', 'SUCESSO: 30 Máquinas Ativas de Teste com dados reais iniciadas com sucesso!');
        } else {
          const numApontamentos = Math.floor(Math.random() * 6) + 5;
          const shuffled = [...sessoesTestes].sort(() => 0.5 - Math.random());
          const selecionadas = shuffled.slice(0, numApontamentos);

          const agora = new Date();
          const horaStr = agora.toLocaleTimeString('pt-BR', { hour12: false });
          const diaStr = agora.toISOString().split('T')[0];

          const producoes = selecionadas.map(sessao => {
            const prodRand = Math.floor(Math.random() * 41) + 10;
            return {
              data: diaStr,
              operadora_nome: sessao.operadora_nome,
              hora_extra: sessao.hora_extra || 'n',
              operacao_nome: sessao.operacao_nome,
              tipo_maquina: sessao.tipo_maquina,
              lote: sessao.lote,
              num_maquina: sessao.num_maquina,
              lado: sessao.lado,
              codigo_manual_curto: sessao.codigo_manual_curto,
              horario_inicio: '07:00:00',
              horario_termino: horaStr,
              producao_conforme: prodRand,
              retrabalho_proprio: 0,
              retrabalho_terceiro: 0,
              refugo: 0,
              motivo_ocorrencia: 'Produção Normal',
              user_id: userId,
              materia_prima_inicial: 1000,
              observacao: 'Apontamento simulado'
            };
          });

          const { error: errProd } = await supabase
            .schema('AtlasApontamento')
            .from('registros_producao_terminal')
            .insert(producoes);
            
          if (errProd) throw errProd;
          showAlert('success', 'SUCESSO: Produção aleatória simulada e salva com sucesso!');
        }
      } catch (e: any) {
        showAlert('error', `Erro na simulação Y6: ${e.message}`);
      } finally {
        if (scannerRef.current && scannerRef.current.getState() === 2) {
          scannerRef.current.resume();
        }
        setIsScanning(true);
        isProcessingScan.current = false;
        setIsSearchingSessao(false);
        setManualCodeInput('');
      }
      return;
    }

    playBeep();

    // Pausa a câmera durante o fluxo de modais
    if (scannerRef.current && scannerRef.current.getState() === 2) {
      scannerRef.current.pause(true);
    }
    setIsScanning(false);

    try {
      let sessaoEncontrada = null;

      // 0. Se for um código curto de 6 caracteres
      if (codigo.length === 6) {
        // Primeiro, procure na tabela sessoes_ativas_terminal (ou em offlineSessoes se for offline)
        sessaoEncontrada = offlineSessoes.find(s => s.codigo_manual_curto === codigo);

        if (!sessaoEncontrada) {
          const { data: sessoes, error } = await supabase
            .schema('AtlasApontamento')
            .from('sessoes_ativas_terminal')
            .select('*')
            .eq('codigo_manual_curto', codigo);

          if (error) throw error;
          if (sessoes && sessoes.length > 0) {
            sessaoEncontrada = sessoes[0];
          }
        }

        if (sessaoEncontrada) {
          // Se o código estiver ativo, abre o Modal de Contagem (Apontamento de Contagem)
          setActiveSession(sessaoEncontrada);
          setProdConforme('');
          setRetrabalhoProprio(0);
          setRetrabalhoTerceiro(0);
          setQualidadeRefugo(0);
          setShowQualidadeForm(false);
          setMotivoOcorrencia('Produção Normal');
        } else {
          // Se não estiver lá, faça uma busca secundária na tabela definitiva registros_producao_terminal
          const { data: registros, error: errRegistros } = await supabase
            .schema('AtlasApontamento')
            .from('registros_producao_terminal')
            .select('*')
            .eq('codigo_manual_curto', codigo);

          if (errRegistros) throw errRegistros;

          if (registros && registros.length > 0) {
            // Se for localizado lá, processo já encerrado
            showAlert('warning', "Este processo já foi encerrado. Para iniciar um novo, escaneie o QR Code ou digite o número da máquina.");
            retomarScanner(false);
            return;
          } else {
            // Se o código não existir em nenhuma das duas tabelas
            showAlert('error', "Código inválido. Verifique o código e tente novamente.");
            retomarScanner(false);
            return;
          }
        }
      } else {
        // Se for digitado um Número de Máquina (comprimento diferente de 6)
        sessaoEncontrada = offlineSessoes.find(s => s.num_maquina === codigo);

        if (!sessaoEncontrada) {
          const { data: sessoes, error } = await supabase
            .schema('AtlasApontamento')
            .from('sessoes_ativas_terminal')
            .select('*')
            .eq('num_maquina', codigo);

          if (error) throw error;
          if (sessoes && sessoes.length > 0) {
            sessaoEncontrada = sessoes[0];
          }
        }

        if (sessaoEncontrada) {
          // Abre o Modal do Apontamento de Contagem (Contagem)
          setActiveSession(sessaoEncontrada);
          setProdConforme('');
          setRetrabalhoProprio(0);
          setRetrabalhoTerceiro(0);
          setQualidadeRefugo(0);
          setShowQualidadeForm(false);
          setMotivoOcorrencia('Produção Normal');
        } else {
          // Abre o Modal do Novo Processo (Inicialização)
          let tipoMaquinaEncontrado = tipoMaquinaPadrao;
          let operadoraRecente = '';

          try {
            const { data: recenteData } = await supabase
              .schema('public')
              .from('vw_maquinas_operadoras_recentes')
              .select('operadora_nome, tipo_maquina')
              .eq('num_maquina', codigo)
              .maybeSingle();
            
            if (recenteData) {
              operadoraRecente = recenteData.operadora_nome || '';
              if (!tipoMaquinaEncontrado) {
                tipoMaquinaEncontrado = recenteData.tipo_maquina || '';
              }
            }
          } catch (err) {
            console.log('[Terminal Supabase] Erro ao buscar operadora recente:', err);
          }

          if (!tipoMaquinaEncontrado) {
            try {
              const query = supabase
                .schema('AtlasApontamento')
                .from('maquinas_config')
                .select('tipo_maquina')
                .eq('num_maquina', codigo);
              
              const { data: resData } = typeof query.single === 'function' ? await query.single() : await query;
              
              if (resData) {
                const singleItem = Array.isArray(resData) ? resData[0] : resData;
                tipoMaquinaEncontrado = singleItem?.tipo_maquina || '';
              }
            } catch (maqErr) {
              console.log('[Terminal Supabase] Nenhuma configuração de máquina encontrada para', codigo, maqErr);
            }
          }

          setScannedTarget(codigo);
          setFormMaquina(codigo);
          setFormCodigoCurto(gerarCodigoManualCurto());
          setFormOperadora(operadoraRecente);
          setFormOperacao('');
          setFormLote('');
          setFormLado('Único');
          setFormTipoMaquina(tipoMaquinaEncontrado);
          setFormHoraExtra(false);
          setFormMateriaPrima(0);
          
          setShowScenarioA(true);
        }
      }
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao buscar sessões ativas:', err);
      showAlert('error', `Erro ao consultar sessões ativas: ${err.message || err}`);
      retomarScanner(false);
    } finally {
      setIsSearchingSessao(false);
      setManualCodeInput('');
    }
  };

  const simularCodigoManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCodeInput.trim()) return;
    processarTextoQR(manualCodeInput.trim());
  };

  const handlePasteShortCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) {
        setManualCodeInput(trimmed);
      } else {
        showAlert('warning', 'A área de transferência está vazia.');
      }
    } catch (err) {
      console.error('Erro ao ler área de transferência:', err);
      showAlert('error', 'Sem permissão para ler a área de transferência.');
    }
  };

  const retomarScanner = (fecharOverlay = true) => {
    setActiveSession(null);
    setShowScenarioA(false);
    setShowQualidadeForm(false);
    setShowManutencaoForm(false);
    setManutencaoDesc('');
    setShowJustificativaModal(false);
    setJustificativaMotivo('');
    setProdConforme('');
    setRetrabalhoProprio('');
    setRetrabalhoTerceiro('');
    setCenarioBObservacao('');
    setConfirmaBProdConforme(false);
    setConfirmaBRetrabalhoProprio(false);
    setConfirmaBRetrabalhoTerceiro(false);
    setActiveWindow('conforme');
    setActiveWindowA('operadora');
    setIsScanning(true);
    isProcessingScan.current = false;
    if (scannerRef.current && scannerRef.current.getState() === 3) {
      scannerRef.current.resume();
    }
    if (fecharOverlay && isOverlayMode && onCloseOverlay) {
      onCloseOverlay();
    }
  };

  // ==========================================
  // SALVAR Novo Processo: INÍCIO DE NOVO PROCESSO
  // ==========================================
  const handleSalvarCenarioA = async () => {
    if (!formOperadora.trim()) {
      showAlert('warning', "Por favor, informe o Nome da Operadora.");
      return;
    }
    if (!formOperacao.trim()) {
      showAlert('warning', "Por favor, informe o Nome da Operação.");
      return;
    }
    if (!formLote.trim()) {
      showAlert('warning', "Por favor, informe o número do Lote.");
      return;
    }
    if (!formTipoMaquina.trim()) {
      showAlert('warning', "Por favor, informe o Tipo de Máquina.");
      return;
    }

    setIsSaving(true);
    const nomeOperadoraSanitizado = sanitizeInput(formOperadora, 100).toUpperCase();

    // TRAVA DE OPERADORA ATIVA DUPLICADA (CENÁRIO A)
    try {
      const { data: sessoesExistentes, error: checkError } = await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .select('*')
        .ilike('operadora_nome', nomeOperadoraSanitizado);

      if (checkError) {
        console.error('[Terminal Supabase] Erro ao verificar operadora ativa no banco:', checkError);
      }

      const sessaoAtivaExistente = sessoesExistentes?.find(
        (s: any) => String(s.operadora_nome || '').trim().toUpperCase() === nomeOperadoraSanitizado
      ) || offlineSessoes.find(
        (s: any) => String(s.operadora_nome || '').trim().toUpperCase() === nomeOperadoraSanitizado
      );

      if (sessaoAtivaExistente) {
        setIsSaving(false);
        const maquinaAlocada = sessaoAtivaExistente.num_maquina || 'desconhecida';
        showAlert(
          'error',
          `FALHA DE ALOCAÇÃO: A operadora ${nomeOperadoraSanitizado} já está trabalhando ativamente na Máquina ${maquinaAlocada}. Você deve encerrar o processo dela na Máquina ${maquinaAlocada} antes de alocá-la nesta nova máquina!`
        );
        return;
      }
    } catch (checkErr: any) {
      console.error('[Terminal Supabase] Exceção ao verificar operadora ativa:', checkErr);
      const sessaoOffline = offlineSessoes.find(
        (s: any) => String(s.operadora_nome || '').trim().toUpperCase() === nomeOperadoraSanitizado
      );
      if (sessaoOffline) {
        setIsSaving(false);
        const maquinaAlocada = sessaoOffline.num_maquina || 'desconhecida';
        showAlert(
          'error',
          `FALHA DE ALOCAÇÃO: A operadora ${nomeOperadoraSanitizado} já está trabalhando ativamente na Máquina ${maquinaAlocada}. Você deve encerrar o processo dela na Máquina ${maquinaAlocada} antes de alocá-la nesta nova máquina!`
        );
        return;
      }
    }

    const horarioInicio = new Date().toTimeString().split(' ')[0];
    const userObj = getLocalSessionUser() as any;
    const userId = userObj?.id || userObj?.uid;

    const obsFormatada = formObservacao.trim() ? `[${horarioInicio.slice(0,5)}] ${formObservacao.trim()}` : '';

    const novaSessao = {
      num_maquina: sanitizeInput(formMaquina, 50).toUpperCase(),
      codigo_manual_curto: sanitizeInput(formCodigoCurto, 50),
      operadora_nome: nomeOperadoraSanitizado,
      operacao_nome: sanitizeInput(formOperacao, 100).toUpperCase(),
      lote: sanitizeInput(formLote, 100).toUpperCase(),
      lado: formLado,
      tipo_maquina: sanitizeInput(formTipoMaquina, 100).toUpperCase(),
      hora_extra: formHoraExtra ? 's' : 'n',
      horario_inicio: horarioInicio,
      user_id: userId,
      materia_prima_inicial: Number(formMateriaPrima) || 0,
      observacao: sanitizeInput(obsFormatada, 150)
    };

    try {
      // Limpa qualquer sessão remanescente da mesma máquina para não deixar sessões antigas presas
      await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .delete()
        .eq('num_maquina', novaSessao.num_maquina);

      const { error } = await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .insert([novaSessao]);

      if (error) throw error;

      showAlert('success', `Sessão do terminal iniciada com sucesso real para a máquina ${novaSessao.num_maquina}!`);
      retomarScanner(false);
      await carregarBaseDeDados();
      window.dispatchEvent(new CustomEvent('refresh-apontamentos'));
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao criar sessão ativa:', err);
      const safeErrorMsg = getSafeErrorMessage(err);
      // Fallback in-memory session activation
      const fallbackSessao = {
        ...novaSessao,
        id: 'offline-' + Math.random().toString(36).substring(2, 9),
        offline: true
      };
      setOfflineSessoes(prev => [...prev, fallbackSessao]);
      showAlert('warning', safeErrorMsg + ` Sessão iniciada temporariamente offline para a máquina ${novaSessao.num_maquina}.`);
      retomarScanner(false);
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // SALVAR AJUSTE DE QUALIDADE
  // ==========================================
  const handleSalvarQualidade = async () => {
    setIsSaving(true);
    const userObj = getLocalSessionUser() as any;
    const userId = userObj?.id || userObj?.uid;

    const novaQualidadeRegistro = {
      data: new Date().toISOString().split('T')[0],
      operadora_nome: activeSession.operadora_nome,
      hora_extra: activeSession.hora_extra || 'n',
      operacao_nome: activeSession.operacao_nome,
      tipo_maquina: activeSession.tipo_maquina,
      lote: activeSession.lote,
      num_maquina: activeSession.num_maquina,
      lado: activeSession.lado,
      horario_inicio: activeSession.horario_inicio, // mantém o mesmo inicio
      horario_termino: new Date().toTimeString().split(' ')[0], // registra a hora do apontamento de qualidade
      producao_conforme: 0,
      retrabalho_proprio: Number(retrabalhoProprio) || 0,
      retrabalho_terceiro: Number(retrabalhoTerceiro) || 0,
      refugo: Number(qualidadeRefugo) || 0,
      motivo_ocorrencia: 'Ajuste de Qualidade',
      user_id: userId,
      observacao: 'Ajuste de Qualidade'
    };

    try {
      // Grava o desconto como um registro final, que depois a interface abate do total
      const { error } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .insert([novaQualidadeRegistro]);

      if (error) throw error;

      showAlert('success', `Ajuste de Qualidade lançado com sucesso na máquina ${activeSession.num_maquina}!`);
      retomarScanner(false);
      await carregarBaseDeDados();
      window.dispatchEvent(new CustomEvent('refresh-apontamentos'));
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao gravar ajuste de qualidade:', err);
      const safeErrorMsg = getSafeErrorMessage(err);
      // Fallback in-memory record saving
      const fallbackQualidade = {
        ...novaQualidadeRegistro,
        id: 'offline-qualidade-' + Math.random().toString(36).substring(2, 9),
        offline: true
      };
      setHistoricoHoje(prev => [fallbackQualidade, ...prev]);
      showAlert('warning', safeErrorMsg + ` Ajuste de qualidade lançado offline na máquina ${activeSession.num_maquina}.`);
      retomarScanner(false);
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // FUNÇÕES DE MANUTENÇÃO E JUSTIFICATIVA DE ENCERRAMENTO ANTECIPADO
  // ==========================================
  const handleConfirmarManutencao = async () => {
    setIsSaving(true);
    try {
      const userObj = getLocalSessionUser() as any;
      const userId = userObj?.id || userObj?.uid;
      
      const agora = new Date();
      const horarioInicio = agora.toTimeString().split(' ')[0]; // HH:MM:SS
      
      const { error } = await supabase
        .schema('AtlasApontamento')
        .from('ocorrencias_terminal')
        .insert([{
          num_maquina: activeSession?.num_maquina,
          operadora_nome: activeSession?.operadora_nome,
          operacao_nome: activeSession?.operacao_nome,
          tipo_ocorrencia: 'manutencao',
          descricao: manutencaoDesc.trim() || 'Chamado de manutenção solicitado',
          horario_inicio: horarioInicio,
          status: 'pendente',
          user_id: userId
        }]);
        
      if (error) throw error;
      
      showAlert('success', 'Chamado de manutenção registrado com sucesso!');
      setShowManutencaoForm(false);
      setManutencaoDesc('');
    } catch (err: any) {
      console.error('[Terminal] Erro ao salvar chamado de manutenção:', err);
      showAlert('error', `Falha ao registrar manutenção: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const verificarSeExigeJustificativa = () => {
    const agora = new Date();
    const diaSemana = agora.getDay(); // 0: Dom, 1: Seg, 2: Ter, 3: Qua, 4: Qui, 5: Sex, 6: Sáb
    const horas = agora.getHours();
    const minutos = agora.getMinutes();
    const tempoAtualEmMinutos = horas * 60 + minutos;

    const thresholdDate = new Date('2026-11-29T23:59:59');
    
    if (diaSemana === 5) { // Sexta-feira
      if (agora <= thresholdDate) {
        // Até 29 de Novembro de 2026: antes de 16h44 exige justificativa (16 * 60 + 44 = 1004 minutos)
        const limiteMinutos = 16 * 60 + 44;
        return tempoAtualEmMinutos < limiteMinutos;
      } else {
        // Após 29 de Novembro de 2026: antes de 15h44 exige justificativa (15 * 60 + 44 = 944 minutos)
        const limiteMinutos = 15 * 60 + 44;
        return tempoAtualEmMinutos < limiteMinutos;
      }
    } else if (diaSemana >= 1 && diaSemana <= 4) { // Segunda a Quinta
      // Antes de 17h00 exige justificativa (17 * 60 = 1020 minutos)
      const limiteMinutos = 17 * 60;
      return tempoAtualEmMinutos < limiteMinutos;
    }
    
    return false;
  };

  const handleFinalizarProcessoClick = () => {
    const exigeJustificativa = verificarSeExigeJustificativa();
    if (exigeJustificativa) {
      setJustificativaMotivo('');
      setShowJustificativaModal(true);
    } else {
      handleSalvarCenarioB(false, true);
    }
  };

  const handleConfirmarFinalizacaoAntecipada = async () => {
    if (!justificativaMotivo.trim()) {
      showAlert('warning', 'Por favor, descreva o motivo da finalização antecipada.');
      return;
    }
    setIsSaving(true);
    try {
      const userObj = getLocalSessionUser() as any;
      const userId = userObj?.id || userObj?.uid;
      
      const agora = new Date();
      const horarioInicio = agora.toTimeString().split(' ')[0]; // HH:MM:SS
      
      const { error } = await supabase
        .schema('AtlasApontamento')
        .from('ocorrencias_terminal')
        .insert([{
          num_maquina: activeSession?.num_maquina,
          operadora_nome: activeSession?.operadora_nome,
          operacao_nome: activeSession?.operacao_nome,
          tipo_ocorrencia: 'finalizacao_antecipada',
          descricao: justificativaMotivo.trim(),
          horario_inicio: horarioInicio,
          status: 'pendente',
          user_id: userId
        }]);
        
      if (error) throw error;
      
      setShowJustificativaModal(false);
      await handleSalvarCenarioB(false, true);
    } catch (err: any) {
      console.error('[Terminal] Erro ao registrar finalização antecipada:', err);
      showAlert('error', `Falha ao registrar justificativa: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // SALVAR Apontamento de Contagem: APONTAMENTO DE PRODUÇÃO
  // ==========================================
  const handleSalvarCenarioB = async (mudarProcesso: boolean = false, finalizarProcessoCompleto: boolean = false) => {
    const isConformeEmpty = prodConforme === '';
    const hasRetrabalho = (Number(refugo) > 0 || Number(retrabalhoProprio) > 0 || Number(retrabalhoTerceiro) > 0);

    if (isConformeEmpty && !hasRetrabalho) {
      showAlert('warning', "Por favor, preencha a Quantidade Conforme ou informe algum valor de Refugo ou Retrabalho.");
      return;
    }

    setIsSaving(true);
    const horarioTermino = new Date().toTimeString().split(' ')[0];
    const userObj = getLocalSessionUser() as any;
    const userId = userObj?.id || userObj?.uid;

    const formatToTimeString = (val: string) => {
      if (!val) return '';
      if (val.includes('T') || val.includes('-')) {
        try {
          return new Date(val).toTimeString().split(' ')[0];
        } catch (e) {
          return val;
        }
      }
      return val;
    };

    // 1. Dados acumulados da sessão temporária + dados da produção
    const novoRegistroDefinitivo = {
      data: new Date().toISOString().split('T')[0],
      operadora_nome: activeSession.operadora_nome,
      hora_extra: activeSession.hora_extra || 'n',
      operacao_nome: activeSession.operacao_nome,
      tipo_maquina: activeSession.tipo_maquina,
      lote: activeSession.lote,
      num_maquina: activeSession.num_maquina,
      lado: cenarioBLado,
      codigo_manual_curto: activeSession.codigo_manual_curto,
      horario_inicio: formatToTimeString(activeSession.horario_inicio),
      horario_termino: horarioTermino,
      producao_conforme: isConformeEmpty ? null : Number(prodConforme),
      retrabalho_proprio: Number(retrabalhoProprio) || 0,
      retrabalho_terceiro: Number(retrabalhoTerceiro) || 0,
      refugo: Number(refugo) || 0,
      motivo_ocorrencia: 'Produção Normal',
      user_id: userId,
      materia_prima_inicial: Number(activeSession.materia_prima_inicial) || 0,
      observacao: sanitizeInput([activeSession.observacao, cenarioBObservacao.trim() ? `[${horarioTermino.slice(0,5)}] ${cenarioBObservacao.trim()}` : ''].filter(Boolean).join(" | "), 150)
    };

    try {
      // 1. Salva o registro final definitivo
      const { error: errInsert } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .insert([novoRegistroDefinitivo]);

      if (errInsert) throw errInsert;

      // 2. Deleta a sessão ativa da tabela temporária (No schema AtlasApontamento)
      const { error: errDelete } = await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .delete()
        .eq('id', activeSession.id);

      if (errDelete) throw errDelete;

      // 3. Verifica fluxo: Mudar Processo, Finalizar Processo Completo ou Recriação Automática
      if (finalizarProcessoCompleto) {
        showAlert('success', `Apontamento finalizado e encerrado com sucesso na máquina ${activeSession.num_maquina}!`);
        retomarScanner(false);
      } else if (!mudarProcesso) {
        // Recria sessão ativa com mesmos parâmetros e novo horario_inicio
        const novaSessaoRecriada = {
          num_maquina: activeSession.num_maquina,
          codigo_manual_curto: activeSession.codigo_manual_curto,
          operadora_nome: activeSession.operadora_nome,
          operacao_nome: activeSession.operacao_nome,
          lote: activeSession.lote,
          lado: cenarioBLado,
          tipo_maquina: activeSession.tipo_maquina,
          hora_extra: activeSession.hora_extra,
          horario_inicio: horarioTermino, // O tempo reinicia na hora exata do término anterior
          user_id: userId,
          materia_prima_inicial: Number(activeSession.materia_prima_inicial) || 0,
          observacao: [activeSession.observacao, cenarioBObservacao.trim() ? `[${horarioTermino.slice(0,5)}] ${cenarioBObservacao.trim()}` : ''].filter(Boolean).join(" | ")
        };

        const { error: errRecreate } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .insert([novaSessaoRecriada]);

        if (errRecreate) throw errRecreate;

        showAlert('success', `Apontamento gravado com sucesso! Próximo ciclo de contagem iniciado na máquina ${activeSession.num_maquina}.`);
        retomarScanner(false);
      } else {
        // Salva e Mudar Processo: Transiciona o modal B diretamente para o formulário A (Início de Processo)
        const maquinaAtual = activeSession.num_maquina;
        setActiveSession(null); // fecha o modal de apontamento

        // Configura estados do formulário A com a mesma máquina pré-preenchida
        setScannedTarget(maquinaAtual);
        setFormMaquina(maquinaAtual);
        setFormCodigoCurto(gerarCodigoManualCurto());
        setFormOperadora(activeSession.operadora_nome); // pré-preenche para conveniência
        setFormOperacao(''); // limpa operação e lote para o novo processo
        setFormLote('');
        setFormLado(cenarioBLado || 'Único');
        setFormTipoMaquina(activeSession.tipo_maquina);
        setFormHoraExtra(activeSession.hora_extra === 's');

        showAlert('success', `Apontamento gravado com sucesso! Prossiga configurando o novo processo para a máquina ${maquinaAtual}.`);
        setShowScenarioA(true); // abre o formulário completo
      }

      // Recarrega o histórico
      await carregarBaseDeDados();
      window.dispatchEvent(new CustomEvent('refresh-apontamentos'));
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao processar apontamento:', err);
      const safeErrorMsg = getSafeErrorMessage(err);
      
      // Fallback in-memory record saving
      const fallbackRegistro = {
        ...novoRegistroDefinitivo,
        id: 'offline-registro-' + Math.random().toString(36).substring(2, 9),
        offline: true
      };
      setHistoricoHoje(prev => [fallbackRegistro, ...prev]);

      // Remove from offlineSessoes in-memory if it was an offline session
      setOfflineSessoes(prev => prev.filter(s => s.id !== activeSession.id));

      if (finalizarProcessoCompleto) {
        showAlert('warning', safeErrorMsg + ` Apontamento finalizado offline (em memória) na máquina ${activeSession.num_maquina}.`);
        retomarScanner(false);
      } else if (!mudarProcesso) {
        // Recria sessão ativa offline na memória
        const novaSessaoRecriada = {
          num_maquina: activeSession.num_maquina,
          codigo_manual_curto: activeSession.codigo_manual_curto,
          operadora_nome: activeSession.operadora_nome,
          operacao_nome: activeSession.operacao_nome,
          lote: activeSession.lote,
          lado: cenarioBLado,
          tipo_maquina: activeSession.tipo_maquina,
          hora_extra: activeSession.hora_extra,
          horario_inicio: horarioTermino,
          user_id: userId,
          materia_prima_inicial: Number(activeSession.materia_prima_inicial) || 0,
          id: 'offline-' + Math.random().toString(36).substring(2, 9),
          offline: true
        };
        setOfflineSessoes(prev => [...prev, novaSessaoRecriada]);
        showAlert('warning', safeErrorMsg + ` Apontamento salvo offline (em memória). Próximo ciclo iniciado na máquina ${activeSession.num_maquina}.`);
        retomarScanner(false);
      } else {
        // Salva e Mudar Processo
        const maquinaAtual = activeSession.num_maquina;
        setActiveSession(null);

        // Configura estados do formulário A com a mesma máquina pré-preenchida
        setScannedTarget(maquinaAtual);
        setFormMaquina(maquinaAtual);
        setFormCodigoCurto(gerarCodigoManualCurto());
        setFormOperadora(activeSession.operadora_nome);
        setFormOperacao('');
        setFormLote('');
        setFormLado(cenarioBLado || 'Único');
        setFormTipoMaquina(activeSession.tipo_maquina);
        setFormHoraExtra(activeSession.hora_extra === 's');

        showAlert('warning', safeErrorMsg + ` Apontamento salvo offline. Prossiga configurando o novo processo para a máquina ${maquinaAtual}.`);
        setShowScenarioA(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isConformeEmpty = prodConforme === '' || prodConforme === null;
  const isRefugoEmpty = refugo === '' || refugo === null || Number(refugo) === 0;
  const isRetProprioEmpty = retrabalhoProprio === '' || retrabalhoProprio === null || Number(retrabalhoProprio) === 0;
  const isRetTerceiroEmpty = retrabalhoTerceiro === '' || retrabalhoTerceiro === null || Number(retrabalhoTerceiro) === 0;

  const isBValid = confirmaBLado && 
    (isConformeEmpty || confirmaBProdConforme) &&
    (isRefugoEmpty || confirmaBRefugo) &&
    (isRetProprioEmpty || confirmaBRetrabalhoProprio) &&
    (isRetTerceiroEmpty || confirmaBRetrabalhoTerceiro) &&
    !(isConformeEmpty && isRefugoEmpty && isRetProprioEmpty && isRetTerceiroEmpty);

  useEffect(() => {
    if (isBValid && activeSession) {
      setShowBConfirmationModal(true);
    }
  }, [isBValid]);

  useEffect(() => {
    if (showScenarioA) {
      setActiveWindowA('operadora');
    }
  }, [showScenarioA]);

  return (
    <>
      <div className={`flex-1 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto ${isOverlayMode ? 'hidden' : ''}`} id="terminal-mobile-view">
        
        {/* HEADER PRINCIPAL */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 max-w-6xl mx-auto w-full">
          <div>
            <h2 className="font-mono text-xl font-bold uppercase tracking-[0.15em] text-[#00624C] flex items-center gap-2">
               TERMINAL DE APONTAMENTO
            </h2>
            <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
              LEITURA DE QR CODE E APONTAMENTOS DE PRODUÇÃO EM TEMPO REAL
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto w-full">
          
          {/* LADO ESQUERDO: SCANNER DE QR CODE DE MAQUINA */}
          <div className="lg:col-span-5 flex flex-col gap-6">
          
          <div className="bg-zinc-950 border border-white/60 rounded-xl p-5 md:p-6 relative overflow-hidden">
            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-zinc-400 block">
                ESCANEIE O QR CODE DA MÁQUINA
              </span>

              <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border border-white/60 shadow-2xl flex items-center justify-center @container">
                <div id={readerId} className="w-full h-full rounded-xl overflow-hidden [&>video]:object-cover [&_#qr-shaded-region]:hidden" />
                
                {!cameraDisponivel && (
                  <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-6 text-center bg-zinc-950 z-20">
                    <Camera size={40} className={permissaoNegada ? "text-red-500 mb-2" : "text-zinc-800 mb-2"} />
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${permissaoNegada ? 'text-red-400 font-bold' : 'text-zinc-600'}`}>
                      {permissaoNegada ? 'PERMISSÃO DE CÂMERA NEGADA' : 'CÂMERA INDISPONÍVEL OU INICIALIZANDO'}
                    </span>
                    <p className={`text-[10px] max-w-xs mt-1 font-sans ${permissaoNegada ? 'text-red-300' : 'text-zinc-600'}`}>
                      {permissaoNegada 
                        ? 'Clique no ícone de cadeado na barra de endereços do seu navegador e conceda acesso à câmera.'
                        : 'Permita o acesso à câmera nas configurações ou use a digitação de código de barras abaixo.'}
                    </p>
                  </div>
                )}
                
                {/* Mira visual */}
                {cameraDisponivel && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                    <div className="w-[70cqmin] h-[70cqmin] border-2 border-dashed border-[#00624C]/70 rounded-xl"></div>
                  </div>
                )}
                
                {/* Indicador de Varredura */}
                {isScanning && cameraDisponivel && (
                  <div className="absolute top-3 left-3 bg-[#09090b]/85 border border-zinc-800/80 px-2.5 py-1 rounded flex items-center gap-1.5 z-10 backdrop-blur-sm shadow-lg pointer-events-none">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-widest animate-pulse">
                      Varredura Ativa...
                    </span>
                  </div>
                )}
              </div>

              {/* PAINEL DE SIMULAÇÃO RÁPIDA */}
              <div className="pt-4 border-t border-white/30 mt-2 space-y-3">
                <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-zinc-500 block">
                  Número da Máquina ou Código Curto
                </span>
                
                <form onSubmit={simularCodigoManual} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Número da Máquina ou Código Curto"
                    value={manualCodeInput}
                    onChange={(e) => setManualCodeInput(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-white/30 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00624C]"
                  />
                  <button
                    type="button"
                    onClick={handlePasteShortCode}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded text-[10px] font-mono uppercase cursor-pointer transition-colors"
                    title="Colar da área de transferência"
                  >
                    COLAR
                  </button>
                  <button
                    type="submit"
                    disabled={isSearchingSessao}
                    className="px-4 py-1.5 bg-[#00624C] hover:bg-[#004838] text-white rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors"
                  >
                    {isSearchingSessao ? <Loader2 className="animate-spin" size={12} /> : 'PROCESSAR'}
                  </button>
                </form>
              </div>
            </div>
          </div>

        </div>

        {/* LADO DIREITO: HISTÓRICO DE APONTAMENTOS DE HOJE */}
        <div className="lg:col-span-7 flex flex-col">
          
          <div className="border border-white/60 rounded-xl bg-zinc-950/40 p-5 md:p-6 flex flex-col h-full min-h-[450px]">
            <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-white/40">
              <div className="flex items-center gap-2">
                <History className="text-zinc-400" size={16} />
                <h3 className="font-mono text-xs uppercase tracking-widest text-zinc-300 font-black">
                  Registros Gravados Hoje ({historicoHoje.length})
                </h3>
              </div>
              {isLoadingHistory && <Loader2 className="animate-spin text-[#00624C]" size={14} />}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[500px] space-y-3 pr-1">
              {historicoHoje.length === 0 ? (
                <div className="text-center py-16 text-zinc-600 font-mono text-xs uppercase tracking-widest border border-dashed border-white/30 rounded-lg">
                  Nenhum apontamento finalizado hoje neste terminal.
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoHoje.map((registro, idx) => (
                    <div 
                      key={registro.id || idx} 
                      className="bg-zinc-900 border border-white/30 p-4 rounded-lg md:hover:border-[#00624C]/40 transition-colors space-y-3 select-none active:bg-transparent focus:outline-none [webkit-tap-highlight-color:transparent]"
                    >
                      {/* Header do Log */}
                      <div className="flex items-center justify-between border-b border-white/20 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-[#00624C]/10 border border-[#00624C]/20 text-[#00624C] text-[9px] font-mono font-bold rounded">
                            {registro.num_maquina}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                          <Clock size={10} /> {formatarHora(registro.horario_termino)}
                        </span>
                      </div>

                      {/* Informações de Processo */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                        <div>
                          <span className="text-zinc-600 block text-[8px] uppercase font-bold">Operadora</span>
                          <span className="text-zinc-300 truncate block">{registro.operadora_nome}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600 block text-[8px] uppercase font-bold">Operação</span>
                          <span className="text-zinc-300 truncate block">{registro.operacao_nome}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600 block text-[8px] uppercase font-bold">Lote / Lado</span>
                          <span className="text-zinc-300 block">{registro.lote} ({registro.lado})</span>
                        </div>
                        <div>
                          <span className="text-zinc-600 block text-[8px] uppercase font-bold">Tipo Máq / HE</span>
                          <span className="text-zinc-300 block">{registro.tipo_maquina} ({registro.hora_extra === 's' ? 'Sim' : 'Não'})</span>
                        </div>
                      </div>

                      {/* Resultados da Produção */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 border-t border-white/20 text-[10px] font-mono gap-2">
                        <div className="flex flex-wrap gap-3">
                          {(() => {
                            const tot = Number(registro.producao_conforme || 0);
                            const ref = Number(registro.refugo || 0);
                            const rePr = Number(registro.retrabalho_proprio || 0);
                            const conf = Math.max(0, tot - ref - rePr);

                            return (
                              <>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <span className="text-zinc-500 text-[9px] uppercase">Conforme:</span>
                                  <span className="text-emerald-400 font-bold">{conf} pçs</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                                  <span className="text-zinc-500 text-[9px] uppercase">Total:</span>
                                  <span className="text-zinc-300 font-bold">{tot} pçs</span>
                                </div>
                              </>
                            );
                          })()}
                          {registro.refugo > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              <span className="text-zinc-500 text-[9px] uppercase">Refugo:</span>
                              <span className="text-rose-400 font-bold">{registro.refugo} pçs</span>
                            </div>
                          )}
                          {(registro.retrabalho_proprio > 0 || registro.retrabalho_terceiro > 0) && (
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-500 text-[9px] uppercase">Retrabalho (P/T):</span>
                              <span className="text-amber-400">{registro.retrabalho_proprio || 0}/{registro.retrabalho_terceiro || 0}</span>
                            </div>
                          )}
                          <div className="text-zinc-500">
                            <span>Ciclo: </span>
                            <span className="text-zinc-400 font-bold">
                              {formatarHora(registro.horario_inicio)} - {formatarHora(registro.horario_termino)}
                            </span>
                            <span className="text-[#00624C] ml-1.5 font-bold">
                              ({calcularDuracao(registro.horario_inicio, registro.horario_termino)})
                            </span>
                          </div>
                        </div>

                        {registro.motivo_ocorrencia && registro.motivo_ocorrencia !== 'Produção Normal' && (
                          <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded truncate max-w-[200px]">
                            Ocorrência: {registro.motivo_ocorrencia}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      </div>

      {/* ======================================================= */}
      {/* ======================================================= */}
      <AnimatePresence>
        {showScenarioA && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-3 sm:p-4 pt-[72px] pb-12 sm:pt-[80px] backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-white/30 rounded-xl w-full max-w-md overflow-visible p-4 sm:p-5 space-y-4 sm:space-y-5 shadow-2xl mx-auto my-0"
            >
              {/* Header do Form */}
              <div className="flex justify-between items-center border-b border-white/30 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="text-[#00624C]" size={20} />
                  <div>
                    <h3 className="font-mono text-lg font-bold uppercase tracking-wider text-white">
                      Inicializar Terminal
                    </h3>
                    <p className="text-zinc-500 text-lg font-mono uppercase tracking-widest mt-0.5">
                      Nova sessão para a Máquina {formMaquina}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={retomarScanner}
                  className="p-1 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Formulário Sequencial (Janelas Móveis Touch-First) */}
              <div className="space-y-4 font-mono">
                
                {/* 2. Display Bar de Leitura Travada (Contexto Permanente) */}
                <div className="relative overflow-hidden bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-3.5 flex items-center justify-between shadow-inner mb-2">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#00624C]" />
                  <div className="flex items-center gap-3 pl-2">
                    <div className="h-9 w-9 rounded-md bg-zinc-950 border border-zinc-800/80 flex items-center justify-center text-[#00624C] shadow-sm">
                      <Cpu size={18} className="animate-pulse" />
                    </div>
                    <div>
                      <span className="text-sm font-mono text-zinc-500 uppercase tracking-widest block font-bold">MÁQUINA IDENTIFICADA</span>
                      <span className="font-mono text-lg sm:text-xl font-black text-white tracking-wider">
                        N.º {formMaquina}
                      </span>
                    </div>
                  </div>
                  <div className="text-right pr-1">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">TIPO DE EQUIPAMENTO</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-[#00624C]/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                      <Settings size={10} className="animate-[spin_8s_linear_infinite]" />
                      {formTipoMaquina || 'RETA'}
                    </span>
                  </div>
                </div>

                {/* Indicador de Passos */}
                {activeWindowA !== 'resumo' && (
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full transition-all ${activeWindowA === 'operadora' ? 'bg-emerald-500 scale-125' : 'bg-emerald-500'}`}></div>
                    <div className={`w-2 h-2 rounded-full transition-all ${activeWindowA === 'operacao' ? 'bg-emerald-500 scale-125' : (['lote','materia','extras'].includes(activeWindowA) ? 'bg-emerald-500' : 'bg-zinc-800')}`}></div>
                    <div className={`w-2 h-2 rounded-full transition-all ${activeWindowA === 'lote' ? 'bg-emerald-500 scale-125' : (['materia','extras'].includes(activeWindowA) ? 'bg-emerald-500' : 'bg-zinc-800')}`}></div>
                    <div className={`w-2 h-2 rounded-full transition-all ${activeWindowA === 'materia' ? 'bg-emerald-500 scale-125' : (activeWindowA === 'extras' ? 'bg-emerald-500' : 'bg-zinc-800')}`}></div>
                    <div className={`w-2 h-2 rounded-full transition-all ${activeWindowA === 'extras' ? 'bg-emerald-500 scale-125' : 'bg-zinc-800'}`}></div>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {/* JANELA 1: OPERADORA */}
                  {activeWindowA === 'operadora' && (
                    <motion.div 
                      key="operadora"
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                    >
                      <label className="text-sm font-mono uppercase tracking-wider text-zinc-500 font-bold block">Nome da Operadora *</label>
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="Ex: ANA PAULA SILVA"
                          value={formOperadora}
                          onChange={(e) => {
                            setFormOperadora(e.target.value);
                            setShowOperadoraSuggestions(true);
                          }}
                          onFocus={() => setShowOperadoraSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowOperadoraSuggestions(false), 200)}
                          className="w-full h-14 bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 focus:outline-none focus:border-emerald-500 uppercase placeholder-zinc-600 font-bold font-mono text-xl"
                        />
                        {showOperadoraSuggestions && listaOperadoras.filter(op => op.toLowerCase().includes(formOperadora.toLowerCase())).length > 0 && (
                          <div className="absolute left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-lg mt-1 max-h-48 overflow-y-auto z-50 shadow-2xl">
                            {listaOperadoras.filter(op => op.toLowerCase().includes(formOperadora.toLowerCase())).map((op, opIdx) => (
                              <div
                                key={opIdx}
                                onMouseDown={() => {
                                  setFormOperadora(op);
                                  setShowOperadoraSuggestions(false);
                                }}
                                className="px-4 py-3 text-zinc-300 hover:bg-emerald-600 hover:text-white cursor-pointer transition-colors text-left font-mono text-base font-bold border-b border-zinc-800/50 last:border-0"
                              >
                                {op}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <button 
                        type="button" 
                        onClick={() => {
                          if (!formOperadora.trim()) {
                            showAlert('warning', "Por favor, preencha o Nome da Operadora.");
                            return;
                          }
                          setConfirmaOperadora(true);
                          setActiveWindowA('operacao');
                        }}
                        className="w-full h-14 mt-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center select-none"
                        style={{WebkitTapHighlightColor: 'transparent'}}
                      >
                        Continuar
                      </button>
                    </motion.div>
                  )}

                  {/* JANELA 2: OPERAÇÃO */}
                  {activeWindowA === 'operacao' && (
                    <motion.div 
                      key="operacao"
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                    >
                      <label className="text-sm font-mono uppercase tracking-wider text-zinc-500 font-bold block">Nome da Operação *</label>
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="Ex: COSTURA GOLA"
                          value={formOperacao}
                          onChange={(e) => {
                            setFormOperacao(e.target.value);
                            setShowOperacaoSuggestions(true);
                          }}
                          onFocus={() => setShowOperacaoSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowOperacaoSuggestions(false), 200)}
                          className="w-full h-14 bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 focus:outline-none focus:border-emerald-500 uppercase placeholder-zinc-600 font-bold font-mono text-xl"
                        />
                        {showOperacaoSuggestions && (
                          <div className="absolute left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-lg mt-1 z-50 shadow-2xl p-1 max-h-48 overflow-y-auto">
                            {(() => {
                              const query = formOperacao.toLowerCase();
                              const filtered = filteredOperations.filter(item => 
                                item.operacao_nome.toLowerCase().includes(query) ||
                                item.categoria_nome.toLowerCase().includes(query)
                              );
                              
                              const grouped = filtered.reduce((acc, curr) => {
                                const cat = curr.categoria_nome || 'DIVERSOS';
                                if (!acc[cat]) acc[cat] = [];
                                acc[cat].push(curr.operacao_nome);
                                return acc;
                              }, {} as Record<string, string[]>);
                              
                              if (filtered.length === 0) {
                                return <div className="p-3 text-zinc-500 text-sm font-mono text-center">Nenhuma operação encontrada</div>;
                              }
                              
                              const sortedEntries = (Object.entries(grouped) as [string, string[]][]).sort(([catA], [catB]) => {
                                const getWeight = (c: string) => {
                                  const norm = c.toUpperCase().trim();
                                  if (norm === 'FORRAÇÃO CITY' || norm === 'FORRACAO CITY') return 1;
                                  if (norm === 'ORELHA CITY') return 2;
                                  return 3;
                                };
                                return getWeight(catA) - getWeight(catB) || catA.toUpperCase().localeCompare(catB.toUpperCase());
                              });
                              
                              return sortedEntries.map(([category, ops]) => (
                                <div key={category} className="mb-2 last:mb-0">
                                  <div className="text-emerald-500 font-black text-[10px] uppercase tracking-widest px-3 py-1 bg-zinc-950/50 rounded">{category}</div>
                                  {ops.map(op => (
                                    <div
                                      key={op}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setFormOperacao(op);
                                        setShowOperacaoSuggestions(false);
                                      }}
                                      className="px-3 py-2 text-zinc-300 hover:bg-emerald-600 hover:text-white cursor-pointer transition-colors text-left font-mono text-sm font-bold rounded-md my-0.5"
                                    >
                                      {op}
                                    </div>
                                  ))}
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        <button 
                          type="button" 
                          onClick={() => setActiveWindowA('operadora')}
                          className="h-14 w-16 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg flex items-center justify-center active:scale-95 transition-all"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          <ChevronLeft size={24} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            if (!formOperacao.trim()) {
                              showAlert('warning', "Por favor, preencha a Operação.");
                              return;
                            }
                            setConfirmaOperacao(true);
                            setActiveWindowA('lote');
                          }}
                          className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center select-none"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          Continuar
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* JANELA 3: LOTE DE PRODUÇÃO E LADO */}
                  {activeWindowA === 'lote' && (
                    <motion.div 
                      key="lote"
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                    >
                      <div className="space-y-1">
                        <label className="text-sm font-mono uppercase tracking-wider text-zinc-500 font-bold block">Lote de Produção *</label>
                        <input 
                          type="text" 
                          inputMode="numeric" 
                          pattern="[0-9]*"
                          placeholder="Ex: 205"
                          value={formLote}
                          onChange={(e) => setFormLote(e.target.value)}
                          className="w-full h-14 bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 focus:outline-none focus:border-emerald-500 uppercase placeholder-zinc-600 font-bold font-mono text-xl"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-sm font-mono uppercase tracking-wider text-zinc-500 font-bold block">Lado de Produção *</label>
                        <select 
                          value={formLado} 
                          onChange={(e) => setFormLado(e.target.value as any)}
                          className="w-full h-14 bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 focus:outline-none focus:border-emerald-500 font-bold font-mono text-lg"
                        >
                          <option value="Único">Único</option>
                          <option value="Esquerdo">Esquerdo</option>
                          <option value="Direito">Direito</option>
                        </select>
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        <button 
                          type="button" 
                          onClick={() => setActiveWindowA('operacao')}
                          className="h-14 w-16 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg flex items-center justify-center active:scale-95 transition-all"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          <ChevronLeft size={24} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            if (!formLote.trim()) {
                              showAlert('warning', "Por favor, preencha o Lote.");
                              return;
                            }
                            setConfirmaLote(true);
                            setConfirmaLado(true);
                            setActiveWindowA('materia');
                          }}
                          className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center select-none"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          Continuar
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* JANELA 4: MATÉRIA-PRIMA ALIMENTADA */}
                  {activeWindowA === 'materia' && (
                    <motion.div 
                      key="materia"
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-black text-zinc-400 uppercase tracking-wider">Matéria-Prima Alimentada *</span>
                        <span className="text-xs font-bold text-zinc-500">Un.</span>
                      </div>
                      
                      <input 
                        type="text" 
                        inputMode="numeric" 
                        pattern="[0-9]*"
                        value={formMateriaPrima}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormMateriaPrima(val === '' ? '' : Math.max(0, parseInt(val) || 0));
                        }}
                        onFocus={() => {
                          if (formMateriaPrima === 0) setFormMateriaPrima('');
                        }}
                        className="w-full h-16 bg-zinc-900 border border-zinc-700 rounded-lg px-4 text-4xl font-black font-mono text-emerald-400 text-center focus:outline-none focus:border-emerald-500"
                      />
                      
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setFormMateriaPrima((Number(formMateriaPrima) || 0) + 1)} className="flex-1 h-14 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-xl rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+1</button>
                        <button type="button" onClick={() => setFormMateriaPrima((Number(formMateriaPrima) || 0) + 10)} className="flex-1 h-14 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-xl rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+10</button>
                        <button type="button" onClick={() => setFormMateriaPrima((Number(formMateriaPrima) || 0) + 100)} className="flex-1 h-14 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-xl rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+100</button>
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        <button 
                          type="button" 
                          onClick={() => setActiveWindowA('lote')}
                          className="h-14 w-16 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg flex items-center justify-center active:scale-95 transition-all"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          <ChevronLeft size={24} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            if (formMateriaPrima === '') setFormMateriaPrima(0);
                            setConfirmaMateriaPrima(true);
                            setActiveWindowA('extras');
                          }}
                          className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center select-none"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          Continuar
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* JANELA 5: EXTRAS E OBSERVAÇÕES */}
                  {activeWindowA === 'extras' && (
                    <motion.div 
                      key="extras"
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                    >
                      <div className="space-y-2">
                        <label className="text-sm font-mono uppercase tracking-wider text-zinc-500 font-bold block">Regime de Hora Extra?</label>
                        <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg p-1 h-14">
                          <button 
                            type="button"
                            onClick={() => setFormHoraExtra(false)}
                            className={`flex-1 rounded-md font-bold uppercase transition-all select-none text-base ${!formHoraExtra ? 'bg-zinc-700 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-400'}`}
                            style={{WebkitTapHighlightColor: 'transparent'}}
                          >
                            Não (N)
                          </button>
                          <button 
                            type="button"
                            onClick={() => setFormHoraExtra(true)}
                            className={`flex-1 rounded-md font-bold uppercase transition-all select-none text-base ${formHoraExtra ? 'bg-[#00624C] text-white shadow-md' : 'text-zinc-500 hover:text-zinc-400'}`}
                            style={{WebkitTapHighlightColor: 'transparent'}}
                          >
                            Sim (S)
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-mono uppercase tracking-wider text-zinc-500 font-bold block">Observação (Opcional)</label>
                          <span className="text-xs text-zinc-600 font-mono">{formObservacao.length}/150</span>
                        </div>
                        <input 
                          type="text"
                          maxLength={150}
                          placeholder="Ex: Treinamento / Setup"
                          value={formObservacao}
                          onChange={(e) => setFormObservacao(e.target.value)}
                          className="w-full h-14 bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 focus:outline-none focus:border-emerald-500 placeholder-zinc-600 font-mono text-lg"
                        />
                      </div>
                      
                      <div className="flex gap-2 mt-2">
                        <button 
                          type="button" 
                          onClick={() => setActiveWindowA('materia')}
                          className="h-14 w-16 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg flex items-center justify-center active:scale-95 transition-all"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          <ChevronLeft size={24} />
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setActiveWindowA('resumo')}
                          className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center select-none"
                          style={{WebkitTapHighlightColor: 'transparent'}}
                        >
                          Revisar
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* JANELA 6: RESUMO FINAL E ENVIO */}
                  {activeWindowA === 'resumo' && (
                    <motion.div 
                      key="resumo"
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -15 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-4"
                    >
                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 shadow-xl">
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-zinc-800">
                          <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Resumo da Inicialização</span>
                          <button type="button" onClick={() => setActiveWindowA('operadora')} className="text-[#00624C] hover:text-emerald-400 text-[10px] font-bold uppercase underline">Editar</button>
                        </div>
                        <div className="space-y-2 text-sm font-mono">
                          <div className="flex justify-between border-b border-zinc-900 pb-1"><span className="text-zinc-500">Operadora:</span> <span className="font-bold text-white uppercase truncate pl-2">{formOperadora}</span></div>
                          <div className="flex justify-between border-b border-zinc-900 pb-1"><span className="text-zinc-500">Operação:</span> <span className="font-bold text-white uppercase truncate pl-2">{formOperacao}</span></div>
                          <div className="flex justify-between border-b border-zinc-900 pb-1"><span className="text-zinc-500">Lote / Lado:</span> <span className="font-bold text-white uppercase">{formLote} ({formLado})</span></div>
                          <div className="flex justify-between border-b border-zinc-900 pb-1"><span className="text-zinc-500">Matéria-Prima:</span> <span className="font-bold text-emerald-400">{formMateriaPrima || 0} un.</span></div>
                          <div className="flex justify-between border-b border-zinc-900 pb-1"><span className="text-zinc-500">Hora Extra:</span> <span className="font-bold text-white">{formHoraExtra ? 'SIM (S)' : 'NÃO (N)'}</span></div>
                          <div className="flex justify-between pb-1"><span className="text-zinc-500">Observação:</span> <span className="font-bold text-white truncate pl-2">{formObservacao || '-'}</span></div>
                        </div>
                      </div>

                      <button 
                        type="button"
                        onClick={handleSalvarCenarioA}
                        disabled={isSaving}
                        className="w-full h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 select-none disabled:opacity-50"
                        style={{WebkitTapHighlightColor: 'transparent'}}
                      >
                        {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        Confirmar Todos os Campos
                      </button>

                      <button 
                        type="button"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja cancelar e limpar esta inicialização?")) {
                            setFormOperadora('');
                            setFormOperacao('');
                            setFormLote('');
                            setFormLado('Único');
                            setFormMateriaPrima('');
                            setFormHoraExtra(false);
                            setFormObservacao('');
                            setActiveWindowA('operadora');
                          }
                        }}
                        disabled={isSaving}
                        className="w-full h-12 bg-transparent border border-rose-900/50 text-rose-500 font-bold uppercase tracking-widest rounded-lg active:bg-rose-950 active:scale-95 transition-all flex items-center justify-center select-none"
                        style={{WebkitTapHighlightColor: 'transparent'}}
                      >
                        Cancelar Sessão
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeSession && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center p-3 sm:p-4 pt-[72px] pb-12 sm:pt-[80px] backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-white/30 rounded-xl w-full max-w-md overflow-visible p-4 sm:p-5 md:p-6 space-y-5 shadow-2xl mx-auto my-0"
            >
              {/* Informações Atuais de Leitura (READ-ONLY) */}
              <div className="space-y-3 bg-zinc-900/40 p-4 rounded-lg border border-white/30 font-mono text-lg text-zinc-400">
                {/* Linha de Cabeçalho (Manutenção e Código) */}
                <div className="flex justify-between items-center border-b border-white/20 pb-3 mb-1">
                  <span className="text-neutral-500 font-mono text-lg font-bold">COD: {activeSession.codigo_manual_curto}</span>
                  <div className="flex items-center gap-3">
                    {!showQualidadeForm && !showManutencaoForm && (
                      <button 
                        onClick={() => setShowManutencaoForm(true)}
                        className="bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-400 font-mono font-bold text-lg px-2.5 py-1.5 rounded uppercase transition-colors cursor-pointer"
                      >
                        🔧 Solicitar Manutenção
                      </button>
                    )}
                    <button 
                      onClick={retomarScanner}
                      className="text-zinc-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-3 gap-x-4">
                  <div>
                    <span className="text-zinc-600 block text-[8px] uppercase font-bold">Máquina</span>
                    <strong className="text-zinc-100 font-bold text-lg">{activeSession.num_maquina}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-600 block text-[8px] uppercase font-bold">Operadora</span>
                    <strong className="text-zinc-100 font-bold truncate block">{activeSession.operadora_nome}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-600 block text-[8px] uppercase font-bold">Operação</span>
                    <strong className="text-zinc-100 font-bold truncate block">{activeSession.operacao_nome}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-600 block text-[8px] uppercase font-bold">Lote / Lado</span>
                    <strong className="text-zinc-100 font-bold block">{activeSession.lote} ({activeSession.lado})</strong>
                  </div>
                  <div>
                    <span className="text-zinc-600 block text-[8px] uppercase font-bold">Tipo Máquina / HE</span>
                    <strong className="text-zinc-100 font-bold block">{activeSession.tipo_maquina} ({activeSession.hora_extra === 's' ? 'Sim' : 'Não'})</strong>
                  </div>
                  <div>
                    <span className="text-zinc-600 block text-[8px] uppercase font-bold">Início do Ciclo</span>
                    <div className="text-zinc-300 font-bold flex items-center gap-1 mt-0.5">
                      <Clock size={11} className="text-[#00624C]" /> {formatarHora(activeSession.horario_inicio)}
                    </div>
                  </div>
                </div>
              </div>

              {showQualidadeForm ? (
                // FORMULÁRIO DE QUALIDADE
                <div className="space-y-4 font-mono text-lg">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-zinc-400 font-bold block">Retrabalho Próprio</label>
                      <input 
                        type="number"
                        min="0"
                        value={retrabalhoProprio}
                        onChange={(e) => setRetrabalhoProprio(Number(e.target.value))}
                        className="w-full h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3 focus:outline-none focus:border-[#00624C] text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-zinc-400 font-bold block">Retrabalho Terceiro</label>
                      <input 
                        type="number"
                        min="0"
                        value={retrabalhoTerceiro}
                        onChange={(e) => setRetrabalhoTerceiro(Number(e.target.value))}
                        className="w-full h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3 focus:outline-none focus:border-[#00624C] text-center"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-rose-400 font-bold block">Peças Refugadas</label>
                      <input 
                        type="number"
                        min="0"
                        value={qualidadeRefugo}
                        onChange={(e) => setQualidadeRefugo(Number(e.target.value))}
                        className="w-full h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3 focus:outline-none focus:border-[#00624C] text-center"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-zinc-900">
                    <button 
                      onClick={() => setShowQualidadeForm(false)}
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white font-bold h-12 md:h-10 px-4 rounded text-lg font-mono uppercase tracking-widest transition-colors flex justify-center items-center gap-2 cursor-pointer w-full sm:w-auto"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleSalvarQualidade}
                      disabled={isSaving || (retrabalhoProprio === 0 && retrabalhoTerceiro === 0 && qualidadeRefugo === 0)}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black h-12 md:h-10 px-3 rounded text-lg font-mono uppercase tracking-widest shadow-lg shadow-amber-600/15 transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={14} /> : <AlertCircle size={14} />}
                      Salvar Ajuste de Qualidade
                    </button>
                  </div>
                </div>
              ) : showManutencaoForm ? (
                // FORMULÁRIO DE MANUTENÇÃO
                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-5 md:p-6 mb-4 shadow-inner shadow-rose-500/5">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]">
                        <AlertCircle className="text-rose-500 w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-mono text-xl md:text-2xl font-black text-rose-500 uppercase tracking-widest mb-1">
                          Chamado de Manutenção
                        </h3>
                        <p className="text-zinc-400 font-mono text-sm leading-relaxed">
                          A solicitação de manutenção não interrompe imediatamente o apontamento atual, mas alerta a equipe técnica.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="bg-zinc-900/50 p-5 rounded-xl border border-zinc-800/80 space-y-3">
                      <div className="flex justify-between items-end">
                        <label className="text-zinc-300 font-mono text-sm font-bold uppercase tracking-wider block">
                          Descreva o Problema <span className="text-zinc-600 font-normal lowercase">(Opcional)</span>
                        </label>
                        <span className="text-xs text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">
                          {manutencaoDesc.length}/150
                        </span>
                      </div>
                      <textarea 
                        maxLength={150}
                        rows={4}
                        placeholder="Ex: Barulho estranho no motor, falha intermitente, vazamento..."
                        value={manutencaoDesc}
                        onChange={(e) => setManutencaoDesc(e.target.value)}
                        className="w-full bg-zinc-950/80 border border-zinc-800 text-zinc-100 rounded-lg p-4 font-mono focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/50 placeholder-zinc-700 resize-none transition-all shadow-inner"
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-3 pt-6 mt-4 border-t border-zinc-800">
                    <button 
                      onClick={() => {
                        setShowManutencaoForm(false);
                        setManutencaoDesc('');
                      }}
                      className="order-2 md:order-1 h-14 px-6 bg-zinc-900 md:hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-lg font-mono font-bold uppercase rounded-lg cursor-pointer flex justify-center items-center gap-2 transition-all w-full md:w-auto shrink-0"
                    >
                      <X size={20} className="text-zinc-500" />
                      CANCELAR
                    </button>
                    <button 
                      onClick={handleConfirmarManutencao}
                      disabled={isSaving}
                      className="order-1 md:order-2 h-14 w-full bg-rose-600 hover:bg-rose-700 text-white text-lg font-mono font-black uppercase tracking-wider rounded-lg shadow-[0_0_20px_rgba(225,29,72,0.2)] cursor-pointer flex items-center justify-center gap-3 disabled:opacity-50 disabled:shadow-none transition-all"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="animate-spin" size={20} />
                          PROCESSANDO...
                        </>
                      ) : (
                        <>
                          <AlertCircle size={20} />
                          ENVIAR CHAMADO
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Inputs para digitação */}
                  <div className="space-y-4 font-mono text-lg">
                    
                    {/* Apontamento de Volumes Sequencial (Janelas Móveis Touch-First) */}
                    <div className="space-y-4 font-mono">
                      
                      {/* Indicador de Passos */}
                      {activeWindow !== 'final' && (
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <div className={`w-2.5 h-2.5 rounded-full transition-all ${activeWindow === 'conforme' ? 'bg-emerald-500 scale-125' : 'bg-emerald-500'}`}></div>
                          <div className={`w-2.5 h-2.5 rounded-full transition-all ${activeWindow === 'retProprio' ? 'bg-amber-500 scale-125' : (activeWindow === 'retTerceiro' || activeWindow === 'refugo' ? 'bg-amber-500' : 'bg-zinc-800')}`}></div>
                          <div className={`w-2.5 h-2.5 rounded-full transition-all ${activeWindow === 'retTerceiro' ? 'bg-amber-500 scale-125' : (activeWindow === 'refugo' ? 'bg-amber-500' : 'bg-zinc-800')}`}></div>
                          <div className={`w-2.5 h-2.5 rounded-full transition-all ${activeWindow === 'refugo' ? 'bg-rose-500 scale-125' : 'bg-zinc-800'}`}></div>
                        </div>
                      )}

                      <AnimatePresence mode="wait">
                        {/* JANELA 1: CONFORME */}
                        {activeWindow === 'conforme' && (
                          <motion.div 
                            key="conforme"
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            transition={{ duration: 0.2 }}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xl font-black text-emerald-400 uppercase tracking-wider">Conforme *</span>
                              <span className="text-sm font-bold text-zinc-500">Pçs</span>
                            </div>
                            
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              value={prodConforme}
                              onChange={(e) => setProdConforme(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full h-14 bg-zinc-900 border border-zinc-700 rounded-lg px-4 text-3xl font-black font-mono text-white text-center focus:outline-none focus:border-emerald-500"
                            />
                            
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setProdConforme((Number(prodConforme) || 0) + 1)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+1</button>
                              <button type="button" onClick={() => setProdConforme((Number(prodConforme) || 0) + 10)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+10</button>
                              <button type="button" onClick={() => setProdConforme((Number(prodConforme) || 0) + 100)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+100</button>
                            </div>
                            
                            <button 
                              type="button" 
                              onClick={() => { setConfirmaBProdConforme(true); setLastCheckedFieldB("conforme"); setActiveWindow('retProprio'); }}
                              className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center mt-2 select-none"
                              style={{WebkitTapHighlightColor: 'transparent'}}
                            >
                              Confirmar Conforme
                            </button>
                          </motion.div>
                        )}

                        {/* JANELA 2: RETRABALHO PRÓPRIO */}
                        {activeWindow === 'retProprio' && (
                          <motion.div 
                            key="retProprio"
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            transition={{ duration: 0.2 }}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xl font-black text-amber-400 uppercase tracking-wider">Ret. Próprio</span>
                              <span className="text-sm font-bold text-zinc-500">Un.</span>
                            </div>
                            
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              value={retrabalhoProprio}
                              onChange={(e) => setRetrabalhoProprio(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full h-14 bg-zinc-900 border border-zinc-700 rounded-lg px-4 text-3xl font-black font-mono text-white text-center focus:outline-none focus:border-amber-500"
                            />
                            
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setRetrabalhoProprio((Number(retrabalhoProprio) || 0) + 1)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+1</button>
                              <button type="button" onClick={() => setRetrabalhoProprio((Number(retrabalhoProprio) || 0) + 10)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+10</button>
                              <button type="button" onClick={() => setRetrabalhoProprio((Number(retrabalhoProprio) || 0) + 100)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+100</button>
                            </div>
                            
                            <div className="flex gap-2 mt-2">
                              <button 
                                type="button" 
                                onClick={() => setActiveWindow('conforme')}
                                className="h-12 w-16 bg-zinc-900 text-zinc-400 rounded-lg flex items-center justify-center active:scale-95 transition-all"
                              >
                                <ChevronLeft size={24} />
                              </button>
                              <button 
                                type="button" 
                                onClick={() => { setConfirmaBRetrabalhoProprio(true); setLastCheckedFieldB("retrabalhoProprio"); setActiveWindow('retTerceiro'); }}
                                className="flex-1 h-12 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-amber-700 active:scale-95 transition-all flex items-center justify-center select-none"
                                style={{WebkitTapHighlightColor: 'transparent'}}
                              >
                                Confirmar R. Próprio
                              </button>
                            </div>
                          </motion.div>
                        )}

                        {/* JANELA 3: RETRABALHO TERCEIROS */}
                        {activeWindow === 'retTerceiro' && (
                          <motion.div 
                            key="retTerceiro"
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            transition={{ duration: 0.2 }}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xl font-black text-amber-400 uppercase tracking-wider">Ret. Terceiros</span>
                              <span className="text-sm font-bold text-zinc-500">Un.</span>
                            </div>
                            
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              value={retrabalhoTerceiro}
                              onChange={(e) => setRetrabalhoTerceiro(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full h-14 bg-zinc-900 border border-zinc-700 rounded-lg px-4 text-3xl font-black font-mono text-white text-center focus:outline-none focus:border-amber-500"
                            />
                            
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setRetrabalhoTerceiro((Number(retrabalhoTerceiro) || 0) + 1)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+1</button>
                              <button type="button" onClick={() => setRetrabalhoTerceiro((Number(retrabalhoTerceiro) || 0) + 10)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+10</button>
                              <button type="button" onClick={() => setRetrabalhoTerceiro((Number(retrabalhoTerceiro) || 0) + 100)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+100</button>
                            </div>
                            
                            <div className="flex gap-2 mt-2">
                              <button 
                                type="button" 
                                onClick={() => setActiveWindow('retProprio')}
                                className="h-12 w-16 bg-zinc-900 text-zinc-400 rounded-lg flex items-center justify-center active:scale-95 transition-all"
                              >
                                <ChevronLeft size={24} />
                              </button>
                              <button 
                                type="button" 
                                onClick={() => { setConfirmaBRetrabalhoTerceiro(true); setLastCheckedFieldB("retrabalhoTerceiro"); setActiveWindow('refugo'); }}
                                className="flex-1 h-12 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-amber-700 active:scale-95 transition-all flex items-center justify-center select-none"
                                style={{WebkitTapHighlightColor: 'transparent'}}
                              >
                                Confirmar R. Terc.
                              </button>
                            </div>
                          </motion.div>
                        )}

                        {/* JANELA 4: REFUGO */}
                        {activeWindow === 'refugo' && (
                          <motion.div 
                            key="refugo"
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            transition={{ duration: 0.2 }}
                            className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4 shadow-xl"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-xl font-black text-rose-400 uppercase tracking-wider">Refugo</span>
                              <span className="text-sm font-bold text-zinc-500">Un.</span>
                            </div>
                            
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              value={refugo}
                              onChange={(e) => setRefugo(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-full h-14 bg-zinc-900 border border-zinc-700 rounded-lg px-4 text-3xl font-black font-mono text-white text-center focus:outline-none focus:border-rose-500"
                            />
                            
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setRefugo((Number(refugo) || 0) + 1)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+1</button>
                              <button type="button" onClick={() => setRefugo((Number(refugo) || 0) + 10)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+10</button>
                              <button type="button" onClick={() => setRefugo((Number(refugo) || 0) + 100)} className="flex-1 h-12 bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold text-lg rounded-lg active:bg-zinc-800 active:scale-95 transition-all select-none" style={{WebkitTapHighlightColor: 'transparent'}}>+100</button>
                            </div>
                            
                            <div className="flex gap-2 mt-2">
                              <button 
                                type="button" 
                                onClick={() => setActiveWindow('retTerceiro')}
                                className="h-12 w-16 bg-zinc-900 text-zinc-400 rounded-lg flex items-center justify-center active:scale-95 transition-all"
                              >
                                <ChevronLeft size={24} />
                              </button>
                              <button 
                                type="button" 
                                onClick={() => { setConfirmaBRefugo(true); setLastCheckedFieldB("refugo"); setActiveWindow('final'); }}
                                className="flex-1 h-12 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-wider rounded-lg active:bg-rose-700 active:scale-95 transition-all flex items-center justify-center select-none"
                                style={{WebkitTapHighlightColor: 'transparent'}}
                              >
                                Confirmar Refugo
                              </button>
                            </div>
                          </motion.div>
                        )}

                        {/* JANELA 5: FINAL (PARÂMETROS E RESUMO) */}
                        {activeWindow === 'final' && (
                          <motion.div 
                            key="final"
                            initial={{ opacity: 0, x: 15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            transition={{ duration: 0.2 }}
                            className="flex flex-col gap-4"
                          >
                            {/* Resumo da Contagem */}
                            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 shadow-xl">
                              <div className="flex justify-between items-center mb-3 pb-2 border-b border-zinc-800">
                                <span className="text-sm text-zinc-400 font-bold uppercase tracking-wider">Resumo Registrado</span>
                                <button type="button" onClick={() => setActiveWindow('conforme')} className="text-[#00624C] hover:text-emerald-400 text-xs font-bold uppercase underline">Editar</button>
                              </div>
                              <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-emerald-400">Conforme:</span> <span className="font-bold text-white">{prodConforme || '0'} pçs</span></div>
                                <div className="flex justify-between"><span className="text-amber-400">R. Próprio:</span> <span className="font-bold text-white">{retrabalhoProprio || '0'} un.</span></div>
                                <div className="flex justify-between"><span className="text-amber-400">R. Terc:</span> <span className="font-bold text-white">{retrabalhoTerceiro || '0'} un.</span></div>
                                <div className="flex justify-between"><span className="text-rose-400">Refugo:</span> <span className="font-bold text-white">{refugo || '0'} un.</span></div>
                              </div>
                            </div>

                            {/* Lado (Dropdown) */}
                            <div className="flex items-center justify-between bg-zinc-950/60 p-3 rounded-xl border border-zinc-900/60 shadow-xl">
                              <span className="text-sm text-zinc-400 uppercase font-black tracking-wider">Lado de Produção:</span>
                              <div className="flex items-center gap-2">
                                <select 
                                  disabled={confirmaBLado}
                                  value={cenarioBLado} 
                                  onChange={(e) => setCenarioBLado(e.target.value as any)}
                                  className="h-12 bg-zinc-900 border border-zinc-800 text-white text-base font-mono font-bold rounded-lg px-3 focus:outline-none focus:border-[#00624C] disabled:opacity-50"
                                >
                                  <option value="Único">Único</option>
                                  <option value="Esquerdo">Esquerdo</option>
                                  <option value="Direito">Direito</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => { const v = !confirmaBLado; setConfirmaBLado(v); if(v) setLastCheckedFieldB("lado"); }}
                                  className={`h-12 w-12 rounded-lg border flex items-center justify-center font-bold text-lg cursor-pointer transition-all shrink-0 ${
                                    confirmaBLado 
                                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                  }`}
                                  title={confirmaBLado ? "Desbloquear Lado" : "Confirmar Lado"}
                                >
                                  <Check size={18} className={confirmaBLado ? "scale-110" : ""} />
                                </button>
                              </div>
                            </div>

                            {/* Observação (Justificativa) */}
                            <div className="space-y-1.5 bg-zinc-950 border border-zinc-800 rounded-xl p-4 shadow-xl">
                              <label className="text-sm font-mono text-zinc-400 uppercase tracking-wider block font-black">
                                OBSERVAÇÃO (JUSTIFICATIVA)
                              </label>
                              <textarea 
                                maxLength={150}
                                rows={2}
                                placeholder="Ex: Treinamento ou justificativa de parada..."
                                value={cenarioBObservacao}
                                onChange={(e) => setCenarioBObservacao(e.target.value)}
                                className="w-full h-16 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-base text-white focus:outline-none focus:border-[#00624C] resize-none font-mono placeholder-zinc-600"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* B CONFIRMATION MODAL */}
      <AnimatePresence>
        {showBConfirmationModal && (
          <div className="fixed inset-0 bg-black/75 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-lg p-6 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-white font-mono uppercase tracking-wider">RESUMO DA PRODUÇÃO</h3>
                <button 
                  onClick={() => {
                    setShowBConfirmationModal(false);
                    if (lastCheckedFieldB === 'conforme') setConfirmaBProdConforme(false);
                    else if (lastCheckedFieldB === 'refugo') setConfirmaBRefugo(false);
                    else if (lastCheckedFieldB === 'retrabalhoProprio') setConfirmaBRetrabalhoProprio(false);
                    else if (lastCheckedFieldB === 'retrabalhoTerceiro') setConfirmaBRetrabalhoTerceiro(false);
                    else if (lastCheckedFieldB === 'lado') setConfirmaBLado(false);
                  }}
                  className="text-zinc-500 hover:text-white p-1"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4 mb-8 font-mono">
                <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-zinc-500 text-xs font-bold block uppercase mb-1">Prod. Conforme</span>
                      <span className="text-emerald-400 font-black text-lg">{prodConforme || '0'} pçs</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs font-bold block uppercase mb-1">Refugo</span>
                      <span className="text-rose-400 font-black text-lg">{refugo || '0'} pçs</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs font-bold block uppercase mb-1">Retrabalho Prop.</span>
                      <span className="text-amber-400 font-black text-lg">{retrabalhoProprio || '0'} pçs</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs font-bold block uppercase mb-1">Retrabalho Terc.</span>
                      <span className="text-amber-400 font-black text-lg">{retrabalhoTerceiro || '0'} pçs</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-zinc-800/50 mt-2">
                      <span className="text-zinc-500 text-xs font-bold block uppercase mb-1">Lado</span>
                      <span className="text-white font-black">{cenarioBLado || 'N/A'}</span>
                    </div>
                    {cenarioBObservacao && (
                      <div className="col-span-2">
                        <span className="text-zinc-500 text-xs font-bold block uppercase mb-1">Observação</span>
                        <span className="text-zinc-300 text-sm whitespace-pre-wrap">{cenarioBObservacao}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <p className="text-center text-zinc-300 font-bold uppercase tracking-wider mt-6">O que gostaria de fazer agora?</p>
              </div>

              <div className="flex flex-col gap-3 font-mono">
                <button 
                  onClick={() => {
                    setShowBConfirmationModal(false);
                    handleSalvarCenarioB(false);
                  }}
                  disabled={isSaving}
                  className="h-14 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold uppercase rounded-lg shadow-lg shadow-emerald-600/10 transition-colors flex items-center justify-center"
                >
                  {isSaving ? <Loader2 className="animate-spin mr-2" size={20} /> : <Save className="mr-2" size={20} />}
                  Salvar Produção
                </button>
                
                <button 
                  onClick={() => {
                    setShowBConfirmationModal(false);
                    handleSalvarCenarioB(true);
                  }}
                  disabled={isSaving}
                  className="h-14 w-full bg-blue-600 hover:bg-blue-700 text-white text-lg font-bold uppercase rounded-lg shadow-lg shadow-blue-600/10 transition-colors flex items-center justify-center"
                >
                  Mudar de Processo
                </button>
                
                <button 
                  onClick={() => {
                    setShowBConfirmationModal(false);
                    handleFinalizarProcessoClick();
                  }}
                  disabled={isSaving}
                  className="h-14 w-full bg-rose-600 hover:bg-rose-700 text-white text-lg font-bold uppercase rounded-lg shadow-lg shadow-rose-600/10 transition-colors flex items-center justify-center"
                >
                  Finalizar Expediente
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE ALERTA CUSTOMIZADO */}
      <AnimatePresence>
        {customAlert && customAlert.show && (
          <div className="fixed inset-0 bg-black/75 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-sm p-6 space-y-4 shadow-2xl text-center"
            >
              <div className="flex flex-col items-center justify-center gap-3">
                {customAlert.type === 'success' && (
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-400">
                    <CheckCircle2 size={28} />
                  </div>
                )}
                {customAlert.type === 'warning' && (
                  <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-400">
                    <AlertCircle size={28} />
                  </div>
                )}
                {customAlert.type === 'error' && (
                  <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/30 rounded-full flex items-center justify-center text-rose-400">
                    <XCircle size={28} />
                  </div>
                )}
                
                <h4 className={`font-mono text-lg uppercase tracking-widest font-black ${
                  customAlert.type === 'success' ? 'text-emerald-400' :
                  customAlert.type === 'warning' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {customAlert.type === 'success' ? 'SUCESSO REALIZADO' :
                   customAlert.type === 'warning' ? 'AVISO / ATENÇÃO' : 'FALHA REJEITADA'}
                </h4>
                
                <p className="text-zinc-300 font-mono text-lg leading-relaxed uppercase">
                  {customAlert.message}
                </p>
              </div>

              <button
                onClick={() => {
                  setCustomAlert(null);
                  if (isOverlayMode && onCloseOverlay && !showScenarioA && !activeSession) {
                    onCloseOverlay();
                  }
                }}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded text-lg font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
              >
                Ok, Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL DE JUSTIFICATIVA PARA ENCERRAMENTO ANTECIPADO */}
      <AnimatePresence>
        {showJustificativaModal && (
          <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-rose-900 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-center"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/30 rounded-full flex items-center justify-center text-rose-500">
                  <AlertCircle size={28} />
                </div>
                
                <h4 className="font-mono text-lg uppercase tracking-widest font-black text-rose-500">
                  ATENÇÃO: ALERTA DE TURNO ATIVO
                </h4>
                
                <p className="text-zinc-300 font-mono text-lg leading-relaxed uppercase">
                  Atenção: O turno ainda não encerrou. Descreva o motivo da finalização antecipada:
                </p>

                <div className="w-full text-left space-y-1">
                  <div className="flex justify-between items-center text-lg text-zinc-500 font-mono">
                    <span>Justificativa</span>
                    <span>{justificativaMotivo.length}/150</span>
                  </div>
                  <textarea
                    maxLength={150}
                    rows={3}
                    placeholder="Descreva aqui o motivo detalhado (máx 150 caracteres)..."
                    value={justificativaMotivo}
                    onChange={(e) => setJustificativaMotivo(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded p-3 text-lg focus:outline-none focus:border-rose-500 placeholder-zinc-600 resize-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowJustificativaModal(false);
                    setJustificativaMotivo('');
                  }}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded text-lg font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConfirmarFinalizacaoAntecipada}
                  disabled={isSaving || !justificativaMotivo.trim()}
                  className="flex-1 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-lg font-mono font-black uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
                >
                  Confirmar Finalização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </>
  );
}
