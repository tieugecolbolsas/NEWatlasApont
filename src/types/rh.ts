export type StatusFuncionaria = 'ativa' | 'ferias' | 'afastamento' | 'inativa';

export interface Funcionaria {
  id: string;
  nome: string;
  cargo: string;
  status: StatusFuncionaria;
  data_saida: string | null;
  data_volta: string | null;
  created_at?: string;
}
