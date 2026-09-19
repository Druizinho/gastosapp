import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, TrendingDown, TrendingUp, Wallet, ChevronRight, Lock } from 'lucide-react';

interface ToolCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  path: string;
  enabled: boolean;
}

const tools: ToolCard[] = [
  {
    id: 'fixed-expenses',
    title: 'Gastos Fijos',
    description: 'Gastos recurrentes mensuales',
    icon: <Receipt size={28} />,
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    path: '/herramientas/gastos-fijos',
    enabled: true,
  },
  {
    id: 'debts-owed',
    title: 'Deudas Nuestras',
    description: 'Lo que debemos a otros',
    icon: <TrendingDown size={28} />,
    color: '#EF4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    path: '/herramientas/deudas-nuestras',
    enabled: true,
  },
  {
    id: 'receivables',
    title: 'Deudas por Cobrar',
    description: 'Lo que otros nos deben',
    icon: <TrendingUp size={28} />,
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    path: '/herramientas/deudas-por-cobrar',
    enabled: true,
  },
  {
    id: 'estimated-income',
    title: 'Ingresos Estimados',
    description: 'Proyección de ingresos mensuales',
    icon: <Wallet size={28} />,
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    path: '/herramientas/ingresos-estimados',
    enabled: true,
  },
];

export const ToolsHub: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: '2rem', paddingTop: '1rem' }}>
        <h1 style={{ 
          fontSize: '1.75rem', 
          fontWeight: 800, 
          color: 'var(--text-primary)', 
          marginBottom: '0.25rem',
          letterSpacing: '-0.02em'
        }}>
          Herramientas
        </h1>
        <p style={{ 
          fontSize: '0.95rem', 
          color: 'var(--text-secondary)',
          lineHeight: 1.5
        }}>
          Gestiona tus finanzas de forma integral
        </p>
      </header>

      {/* Cards Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {tools.map((tool) => (
          <button
            key={tool.id}
            className="tool-card"
            onClick={() => tool.enabled && navigate(tool.path)}
            disabled={!tool.enabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              width: '100%',
              padding: '1.25rem',
              background: 'var(--surface-color)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              border: 'none',
              cursor: tool.enabled ? 'pointer' : 'default',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'all 0.2s ease',
              opacity: tool.enabled ? 1 : 0.7,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Icon */}
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-md)',
              background: tool.bgColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tool.color,
              flexShrink: 0,
              transition: 'transform 0.2s ease',
            }}>
              {tool.icon}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: '1.05rem', 
                fontWeight: 650, 
                color: 'var(--text-primary)',
                marginBottom: '0.15rem'
              }}>
                {tool.title}
              </div>
              <div style={{ 
                fontSize: '0.85rem', 
                color: 'var(--text-secondary)',
                lineHeight: 1.4
              }}>
                {tool.description}
              </div>
            </div>

            {/* Right side indicator */}
            <div style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
              {tool.enabled ? (
                <ChevronRight size={20} />
              ) : (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  background: 'var(--surface-muted)',
                  padding: '0.3rem 0.6rem',
                  borderRadius: 'var(--radius-full)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}>
                  <Lock size={10} />
                  Pronto
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
