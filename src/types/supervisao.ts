export type StatusOperacional = 'produzindo' | 'pausada' | 'manutencao' | 'offline';

export interface Maquina {
  id: string;
  numero: string; // e.g. "MQ-01"
  operadora: string;
  processo: string;
  status: StatusOperacional;
  ultima_atualizacao: string; // ISO string
  eficiencia: number; // e.g. 94.5
  pecas_produzidas: number;
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
