import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  actionColor?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightAction,
  actionLabel,
  actionIcon,
  onAction,
  actionColor = '#6366F1',
}) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '1.5rem',
      paddingTop: '0.5rem',
      gap: '0.75rem',
      flexWrap: 'nowrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Volver"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-full, 9999px)',
              background: 'var(--surface-color, #FFFFFF)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
              color: 'var(--text-primary, #0F172A)',
              flexShrink: 0,
              transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ArrowLeft size={20} />
          </button>
        )}

        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: '1.4rem',
            fontWeight: 800,
            color: 'var(--text-primary, #0F172A)',
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              fontSize: '0.8rem',
              color: 'var(--text-tertiary, #94A3B8)',
              margin: '2px 0 0 0',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {rightAction ? (
          rightAction
        ) : onAction && actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: actionColor,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 'var(--radius-md, 12px)',
              padding: '0.55rem 0.95rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: `0 4px 14px ${actionColor}40`,
              transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {actionIcon || <Plus size={16} strokeWidth={2.5} />}
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
};
