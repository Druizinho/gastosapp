import React from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  variant?: 'default' | 'inverse';
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius = '8px',
  variant = 'default',
  className = '',
  style = {},
}) => {
  const shimmerClass = variant === 'inverse' ? 'skeleton-shimmer-inverse' : 'skeleton-shimmer';

  return (
    <div
      aria-hidden="true"
      className={`${shimmerClass} ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
};

export const SkeletonText: React.FC<{
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ lines = 3, className = '', style = {} }) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        ...style,
      }}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="0.875rem"
          width={i === lines - 1 && lines > 1 ? '65%' : '100%'}
          borderRadius="6px"
        />
      ))}
    </div>
  );
};

export const SkeletonCircle: React.FC<{
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 42, className = '', style = {} }) => {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius="50%"
      className={className}
      style={{
        flexShrink: 0,
        ...style,
      }}
    />
  );
};

export interface SkeletonCardProps {
  className?: string;
  style?: React.CSSProperties;
  titleWidth?: number | string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className = '',
  style = {},
  titleWidth = '55%',
}) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '16px',
        background: 'var(--bg-card, var(--surface, #fff))',
        border: '1px solid var(--border-color, var(--border, rgba(148,163,184,0.18)))',
        boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.04))',
        ...style,
      }}
    >
      {/* Left: Circle icon */}
      <SkeletonCircle size={42} />

      {/* Middle: Title & Subtitle */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          minWidth: 0,
        }}
      >
        <Skeleton width={titleWidth} height={15} borderRadius={6} />
        <Skeleton width="35%" height={11} borderRadius={4} />
      </div>

      {/* Right: Amounts */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <Skeleton width={72} height={16} borderRadius={6} />
        <Skeleton width={48} height={11} borderRadius={4} />
      </div>
    </div>
  );
};

export const SkeletonHeroCard: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className = '', style = {} }) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        padding: '20px',
        borderRadius: '20px',
        background: 'var(--bg-card, var(--surface, #fff))',
        border: '1px solid var(--border-color, var(--border, rgba(148,163,184,0.18)))',
        boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.04))',
        marginBottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        ...style,
      }}
    >
      {/* Header pill / eyebrow */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={120} height={14} borderRadius={6} />
        <Skeleton width={64} height={14} borderRadius={9999} />
      </div>

      {/* Main amount */}
      <Skeleton width={180} height={32} borderRadius={10} />

      {/* 3 bottom metric boxes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          borderTop: '1px solid var(--border-color, rgba(148,163,184,0.18))',
          paddingTop: '12px',
        }}
      >
        {[0, 1, 2].map((idx) => (
          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width="60%" height={10} borderRadius={4} />
            <Skeleton width="85%" height={16} borderRadius={6} />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonList: React.FC<{
  count?: number;
  cardClassName?: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ count = 4, cardClassName = '', className = '', style = {} }) => {
  const widths = ['58%', '44%', '66%', '50%'];

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando..."
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        ...style,
      }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const isLast = i === count - 1 && count > 1;
        return (
          <SkeletonCard
            key={i}
            className={cardClassName}
            titleWidth={widths[i % widths.length]}
            style={isLast ? { opacity: 0.65 } : undefined}
          />
        );
      })}
    </div>
  );
};
