import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { SkeletonHeroCard, SkeletonList } from './ui/Skeleton';

const MESSAGES = [
  "Conectando con la base de datos...",
  "El servidor estaba descansando, despertándolo... ☕",
  "Organizando tus finanzas...",
  "Calculando tus gastos...",
  "Casi listos..."
];

export const WakeUpLoader: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [showColdStartBanner, setShowColdStartBanner] = useState(false);

  useEffect(() => {
    const bannerTimer = setTimeout(() => {
      setShowColdStartBanner(true);
    }, 3500);

    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1 < MESSAGES.length ? prev + 1 : prev));
    }, 12000);

    return () => {
      clearTimeout(bannerTimer);
      clearInterval(messageInterval);
    };
  }, []);

  return (
    <>
      <style>
        {`
          @keyframes wu-spin {
            100% { transform: rotate(360deg); }
          }
          @keyframes wu-fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .wu-animate-spin {
            animation: wu-spin 1s linear infinite;
          }
          .wu-banner-fade-in {
            animation: wu-fadeIn 0.25s ease-out forwards;
          }
          @media (prefers-reduced-motion: reduce) {
            .wu-animate-spin {
              animation: none;
            }
            .wu-banner-fade-in {
              animation: none;
            }
          }
        `}
      </style>
      <div style={{ padding: '4px 0' }}>
        <SkeletonHeroCard />

        {showColdStartBanner && (
          <div
            role="status"
            aria-live="polite"
            className="wu-banner-fade-in"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: '16px',
              background: 'var(--surface-color, #ffffff)',
              border: '1px solid var(--border-color, rgba(148, 163, 184, 0.2))',
              boxShadow: 'var(--shadow-xs, 0 1px 3px rgba(0, 0, 0, 0.05))',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                color: 'var(--info-color, #3B82F6)',
                background: 'var(--info-bg, rgba(59, 130, 246, 0.1))',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Loader2 size={18} className="wu-animate-spin" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #0F172A)',
                  lineHeight: 1.3,
                }}
              >
                {MESSAGES[messageIndex]}
              </p>
            </div>
          </div>
        )}

        <SkeletonList count={showColdStartBanner ? 4 : 5} />
      </div>
    </>
  );
};
