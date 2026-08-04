export type StatusOperacional = 'produzindo' | 'pausada' | 'manutencao' | 'offline';

export interface Maquina {
  id: string;
  numero: string; // e.g. "MQ-01"
  operadora: string;
  processo: string;
  status: StatusOperacional;
  ultima_atualizacao: string; // ISO string
  eficiencia: number; // e.g. 94.5 (calculada sobre Prod. Conforme)
  pecas_produzidas: number; // Mantido para compatibilidade, equivale a Prod. Conforme
  prod_conforme?: number; // Prod. Conforme = Total Contado - Refugo - Retrabalho Próprio
  total_contado?: number; // Total Contado = Todas as peças sem subtrações
  refugo?: number; // Contador de Refugo
  retrabalho_proprio?: number; // Retrabalho Próprio
  retrabalho_terceiro?: number; // Retrabalho de Terceiros
}

export interface Apontamento {
  id: string;
  timestamp: string; // ISO string or locale datetime
  apontadora: string; // e.g. "MARA SOUZA (AP-01)"
  maquina: string; // MQ-01
  operadora: string; // ANA PAULA SILVA
  processo: string; // CADÊNCIA, EMBALAGEM, REVISÃO, DIVERSOS
  quantidade: number;
  status: 'validado' | 'rejeitado' | 'analise';
}

export interface ShiftState {
  totalSeconds: number;
  remainingSeconds: number;
  isPaused: boolean;
  pauseReason: 'cafe_manha' | 'almoco' | 'cafe_tarde' | 'manual' | null;
}
