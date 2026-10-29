import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Wallet, ChevronRight, Lock, Users, PiggyBank, Target, ArrowLeftRight } from 'lucide-react';
import { TOOL_COLORS } from '../utils/toolColors';

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

interface ToolSection {
  title: string;
  tools: ToolCard[];
}

const toolSections: ToolSection[] = [
  {
    title: 'Planificación Mensual',
    tools: [
      {
        id: 'budgets',
        title: 'Presupuestos',
        description: 'Límites mensuales globales y por categoría',
        icon: <Target size={28} />,
        color: TOOL_COLORS.budgets.solid,
        bgColor: TOOL_COLORS.budgets.bg,
        path: '/herramientas/presupuestos',
        enabled: true,
      },
      {
        id: 'fixed-expenses',
        title: 'Gastos Fijos',
        description: 'Gastos recurrentes cada mes',
        icon: <Receipt size={28} />,
        color: TOOL_COLORS.fixedExpenses.solid,
        bgColor: TOOL_COLORS.fixedExpenses.bg,
        path: '/herramientas/gastos-fijos',
        enabled: true,
      },
      {
        id: 'estimated-income',
        title: 'Ingresos',
        description: 'Ingresos recibidos y cobros del mes',
        icon: <Wallet size={28} />,
        color: TOOL_COLORS.income.solid,
        bgColor: TOOL_COLORS.income.bg,
        path: '/herramientas/ingresos',
        enabled: true,
      },
    ],
  },
  {
    title: 'Patrimonio y Compromisos',
    tools: [
      {
        id: 'debts-unified',
        title: 'Deudas y Préstamos',
        description: 'Lo que debes y lo que te deben con balance neto',
        icon: <ArrowLeftRight size={28} />,
        color: TOOL_COLORS.debts.solid,
        bgColor: TOOL_COLORS.debts.bg,
        path: '/herramientas/deudas',
        enabled: true,
      },
      {
        id: 'savings',
        title: 'Proyectos / Ahorros',
        description: 'Fondos de reserva y cuentas por proyecto',
        icon: <PiggyBank size={28} />,
        color: TOOL_COLORS.savings.solid,
        bgColor: TOOL_COLORS.savings.bg,
        path: '/herramientas/ahorros',
        enabled: true,
      },
    ],
  },
  {
    title: 'Comunidad y Red',
    tools: [
      {
        id: 'connections',
        title: 'Panas',
        description: 'Gastos fijos, deudas y metas compartidas',
        icon: <Users size={28} />,
        color: TOOL_COLORS.panas.solid,
        bgColor: TOOL_COLORS.panas.bg,
        path: '/herramientas/panas',
        enabled: true,
      },
    ],
  },
];

export const ToolsHub: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ marginBottom: '1.75rem', paddingTop: '1rem' }}>
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

      {/* Grouped Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {toolSections.map((section) => (
          <div key={section.title}>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '0.6rem',
              paddingLeft: '0.25rem',
            }}>
              {section.title}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {section.tools.map((tool) => (
                <button
                  key={tool.id}
                  className="tool-card"
                  onClick={() => tool.enabled && navigate(tool.path)}
                  disabled={!tool.enabled}
                  onMouseDown={(e) => {
                    if (tool.enabled) e.currentTarget.style.transform = 'scale(0.96)';
                  }}
                  onMouseUp={(e) => {
                    if (tool.enabled) e.currentTarget.style.transform = 'scale(1)';
                  }}
                  onMouseLeave={(e) => {
                    if (tool.enabled) e.currentTarget.style.transform = 'scale(1)';
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    width: '100%',
                    padding: '1.15rem',
                    background: 'var(--surface-color)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    border: 'none',
                    cursor: tool.enabled ? 'pointer' : 'default',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'transform 150ms ease-out, box-shadow 150ms ease-out, opacity 150ms ease-out',
                    opacity: tool.enabled ? 1 : 0.7,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: '52px',
                    height: '52px',
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
                      fontSize: '1.02rem',
                      fontWeight: 650,
                      color: 'var(--text-primary)',
                      marginBottom: '0.15rem'
                    }}>
                      {tool.title}
                    </div>
                    <div style={{
                      fontSize: '0.82rem',
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
        ))}
      </div>
    </div>
  );
};
