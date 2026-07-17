import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Maquina, Apontamento, ShiftState, StatusOperacional } from '../types/supervisao';
import { supabase } from './supabase';
import { getLocalSessionUser } from './auth';

interface RealtimeContextType {
  machines: Maquina[];
  apontamentos: Apontamento[];
  shiftState: ShiftState;
  simulatedTime: number; // Seconds since midnight
  clockSpeed: number; // Seconds per real second
  isDemoMode: boolean;
  setClockSpeed: (speed: number) => void;
  setSimulatedTime: (time: number) => void;
  setIsDemoMode: (val: boolean) => void;
  toggleManualPause: () => void;
  resetShift: () => void;
  simulateScan: (apontadora: string, machineNo: string, operadora: string, processo: string, qtd: number, status?: 'validado' | 'rejeitado' | 'analise') => void;
  updateMachineStatus: (machineId: string, status: StatusOperacional) => void;
  addToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

const SEED_MACHINES: Maquina[] = [
  { id: 'mq-01', numero: 'MQ-01', operadora: 'ANA PAULA SILVA', processo: 'CADÊNCIA', status: 'produzindo', ultima_atualizacao: new Date().toISOString(), eficiencia: 96.2, pecas_produzidas: 0 },
  { id: 'mq-02', numero: 'MQ-02', operadora: 'BEATRIZ SOUZA', processo: 'EMBALAGEM', status: 'produzindo', ultima_atualizacao: new Date().toISOString(), eficiencia: 92.4, pecas_produzidas: 0 },
  { id: 'mq-03', numero: 'MQ-03', operadora: 'CAMILA REIS', processo: 'REVISÃO', status: 'pausada', ultima_atualizacao: new Date().toISOString(), eficiencia: 88.1, pecas_produzidas: 0 },
  { id: 'mq-04', numero: 'MQ-04', operadora: 'CLAUDIA MARQUES', processo: 'CADÊNCIA', status: 'produzindo', ultima_atualizacao: new Date().toISOString(), eficiencia: 95.0, pecas_produzidas: 0 },
  { id: 'mq-05', numero: 'MQ-05', operadora: 'DEBORA OLIVEIRA', processo: 'EMBALAGEM', status: 'manutencao', ultima_atualizacao: new Date().toISOString(), eficiencia: 65.2, pecas_produzidas: 0 },
  { id: 'mq-06', numero: 'MQ-06', operadora: 'ELIANE COSTA', processo: 'DIVERSOS', status: 'produzindo', ultima_atualizacao: new Date().toISOString(), eficiencia: 91.8, pecas_produzidas: 0 },
  { id: 'mq-07', numero: 'MQ-07', operadora: 'FERNANDA ALVES', processo: 'REVISÃO', status: 'offline', ultima_atualizacao: new Date().toISOString(), eficiencia: 0.0, pecas_produzidas: 0 },
  { id: 'mq-08', numero: 'MQ-08', operadora: 'GISELE PINTO', processo: 'CADÊNCIA', status: 'produzindo', ultima_atualizacao: new Date().toISOString(), eficiencia: 98.1, pecas_produzidas: 0 }
];

// Standard Shift remaining seconds calculation: 8.27 hours
const SHIFT_MAX_SECONDS = Math.round(8.27 * 3600); // 29772 seconds

// Automated Pause Intervals (seconds since midnight)
// 09:30 - 09:40 (Morning coffee: 34200 to 34800)
// 12:00 - 13:00 (Lunch: 43200 to 46800)
// 15:30 - 15:40 (Afternoon coffee: 55800 to 56400)
const MORNING_COFFEE_START = 9.5 * 3600; // 34200 (09:30)
const MORNING_COFFEE_END = 9.666 * 3600; // 34800 (09:40)
const LUNCH_START = 12 * 3600; // 43200 (12:00)
const LUNCH_END = 13 * 3600; // 46800 (13:00)
const AFTERNOON_COFFEE_START = 15.5 * 3600; // 55800 (15:30)
const AFTERNOON_COFFEE_END = 15.666 * 3600; // 56400 (15:40)

export const RealtimeProvider: React.FC<{ children: React.ReactNode; addToast: (text: string, type: 'success' | 'error' | 'info') => void }> = ({ children, addToast }) => {
  const [machines, setMachines] = useState<Maquina[]>(() => {
    const saved = localStorage.getItem('atlas_supervisao_machines');
    return saved ? JSON.parse(saved) : SEED_MACHINES;
  });

  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);

