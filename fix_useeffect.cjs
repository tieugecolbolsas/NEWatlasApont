const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

code = code.replace(
  'useEffect(() => {\n    if (isBValid && activeSession && !showBConfirmationModal) {\n      setShowBConfirmationModal(true);\n    }\n  }, [isBValid, activeSession, showBConfirmationModal]);',
  'useEffect(() => {\n    if (isBValid && activeSession) {\n      setShowBConfirmationModal(true);\n    }\n  }, [isBValid]);'
);

fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
console.log('Fixed useEffect');
