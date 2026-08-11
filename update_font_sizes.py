import re

def update_fonts(text):
    # This will only update text sizes within the modals (showScenarioA and activeSession)
    
    # We will just replace specific patterns
    replacements = {
        'text-[9px]': 'text-[10px]',
        'text-[10px]': 'text-xs',
        'text-[11px]': 'text-sm',
        'text-xs': 'text-sm',
        'text-sm': 'text-base',
        'text-base': 'text-lg',
    }
    
    for k, v in replacements.items():
        text = text.replace(k, v)
        
    return text

with open('src/components/ScannerCaixas.tsx', 'r') as f:
    content = f.read()

# split content at showScenarioA
parts = content.split('{showScenarioA && (')
if len(parts) > 1:
    modals = parts[1]
    modals = update_fonts(modals)
    content = parts[0] + '{showScenarioA && (' + modals

with open('src/components/ScannerCaixas.tsx', 'w') as f:
    f.write(content)
