const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

const oldFormStart = '              ) : showManutencaoForm ? (\n                // FORMULÁRIO DE MANUTENÇÃO\n                <div className="space-y-4 font-mono text-lg">';
const oldFormEnd = '                  </div>\n                </div>\n              ) : (';

if (code.indexOf(oldFormStart) !== -1) {
    const startIndex = code.indexOf(oldFormStart);
    const endIndex = code.indexOf(oldFormEnd, startIndex) + oldFormEnd.length;
    
    const newForm = `              ) : showManutencaoForm ? (
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
              ) : (`;
    
    code = code.substring(0, startIndex) + newForm + code.substring(endIndex);
    fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
    console.log('Maintenance form updated successfully');
} else {
    console.log('Maintenance form section not found');
}
