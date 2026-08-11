const fs = require('fs');
let code = fs.readFileSync('src/components/ScannerCaixas.tsx', 'utf8');

code = code.replace("import { X, Html5Qrcode }", "import { Html5Qrcode }");
if (code.indexOf("X,") === -1 || code.indexOf("X, Html5") !== -1) {
    code = code.replace("import { \n  Camera,", "import { \n  X,\n  Camera,");
}

fs.writeFileSync('src/components/ScannerCaixas.tsx', code);
