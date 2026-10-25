import React from 'react';

export interface ListCardProgress {
  value: number;
  max?: number;
  color?: string;
}

export interface ListCardProps {
  statusColor?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  isPaused?: boolean;
  badges?: React.ReactNode;
  progress?: ListCardProgress;
  primaryAmount?: React.ReactNode;
  secondaryAmount?: React.ReactNode;
  quickAction?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const ListCard: React.FC<ListCardProps> = ({
  statusColor = 'transparent',
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  isPaused = false,
  badges,
  progress,
  primaryAmount,
  secondaryAmount,
  quickAction,
  onClick,
  className = '',
  style = {},
  children,
}) => {
  const progressPercent = progress
    ? Math.min(100, Math.max(0, (progress.value / (progress.max || 100)) * 100))
    : null;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`list-card ${isPaused ? 'is-paused' : ''} ${className}`.trim()}
      style={{
        borderLeftColor: statusColor,
        ...style,
      }}
    >
      {icon && (
        <div
          className="list-card-icon-container"
          style={{
            backgroundColor: iconBg || (statusColor !== 'transparent' ? `${statusColor}18` : 'var(--surface-muted)'),
            color: iconColor || (statusColor !== 'transparent' ? statusColor : 'var(--text-primary)'),
            border: statusColor !== 'transparent' ? `1px solid ${statusColor}33` : undefined,
          }}
        >
          {icon}
        </div>
      )}

      <div className="list-card-spine">
        <div className={`list-card-title ${isPaused ? 'strikethrough' : ''}`}>
          {title}
        </div>
        {subtitle && <div className="list-card-subtitle">{subtitle}</div>}
        {badges && <div className="list-card-badges">{badges}</div>}
        {progressPercent !== null && (
          <div className="list-card-progress-bar-container">
            <div
              className="list-card-progress-bar-fill"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: progress?.color || (statusColor !== 'transparent' ? statusColor : 'var(--accent-color)'),
              }}
            />
          </div>
        )}
        {children}
      </div>

      {(primaryAmount !== undefined || secondaryAmount !== undefined) && (
        <div className="list-card-trailing">
          {primaryAmount !== undefined && (
            <div className="list-card-amount-primary">{primaryAmount}</div>
          )}
          {secondaryAmount !== undefined && (
            <div className="list-card-amount-secondary">{secondaryAmount}</div>
          )}
        </div>
      )}

      {quickAction && (
        <div
          className="list-card-quick-action-wrapper"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {quickAction}
        </div>
      )}
    </div>
  );
};

export default React.memo(ListCard);
