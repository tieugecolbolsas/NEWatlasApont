const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

// Remove the bottom buttons (Botões do Form)
code = code.replace(/\{\/\* Botões do Form.*?\}\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?<\/div>/s, '');

// Add the modal HTML before custom alert
const modalCode = `
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
                  onClick={() => setShowBConfirmationModal(false)}
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
`;

code = code.replace('{/* MODAL DE ALERTA CUSTOMIZADO */}', modalCode + '\n      {/* MODAL DE ALERTA CUSTOMIZADO */}');
fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
