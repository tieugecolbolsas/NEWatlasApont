const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

const effectCode = `  useEffect(() => {
    if (isBValid && activeSession) {
      setShowBConfirmationModal(true);
    }
  }, [isBValid]);`;

// Remove the effect from top
code = code.replace(effectCode, '');

// Insert it right after isBValid declaration
const target = '    !(isConformeEmpty && isRefugoEmpty && isRetProprioEmpty && isRetTerceiroEmpty);';
code = code.replace(target, target + '\n\n' + effectCode);

// Fix missing X import
if (code.indexOf('import { X,') === -1 && code.indexOf('X, ') === -1) {
    code = code.replace("import { Menu, Search, QrCode, ", "import { Menu, Search, QrCode, X, ");
    // Or just append it if not sure
    code = code.replace("import {", "import { X,");
}

fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
console.log('Fixed TDZ');
