import React, { useState, useEffect, useRef } from 'react';
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
  Play
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

export default function ScannerCaixas() {
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
  const [activeSession, setActiveSession] = useState<any | null>(null); // Se houver, abre Cenário B
  const [showScenarioA, setShowScenarioA] = useState(false); // Abre Cenário A (Formulário Completo)
  const [scannedTarget, setScannedTarget] = useState(''); // num_maquina ou código escaneado

  // Campos do Formulário - Cenário A (Novo Início de Processo)
  const [formMaquina, setFormMaquina] = useState('');
  const [formCodigoCurto, setFormCodigoCurto] = useState('');
  const [formOperadora, setFormOperadora] = useState('');
  const [formOperacao, setFormOperacao] = useState('');
  const [formLote, setFormLote] = useState('');
  const [formLado, setFormLado] = useState<'Esquerdo' | 'Direito' | 'Único'>('Único');
  const [formTipoMaquina, setFormTipoMaquina] = useState('');
  const [formHoraExtra, setFormHoraExtra] = useState<boolean>(false); // toggle que salva 's' ou 'n'
  const [formMateriaPrima, setFormMateriaPrima] = useState<number | ''>(0);

  // Estados de Confirmação Individual de Segurança (Cenário A)
  const [confirmaOperadora, setConfirmaOperadora] = useState(false);
  const [confirmaOperacao, setConfirmaOperacao] = useState(false);
  const [confirmaLote, setConfirmaLote] = useState(false);
  const [confirmaLado, setConfirmaLado] = useState(false);
  const [confirmaTipoMaquina, setConfirmaTipoMaquina] = useState(false);
  const [confirmaMateriaPrima, setConfirmaMateriaPrima] = useState(false);

  // Estado do Lado no Apontamento (Cenário B - Editável)
  const [cenarioBLado, setCenarioBLado] = useState<'Esquerdo' | 'Direito' | 'Único'>('Único');

  // Campo Observação em ambos os modais (limite de 150 caracteres)
  const [formObservacao, setFormObservacao] = useState('');
  const [cenarioBObservacao, setCenarioBObservacao] = useState('');

  // Estados de Confirmação Individual de Segurança (Cenário B)
  const [confirmaBProdConforme, setConfirmaBProdConforme] = useState(false);
  const [confirmaBLado, setConfirmaBLado] = useState(false);
  const [confirmaBRetrabalhoProprio, setConfirmaBRetrabalhoProprio] = useState(false);
  const [confirmaBRetrabalhoTerceiro, setConfirmaBRetrabalhoTerceiro] = useState(false);
  const [confirmaBMotivoOcorrencia, setConfirmaBMotivoOcorrencia] = useState(false);
  const [confirmaBObservacao, setConfirmaBObservacao] = useState(false);

  // Resetar confirmações ao carregar formulário Cenário A
  useEffect(() => {
    if (showScenarioA) {
      setConfirmaOperadora(false);
      setConfirmaOperacao(false);
      setConfirmaLote(false);
      setConfirmaLado(false);
      setConfirmaTipoMaquina(false);
      setConfirmaMateriaPrima(false);
      setFormObservacao('');
    }
  }, [showScenarioA]);

  // Sincronizar lado da sessão ativa para o estado editável do Cenário B e resetar confirmações
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
  
  // Autocomplete de Operações e Operadoras
  const [listaOperacoes, setListaOperacoes] = useState<string[]>([]);
  const [showOperacaoSuggestions, setShowOperacaoSuggestions] = useState(false);
  const [listaOperadoras, setListaOperadoras] = useState<string[]>([]);
  const [showOperadoraSuggestions, setShowOperadoraSuggestions] = useState(false);

  useEffect(() => {
    async function carregarAuxiliares() {
      try {
        const { data, error } = await supabase
          .schema('public')
          .from('costureiras_funcoes')
          .select('operacao_nome, operadora_nome');
        if (!error && data) {
          const distinctOps = Array.from(new Set(data.map((item: any) => item.operacao_nome).filter(Boolean)));
          const distinctOpe = Array.from(new Set(data.map((item: any) => item.operadora_nome).filter(Boolean)));
          setListaOperacoes(distinctOps as string[]);
          setListaOperadoras(distinctOpe as string[]);
        }
      } catch (err) {
        console.error('Erro ao carregar dados auxiliares:', err);
      }
    }
    carregarAuxiliares();
  }, []);
  
  // Campos do Formulário - Cenário B (Apontamento de Produção de Sessão Ativa)
  const [prodConforme, setProdConforme] = useState<number | ''>('');
  const [retrabalhoProprio, setRetrabalhoProprio] = useState<number>(0);
  const [retrabalhoTerceiro, setRetrabalhoTerceiro] = useState<number>(0);
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

  // Busca histórico de registros de produção teste salvos hoje
  async function carregarBaseDeDados() {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .schema('AtlasApontamento')
        .from('registros_producao_terminal')
        .select('*');

      if (error) throw error;

      if (data) {
        // Ordena para exibir o mais recente no topo
        const sorted = [...data].sort((a: any, b: any) => new Date(b.horario_termino).getTime() - new Date(a.horario_termino).getTime());
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

    playBeep();

    // Pausa a câmera durante o fluxo de modais
    if (scannerRef.current && scannerRef.current.getState() === 2) {
      scannerRef.current.pause(true);
    }
    setIsScanning(false);

    try {
      // 0. Consulta as sessões offline salvas em memória
      let sessaoEncontrada = offlineSessoes.find(s => s.num_maquina === codigo || s.codigo_manual_curto === codigo);

      if (!sessaoEncontrada) {
        // 1. Consulta a tabela de sessões ativas procurando por num_maquina ou codigo_manual_curto
        const { data: sessoes, error } = await supabase
          .schema('AtlasApontamento')
          .from('sessoes_ativas_terminal')
          .select('*')
          .eq('num_maquina', codigo);

        if (error) throw error;

        sessaoEncontrada = sessoes && sessoes.length > 0 ? sessoes[0] : null;

        if (!sessaoEncontrada) {
          // Tenta buscar por codigo_manual_curto se não achar por num_maquina
          const { data: sessoesCurto, error: errCurto } = await supabase
            .schema('AtlasApontamento')
            .from('sessoes_ativas_terminal')
            .select('*')
            .eq('codigo_manual_curto', codigo);
          
          if (!errCurto && sessoesCurto && sessoesCurto.length > 0) {
            sessaoEncontrada = sessoesCurto[0];
          }
        }
      }

      if (sessaoEncontrada) {
        // CASO JÁ EXISTA UMA SESSÃO ATIVA (Cenário B)
        setActiveSession(sessaoEncontrada);
        setProdConforme('');
        setRetrabalhoProprio(0);
        setRetrabalhoTerceiro(0);
        setQualidadeRefugo(0);
        setShowQualidadeForm(false);
        setMotivoOcorrencia('Produção Normal');
      } else {
        // CASO NÃO EXISTA SESSÃO ATIVA (Cenário A)
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

  const retomarScanner = () => {
    setActiveSession(null);
    setShowScenarioA(false);
    setShowQualidadeForm(false);
    setIsScanning(true);
    isProcessingScan.current = false;
    if (scannerRef.current && scannerRef.current.getState() === 3) {
      scannerRef.current.resume();
    }
  };

  // ==========================================
  // SALVAR CENÁRIO A: INÍCIO DE NOVO PROCESSO
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
    const horarioInicio = new Date().toTimeString().split(' ')[0];
    const userObj = getLocalSessionUser() as any;
    const userId = userObj?.id || userObj?.uid;

    const novaSessao = {
      num_maquina: formMaquina.toUpperCase(),
      codigo_manual_curto: formCodigoCurto,
      operadora_nome: formOperadora.trim().toUpperCase(),
      operacao_nome: formOperacao.trim().toUpperCase(),
      lote: formLote.trim().toUpperCase(),
      lado: formLado,
      tipo_maquina: formTipoMaquina.trim().toUpperCase(),
      hora_extra: formHoraExtra ? 's' : 'n',
      horario_inicio: horarioInicio,
      user_id: userId,
      materia_prima_inicial: Number(formMateriaPrima) || 0,
      observacao: formObservacao.trim()
    };

    try {
      const { error } = await supabase
        .schema('AtlasApontamento')
        .from('sessoes_ativas_terminal')
        .insert([novaSessao]);

      if (error) throw error;

      showAlert('success', `Sessão do terminal iniciada com sucesso real para a máquina ${novaSessao.num_maquina}!`);
      retomarScanner();
      await carregarBaseDeDados();
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao criar sessão ativa:', err);
      // Fallback in-memory session activation
      const fallbackSessao = {
        ...novaSessao,
        id: 'offline-' + Math.random().toString(36).substring(2, 9),
        offline: true
      };
      setOfflineSessoes(prev => [...prev, fallbackSessao]);
      showAlert('warning', `Erro de conexão! Sessão iniciada temporariamente offline (em memória) para a máquina ${novaSessao.num_maquina}.`);
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
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao gravar ajuste de qualidade:', err);
      // Fallback in-memory record saving
      const fallbackQualidade = {
        ...novaQualidadeRegistro,
        id: 'offline-qualidade-' + Math.random().toString(36).substring(2, 9),
        offline: true
      };
      setHistoricoHoje(prev => [fallbackQualidade, ...prev]);
      showAlert('warning', `Erro de conexão! Ajuste de qualidade lançado offline na máquina ${activeSession.num_maquina}.`);
      retomarScanner();
    } finally {
      setIsSaving(false);
    }
  };

  // ==========================================
  // SALVAR CENÁRIO B: APONTAMENTO DE PRODUÇÃO
  // ==========================================
  const handleSalvarCenarioB = async (mudarProcesso: boolean = false) => {
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
      horario_inicio: formatToTimeString(activeSession.horario_inicio),
      horario_termino: horarioTermino,
      producao_conforme: isConformeEmpty ? null : Number(prodConforme),
      retrabalho_proprio: Number(retrabalhoProprio) || 0,
      retrabalho_terceiro: Number(retrabalhoTerceiro) || 0,
      refugo: 0,
      motivo_ocorrencia: 'Produção Normal',
      user_id: userId,
      materia_prima_inicial: Number(activeSession.materia_prima_inicial) || 0,
      observacao: cenarioBObservacao.trim()
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

      // 3. Verifica fluxo: Mudar Processo ou Recriação Automática
      if (!mudarProcesso) {
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
          materia_prima_inicial: Number(activeSession.materia_prima_inicial) || 0
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
    } catch (err: any) {
      console.error('[Terminal Supabase] Erro ao processar apontamento:', err);
      
      // Fallback in-memory record saving
      const fallbackRegistro = {
        ...novoRegistroDefinitivo,
        id: 'offline-registro-' + Math.random().toString(36).substring(2, 9),
        offline: true
      };
      setHistoricoHoje(prev => [fallbackRegistro, ...prev]);

      // Remove from offlineSessoes in-memory if it was an offline session
      setOfflineSessoes(prev => prev.filter(s => s.id !== activeSession.id));

      if (!mudarProcesso) {
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
        showAlert('warning', `Erro de conexão! Apontamento salvo offline (em memória). Próximo ciclo iniciado na máquina ${activeSession.num_maquina}.`);
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

        showAlert('warning', `Erro de conexão! Apontamento salvo offline. Prossiga configurando o novo processo para a máquina ${maquinaAtual}.`);
        setShowScenarioA(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 overflow-y-auto" id="terminal-mobile-view">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold uppercase tracking-[0.15em] text-[#00624C] flex items-center gap-2">
            <ScanLine size={24} className="text-[#00624C]" /> TERMINAL MOBILE DE APONTAMENTO
          </h2>
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mt-1">
            LEITURA DE QR CODE DE MÁQUINAS E APONTAMENTOS DE PRODUÇÃO EM TEMPO REAL
          </p>
        </div>

        <button
          onClick={carregarBaseDeDados}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors"
        >
          <RefreshCw size={12} /> Sincronizar Logs
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LADO ESQUERDO: SCANNER DE QR CODE DE MAQUINA */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-5 md:p-6 relative overflow-hidden">
            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-mono uppercase tracking-widest font-bold text-zinc-400 block">
                ESCANEIE O QR CODE DA MÁQUINA OU PROCESSO
              </span>

              <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center @container">
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
              <div className="pt-4 border-t border-zinc-900 mt-2 space-y-3">
                <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-zinc-500 block">
                  PAINEL DE SIMULAÇÃO: INSERIR MÁQUINA / SESSÃO
                </span>
                
                <form onSubmit={simularCodigoManual} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Número da Máquina ou Código Curto (ex: MQ-01)"
                    value={manualCodeInput}
                    onChange={(e) => setManualCodeInput(e.target.value)}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00624C]"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingSessao}
                    className="px-4 py-1.5 bg-[#00624C] hover:bg-[#004838] text-white rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors"
                  >
                    {isSearchingSessao ? <Loader2 className="animate-spin" size={12} /> : 'Processar'}
                  </button>
                </form>

                <div className="flex flex-col gap-2 bg-zinc-900/30 p-2.5 border border-zinc-900 rounded">
                  <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase">Simular com Atalhos Rápidos:</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => processarTextoQR('MQ-01')}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-mono rounded cursor-pointer text-zinc-300"
                    >
                      Sessão MQ-01 (Cenário B)
                    </button>
                    <button
                      onClick={() => processarTextoQR('MQ-02')}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-mono rounded cursor-pointer text-zinc-300"
                    >
                      Sessão MQ-02 (Cenário B)
                    </button>
                    <button
                      onClick={() => processarTextoQR('MQ-03')}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[9px] font-mono rounded cursor-pointer text-zinc-300"
                    >
                      Nova Máquina MQ-03 (Cenário A)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* LADO DIREITO: HISTÓRICO DE APONTAMENTOS DE HOJE */}
        <div className="lg:col-span-7 flex flex-col">
          
          <div className="border border-zinc-900 rounded-xl bg-zinc-950/40 p-5 md:p-6 flex flex-col h-full min-h-[450px]">
            <div className="flex items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-900">
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
                <div className="text-center py-16 text-zinc-600 font-mono text-xs uppercase tracking-widest border border-dashed border-zinc-900 rounded-lg">
                  Nenhum apontamento finalizado hoje neste terminal.
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoHoje.map((registro, idx) => (
                    <div 
                      key={registro.id || idx} 
                      className="bg-[#af1e59]/16 border border-[#af1e59]/25 p-4 rounded-lg hover:border-[#af1e59]/40 transition-colors space-y-3"
                    >
                      {/* Header do Log */}
                      <div className="flex items-center justify-between border-b border-zinc-900/40 pb-2">
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
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 border-t border-zinc-900/20 text-[10px] font-mono gap-2">
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
      // CENÁRIO A: FORMULÁRIO COMPLETO - NOVO PROCESSO
      {/* ======================================================= */}
      <AnimatePresence>
        {showScenarioA && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-zinc-900 rounded-xl w-full max-w-lg p-5 md:p-6 space-y-6 shadow-2xl"
            >
              {/* Header do Form */}
              <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
                <div className="flex items-center gap-2">
                  <Layers className="text-[#00624C]" size={20} />
                  <div>
                    <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                      Inicializar Terminal (Cenário A)
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
              <div className="space-y-4 font-mono text-xs">
                
                {/* ID de Máquina e Código Curto */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-900/50 p-3.5 rounded border border-zinc-900">
                  <div>
                    <label className="text-zinc-500 text-[8px] uppercase tracking-widest font-bold block mb-1">Máquina Alvo</label>
                    <strong className="text-white text-sm font-bold block">{formMaquina}</strong>
                  </div>
                  <div>
                    <label className="text-[#00624C] text-[8px] uppercase tracking-widest font-bold block mb-1">Cód. Curto Gerado</label>
                    <strong className="text-zinc-300 text-sm font-black tracking-widest block">{formCodigoCurto}</strong>
                  </div>
                </div>

                {/* Nome da Operadora */}
                <div className="space-y-1 relative">
                  <label className="text-zinc-400 font-bold block">Nome da Operadora <span className="text-[#00624C]">*</span></label>
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
                      className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600 font-bold"
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
                      className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
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

                {/* Nome da Operação e Lote */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1 relative">
                    <label className="text-zinc-400 font-bold block">Nome da Operação <span className="text-[#00624C]">*</span></label>
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
                        className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600"
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
                        className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                          confirmaOperacao 
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                        title={confirmaOperacao ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                      >
                        <Check size={16} className={confirmaOperacao ? "scale-110" : ""} />
                      </button>
                    </div>
                    {showOperacaoSuggestions && listaOperacoes.filter(op => op.toLowerCase().includes(formOperacao.toLowerCase())).length > 0 && (
                      <div className="absolute left-0 right-0 bg-zinc-950 border border-zinc-800 rounded mt-1 max-h-40 overflow-y-auto z-50 shadow-2xl">
                        {listaOperacoes.filter(op => op.toLowerCase().includes(formOperacao.toLowerCase())).map((op, opIdx) => (
                          <div
                            key={opIdx}
                            onMouseDown={() => {
                              if (!confirmaOperacao) {
                                setFormOperacao(op);
                                setShowOperacaoSuggestions(false);
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
                  <div className="space-y-1">
                    <label className="text-zinc-400 font-bold block">Lote de Produção <span className="text-[#00624C]">*</span></label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        required
                        disabled={confirmaLote}
                        placeholder="Ex: L-205"
                        value={formLote}
                        onChange={(e) => setFormLote(e.target.value)}
                        className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!formLote.trim()) {
                            showAlert('warning', "Por favor, preencha o Lote antes de confirmar.");
                            return;
                          }
                          setConfirmaLote(!confirmaLote);
                        }}
                        className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                          confirmaLote 
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                        title={confirmaLote ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                      >
                        <Check size={16} className={confirmaLote ? "scale-110" : ""} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lado, Tipo Máquina */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-zinc-400 font-bold block">Lado</label>
                    <div className="flex gap-2">
                      <select 
                        disabled={confirmaLado}
                        value={formLado} 
                        onChange={(e) => setFormLado(e.target.value as any)}
                        className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] font-bold"
                      >
                        <option value="Único">Único</option>
                        <option value="Esquerdo">Esquerdo</option>
                        <option value="Direito">Direito</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmaLado(!confirmaLado);
                        }}
                        className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                          confirmaLado 
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                        title={confirmaLado ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                      >
                        <Check size={16} className={confirmaLado ? "scale-110" : ""} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-zinc-400 font-bold block">Tipo de Máquina <span className="text-[#00624C]">*</span></label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        required
                        disabled={confirmaTipoMaquina}
                        placeholder="Ex: RETALHADORA"
                        value={formTipoMaquina}
                        onChange={(e) => setFormTipoMaquina(e.target.value)}
                        className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] uppercase placeholder-zinc-600"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!formTipoMaquina.trim()) {
                            showAlert('warning', "Por favor, preencha o Tipo de Máquina antes de confirmar.");
                            return;
                          }
                          setConfirmaTipoMaquina(!confirmaTipoMaquina);
                        }}
                        className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                          confirmaTipoMaquina 
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                        title={confirmaTipoMaquina ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                      >
                        <Check size={16} className={confirmaTipoMaquina ? "scale-110" : ""} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Matéria-Prima Alimentada */}
                <div className="space-y-1">
                  <label className="text-zinc-400 font-bold block">Matéria-Prima Alimentada <span className="text-[#00624C]">*</span></label>
                  <div className="flex gap-2">
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
                      className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 disabled:opacity-50 disabled:bg-zinc-900/35 disabled:border-emerald-600/30 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] placeholder-zinc-600 font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmaMateriaPrima(!confirmaMateriaPrima);
                      }}
                      className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                        confirmaMateriaPrima 
                          ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={confirmaMateriaPrima ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                    >
                      <Check size={16} className={confirmaMateriaPrima ? "scale-110" : ""} />
                    </button>
                  </div>
                </div>

                {/* Observação (Opcional, máx 150 caracteres) */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-zinc-400 font-bold block">Observação (Justificativa de Parada / Treinamento)</label>
                    <span className="text-[10px] text-zinc-500 font-mono">{formObservacao.length}/150</span>
                  </div>
                  <input 
                    type="text"
                    maxLength={150}
                    placeholder="Ex: Treinamento ou justificativa de parada (máx 150 caracteres)"
                    value={formObservacao}
                    onChange={(e) => setFormObservacao(e.target.value)}
                    className="w-full h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] placeholder-zinc-600"
                  />
                </div>

                {/* Hora Extra (Toggle) */}
                <div className="bg-zinc-900/30 p-3.5 border border-zinc-900 rounded flex justify-between items-center">
                  <div>
                    <span className="font-bold text-white block">Regime de Hora Extra?</span>
                    <span className="text-[10px] text-zinc-500">Determina se o tempo conta como HE</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormHoraExtra(!formHoraExtra)}
                    className={`px-4 h-10 md:h-8 rounded font-bold uppercase transition-all flex items-center justify-center gap-1 cursor-pointer text-[10px] ${
                      formHoraExtra 
                        ? 'bg-[#00624C] text-white shadow-lg shadow-[#00624C]/15' 
                        : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                    }`}
                  >
                    {formHoraExtra ? <Check size={12} /> : null}
                    {formHoraExtra ? 'SIM (S)' : 'NÃO (N)'}
                  </button>
                </div>

              </div>

              {/* Botões do Form */}
              <div className="flex flex-col sm:flex-row gap-3 border-t border-zinc-900 pt-4">
                <button 
                  onClick={retomarScanner}
                  className="flex-1 h-12 md:h-10 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white font-bold rounded text-[10px] font-mono uppercase tracking-widest transition-colors flex justify-center items-center gap-2 cursor-pointer"
                >
                  <XCircle size={14} /> Cancelar
                </button>
                <button 
                  onClick={handleSalvarCenarioA}
                  disabled={isSaving || !(confirmaOperadora && confirmaOperacao && confirmaLote && confirmaLado && confirmaTipoMaquina && confirmaMateriaPrima)}
                  className="flex-1 h-12 md:h-10 bg-[#00624C] hover:bg-[#004838] text-white font-bold rounded text-[10px] font-mono uppercase tracking-widest shadow-lg shadow-[#00624C]/15 transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                  {!(confirmaOperadora && confirmaOperacao && confirmaLote && confirmaLado && confirmaTipoMaquina && confirmaMateriaPrima)
                    ? "CONFIRME TODOS OS CAMPOS"
                    : "Iniciar Processo"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================= */}
      // CENÁRIO B: APONTAMENTO DE PRODUÇÃO - APONTADORA DIGITA
      {/* ======================================================= */}
      <AnimatePresence>
        {activeSession && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-zinc-950 border border-zinc-900 rounded-xl w-full max-w-xl p-5 md:p-6 space-y-6 shadow-2xl"
            >
              {/* Header do Form */}
              <div className="flex justify-between items-center border-b border-zinc-900 pb-4">
                <div className="flex items-center gap-2">
                  <ClipboardList className="text-[#00624C]" size={20} />
                  <div>
                    <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-white">
                      Apontar Lote de Produção (Cenário B)
                    </h3>
                    <p className="text-zinc-500 text-[9px] font-mono uppercase tracking-widest mt-0.5">
                      Contagem de peças para a Máquina {activeSession.num_maquina} | COD: {activeSession.codigo_manual_curto}
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

              {/* Informações Atuais de Leitura (READ-ONLY) */}
              <div className="space-y-3 bg-zinc-900/40 p-4 rounded-lg border border-zinc-900/60 font-mono text-[11px] text-zinc-400">
                <div className="flex justify-between items-center border-b border-zinc-900/40 pb-2 mb-2">
                  <span className="text-[#00624C] text-[9px] font-bold uppercase tracking-widest">Processo Ativo Atualmente</span>
                  <div className="flex gap-2">
                    {!showQualidadeForm && (
                      <button 
                        onClick={() => setShowQualidadeForm(true)}
                        className="text-[9px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30 transition-colors"
                      >
                        Lançar Ajuste (Qualidade)
                      </button>
                    )}
                    <span className="text-zinc-500 text-[9px] font-bold ml-1">CÓD: {activeSession.codigo_manual_curto}</span>
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
              ) : (
                <>
                  {/* Inputs para digitação */}
                  <div className="space-y-4 font-mono text-xs">
                    
                    {/* Quantidade Conforme */}
                    <div className="space-y-1.5">
                      <label className="text-white font-black text-sm block">
                        Quantidade Conforme Produzida
                      </label>
                      <div className="flex gap-2">
                        <input 
                          type="number"
                          disabled={confirmaBProdConforme}
                          min="0"
                          placeholder="Digite o número de peças conformes (ou deixe vazio se retrabalho)"
                          value={prodConforme}
                          onChange={(e) => setProdConforme(e.target.value === '' ? '' : Number(e.target.value))}
                          className="flex-1 h-14 bg-zinc-900 border-2 border-zinc-800 focus:border-[#00624C] text-white text-base font-black rounded px-4 focus:outline-none disabled:opacity-50 disabled:bg-zinc-900/30 disabled:border-emerald-600/30"
                        />
                        <button
                          type="button"
                          onClick={() => setConfirmaBProdConforme(!confirmaBProdConforme)}
                          className={`p-2.5 rounded border h-14 w-14 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                            confirmaBProdConforme 
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                          }`}
                          title={confirmaBProdConforme ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                        >
                          <Check size={20} className={confirmaBProdConforme ? "scale-110" : ""} />
                        </button>
                      </div>
                      <p className="text-[9px] text-zinc-500">Mapeia diretamente para a coluna producao_conforme. Deixe vazio para apenas lançar retrabalho.</p>
                    </div>

                    {/* Lado (Dropdown: Esquerdo, Direito, Único) 100% editável e destravado */}
                    <div className="space-y-1.5">
                      <label className="text-zinc-400 font-bold block">
                        Lado de Produção <span className="text-[#00624C]">*</span>
                      </label>
                      <div className="flex gap-2">
                        <select 
                          disabled={confirmaBLado}
                          value={cenarioBLado} 
                          onChange={(e) => setCenarioBLado(e.target.value as any)}
                          className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] font-bold disabled:opacity-50 disabled:bg-zinc-900/30 disabled:border-emerald-600/30"
                        >
                          <option value="Único">Único</option>
                          <option value="Esquerdo">Esquerdo</option>
                          <option value="Direito">Direito</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setConfirmaBLado(!confirmaBLado)}
                          className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                            confirmaBLado 
                              ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                              : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                          }`}
                          title={confirmaBLado ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                        >
                          <Check size={16} className={confirmaBLado ? "scale-110" : ""} />
                        </button>
                      </div>
                      <p className="text-[9px] text-zinc-500">Mude o lado conforme a contagem de peças realizada</p>
                    </div>

                    {/* Retrabalhos Opcionais */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-bold block">Retrabalho Próprio</label>
                        <div className="flex gap-2">
                          <input 
                            type="number"
                            min="0"
                            disabled={confirmaBRetrabalhoProprio}
                            value={retrabalhoProprio}
                            onChange={(e) => setRetrabalhoProprio(Number(e.target.value))}
                            className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3 focus:outline-none focus:border-[#00624C] text-center disabled:opacity-50 disabled:bg-zinc-900/30 disabled:border-emerald-600/30"
                          />
                          <button
                            type="button"
                            onClick={() => setConfirmaBRetrabalhoProprio(!confirmaBRetrabalhoProprio)}
                            className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                              confirmaBRetrabalhoProprio 
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                            }`}
                            title={confirmaBRetrabalhoProprio ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-bold block">Retrabalho Terceiro</label>
                        <div className="flex gap-2">
                          <input 
                            type="number"
                            min="0"
                            disabled={confirmaBRetrabalhoTerceiro}
                            value={retrabalhoTerceiro}
                            onChange={(e) => setRetrabalhoTerceiro(Number(e.target.value))}
                            className="flex-1 h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3 focus:outline-none focus:border-[#00624C] text-center disabled:opacity-50 disabled:bg-zinc-900/30 disabled:border-emerald-600/30"
                          />
                          <button
                            type="button"
                            onClick={() => setConfirmaBRetrabalhoTerceiro(!confirmaBRetrabalhoTerceiro)}
                            className={`p-2.5 rounded border h-12 md:h-10 w-12 flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                              confirmaBRetrabalhoTerceiro 
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-md shadow-emerald-600/20' 
                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                            }`}
                            title={confirmaBRetrabalhoTerceiro ? "Desbloquear Campo" : "Confirmar e Travar Campo"}
                          >
                            <Check size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Observação (Justificativa de Parada / Treinamento) */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-zinc-400 font-bold block">Observação (Justificativa de Parada / Treinamento)</label>
                        <span className="text-[10px] text-zinc-500 font-mono">{cenarioBObservacao.length}/150</span>
                      </div>
                      <input 
                        type="text"
                        maxLength={150}
                        placeholder="Ex: Treinamento ou justificativa de parada (máx 150 caracteres)"
                        value={cenarioBObservacao}
                        onChange={(e) => setCenarioBObservacao(e.target.value)}
                        className="w-full h-12 md:h-10 bg-zinc-900 border border-zinc-800 text-white rounded px-3.5 focus:outline-none focus:border-[#00624C] placeholder-zinc-600"
                      />
                    </div>

                  </div>

                  {/* Botões do Form */}
                  <div className="flex flex-col sm:flex-row gap-3 border-t border-zinc-900 pt-4">
                    
                    <button 
                      onClick={retomarScanner}
                      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white font-bold h-12 md:h-10 px-4 rounded text-[10px] font-mono uppercase tracking-widest transition-colors flex justify-center items-center gap-2 cursor-pointer w-full sm:w-auto"
                    >
                      <XCircle size={14} /> Cancelar
                    </button>

                    <div className="flex-1 flex flex-col sm:flex-row gap-3">
                      {/* Botão Salvar e Mudar Processo */}
                      <button 
                        onClick={() => handleSalvarCenarioB(true)}
                        disabled={isSaving || !(confirmaBProdConforme && confirmaBLado && confirmaBRetrabalhoProprio && confirmaBRetrabalhoTerceiro)}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 font-bold h-12 md:h-10 px-3 rounded text-[10px] font-mono uppercase tracking-widest transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
                        title="Fecha o lote atual e abre o form para configurar um novo processo/operadora para esta máquina"
                      >
                        Mudar Processo
                      </button>

                      {/* Botão Salvar (Mantém Processo e reinicia ciclo) */}
                      <button 
                        onClick={() => handleSalvarCenarioB(false)}
                        disabled={isSaving || !(confirmaBProdConforme && confirmaBLado && confirmaBRetrabalhoProprio && confirmaBRetrabalhoTerceiro)}
                        className="flex-1 bg-[#00624C] hover:bg-[#004838] text-white font-black h-12 md:h-10 px-3 rounded text-[10px] font-mono uppercase tracking-widest shadow-lg shadow-[#00624C]/15 transition-all flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
                      >
                        {isSaving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                        {!(confirmaBProdConforme && confirmaBLado && confirmaBRetrabalhoProprio && confirmaBRetrabalhoTerceiro)
                          ? "CONFIRME TODOS"
                          : "Salvar e Continuar"}
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

    </div>
  );
}
