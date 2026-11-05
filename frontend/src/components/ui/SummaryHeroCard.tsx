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
  /** @deprecated Currency hint is now communicated via title and card hover/tap interactions */
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
  onCycleCurrency,
  accentColor = '#6366F1',
  metrics,
  progress,
  children,
  isLoading = false,
}) => {
  const isInteractive = typeof onCycleCurrency === 'function';
  const isDuplicateEyebrow = Boolean(
    badgeText && eyebrow.trim().toLowerCase() === (badgeText || '').trim().toLowerCase()
  );
  const hasFooter = Boolean((metrics && metrics.length > 0) || progress || children);

  return (
    <div
      className={`soft-card summary-hero-card ${isInteractive ? 'summary-hero-card--interactive' : ''}`}
      title={isInteractive ? 'Toca para alternar moneda' : undefined}
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
        background: `linear-gradient(140deg, ${colorWithOpacity(accentColor, '1a')} 0%, ${colorWithOpacity(accentColor, '06')} 45%, var(--surface-color, #FFFFFF) 100%)`,
        border: `1px solid ${colorWithOpacity(accentColor, '25')}`,
        boxShadow: `0 4px 20px -2px ${colorWithOpacity(accentColor, '14')}, var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.04))`,
      }}
    >
      {/* Zone 1: Top Bar (Eyebrow + Badge) */}
      <div className="summary-hero-header">
        {!isDuplicateEyebrow && (
          <span
            className="summary-hero-eyebrow"
            style={{
              color: colorWithOpacity(accentColor, 'b0') || 'var(--text-tertiary, #64748B)',
            }}
          >
            {eyebrow}
          </span>
        )}

        {badgeText && (
          <div
            className="summary-hero-badge"
            style={{
              background: colorWithOpacity(badgeColor || accentColor, '18'),
              color: badgeColor || accentColor,
            }}
          >
            {badgeIcon}
            <span>{badgeText}</span>
          </div>
        )}
      </div>

      {/* Zone 2: Main Amount + Status/Hint */}
      <div className={`summary-hero-amount-zone ${hasFooter ? 'summary-hero-amount-zone--has-footer' : ''}`}>
        <div
          className="summary-hero-amount"
          style={mainAmountColor ? { color: mainAmountColor } : undefined}
        >
          {isLoading || mainAmount === '...' ? (
            <Skeleton width={150} height={30} borderRadius={8} style={{ verticalAlign: 'middle' }} />
          ) : (
            mainAmount
          )}
        </div>

        {statusSubtext && (
          <div className="summary-hero-status-text">
            {statusSubtext}
          </div>
        )}
      </div>

      {/* Zone 3: Metrics Grid (2 or 3 columns, responsive on mobile / 4+ items) */}
      {metrics && metrics.length > 0 && (
        <div
          className={`summary-hero-metrics-grid ${metrics.length >= 4 ? 'multi-row' : ''} ${metrics.length > 2 ? 'has-multiple-rows' : ''}`}
          style={{
            '--hero-metric-cols': metrics.length,
          } as React.CSSProperties}
        >
          {metrics.map((item, idx) => (
            <div
              key={idx}
              className="summary-hero-metric-item"
            >
              <div className="summary-hero-metric-label">
                {item.icon}
                <span>{item.label}</span>
              </div>
              <div
                className="summary-hero-metric-value"
                style={item.valueColor ? { color: item.valueColor } : undefined}
              >
                {isLoading || item.value === '...' ? (
                  <Skeleton width={68} height={16} borderRadius={6} style={{ marginTop: 2 }} />
                ) : (
                  item.value
                )}
              </div>
              {item.subtext && (
                <div className="summary-hero-metric-subtext">
                  {item.subtext}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Zone 4: Progress Bar */}
      {progress && (
        <div className="summary-hero-progress">
          <div className="summary-hero-progress-labels">
            <span className="summary-hero-progress-left">
              {progress.leftLabel}
            </span>
            {progress.rightLabel && (
              <span
                className="summary-hero-progress-right"
                style={{ color: progress.color || accentColor }}
              >
                {progress.rightLabel}
              </span>
            )}
          </div>
          <div className="summary-hero-progress-track">
            <div
              className="summary-hero-progress-bar"
              style={{
                background: progress.color || `linear-gradient(90deg, ${accentColor}, ${colorWithOpacity(accentColor, 'cc')})`,
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Optional Children slot */}
      {children}
    </div>
  );
};
