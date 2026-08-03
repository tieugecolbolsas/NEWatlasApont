import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'motion/react';
import { 
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
}

export default function ScannerCaixas({ pendingScanCode, onClearPendingScanCode }: ScannerCaixasProps = {}) {
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
  const [confirmaBLado, setConfirmaBLado] = useState(false);
  const [confirmaBRetrabalhoProprio, setConfirmaBRetrabalhoProprio] = useState(false);
  const [confirmaBRetrabalhoTerceiro, setConfirmaBRetrabalhoTerceiro] = useState(false);
  const [confirmaBMotivoOcorrencia, setConfirmaBMotivoOcorrencia] = useState(false);
  const [confirmaBObservacao, setConfirmaBObservacao] = useState(false);

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
      setConfirmaBProdConforme(false);
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
  const [retrabalhoProprio, setRetrabalhoProprio] = useState<number | ''>('');
  const [retrabalhoTerceiro, setRetrabalhoTerceiro] = useState<number | ''>('');
  const [motivoOcorrencia, setMotivoOcorrencia] = useState<string>('Produção Normal');

  // Campos do Formulário - Ajuste de Qualidade
  const [showQualidadeForm, setShowQualidadeForm] = useState(false);
  const [qualidadeRefugo, setQualidadeRefugo] = useState<number>(0);
  
  const [isSaving, setIsSaving] = useState(false);
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
      const { data, error } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .select('*');

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
            retomarScanner();
            return;
          } else {
            // Se o código não existir em nenhuma das duas tabelas
            showAlert('error', "Código inválido. Verifique o código e tente novamente.");
            retomarScanner();
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
      retomarScanner();
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

  const retomarScanner = () => {
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
    setIsScanning(true);
    isProcessingScan.current = false;
    if (scannerRef.current && scannerRef.current.getState() === 3) {
      scannerRef.current.resume();
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
      retomarScanner();
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
      retomarScanner();
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
      retomarScanner();
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
      retomarScanner();
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
    const hasRetrabalho = (Number(retrabalhoProprio) > 0 || Number(retrabalhoTerceiro) > 0);

    if (isConformeEmpty && !hasRetrabalho) {
      showAlert('warning', "Por favor, preencha a Quantidade Conforme ou informe algum valor de Retrabalho.");
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
      refugo: 0,
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
        retomarScanner();
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
        retomarScanner();
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
        retomarScanner();
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
        retomarScanner();
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
  const isRetProprioEmpty = retrabalhoProprio === '' || retrabalhoProprio === null || Number(retrabalhoProprio) === 0;
  const isRetTerceiroEmpty = retrabalhoTerceiro === '' || retrabalhoTerceiro === null || Number(retrabalhoTerceiro) === 0;

  const isBValid = confirmaBLado && 
    (isConformeEmpty || confirmaBProdConforme) &&
    (isRetProprioEmpty || confirmaBRetrabalhoProprio) &&
    (isRetTerceiroEmpty || confirmaBRetrabalhoTerceiro) &&
    !(isConformeEmpty && isRetProprioEmpty && isRetTerceiroEmpty);

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto" id="terminal-mobile-view">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold uppercase tracking-[0.15em] text-[#00624C] flex items-center gap-2">
             TERMINAL DE APONTAMENTO
          </h2>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
            LEITURA DE QR CODE E APONTAMENTOS DE PRODUÇÃO EM TEMPO REAL
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
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
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-zinc-500 text-[9px] uppercase">Conforme:</span>
                            <span className="text-emerald-400 font-bold">{registro.producao_conforme} pçs</span>
                          </div>
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

      {/* ======================================================= */}
      {/* ======================================================= */}
      <AnimatePresence>
        {showScenarioA && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-white/30 rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto p-3.5 sm:p-5 space-y-3 sm:space-y-4 shadow-2xl scrollbar-thin my-auto"
            >
              {/* Header do Form */}
              <div className="flex justify-between items-center border-b border-white/30 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="text-[#00624C]" size={20} />
                  <div>
                    <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                      Inicializar Terminal
                    </h3>
                    <p className="text-zinc-500 text-[9px] font-mono uppercase tracking-widest mt-0.5">
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

              {/* Formulário */}
              <div className="space-y-3 font-mono text-xs">
                
                {/* 2. Display Bar de Leitura Travada (Substitui Máquina Alvo / Cód. Curto Gerado) */}
                <div className="relative overflow-hidden bg-zinc-900/90 border border-zinc-800/80 rounded-lg p-3.5 flex items-center justify-between shadow-inner">
                  {/* Decorative industrial corner/line */}
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#00624C]" />
                  
                  <div className="flex items-center gap-3 pl-2">
                    <div className="h-9 w-9 rounded-md bg-zinc-950 border border-zinc-800/80 flex items-center justify-center text-[#00624C] shadow-sm">
                      <Cpu size={18} className="animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">MÁQUINA IDENTIFICADA</span>
                      <span className="font-mono text-xs sm:text-sm font-black text-white tracking-wider">
                        N.º {formMaquina}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-right pr-1">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">TIPO DE EQUIPAMENTO</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-[#00624C]/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                      <Settings size={10} className="animate-[spin_8s_linear_infinite]" />
                      {formTipoMaquina || 'RETA'}
                    </span>
                  </div>
                </div>

                {/* Nome da Operadora */}
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Nome da Operadora *</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      required
                      disabled={confirmaOperadora}
                      placeholder="Ex: ANA PAULA SILVA"
                      value={formOperadora}
                      onChange={(e) => {
                        setFormOperadora(e.target.value);
                        setShowOperadoraSuggestions(true);
                      }}
                      onFocus={() => setShowOperadoraSuggestions(true)}
                      onBlur={() => {
                        setTimeout(() => setShowOperadoraSuggestions(false), 200);
                      }}
                      className="flex-1 h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600 font-bold font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!formOperadora.trim()) {
                          showAlert('warning', "Por favor, preencha o Nome da Operadora antes de confirmar.");
                          return;
                        }
                        setConfirmaOperadora(!confirmaOperadora);
                      }}
                      className={`p-2.5 rounded border h-10 w-10 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                        confirmaOperadora 
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={confirmaOperadora ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                    >
                      <Check size={16} className={confirmaOperadora ? "scale-110" : ""} />
                    </button>
                  </div>
                  {showOperadoraSuggestions && listaOperadoras.filter(op => op.toLowerCase().includes(formOperadora.toLowerCase())).length > 0 && (
                    <div className="absolute left-0 right-0 bg-zinc-950 border border-zinc-800 rounded mt-1 max-h-40 overflow-y-auto z-50 shadow-2xl">
                      {listaOperadoras.filter(op => op.toLowerCase().includes(formOperadora.toLowerCase())).map((op, opIdx) => (
                        <div
                          key={opIdx}
                          onMouseDown={() => {
                            if (!confirmaOperadora) {
                              setFormOperadora(op);
                              setShowOperadoraSuggestions(false);
                            }
                          }}
                          className="px-3 py-2 text-zinc-300 hover:bg-[#00624C] hover:text-white cursor-pointer transition-colors text-left font-mono text-xs"
                        >
                          {op}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Nome da Operação */}
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Nome da Operação *</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      required
                      disabled={confirmaOperacao}
                      placeholder="Ex: COSTURA GOLA"
                      value={formOperacao}
                      onChange={(e) => {
                        setFormOperacao(e.target.value);
                        setShowOperacaoSuggestions(true);
                      }}
                      onFocus={() => setShowOperacaoSuggestions(true)}
                      onBlur={() => {
                        setTimeout(() => setShowOperacaoSuggestions(false), 200);
                      }}
                      className="flex-1 h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!formOperacao.trim()) {
                          showAlert('warning', "Por favor, preencha a Operação antes de confirmar.");
                          return;
                        }
                        setConfirmaOperacao(!confirmaOperacao);
                      }}
                      className={`p-2.5 rounded border h-10 w-10 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                        confirmaOperacao 
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={confirmaOperacao ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                    >
                      <Check size={16} className={confirmaOperacao ? "scale-110" : ""} />
                    </button>
                  </div>
                  {showOperacaoSuggestions && (
                    <div className="absolute left-0 right-0 bg-zinc-950 border border-zinc-800 rounded mt-1 z-50 shadow-2xl p-1">
                      {(() => {
                        const query = formOperacao.toLowerCase();
                        const filtered = filteredOperations.filter(item => 
                          item.operacao_nome.toLowerCase().includes(query) ||
                          item.categoria_nome.toLowerCase().includes(query)
                        );
                        
                        // Group by category
                        const grouped = filtered.reduce((acc, curr) => {
                          const cat = curr.categoria_nome || 'DIVERSOS';
                          if (!acc[cat]) acc[cat] = [];
                          acc[cat].push(curr.operacao_nome);
                          return acc;
                        }, {} as Record<string, string[]>);
                        
                        const totalFiltered = filtered.length;
                        
                        if (totalFiltered === 0) {
                          return <div className="p-2 text-zinc-500 text-xs font-mono">Nenhuma operação encontrada</div>;
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
                            onChange={(e) => {
                              if (e.target.value) {
                                setFormOperacao(e.target.value);
                                setShowOperacaoSuggestions(false);
                              }
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            {sortedEntries.map(([category, ops]) => (
                              <optgroup key={category} label={category.toUpperCase()} className="text-[#00624C] font-extrabold bg-zinc-950 px-2 py-1">
                                {ops.map(op => (
                                  <option 
                                    key={op} 
                                    value={op} 
                                    className="text-zinc-300 font-mono text-xs bg-zinc-900 px-3 py-1.5 hover:bg-[#00624C] hover:text-white cursor-pointer"
                                    onClick={() => {
                                      setFormOperacao(op);
                                      setShowOperacaoSuggestions(false);
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

                {/* 5. Agrupamento: Lote de Produção e Lado (Confirmados juntos) */}
                <div className="flex gap-2 items-end">
                  {/* Lote Input (numeric keypad trigger) */}
                  <div className="space-y-1 flex-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Lote de Produção *</label>
                    <input 
                      type="text" 
                      inputMode="numeric" 
                      pattern="[0-9]*"
                      required
                      disabled={confirmaLote}
                      placeholder="Ex: 205"
                      value={formLote}
                      onChange={(e) => setFormLote(e.target.value)}
                      className="w-full h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600 font-mono text-xs font-bold"
                    />
                  </div>
                  
                  {/* Lado Select Dropdown */}
                  <div className="space-y-1 flex-1">
                    <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Lado</label>
                    <select 
                      disabled={confirmaLado}
                      value={formLado} 
                      onChange={(e) => setFormLado(e.target.value as any)}
                      className="w-full h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3 focus:outline-none focus:border-[#00624C] font-mono text-xs font-bold"
                    >
                      <option value="Único">Único</option>
                      <option value="Esquerdo">Esquerdo</option>
                      <option value="Direito">Direito</option>
                    </select>
                  </div>
                  
                  {/* Botão Único de Confirmação para Lote e Lado */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmaLote && !formLote.trim()) {
                        showAlert('warning', "Por favor, preencha o Lote antes de confirmar.");
                        return;
                      }
                      const nextState = !confirmaLote;
                      setConfirmaLote(nextState);
                      setConfirmaLado(nextState);
                    }}
                    className={`p-2 rounded border h-10 w-10 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                      confirmaLote 
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                    title={confirmaLote ? "Desbloquear Campos (Lote e Lado)" : "Confirmar e Travar Campos (Lote e Lado)"}
                  >
                    <Check size={16} className={confirmaLote ? "scale-110" : ""} />
                  </button>
                </div>

                {/* Matéria-Prima Alimentada & Observação */}
                <div className="flex gap-2 items-end">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                    <div className="space-y-1">
                      <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Matéria-Prima Alimentada *</label>
                      <input 
                        type="number"
                        required
                        min="0"
                        disabled={confirmaMateriaPrima}
                        placeholder="Ex: 500"
                        value={formMateriaPrima === '' ? '' : formMateriaPrima}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormMateriaPrima(val === '' ? '' : Math.max(0, parseInt(val) || 0));
                        }}
                        onFocus={() => {
                          if (formMateriaPrima === 0) {
                            setFormMateriaPrima('');
                          }
                        }}
                        className="w-full h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3 focus:outline-none focus:border-[#00624C] placeholder-zinc-600 font-mono text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">Observação</label>
                        <span className="text-[9px] text-zinc-600 font-mono">{formObservacao.length}/150</span>
                      </div>
                      <input 
                        type="text"
                        maxLength={150}
                        placeholder="Ex: Treinamento / Parada"
                        value={formObservacao}
                        onChange={(e) => setFormObservacao(e.target.value)}
                        className="w-full h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3 focus:outline-none focus:border-[#00624C] placeholder-zinc-600 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setConfirmaMateriaPrima(!confirmaMateriaPrima)}
                    className={`p-2 rounded border h-10 w-10 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                      confirmaMateriaPrima 
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                    }`}
                    title={confirmaMateriaPrima ? "Desbloquear Campo (Matéria-Prima)" : "Confirmar e Travar Campo (Matéria-Prima)"}
                  >
                    <Check size={16} className={confirmaMateriaPrima ? "scale-110" : ""} />
                  </button>
                </div>

                {/* 6. Compact Regime de Hora Extra Toggle Section */}
                <div className="bg-zinc-900/30 px-3 py-2 border border-zinc-800 rounded flex justify-between items-center">
                  <div>
                    <span className="font-bold text-zinc-300 text-[11px] block">Regime de Hora Extra?</span>
                    <span className="text-[9px] text-zinc-500 font-mono">Determina se o tempo conta como HE</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormHoraExtra(!formHoraExtra)}
                    className={`px-3 h-8 rounded font-bold font-mono uppercase transition-all flex items-center justify-center gap-1 cursor-pointer text-[10px] ${
                      formHoraExtra 
                        ? 'bg-[#00624C] text-white shadow-md shadow-[#00624C]/20' 
                        : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                    }`}
                  >
                    {formHoraExtra ? <Check size={12} /> : null}
                    {formHoraExtra ? 'SIM (S)' : 'NÃO (N)'}
                  </button>
                </div>

              </div>

              {/* 7. Enlarged Bottom Action Buttons (Thick, tall touch targets on mobile) */}
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-zinc-900/40">
                <button 
                  type="button"
                  onClick={retomarScanner}
                  className="h-14 text-sm font-mono font-bold uppercase text-zinc-400 hover:text-white rounded-lg border border-zinc-800 bg-transparent cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <XCircle size={16} />
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleSalvarCenarioA}
                  disabled={isSaving || !(confirmaOperadora && confirmaOperacao && confirmaLote && confirmaLado && confirmaTipoMaquina && confirmaMateriaPrima)}
                  className="h-14 text-sm font-mono font-bold uppercase text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-emerald-600/10 cursor-pointer transition-all flex items-center justify-center gap-2 text-center"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}
                  {!(confirmaOperadora && confirmaOperacao && confirmaLote && confirmaLado && confirmaTipoMaquina && confirmaMateriaPrima)
                    ? "Confirme Todos os Campos"
                    : "Iniciar Processo"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeSession && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-white/30 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4 shadow-2xl scrollbar-thin my-auto"
            >
              {/* Informações Atuais de Leitura (READ-ONLY) */}
              <div className="space-y-3 bg-zinc-900/40 p-4 rounded-lg border border-white/30 font-mono text-[11px] text-zinc-400">
                {/* Linha de Cabeçalho (Manutenção e Código) */}
                <div className="flex justify-between items-center border-b border-white/20 pb-3 mb-1">
                  <span className="text-neutral-500 font-mono text-[9px] font-bold">COD: {activeSession.codigo_manual_curto}</span>
                  <div className="flex items-center gap-3">
                    {!showQualidadeForm && !showManutencaoForm && (
                      <button 
                        onClick={() => setShowManutencaoForm(true)}
                        className="bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-400 font-mono font-bold text-[9px] px-2.5 py-1.5 rounded uppercase transition-colors cursor-pointer"
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
                    <strong className="text-zinc-100 font-bold text-xs">{activeSession.num_maquina}</strong>
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
                <div className="space-y-4 font-mono text-xs">
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
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white font-bold h-12 md:h-10 px-4 rounded text-[10px] font-mono uppercase tracking-widest transition-colors flex justify-center items-center gap-2 cursor-pointer w-full sm:w-auto"
                    >
                      Voltar
                    </button>
                    <button 
                      onClick={handleSalvarQualidade}
                      disabled={isSaving || (retrabalhoProprio === 0 && retrabalhoTerceiro === 0 && qualidadeRefugo === 0)}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black h-12 md:h-10 px-3 rounded text-[10px] font-mono uppercase tracking-widest shadow-lg shadow-amber-600/15 transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={14} /> : <AlertCircle size={14} />}
                      Salvar Ajuste de Qualidade
                    </button>
                  </div>
                </div>
              ) : showManutencaoForm ? (
                // FORMULÁRIO DE MANUTENÇÃO
                <div className="space-y-4 font-mono text-xs">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-rose-400 font-bold block">Descrever Problema da Máquina (Opcional)</label>
                      <span className="text-[10px] text-zinc-500 font-mono">{manutencaoDesc.length}/150</span>
                    </div>
                    <textarea 
                      maxLength={150}
                      rows={3}
                      placeholder="Descreva o problema ou ruído da máquina (máx 150 caracteres)..."
                      value={manutencaoDesc}
                      onChange={(e) => setManutencaoDesc(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 text-white rounded p-3 focus:outline-none focus:border-rose-500 placeholder-zinc-600 resize-none"
                    />
                  </div>
                  
                  <div className="flex flex-col gap-2.5 pt-4 border-t border-zinc-900">
                    <button 
                      onClick={handleConfirmarManutencao}
                      disabled={isSaving}
                      className="h-14 w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-mono font-bold uppercase rounded-lg shadow-lg shadow-rose-600/10 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={16} /> : <AlertCircle size={16} />}
                      CONFIRMAR CHAMADO DE MANUTENÇÃO
                    </button>
                    <button 
                      onClick={() => {
                        setShowManutencaoForm(false);
                        setManutencaoDesc('');
                      }}
                      className="h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono font-bold uppercase rounded-lg cursor-pointer flex justify-center items-center gap-2 w-full"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Inputs para digitação */}
                  <div className="space-y-4 font-mono text-xs">
                    
                    {/* Apontamento de Volumes (Grid de 3 Colunas: Conforme, Ret. Próprio, Ret. Terceiro) */}
                    <div className="space-y-3.5">
                      <span className="text-[10px] font-mono text-zinc-400 uppercase font-black tracking-wider block">
                        Apontamento de Volumes
                      </span>
                      
                      <div className="grid grid-cols-3 gap-2">
                        {/* Column 1: Conforme (Verde) */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-emerald-400 font-black uppercase tracking-wider block">Conforme *</label>
                          <div className="flex flex-col gap-1.5">
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              placeholder="Pçs" 
                              value={prodConforme}
                              onChange={(e) => setProdConforme(e.target.value === '' ? '' : Number(e.target.value))}
                              disabled={confirmaBProdConforme}
                              className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded px-2 text-xs font-mono text-white text-center focus:outline-none focus:border-emerald-500 disabled:opacity-50" 
                            />
                            <button 
                              type="button" 
                              onClick={() => setConfirmaBProdConforme(!confirmaBProdConforme)}
                              className={`w-full h-10 rounded border flex items-center justify-center font-bold text-xs cursor-pointer transition-all ${
                                confirmaBProdConforme 
                                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              <Check size={16} className={confirmaBProdConforme ? "scale-110" : ""} />
                            </button>
                          </div>
                        </div>

                        {/* Column 2: Retrabalho Próprio (Laranja) */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">Ret. Próprio</label>
                          <div className="flex flex-col gap-1.5">
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              placeholder="Próp." 
                              value={retrabalhoProprio}
                              onChange={(e) => setRetrabalhoProprio(e.target.value === '' ? '' : Number(e.target.value))}
                              disabled={confirmaBRetrabalhoProprio}
                              className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded px-2 text-xs font-mono text-white text-center focus:outline-none focus:border-amber-500 disabled:opacity-50" 
                            />
                            <button 
                              type="button" 
                              onClick={() => setConfirmaBRetrabalhoProprio(!confirmaBRetrabalhoProprio)}
                              className={`w-full h-10 rounded border flex items-center justify-center font-bold text-xs cursor-pointer transition-all ${
                                confirmaBRetrabalhoProprio 
                                  ? 'bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-600/20' 
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              <Check size={16} className={confirmaBRetrabalhoProprio ? "scale-110" : ""} />
                            </button>
                          </div>
                        </div>

                        {/* Column 3: Retrabalho Terceiro (Laranja) */}
                        <div className="space-y-1">
                          <label className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">Ret. Terc.</label>
                          <div className="flex flex-col gap-1.5">
                            <input 
                              type="text" 
                              inputMode="numeric" 
                              pattern="[0-9]*" 
                              placeholder="Terc." 
                              value={retrabalhoTerceiro}
                              onChange={(e) => setRetrabalhoTerceiro(e.target.value === '' ? '' : Number(e.target.value))}
                              disabled={confirmaBRetrabalhoTerceiro}
                              className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded px-2 text-xs font-mono text-white text-center focus:outline-none focus:border-amber-500 disabled:opacity-50" 
                            />
                            <button 
                              type="button" 
                              onClick={() => setConfirmaBRetrabalhoTerceiro(!confirmaBRetrabalhoTerceiro)}
                              className={`w-full h-10 rounded border flex items-center justify-center font-bold text-xs cursor-pointer transition-all ${
                                confirmaBRetrabalhoTerceiro 
                                  ? 'bg-amber-600 border-amber-500 text-white shadow-md shadow-amber-600/20' 
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              <Check size={16} className={confirmaBRetrabalhoTerceiro ? "scale-110" : ""} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Lado (Dropdown) */}
                    <div className="flex items-center justify-between bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-900/60">
                      <span className="text-[10px] font-mono text-zinc-300 uppercase font-black tracking-wider">Lado de Produção:</span>
                      <div className="flex items-center gap-2">
                        <select 
                          disabled={confirmaBLado}
                          value={cenarioBLado} 
                          onChange={(e) => setCenarioBLado(e.target.value as any)}
                          className="h-10 bg-zinc-900 border border-zinc-800 text-white text-xs font-mono font-bold rounded px-2 focus:outline-none focus:border-[#00624C] disabled:opacity-50"
                        >
                          <option value="Único">Único</option>
                          <option value="Esquerdo">Esquerdo</option>
                          <option value="Direito">Direito</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setConfirmaBLado(!confirmaBLado)}
                          className={`h-10 w-10 rounded border flex items-center justify-center font-bold text-xs cursor-pointer transition-all shrink-0 ${
                            confirmaBLado 
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                          }`}
                          title={confirmaBLado ? "Desbloquear Lado" : "Confirmar Lado"}
                        >
                          <Check size={16} className={confirmaBLado ? "scale-110" : ""} />
                        </button>
                      </div>
                    </div>

                    {/* Observação (Justificativa) */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block font-black">
                        OBSERVAÇÃO (JUSTIFICATIVA)
                      </label>
                      <textarea 
                        maxLength={150}
                        rows={2}
                        placeholder="Ex: Treinamento ou justificativa de parada..."
                        value={cenarioBObservacao}
                        onChange={(e) => setCenarioBObservacao(e.target.value)}
                        className="w-full h-16 bg-zinc-900 border border-zinc-800 rounded p-2.5 text-xs text-white focus:outline-none focus:border-[#00624C] resize-none font-mono placeholder-zinc-600"
                      />
                    </div>

                  </div>

                  {/* Botões do Form (Exatamente como o print) */}
                  <div className="flex flex-col gap-2.5 pt-3 border-t border-zinc-900/40 font-mono">
                    {/* Botão Principal Verde em Cima */}
                    <button 
                      onClick={() => handleSalvarCenarioB(false)}
                      disabled={isSaving || !isBValid}
                      className="h-14 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-mono font-bold uppercase rounded-lg shadow-lg shadow-emerald-600/10 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                      {!isBValid
                        ? "CONFIRME TODOS OS CAMPOS"
                        : "💾 SALVAR E CONTINUAR"}
                    </button>

                    {/* Duas colunas embaixo */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <button 
                        onClick={() => handleSalvarCenarioB(true)}
                        disabled={isSaving || !isBValid}
                        className="h-12 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono font-bold uppercase rounded-lg cursor-pointer flex items-center justify-center disabled:opacity-50"
                        title="Fecha o lote atual e abre o form para configurar um novo processo/operadora para esta máquina"
                      >
                        MUDAR PROCESSO
                      </button>

                      <button 
                        onClick={handleFinalizarProcessoClick}
                        disabled={isSaving || !isBValid}
                        className="h-12 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold uppercase rounded-lg cursor-pointer flex items-center justify-center disabled:opacity-50"
                        title="Finaliza o lote atual gravando a contagem e encerra o processo de vez nesta máquina"
                      >
                        FINALIZAR
                      </button>
                    </div>
                  </div>
                </>
              )}
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
              <div className="flex flex-col items-center gap-3">
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
                
                <h4 className={`font-mono text-xs uppercase tracking-widest font-black ${
                  customAlert.type === 'success' ? 'text-emerald-400' :
                  customAlert.type === 'warning' ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {customAlert.type === 'success' ? 'SUCESSO REALIZADO' :
                   customAlert.type === 'warning' ? 'AVISO / ATENÇÃO' : 'FALHA REJEITADA'}
                </h4>
                
                <p className="text-zinc-300 font-mono text-xs leading-relaxed uppercase">
                  {customAlert.message}
                </p>
              </div>

              <button
                onClick={() => setCustomAlert(null)}
                className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded text-[10px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
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
                
                <h4 className="font-mono text-sm uppercase tracking-widest font-black text-rose-500">
                  ATENÇÃO: ALERTA DE TURNO ATIVO
                </h4>
                
                <p className="text-zinc-300 font-mono text-xs leading-relaxed uppercase">
                  Atenção: O turno ainda não encerrou. Descreva o motivo da finalização antecipada:
                </p>

                <div className="w-full text-left space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                    <span>Justificativa</span>
                    <span>{justificativaMotivo.length}/150</span>
                  </div>
                  <textarea
                    maxLength={150}
                    rows={3}
                    placeholder="Descreva aqui o motivo detalhado (máx 150 caracteres)..."
                    value={justificativaMotivo}
                    onChange={(e) => setJustificativaMotivo(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded p-3 text-xs focus:outline-none focus:border-rose-500 placeholder-zinc-600 resize-none font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowJustificativaModal(false);
                    setJustificativaMotivo('');
                  }}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded text-[10px] font-mono font-bold uppercase tracking-widest transition-colors cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConfirmarFinalizacaoAntecipada}
                  disabled={isSaving || !justificativaMotivo.trim()}
                  className="flex-1 py-2.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-[10px] font-mono font-black uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-50"
                >
                  Confirmar Finalização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
