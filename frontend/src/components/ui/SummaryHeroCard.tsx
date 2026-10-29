import React from 'react';
import { Skeleton } from './Skeleton';
import { colorWithOpacity } from '../../utils/toolColors';

export interface SummaryMetricItem {
  label: string;
  value: string;
  subtext?: string;
  valueColor?: string;
  icon?: React.ReactNode;
}

export interface SummaryHeroCardProps {
  eyebrow: string;
  badgeText?: string;
  badgeIcon?: React.ReactNode;
  badgeColor?: string;
  mainAmount: string;
  mainAmountColor?: string;
  statusSubtext?: string;
  currencyHintText?: string;
  onCycleCurrency?: () => void;
  accentColor?: string;
  metrics?: SummaryMetricItem[]; // 2 or 3 columns
  progress?: {
    percent: number;
    leftLabel: string;
    rightLabel?: string;
    color?: string;
  };
  children?: React.ReactNode;
  isLoading?: boolean;
}

export const SummaryHeroCard: React.FC<SummaryHeroCardProps> = ({
  eyebrow,
  badgeText,
  badgeIcon,
  badgeColor,
  mainAmount,
  mainAmountColor,
  statusSubtext,
  currencyHintText,
  onCycleCurrency,
  accentColor = '#6366F1',
  metrics,
  progress,
  children,
  isLoading = false,
}) => {
  const isInteractive = typeof onCycleCurrency === 'function';

  return (
    <div
      className="soft-card"
      onClick={onCycleCurrency}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCycleCurrency();
        }
      } : undefined}
      style={{
        marginBottom: '1.5rem',
        padding: '1.35rem 1.45rem',
        borderRadius: '20px',
        background: `linear-gradient(140deg, ${colorWithOpacity(accentColor, '1a')} 0%, ${colorWithOpacity(accentColor, '06')} 45%, var(--surface-color, #FFFFFF) 100%)`,
        border: `1px solid ${colorWithOpacity(accentColor, '25')}`,
        boxShadow: `0 4px 20px -2px ${colorWithOpacity(accentColor, '14')}, var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.04))`,
        cursor: isInteractive ? 'pointer' : 'default',
        transition: 'transform 150ms ease-out, box-shadow 150ms ease-out',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseDown={isInteractive ? (e) => {
        e.currentTarget.style.transform = 'scale(0.99)';
      } : undefined}
      onMouseUp={isInteractive ? (e) => {
        e.currentTarget.style.transform = 'scale(1)';
      } : undefined}
      onMouseLeave={isInteractive ? (e) => {
        e.currentTarget.style.transform = 'scale(1)';
      } : undefined}
    >
      {/* Zone 1: Top Bar (Eyebrow + Badge) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.4rem',
        gap: '0.5rem',
      }}>
        <span style={{
          fontSize: '0.78rem',
          color: colorWithOpacity(accentColor, 'b0') || 'var(--text-tertiary, #64748B)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {eyebrow}
        </span>

        {badgeText && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.2rem 0.6rem',
            borderRadius: '9999px',
            background: `${colorWithOpacity(badgeColor || accentColor, '18')}`,
            color: badgeColor || accentColor,
            fontSize: '0.72rem',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {badgeIcon}
            <span>{badgeText}</span>
          </div>
        )}
      </div>

      {/* Zone 2: Main Amount + Status/Hint */}
      <div style={{ marginBottom: metrics || progress || children ? '0.9rem' : 0 }}>
        <div style={{
          fontSize: '2.1rem',
          fontWeight: 800,
          color: mainAmountColor || 'var(--text-primary, #0F172A)',
          letterSpacing: '-0.03em',
          lineHeight: 1.15,
        }}>
          {isLoading || mainAmount === '...' ? (
            <Skeleton width={150} height={30} borderRadius={8} style={{ verticalAlign: 'middle' }} />
          ) : (
            mainAmount
          )}
        </div>

        {(statusSubtext || currencyHintText) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}>
            {statusSubtext && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #475569)', fontWeight: 500 }}>
                {statusSubtext}
              </span>
            )}
            {currencyHintText && (
              <span style={{
                fontSize: '0.7rem',
                color: 'var(--text-tertiary, #94A3B8)',
                fontWeight: 500,
                marginLeft: 'auto',
              }}>
                {currencyHintText}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Zone 3: Metrics Grid (2 or 3 columns) */}
      {metrics && metrics.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${metrics.length}, 1fr)`,
          gap: '0.75rem',
          borderTop: '1px solid var(--border-color, rgba(0, 0, 0, 0.07))',
          paddingTop: '0.85rem',
        }}>
          {metrics.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                borderRight: idx < metrics.length - 1 ? '1px solid var(--border-color, rgba(0, 0, 0, 0.07))' : 'none',
                paddingRight: idx < metrics.length - 1 ? '0.75rem' : 0,
              }}
            >
              <div style={{
                fontSize: '0.68rem',
                color: 'var(--text-tertiary, #94A3B8)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}>
                {item.icon}
                <span>{item.label}</span>
              </div>
              <div style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: item.valueColor || 'var(--text-primary, #0F172A)',
                letterSpacing: '-0.01em',
              }}>
                {isLoading || item.value === '...' ? (
                  <Skeleton width={68} height={16} borderRadius={6} style={{ marginTop: 2 }} />
                ) : (
                  item.value
                )}
              </div>
              {item.subtext && (
                <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary, #94A3B8)', marginTop: '2px' }}>
                  {item.subtext}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Zone 4: Progress Bar */}
      {progress && (
        <div style={{
          marginTop: '0.85rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid var(--border-color, rgba(0, 0, 0, 0.07))',
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.4rem',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary, #0F172A)' }}>
              {progress.leftLabel}
            </span>
            {progress.rightLabel && (
              <span style={{
                fontSize: '0.75rem',
                color: progress.color || accentColor,
                fontWeight: 700,
              }}>
                {progress.rightLabel}
              </span>
            )}
          </div>
          <div style={{
            height: '7px',
            borderRadius: '9999px',
            background: 'var(--surface-muted, rgba(0, 0, 0, 0.06))',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              borderRadius: '9999px',
              background: progress.color || `linear-gradient(90deg, ${accentColor}, ${colorWithOpacity(accentColor, 'cc')})`,
              width: `${Math.min(100, Math.max(0, progress.percent))}%`,
              transition: 'width 300ms ease-out',
            }} />
          </div>
        </div>
      )}

      {/* Optional Children slot */}
      {children}
    </div>
  );
};
