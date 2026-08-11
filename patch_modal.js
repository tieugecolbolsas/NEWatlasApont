const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

// Insert the useEffect
const useEffectStr = `
  useEffect(() => {
    if (isBValid && activeSession) {
      setShowBConfirmationModal(true);
    }
  }, [isBValid]);
`;

code = code.replace('useEffect(() => {', useEffectStr + '\n  useEffect(() => {');
fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
