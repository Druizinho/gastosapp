import React from 'react';
import { Sparkles } from 'lucide-react';

export const PeriodComparison: React.FC = () => {
  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '800px', margin: '0 auto', minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="soft-card" style={{ padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          borderRadius: '50%', 
          backgroundColor: 'rgba(59, 130, 246, 0.1)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'var(--accent-color)'
        }}>
          <Sparkles size={40} />
        </div>
        
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Próximamente
          </h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto', lineHeight: 1.5 }}>
            Estamos trabajando en una nueva funcionalidad para ayudarte a analizar y entender mejor tus gastos.
          </p>
        </div>
      </div>
    </div>
  );
};