  // Simulated Time: start shift at 07:00:00 (25200 seconds)
  const [simulatedTime, setSimulatedTime] = useState<number>(() => {
    const saved = localStorage.getItem('atlas_simulated_time');
    return saved ? Number(saved) : 7 * 3600;
  });

  const [clockSpeed, setClockSpeed] = useState<number>(1); // default 1 second per real second
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false); // generate auto scans (disabled by default)
  const [manualPause, setManualPause] = useState<boolean>(false);

  const [shiftState, setShiftState] = useState<ShiftState>(() => {
    const saved = localStorage.getItem('atlas_shift_state');
    if (saved) return JSON.parse(saved);
    return {
      totalSeconds: SHIFT_MAX_SECONDS,
      remainingSeconds: SHIFT_MAX_SECONDS,
      isPaused: false,
      pauseReason: null
    };
  });

  // Save states to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('atlas_supervisao_machines', JSON.stringify(machines));
  }, [machines]);

  useEffect(() => {
    localStorage.setItem('atlas_simulated_time', String(simulatedTime));
  }, [simulatedTime]);

  // Handle shift states and clock ticking
  useEffect(() => {
    const timer = setInterval(() => {
      // 1. Tick simulated time
      let nextSimTime = simulatedTime + clockSpeed;
      if (nextSimTime >= 24 * 3600) {
        nextSimTime = 0; // Wrap around day
      }
      setSimulatedTime(nextSimTime);

      // 2. Check for automated pause windows based on simulated time
      let autoPauseReason: ShiftState['pauseReason'] = null;
      let isAutoPaused = false;

      if (nextSimTime >= MORNING_COFFEE_START && nextSimTime < MORNING_COFFEE_END) {
        autoPauseReason = 'cafe_manha';
        isAutoPaused = true;
      } else if (nextSimTime >= LUNCH_START && nextSimTime < LUNCH_END) {
        autoPauseReason = 'almoco';
        isAutoPaused = true;
      } else if (nextSimTime >= AFTERNOON_COFFEE_START && nextSimTime < AFTERNOON_COFFEE_END) {
        autoPauseReason = 'cafe_tarde';
        isAutoPaused = true;
      }

      // Final pause decision
      const currentPaused = isAutoPaused || manualPause;
      const currentReason = isAutoPaused ? autoPauseReason : (manualPause ? 'manual' : null);

      // 3. Count down shift timer if NOT paused and remaining > 0
      setShiftState(prev => {
        let nextRemaining = prev.remainingSeconds;
        if (!currentPaused && prev.remainingSeconds > 0) {
          nextRemaining = Math.max(0, prev.remainingSeconds - clockSpeed);
        }

        const state: ShiftState = {
          totalSeconds: SHIFT_MAX_SECONDS,
          remainingSeconds: nextRemaining,
          isPaused: currentPaused,
          pauseReason: currentReason
        };
        localStorage.setItem('atlas_shift_state', JSON.stringify(state));
        return state;
      });

      // 4. Auto-sync machine operational status during lunch/coffee
      if (isAutoPaused) {
        setMachines(prev => prev.map(m => {
          if (m.status === 'produzindo') {
            return { ...m, status: 'pausada', ultima_atualizacao: new Date().toISOString() };
          }
          return m;
        }));
      }

    }, 1000);

    return () => clearInterval(timer);
  }, [simulatedTime, clockSpeed, manualPause]);

  // Load initial real records from database
  useEffect(() => {
    const fetchInitialAps = async () => {
      try {
        const userObj = getLocalSessionUser() as any;
        const userId = userObj?.id || userObj?.uid;
        if (!userId) return;

        const { data, error } = await supabase
          .from('registros_producao_teste')
          .select('*')
          .eq('user_id', userId)
          .order('id', { ascending: false })
          .limit(100);

        if (error) throw error;
        if (data) {
          const loaded: Apontamento[] = data.map((raw: any) => ({
            id: raw.id ? String(raw.id) : String(Date.now() + Math.random()),
            timestamp: raw.horario_termino || raw.created_at || raw.timestamp || new Date().toISOString(),
            apontadora: raw.apontadora_nome || raw.apontadora || 'MANUAL',
            maquina: raw.num_maquina || raw.maquina || 'S/M',
            operadora: raw.operadora_nome || raw.operadora || 'Desconhecida',
            processo: raw.operacao_nome || raw.processo || 'PROCESSO',
            quantidade: Number(raw.producao_conforme !== undefined ? raw.producao_conforme : raw.quantidade || 0),
            status: raw.status || 'validado'
          }));
          setApontamentos(loaded);

          // Update machine production counts from loaded db records
          setMachines(prev => prev.map(m => {
            const sum = loaded
              .filter(ap => ap.maquina.toLowerCase().trim() === m.numero.toLowerCase().trim() && ap.status === 'validado')
              .reduce((acc, curr) => acc + curr.quantidade, 0);
            return {
              ...m,
              pecas_produzidas: sum,
              ultima_atualizacao: new Date().toISOString()
            };
          }));
        }
      } catch (err) {
        console.error('Failed to load initial apontamentos:', err);
      }
    };
    fetchInitialAps();
  }, []);

  // Attempt real Supabase channel integration if VITE_SUPABASE_URL is available
  useEffect(() => {
    const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return;

    // Subscriptions setup
    const apontamentosChannel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'registros_producao_teste' },
        (payload: any) => {
          const raw = payload.new;
          const newAp: Apontamento = {
            id: raw.id || String(Date.now()),
            timestamp: raw.horario_termino || raw.created_at || raw.timestamp || new Date().toISOString(),
            apontadora: raw.apontadora_nome || raw.apontadora || 'MANUAL',
            maquina: raw.num_maquina || raw.maquina || 'S/M',
            operadora: raw.operadora_nome || raw.operadora || 'Desconhecida',
            processo: raw.operacao_nome || raw.processo || 'PROCESSO',
            quantidade: Number(raw.producao_conforme !== undefined ? raw.producao_conforme : raw.quantidade || 0),
            status: raw.status || 'validado'
          };
          // Avoid duplicate
          setApontamentos(prev => {
            if (prev.some(a => a.id === newAp.id)) return prev;
            return [newAp, ...prev];
          });
          
          // Update machine
          setMachines(prev => prev.map(m => {
            if (m.numero.toLowerCase() === newAp.maquina.toLowerCase()) {
              const count = newAp.status === 'validado' ? newAp.quantidade : 0;
              return {
                ...m,
                pecas_produzidas: m.pecas_produzidas + count,
                status: 'produzindo',
                ultima_atualizacao: new Date().toISOString()
              };
            }
            return m;
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'maquinas' },
        (payload: any) => {
          const updatedM = payload.new as Maquina;
          setMachines(prev => prev.map(m => m.id === updatedM.id ? { ...m, ...updatedM } : m));
          addToast(`Status da Máquina ${updatedM.numero} atualizado via Supabase.`, 'info');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(apontamentosChannel);
    };
  }, [addToast]);

  // Periodic simulated scans generator disabled as requested by user ("o sistema não deve mais soltar automaticamente")
  useEffect(() => {
    // Disabled
  }, []);

  // Simulate a scan (adds record and triggers animations + updates KPIs)
  const simulateScan = (
    apontadora: string,
    machineNo: string,
    operadora: string,
    processo: string,
    qtd: number,
    status: 'validado' | 'rejeitado' | 'analise' = 'validado'
  ) => {
    const newAp: Apontamento = {
      id: `ap-sim-${Math.random().toString().substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      apontadora,
      maquina: machineNo,
      operadora,
      processo,
      quantidade: qtd,
      status
    };

    // Update apontamentos list
    setApontamentos(prev => [newAp, ...prev]);

    // Update specific machine properties
    setMachines(prev => prev.map(m => {
      if (m.numero.toLowerCase().trim() === machineNo.toLowerCase().trim()) {
        const addedPieces = status === 'validado' ? qtd : 0;
        
        // Randomly tweak efficiency between 88% and 99%
        const computedEficiencia = Math.round((88 + Math.random() * 11) * 10) / 10;

        return {
          ...m,
          pecas_produzidas: m.pecas_produzidas + addedPieces,
          status: 'produzindo', // set back to active
          eficiencia: computedEficiencia,
          ultima_atualizacao: new Date().toISOString()
        };
      }
      return m;
    }));

    // Toast removed as requested by user

    // Try to mirror to Supabase asynchronously if table exists
    const saveToSupabase = async () => {
      try {
        const userObj = getLocalSessionUser() as any;
        const userId = userObj?.id || userObj?.uid;
        const nowTime = new Date().toTimeString().split(' ')[0];

        const { error } = await supabase
          .from('registros_producao_teste')
          .insert([{
            data: new Date().toISOString().split('T')[0],
            operadora_nome: operadora,
            hora_extra: 'n',
            operacao_nome: processo,
            tipo_maquina: 'REALTIME',
            lote: 'L-REALTIME',
            num_maquina: machineNo,
            lado: 'Único',
            horario_inicio: nowTime,
            horario_termino: nowTime,
            producao_conforme: Number(qtd),
            retrabalho_proprio: 0,
            retrabalho_terceiro: 0,
            motivo_ocorrencia: 'Produção Realtime',
            user_id: userId
          }]);
        if (error) throw error;
      } catch (err) {
        // Silently catch - database tables may not be established yet
      }
    };
    saveToSupabase();
  };

  const updateMachineStatus = (machineId: string, status: StatusOperacional) => {
    setMachines(prev => prev.map(m => {
      if (m.id === machineId) {
        return {
          ...m,
          status,
          ultima_atualizacao: new Date().toISOString()
        };
      }
      return m;
    }));

    const targetMac = machines.find(m => m.id === machineId);
    if (targetMac) {
      addToast(`Máquina ${targetMac.numero} agora está em estado [${status.toUpperCase()}].`, 'info');
    }
  };

  const toggleManualPause = () => {
    setManualPause(prev => {
      const next = !prev;
      addToast(next ? 'Turno pausado manualmente pelo supervisor.' : 'Turno retomado pelo supervisor.', 'info');
      return next;
    });
  };

  const resetShift = () => {
    setShiftState({
      totalSeconds: SHIFT_MAX_SECONDS,
      remainingSeconds: SHIFT_MAX_SECONDS,
      isPaused: false,
      pauseReason: null
    });
    setSimulatedTime(7 * 3600); // 07:00 AM
    setManualPause(false);
    
    // Reset machine production counts
    setMachines(prev => prev.map(m => ({
      ...m,
      pecas_produzidas: m.numero === 'MQ-07' ? 0 : Math.floor(Math.random() * 50) + 40,
      status: m.numero === 'MQ-07' ? 'offline' : m.numero === 'MQ-05' ? 'manutencao' : 'produzindo',
      eficiencia: m.numero === 'MQ-07' ? 0 : Math.round((85 + Math.random() * 14) * 10) / 10,
      ultima_atualizacao: new Date().toISOString()
    })));

    addToast('Turno de Trabalho Reiniciado! Contagem de peças e relógio limpos.', 'success');
  };

  return (
    <RealtimeContext.Provider value={{
      machines,
      apontamentos,
      shiftState,
      simulatedTime,
      clockSpeed,
      isDemoMode,
      setClockSpeed,
      setSimulatedTime,
      setIsDemoMode,
      toggleManualPause,
      resetShift,
      simulateScan,
      updateMachineStatus,
      addToast
    }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
