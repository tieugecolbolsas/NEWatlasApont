import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, ScanLine, X, ClipboardCheck } from 'lucide-react';

interface QuickQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export default function QuickQRScannerModal({ isOpen, onClose, onScan }: QuickQRScannerModalProps) {
  const [readerId] = useState(() => `quick-reader-${Math.random().toString(36).substring(2, 9)}`);
  const [cameraDisponivel, setCameraDisponivel] = useState(false);
  const [permissaoNegada, setPermissaoNegada] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    scannedRef.current = false;

    // Aguarda montagem do DOM
    const timer = setTimeout(() => {
      if (!isMounted) return;
      const element = document.getElementById(readerId);
      if (!element) return;

      try {
        const scanner = new Html5Qrcode(readerId);
        scannerRef.current = scanner;

        const handleSuccess = (decodedText: string) => {
          if (!scannedRef.current) {
            scannedRef.current = true;
            onScan(decodedText);
          }
        };

        scanner.start(
          { facingMode: 'environment' },
          { fps: 10, aspectRatio: 1.333334 },
          handleSuccess,
          () => {}
        ).then(() => {
          if (isMounted) setCameraDisponivel(true);
        }).catch((err) => {
          console.warn("Erro câmera traseira:", err);
          if (err?.name === 'NotAllowedError') {
            if (isMounted) setPermissaoNegada(true);
            return;
          }
          // Fallback
          scanner.start(
            {},
            { fps: 10, aspectRatio: 1.333334 },
            handleSuccess,
            () => {}
          ).then(() => {
            if (isMounted) setCameraDisponivel(true);
          }).catch((fallbackErr) => {
            console.error("Erro total câmera:", fallbackErr);
            if (isMounted) {
              if (fallbackErr?.name === 'NotAllowedError') setPermissaoNegada(true);
              setCameraDisponivel(false);
            }
          });
        });
      } catch (err) {
        console.error("Erro ao instanciar leitor QR:", err);
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        try {
          const state = scanner.getState();
          if (state === 2 || state === 3) {
            scanner.stop().catch(() => {});
          }
        } catch (e) {
          // ignora erro ao fechar
        }
      }
    };
  }, [isOpen, readerId, onScan]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    onScan(manualInput.trim());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setManualInput(text.trim());
      }
    } catch (err) {
      console.error('Erro ao colar:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 backdrop-blur-md flex items-center justify-center p-4">
      {/* CARD DO MODAL */}
      <div className="w-full max-w-sm bg-zinc-900 border border-white/60 rounded-2xl p-4 shadow-2xl flex flex-col gap-3 relative">
        {/* HEADER */}
        <div className="flex items-center justify-between pb-2 border-b border-white/20">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-[#00624C]" />
            <div>
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                LEITOR DE QR CODE
              </h3>
              <p className="text-[9px] font-mono text-zinc-400">
                APROXIME A CÂMERA DO QR CODE DA MÁQUINA
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Fechar Leitor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTAINER DA CÂMERA */}
        <div className="relative w-full aspect-[4/3] bg-black rounded-xl overflow-hidden border border-white/60 shadow-inner flex items-center justify-center @container">
          <div id={readerId} className="w-full h-full rounded-xl overflow-hidden [&>video]:object-cover [&_#qr-shaded-region]:hidden" />

          {!cameraDisponivel && (
            <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-4 text-center bg-zinc-950 z-20">
              <Camera size={36} className={permissaoNegada ? "text-red-500 mb-2" : "text-zinc-700 mb-2"} />
              <span className={`text-[10px] font-mono uppercase tracking-wider ${permissaoNegada ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                {permissaoNegada ? 'PERMISSÃO DE CÂMERA NEGADA' : 'CÂMERA INDISPONÍVEL OU INICIALIZANDO'}
              </span>
              <p className="text-[9px] text-zinc-500 mt-1 max-w-xs font-sans">
                {permissaoNegada ? 'Conceda acesso à câmera nas configurações do navegador.' : 'Ou digite o código da máquina abaixo.'}
              </p>
            </div>
          )}

          {cameraDisponivel && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="w-[65%] h-[65%] border-2 border-dashed border-[#00624C]/80 rounded-xl animate-pulse"></div>
            </div>
          )}
        </div>

        {/* ENTRADA MANUAL */}
        <div className="pt-2 border-t border-white/20 space-y-2">
          <span className="text-[9px] font-mono uppercase tracking-widest font-bold text-zinc-400 block">
            Código Curto ou Número da Máquina
          </span>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Ex: 11 ou 11|Reta"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              className="flex-1 bg-zinc-950 border border-white/40 rounded px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#00624C]"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1.5 rounded text-[10px] font-mono uppercase cursor-pointer transition-colors flex items-center gap-1"
              title="Colar da Área de Transferência"
            >
              <ClipboardCheck size={12} />
              COLAR
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#00624C] hover:bg-[#004838] text-white rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors"
            >
              OK
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
