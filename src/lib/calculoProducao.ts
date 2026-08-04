export interface MetricasProducao {
  totalContado: number;
  prodConforme: number;
  refugo: number;
  retrabalhoProprio: number;
  retrabalhoTerceiro: number;
  produtividade: number; // Porcentagem calculada estritamente sobre Prod. Conforme
}

/**
 * Padrão Oficial Atlas de Cálculo de Produção:
 * - Total Contado: Soma de todas as peças contadas (peças conformes + retrabalho próprio + retrabalho de terceiros + refugo).
 * - Prod. Conforme: Total Contado SUBTRAINDO refugo e retrabalho próprio.
 *   (Obs: Retrabalho de terceiros NÃO subtrai da produção da operadora/máquina).
 * - Produtividade (%): Calculada baseada no valor de Prod. Conforme em relação à meta (ex: 1200 pçs).
 */
export function calcularMetricasProducao(records: any[], metaPecas: number = 1200): MetricasProducao {
  let somaConf = 0;
  let somaRefugo = 0;
  let somaRePr = 0;
  let somaReTe = 0;

  if (Array.isArray(records)) {
    records.forEach((r: any) => {
      // Ignorar entregas de matéria-prima, pois não representam peças produzidas
      if (r?.motivo_ocorrencia === 'MATERIA_PRIMA') return;

      const conf = Number(r?.producao_conforme !== undefined ? r.producao_conforme : (r?.quantidade || 0));
      const ref = Number(r?.refugo || 0);
      const rePr = Number(r?.retrabalho_proprio || 0);
      const reTe = Number(r?.retrabalho_terceiro || 0);

      somaConf += conf;
      somaRefugo += ref;
      somaRePr += rePr;
      somaReTe += reTe;
    });
  }

  // Total Contado considera todas as peças movimentadas/apontadas
  const totalContado = Math.max(0, somaConf + somaRePr + somaReTe + somaRefugo);

  // Prod. Conforme subtrai estritamente Refugo e Retrabalho Próprio
  const prodConforme = Math.max(0, totalContado - somaRePr - somaRefugo);

  // Produtividade/Eficiência em % calculada apenas sobre Prod. Conforme
  const produtividade = metaPecas > 0 
    ? Math.min(100, Math.round((prodConforme / metaPecas) * 1000) / 10) 
    : 0;

  return {
    totalContado,
    prodConforme,
    refugo: somaRefugo,
    retrabalhoProprio: somaRePr,
    retrabalhoTerceiro: somaReTe,
    produtividade
  };
}
