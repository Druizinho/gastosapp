import React, { useState, useEffect } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

export const InstallPWA: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [showAndroidPrompt, setShowAndroidPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(true); // Start hidden until we check
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Don't show if already installed as PWA
    if (isInStandaloneMode()) return;

    // Check if user recently dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION_MS) return;
      localStorage.removeItem(DISMISS_KEY);
    }

    setDismissed(false);

    // iOS detection
    if (isIOS()) {
      // Safari on iOS doesn't fire beforeinstallprompt
      const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(navigator.userAgent);
      if (isSafari) {
        setShowIOSPrompt(true);
      }
      // On non-Safari iOS browsers, PWA install isn't supported, so we still show iOS instructions
      // since the user needs to open in Safari
      if (!isSafari) {
        setShowIOSPrompt(true);
      }
      return;
    }

    // Android / Desktop — listen for the browser install event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroidPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowAndroidPrompt(false);
      }
    } catch (err) {
      console.error('Install prompt error:', err);
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  };

  const handleDismiss = () => {
    setShowAndroidPrompt(false);
    setShowIOSPrompt(false);
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  // Nothing to show
  if (dismissed || (!showIOSPrompt && !showAndroidPrompt)) {
    return null;
  }

  // ─── iOS Banner ───
  if (showIOSPrompt) {
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(navigator.userAgent);

    return (
      <div className="install-banner install-banner--ios">
        <button className="install-banner__close" onClick={handleDismiss} aria-label="Cerrar">
          <X size={18} />
        </button>
        <div className="install-banner__content">
          <strong>Instala GastosApp en tu iPhone</strong>
          {isSafari ? (
            <ol className="install-banner__ios-steps">
              <li>Toca el botón Compartir <Share size={16} className="install-banner__inline-icon" /> en la barra inferior.</li>
              <li>Desliza hacia abajo y selecciona <strong>Agregar a inicio</strong> <Plus size={14} className="install-banner__inline-icon" />.</li>
              <li>Toca <strong>Agregar</strong> arriba a la derecha.</li>
            </ol>
          ) : (
            <p>
              Abre esta página en <strong>Safari</strong> para instalar la app en tu iPhone.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Android / Desktop Banner ───
  if (showAndroidPrompt) {
    return (
      <div className="install-banner install-banner--android">
        <button className="install-banner__close" onClick={handleDismiss} aria-label="Cerrar">
          <X size={18} />
        </button>
        <div className="install-banner__icon">
          <Download size={24} />
        </div>
        <div className="install-banner__content">
          <strong>Instala GastosApp</strong>
          <p>Accede más rápido desde tu pantalla de inicio</p>
        </div>
        <button 
          className="install-banner__button" 
          onClick={handleInstallClick}
          disabled={installing}
        >
          {installing ? 'Instalando...' : 'Instalar'}
        </button>
      </div>
    );
  }

  return null;
};
