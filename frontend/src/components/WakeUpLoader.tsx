import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

const MESSAGES = [
  "Conectando con la base de datos...",
  "El servidor estaba descansando, despertándolo... ☕",
  "Organizando tus finanzas...",
  "Calculando tus gastos...",
  "Casi listos..."
];

export const WakeUpLoader: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // Change message every 12 seconds
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1 < MESSAGES.length ? prev + 1 : prev));
    }, 12000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style>
        {`
          @keyframes wu-spin {
            100% { transform: rotate(360deg); }
          }
          @keyframes wu-fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .wu-animate-spin {
            animation: wu-spin 1s linear infinite;
          }
          .wu-animate-fade-in {
            animation: wu-fadeIn 0.5s ease-out forwards;
          }
        `}
      </style>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1rem',
        textAlign: 'center',
        minHeight: '60vh',
      }}>
        <div className="soft-card wu-animate-fade-in" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.5rem',
          maxWidth: '300px',
          width: '100%',
          padding: '2.5rem 2rem'
        }}>
          <div style={{ 
            color: 'var(--info-color)', 
            background: 'var(--info-bg)', 
            padding: '1.25rem', 
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Loader2 size={36} className="wu-animate-spin" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontSize: '1.15rem' }}>
              Cargando datos
            </h3>
            <p 
              className="wu-animate-fade-in"
              style={{ 
                color: 'var(--text-secondary)', 
                fontSize: '0.9rem', 
                margin: 0, 
                minHeight: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }} 
              key={messageIndex}
            >
              {MESSAGES[messageIndex]}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
