import React from 'react';
import { PackageOpen, Plus } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  actionColor?: string;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  actionIcon,
  onAction,
  actionColor = '#6366F1',
  compact = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '2rem 1.5rem' : '3.5rem 1.5rem',
        borderRadius: '16px',
        background: 'var(--surface-subtle, rgba(255, 255, 255, 0.02))',
        border: '1px dashed var(--border-color, rgba(0, 0, 0, 0.08))',
        margin: '1rem 0',
      }}
    >
      <div
        style={{
          width: compact ? '44px' : '56px',
          height: compact ? '44px' : '56px',
          borderRadius: '16px',
          background: 'rgba(99, 102, 241, 0.08)',
          color: actionColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
        }}
      >
        {icon || <PackageOpen size={compact ? 22 : 28} />}
      </div>

      <h3
        style={{
          fontSize: compact ? '0.95rem' : '1.1rem',
          fontWeight: 700,
          color: 'var(--text-primary, #0F172A)',
          margin: '0 0 0.35rem 0',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-tertiary, #94A3B8)',
            margin: '0 0 1.25rem 0',
            maxWidth: '320px',
            lineHeight: 1.45,
          }}
        >
          {description}
        </p>
      )}

      {onAction && actionLabel && (
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
            padding: '0.55rem 1.1rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: `0 4px 14px ${actionColor}35`,
            transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          {actionIcon || <Plus size={16} strokeWidth={2.5} />}
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};
