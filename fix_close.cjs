const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

// Add the state
code = code.replace(
  'const [confirmaBObservacao, setConfirmaBObservacao] = useState(false);',
  'const [confirmaBObservacao, setConfirmaBObservacao] = useState(false);\n  const [lastCheckedFieldB, setLastCheckedFieldB] = useState<string | null>(null);'
);

// Update each checkbox onClick to also set lastCheckedFieldB
code = code.replace(
  'onClick={() => setConfirmaBProdConforme(!confirmaBProdConforme)}',
  'onClick={() => { const v = !confirmaBProdConforme; setConfirmaBProdConforme(v); if(v) setLastCheckedFieldB("conforme"); }}'
);
code = code.replace(
  'onClick={() => setConfirmaBRefugo(!confirmaBRefugo)}',
  'onClick={() => { const v = !confirmaBRefugo; setConfirmaBRefugo(v); if(v) setLastCheckedFieldB("refugo"); }}'
);
code = code.replace(
  'onClick={() => setConfirmaBRetrabalhoProprio(!confirmaBRetrabalhoProprio)}',
  'onClick={() => { const v = !confirmaBRetrabalhoProprio; setConfirmaBRetrabalhoProprio(v); if(v) setLastCheckedFieldB("retrabalhoProprio"); }}'
);
code = code.replace(
  'onClick={() => setConfirmaBRetrabalhoTerceiro(!confirmaBRetrabalhoTerceiro)}',
  'onClick={() => { const v = !confirmaBRetrabalhoTerceiro; setConfirmaBRetrabalhoTerceiro(v); if(v) setLastCheckedFieldB("retrabalhoTerceiro"); }}'
);
code = code.replace(
  'onClick={() => setConfirmaBLado(!confirmaBLado)}',
  'onClick={() => { const v = !confirmaBLado; setConfirmaBLado(v); if(v) setLastCheckedFieldB("lado"); }}'
);

// Update the modal close handler
const modalCloseReplaceStr = `
                <button 
                  onClick={() => setShowBConfirmationModal(false)}
`;
const newModalCloseReplaceStr = `
                <button 
                  onClick={() => {
                    setShowBConfirmationModal(false);
                    if (lastCheckedFieldB === 'conforme') setConfirmaBProdConforme(false);
                    else if (lastCheckedFieldB === 'refugo') setConfirmaBRefugo(false);
                    else if (lastCheckedFieldB === 'retrabalhoProprio') setConfirmaBRetrabalhoProprio(false);
                    else if (lastCheckedFieldB === 'retrabalhoTerceiro') setConfirmaBRetrabalhoTerceiro(false);
                    else if (lastCheckedFieldB === 'lado') setConfirmaBLado(false);
                  }}
`;
code = code.replace(modalCloseReplaceStr, newModalCloseReplaceStr);

fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
console.log('Fixed Close logic');
