const fs = require('fs');
const cssPath = 'src/index.css';
let css = fs.readFileSync(cssPath, 'utf8');

css += `
/* Reduce font size for the specific element requested by user by default */
html:not(.large-font-mode) div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
    --tw-scale-x: 0.85;
    --tw-scale-y: 0.85;
    transform: scaleX(var(--tw-scale-x)) scaleY(var(--tw-scale-y));
    transform-origin: top left;
}
html:not(.large-font-mode) div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) * {
    font-size: 0.85em;
}
`;
// Wait, transform AND font-size? No, just font-size.
