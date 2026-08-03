const fs = require('fs');
let content = fs.readFileSync('src/components/StatusMaquinas.tsx', 'utf8');

// Target 1
const target1 = `  const [todayRegistros, setTodayRegistros] = useState<any[]>([]);
  const [colaboradoras, setColaboradoras] = useState<string[]>([]);`;
const replace1 = `  const [todayRegistros, setTodayRegistros] = useState<any[]>([]);
  const [colaboradoras, setColaboradoras] = useState<string[]>([]);
  const [cronogramaPausas, setCronogramaPausas] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());`;
content = content.replace(target1, replace1);

// Target 2
const target2 = `      const recordsList = registrosData || [];
      setTodayRegistros(recordsList);

      // Create lookup maps`;
const replace2 = `      const recordsList = registrosData || [];
      setTodayRegistros(recordsList);

      // 3.5 Fetch cronograma de pausas
      const { data: pausasData, error: pausasError } = await supabase
        .schema('SupervisorProd')
        .from('vw_cronograma_pausas')
        .select('*');
      if (!pausasError && pausasData) {
        setCronogramaPausas(pausasData);
      }

      // Create lookup maps`;
content = content.replace(target2, replace2);

// Target 3
const target3 = `    fetchProcessos();

    // Setup Realtime Subscriptions to sessoes_ativas_terminal and registros_producao_terminal`;
const replace3 = `    fetchProcessos();

    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    // Setup Realtime Subscriptions to sessoes_ativas_terminal and registros_producao_terminal`;
content = content.replace(target3, replace3);

// Target 4
const target4 = `      supabase.removeChannel(caixasChannel);
      clearInterval(interval);
    };
  }, []);`;
const replace4 = `      supabase.removeChannel(caixasChannel);
      clearInterval(interval);
      clearInterval(timeInterval);
    };
  }, []);`;
content = content.replace(target4, replace4);

// Target 5
const target5 = `          <p className="text-zinc-500 text-xs font-sans uppercase tracking-widest mt-1">
            PAINEL DE STATUS DE MÁQUINAS
          </p>
        </div>
      </div>`;
const replace5 = `          <p className="text-zinc-500 text-xs font-sans uppercase tracking-widest mt-1">
            PAINEL DE STATUS DE MÁQUINAS
          </p>
        </div>

        {/* TEMPO RESTANTE DO TURNO */}
        <div className="flex items-center gap-3 bg-zinc-950/60 border border-white/10 rounded-xl px-4 py-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <div className="flex flex-col">
            <span className="text-[9px] font-sans font-bold uppercase tracking-widest text-zinc-500">
              Tempo Restante do Turno
            </span>
            <span className="text-sm font-mono font-black text-zinc-100">
              {(() => {
                const ct = currentTime;
                const start = new Date(ct).setHours(7, 12, 0, 0);
                const end = new Date(ct).setHours(17, 0, 0, 0);
                const b1s = new Date(ct).setHours(9, 0, 0, 0);
                const b1e = new Date(ct).setHours(9, 10, 0, 0);
                const b2s = new Date(ct).setHours(12, 0, 0, 0);
                const b2e = new Date(ct).setHours(13, 0, 0, 0);
                const b3s = new Date(ct).setHours(15, 0, 0, 0);
                const b3e = new Date(ct).setHours(15, 10, 0, 0);
                const t = ct.getTime();
                if (t >= end) return '00:00:00';
                if (t <= start) return '08:28:00';
                let elapsedMs = 0;
                if (t > start) elapsedMs += Math.min(t, b1s) - start;
                if (t > b1e) elapsedMs += Math.min(t, b2s) - b1e;
                if (t > b2e) elapsedMs += Math.min(t, b3s) - b2e;
                if (t > b3e) elapsedMs += Math.min(t, end) - b3e;
                const totalWorkMs = 508 * 60 * 1000;
                const remainingMs = Math.max(0, totalWorkMs - elapsedMs);
                const totalSecs = Math.floor(remainingMs / 1000);
                const hrs = Math.floor(totalSecs / 3600);
                const mins = Math.floor((totalSecs % 3600) / 60);
                const secs = totalSecs % 60;
                return \`\${String(hrs).padStart(2, '0')}:\${String(mins).padStart(2, '0')}:\${String(secs).padStart(2, '0')}\`;
              })()}
            </span>
          </div>
        </div>
      </div>`;
content = content.replace(target5, replace5);

// Target 6
const target6 = `              {paginatedMachines.map((m) => {
                const isProducing = m.status === 'produzindo';
                const isPaused = m.status === 'pausada';
                const isMaintenance = m.status === 'manutencao';
                const isOffline = m.status === 'offline';`;
const replace6 = `              {paginatedMachines.map((m) => {
                let overrideStatus = m.status as string;
                let statusName = overrideStatus;
                if (overrideStatus === 'produzindo' || overrideStatus === 'pausada') {
                  const opPausas = cronogramaPausas.find(p => p.operadora_nome && m.operadora && p.operadora_nome.trim().toUpperCase() === m.operadora.trim().toUpperCase());
                  if (opPausas) {
                    const ct = currentTime;
                    const cTimeString = \`\${String(ct.getHours()).padStart(2, '0')}:\${String(ct.getMinutes()).padStart(2, '0')}:\${String(ct.getSeconds()).padStart(2, '0')}\`;
                    const checkInterval = (start, end) => {
                      if (!start || !end) return false;
                      return cTimeString >= start && cTimeString <= end;
                    };
                    if (checkInterval(opPausas.cafe_manha_inicio, opPausas.cafe_manha_fim) || checkInterval(opPausas.cafe_tarde_inicio, opPausas.cafe_tarde_fim)) {
                      overrideStatus = 'pausada';
                      statusName = 'pausa p/ café';
                    } else if (checkInterval(opPausas.almoco_inicio, opPausas.almoco_fim)) {
                      overrideStatus = 'pausada';
                      statusName = 'pausa p/ almoço';
                    }
                  }
                }
                const isProducing = overrideStatus === 'produzindo';
                const isPaused = overrideStatus === 'pausada';
                const isMaintenance = overrideStatus === 'manutencao';
                const isOffline = overrideStatus === 'offline';`;
content = content.replace(target6, replace6);

// Target 7
const target7 = `{isOffline ? 'DESLIGADA' : m.status.toUpperCase()}`;
const replace7 = `{isOffline ? 'DESLIGADA' : statusName.toUpperCase()}`;
content = content.replace(target7, replace7);

fs.writeFileSync('src/components/StatusMaquinas.tsx', content, 'utf8');
console.log('Edits applied successfully!');
