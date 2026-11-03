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

export interface SkeletonPeriodSelectorProps {
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonPeriodSelector: React.FC<SkeletonPeriodSelectorProps> = ({
  className = '',
  style = {},
}) => {
  // Pill widths matching the 6 period options: Hoy (54px), Semana (76px), Mes (54px), Año (54px), Todo (58px), Personalizado (115px)
  const pillWidths = [54, 76, 54, 54, 58, 115];

  return (
    <div
      aria-hidden="true"
      className={`period-selector-surface ${className}`.trim()}
      style={style}
    >
      <div className="period-pills-container">
        <div className="period-pills">
          {pillWidths.map((w, i) => (
            <Skeleton
              key={i}
              width={w}
              height={32}
              borderRadius="9999px"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export interface SkeletonFloatingHeroProps {
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonFloatingHero: React.FC<SkeletonFloatingHeroProps> = ({
  className = '',
  style = {},
}) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        marginBottom: '1.25rem',
        marginTop: '0.25rem',
        padding: '0.25rem 0.25rem 0.5rem 0.25rem',
        ...style,
      }}
    >
      {/* Row 1: "Balance del período" label placeholder (130px x 16px) + eye circle (28px) + "30d" days badge (38px x 20px) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.35rem',
        }}
      >
        <Skeleton width={130} height={16} borderRadius={6} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SkeletonCircle size={28} />
          <Skeleton width={38} height={20} borderRadius="9999px" />
        </div>
      </div>

      {/* Row 2: Large 2.5rem bold balance placeholder (210px x 42px) */}
      <div style={{ margin: '0.25rem 0' }}>
        <Skeleton width={210} height={42} borderRadius={10} />
      </div>

      {/* Row 3: 2 inline pill badges: "↓ Ingresado" and "↑ Gastado" with background var(--surface-muted), border 1px solid var(--border-color), and inner text + amount placeholders */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.3rem 0.7rem',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
          }}
        >
          <Skeleton width={68} height={14} borderRadius={4} />
          <Skeleton width={52} height={14} borderRadius={4} />
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.3rem 0.7rem',
            borderRadius: 'var(--radius-full, 9999px)',
            background: 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
            border: '1px solid var(--border-color, rgba(0, 0, 0, 0.06))',
          }}
        >
          <Skeleton width={56} height={14} borderRadius={4} />
          <Skeleton width={52} height={14} borderRadius={4} />
        </div>
      </div>
    </div>
  );
};

export interface SkeletonEquivalencesProps {
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonEquivalences: React.FC<SkeletonEquivalencesProps> = ({
  className = '',
  style = {},
}) => {
  return (
    <div aria-hidden="true" className={className} style={{ marginBottom: '1.25rem', ...style }}>
      {/* Header: "Equivalencias" label (110px x 20px) + 2-pill toggle capsule (Gastos / Ingresos) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 0.5rem',
          marginBottom: '1rem',
        }}
      >
        <Skeleton width={110} height={20} borderRadius={6} />
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
            padding: '3px',
            borderRadius: '9999px',
            gap: '2px',
          }}
        >
          <Skeleton width={58} height={24} borderRadius="9999px" />
          <Skeleton width={64} height={24} borderRadius="9999px" />
        </div>
      </div>

      {/* Scrollable carousel row: 4 soft-cards (142px width, 128px minHeight) with currency circle icon + code + amount + name placeholders */}
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: '1rem',
          overflowX: 'auto',
          paddingBottom: '1rem',
          paddingLeft: '0.5rem',
          paddingRight: '0.5rem',
        }}
      >
        {[
          { codeW: 42, amountW: 94, nameW: 56 },
          { codeW: 46, amountW: 82, nameW: 68 },
          { codeW: 38, amountW: 90, nameW: 50 },
          { codeW: 48, amountW: 78, nameW: 62 },
        ].map((card, i) => (
          <div
            key={i}
            className="soft-card"
            style={{
              flex: '0 0 142px',
              minWidth: '142px',
              maxWidth: '142px',
              minHeight: '128px',
              padding: '1.15rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.65rem',
              }}
            >
              <SkeletonCircle size={24} />
              <Skeleton width={card.codeW} height={14} borderRadius={4} />
            </div>

            <div>
              <Skeleton
                width={card.amountW}
                height={18}
                borderRadius={4}
                style={{ marginBottom: '0.25rem' }}
              />
              <Skeleton width={card.nameW} height={12} borderRadius={4} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export interface SkeletonListCardProps {
  statusColor?: string;
  titleWidth?: number | string;
  badgeWidth?: number | string;
  primaryAmountWidth?: number | string;
  secondaryAmountWidth?: number | string;
  showCheckbox?: boolean;
  showProgress?: boolean;
  showAmounts?: boolean;
  iconBorderRadius?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonListCard: React.FC<SkeletonListCardProps> = ({
  statusColor = 'rgba(148, 163, 184, 0.4)',
  titleWidth = '55%',
  badgeWidth = 64,
  primaryAmountWidth = 72,
  secondaryAmountWidth = 48,
  showCheckbox = false,
  showProgress = false,
  showAmounts = true,
  iconBorderRadius = 12,
  className = '',
  style = {},
}) => {
  return (
    <div
      aria-hidden="true"
      className={`list-card ${className}`.trim()}
      style={{
        borderLeftColor: statusColor,
        cursor: 'default',
        ...style,
      }}
    >
      {/* Tier 1 (.list-card-top) */}
      <div className="list-card-top">
        <div className="list-card-header-left">
          <Skeleton
            width={40}
            height={40}
            borderRadius={iconBorderRadius}
            style={{ flexShrink: 0 }}
          />
          <div className="list-card-spine">
            <div className="list-card-title">
              <Skeleton width={titleWidth} height={16} borderRadius={6} />
            </div>
            <div className="list-card-subtitle" style={{ marginTop: '2px' }}>
              <Skeleton width="35%" height={12} borderRadius={4} />
            </div>
          </div>
        </div>
        {showCheckbox && (
          <div className="list-card-quick-action-wrapper">
            <Skeleton width={22} height={22} borderRadius="50%" style={{ flexShrink: 0 }} />
          </div>
        )}
        {!showAmounts && (
          <div className="list-card-quick-action-wrapper" style={{ display: 'flex', alignItems: 'center' }}>
            <Skeleton width={18} height={18} borderRadius={4} style={{ opacity: 0.4 }} />
          </div>
        )}
      </div>

      {/* Tier 2 (.list-card-meta-row) */}
      <div className="list-card-meta-row">
        <div className="list-card-badges">
          <Skeleton width={badgeWidth} height={18} borderRadius="9999px" />
        </div>
        {showAmounts && (
          <div className="list-card-amounts-column">
            <div className="list-card-amount-primary">
              <Skeleton width={primaryAmountWidth} height={16} borderRadius={6} />
            </div>
            <div className="list-card-amount-secondary">
              <Skeleton width={secondaryAmountWidth} height={12} borderRadius={4} />
            </div>
          </div>
        )}
      </div>
      {showProgress && (
        <div className="list-card-progress-bar-container">
          <Skeleton width="100%" height={6} borderRadius="9999px" />
        </div>
      )}
    </div>
  );
};

export interface SkeletonSegmentedTabsProps {
  tabCount?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonSegmentedTabs: React.FC<SkeletonSegmentedTabsProps> = ({
  tabCount = 2,
  className = '',
  style = {},
}) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
        padding: '4px',
        borderRadius: '14px',
        gap: '4px',
        boxSizing: 'border-box',
        width: '100%',
        ...style,
      }}
    >
      {Array.from({ length: tabCount }).map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '44px',
            padding: '0.55rem 0.75rem',
            borderRadius: '10px',
            boxSizing: 'border-box',
          }}
        >
          <Skeleton width={i === 0 ? '60%' : '50%'} height={16} borderRadius={6} />
        </div>
      ))}
    </div>
  );
};

export interface DashboardSkeletonProps {
  banner?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({
  banner,
  className = '',
  style = {},
}) => {
  const transactionItems = [
    { statusColor: 'rgba(99, 102, 241, 0.45)', titleWidth: '58%', badgeWidth: 70, primaryW: 68, secondaryW: 46 },
    { statusColor: 'rgba(16, 185, 129, 0.45)', titleWidth: '42%', badgeWidth: 60, primaryW: 76, secondaryW: 52 },
    { statusColor: 'rgba(245, 158, 11, 0.45)', titleWidth: '66%', badgeWidth: 80, primaryW: 62, secondaryW: 42 },
    { statusColor: 'rgba(236, 72, 153, 0.45)', titleWidth: '48%', badgeWidth: 64, primaryW: 84, secondaryW: 48 },
  ];

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando panel..."
      className={className}
      style={{ width: '100%', ...style }}
    >
      {/* 1. Period Selector */}
      <SkeletonPeriodSelector />

      {/* 2. Cold-start banner slot */}
      {banner}

      {/* 3. Floating Hero */}
      <SkeletonFloatingHero />

      {/* 4. Equivalences */}
      <SkeletonEquivalences />

      {/* 5. Daily Average card (.soft-card with icon + text + amount) */}
      <div
        className="soft-card mt-4"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Skeleton width={36} height={36} borderRadius={10} style={{ flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Skeleton width={160} height={13} borderRadius={4} />
            <Skeleton width={96} height={20} borderRadius={6} />
          </div>
        </div>
      </div>

      {/* 6. Top Categories card (.soft-card with 3 category rows and progress bars) */}
      <div className="soft-card mt-4" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <SkeletonCircle size={18} />
            <Skeleton width={140} height={14} borderRadius={4} />
          </div>
          <Skeleton width={60} height={14} borderRadius={4} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {[
            { nameW: 75, pctW: 80, barW: '65%' },
            { nameW: 95, pctW: 65, barW: '45%' },
            { nameW: 60, pctW: 55, barW: '25%' },
          ].map((row, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Skeleton width={28} height={28} borderRadius={8} style={{ flexShrink: 0 }} />
                  <Skeleton width={row.nameW} height={14} borderRadius={4} />
                </div>
                <Skeleton width={row.pctW} height={14} borderRadius={4} />
              </div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--surface-muted, rgba(0, 0, 0, 0.05))',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                }}
              >
                <Skeleton width={row.barW} height="100%" borderRadius="9999px" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 7. List Header: "Gastos del Período" title placeholder */}
      <div
        className="list-header mt-8 mb-4"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Skeleton width={170} height={24} borderRadius={6} />
      </div>

      {/* 8. Search & Filter row: search input placeholder + filter button placeholder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Skeleton height={38} borderRadius={20} style={{ flex: 1 }} />
        <Skeleton width={90} height={38} borderRadius={20} style={{ flexShrink: 0 }} />
      </div>

      {/* 9. 4 transaction items with <SkeletonListCard> (staggered widths and subtle left accent colors) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {transactionItems.map((tx, idx) => (
          <SkeletonListCard
            key={idx}
            statusColor={tx.statusColor}
            titleWidth={tx.titleWidth}
            badgeWidth={tx.badgeWidth}
            primaryAmountWidth={tx.primaryW}
            secondaryAmountWidth={tx.secondaryW}
            style={idx === transactionItems.length - 1 ? { opacity: 0.7 } : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export interface ToolsHubSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const ToolsHubSkeleton: React.FC<ToolsHubSkeletonProps> = ({
  className = '',
  style = {},
}) => {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando herramientas..."
      className={className}
      style={{
        padding: '1rem',
        paddingBottom: '6rem',
        maxWidth: '600px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: '1.25rem', paddingTop: '0.5rem' }}>
        <Skeleton width={175} height={32} borderRadius={8} />
      </header>

      {/* Grouped Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {/* Section 1: Planificación Mensual (3 tools) */}
        <div>
          <div style={{ marginBottom: '0.6rem', paddingLeft: '0.25rem' }}>
            <Skeleton width={150} height={12} borderRadius={4} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { titleW: 110, descW: '80%' },
              { titleW: 95, descW: '65%' },
              { titleW: 80, descW: '75%' },
            ].map((card, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  width: '100%',
                  padding: '1.15rem',
                  background: 'var(--surface-color, #fff)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  boxShadow: 'var(--shadow-lg, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
                  boxSizing: 'border-box',
                }}
              >
                <Skeleton width={52} height={52} borderRadius="var(--radius-md, 12px)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Skeleton width={card.titleW} height={16} borderRadius={6} />
                  <Skeleton width={card.descW} height={12} borderRadius={4} />
                </div>
                <Skeleton width={16} height={16} borderRadius={4} style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Patrimonio y Compromisos (2 tools) */}
        <div>
          <div style={{ marginBottom: '0.6rem', paddingLeft: '0.25rem' }}>
            <Skeleton width={165} height={12} borderRadius={4} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { titleW: 75, descW: '85%' },
              { titleW: 135, descW: '70%' },
            ].map((card, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  width: '100%',
                  padding: '1.15rem',
                  background: 'var(--surface-color, #fff)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  boxShadow: 'var(--shadow-lg, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
                  boxSizing: 'border-box',
                }}
              >
                <Skeleton width={52} height={52} borderRadius="var(--radius-md, 12px)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Skeleton width={card.titleW} height={16} borderRadius={6} />
                  <Skeleton width={card.descW} height={12} borderRadius={4} />
                </div>
                <Skeleton width={16} height={16} borderRadius={4} style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Comunidad y Red + Análisis (2 tools) */}
        <div>
          <div style={{ marginBottom: '0.6rem', paddingLeft: '0.25rem' }}>
            <Skeleton width={135} height={12} borderRadius={4} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { titleW: 55, descW: '75%' },
              { titleW: 165, descW: '90%' },
            ].map((card, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  width: '100%',
                  padding: '1.15rem',
                  background: 'var(--surface-color, #fff)',
                  borderRadius: 'var(--radius-lg, 16px)',
                  boxShadow: 'var(--shadow-lg, 0 4px 6px -1px rgba(0, 0, 0, 0.1))',
                  boxSizing: 'border-box',
                }}
              >
                <Skeleton width={52} height={52} borderRadius="var(--radius-md, 12px)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <Skeleton width={card.titleW} height={16} borderRadius={6} />
                  <Skeleton width={card.descW} height={12} borderRadius={4} />
                </div>
                <Skeleton width={16} height={16} borderRadius={4} style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export interface SettingsSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const SettingsSkeleton: React.FC<SettingsSkeletonProps> = ({
  className = '',
  style = {},
}) => {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando ajustes..."
      className={className}
      style={{
        padding: '1rem',
        paddingBottom: '6rem',
        maxWidth: '600px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: '2rem', paddingTop: '1rem' }}>
        <Skeleton width={130} height={32} borderRadius={8} />
      </header>

      {/* Menu Skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Tarjeta de Perfil VIP */}
        <div
          className="soft-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            padding: '1.5rem',
            background: 'linear-gradient(135deg, #0F172A 0%, #312E81 100%)',
            color: 'white',
            border: 'none',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 10px 25px -5px rgba(49, 46, 129, 0.3)',
            borderRadius: 'var(--radius-lg, 16px)',
            boxSizing: 'border-box',
          }}
        >
          {/* Decorative background circle */}
          <div
            style={{
              position: 'absolute',
              top: '-30px',
              right: '-30px',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          />
          <Skeleton
            variant="inverse"
            width={72}
            height={72}
            borderRadius="50%"
            style={{
              border: '2px solid rgba(255, 255, 255, 0.2)',
              flexShrink: 0,
              zIndex: 1,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 1 }}>
            <Skeleton variant="inverse" width={130} height={20} borderRadius={6} />
            <Skeleton variant="inverse" width={175} height={14} borderRadius={4} />
            <Skeleton
              variant="inverse"
              width={92}
              height={22}
              borderRadius="12px"
              style={{ marginTop: '0.2rem' }}
            />
          </div>
        </div>

        {/* Bloque: Cuenta */}
        <div>
          <div style={{ marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            <Skeleton width={64} height={13} borderRadius={4} />
          </div>
          <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
            {[
              { labelW: 60, hasBorder: true },
              { labelW: 110, hasBorder: false },
            ].map((item, idx) => (
              <div
                key={idx}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem',
                  borderBottom: item.hasBorder ? '1px solid var(--surface-muted, rgba(0, 0, 0, 0.05))' : 'none',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <Skeleton width={38} height={38} borderRadius={12} style={{ flexShrink: 0 }} />
                  <Skeleton width={item.labelW} height={16} borderRadius={6} />
                </div>
                <Skeleton width={16} height={16} borderRadius={4} style={{ flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Bloque: Preferencias */}
        <div>
          <div style={{ marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            <Skeleton width={96} height={13} borderRadius={4} />
          </div>
          <div className="soft-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Row 1: Moneda Principal */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem',
                borderBottom: '1px solid var(--surface-muted, rgba(0, 0, 0, 0.05))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Skeleton width={38} height={38} borderRadius={12} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <Skeleton width={120} height={16} borderRadius={6} />
                  <Skeleton width={180} height={11} borderRadius={4} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Skeleton width={44} height={22} borderRadius={8} />
                <Skeleton width={16} height={16} borderRadius={4} />
              </div>
            </div>

            {/* Row 2: Apariencia */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem',
                borderBottom: '1px solid var(--surface-muted, rgba(0, 0, 0, 0.05))',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Skeleton width={38} height={38} borderRadius={12} style={{ flexShrink: 0 }} />
                <Skeleton width={80} height={16} borderRadius={6} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Skeleton width={68} height={14} borderRadius={4} />
                <Skeleton width={16} height={16} borderRadius={4} />
              </div>
            </div>

            {/* Row 3: Notificaciones Push */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Skeleton width={38} height={38} borderRadius={12} style={{ flexShrink: 0 }} />
                <Skeleton width={135} height={16} borderRadius={6} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Skeleton width={68} height={14} borderRadius={4} />
                <Skeleton width={16} height={16} borderRadius={4} />
              </div>
            </div>
          </div>
        </div>

        {/* Botón de Salir */}
        <div className="soft-card" style={{ padding: 0, overflow: 'hidden', marginTop: '0.5rem' }}>
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '1.25rem',
              boxSizing: 'border-box',
            }}
          >
            <Skeleton width={18} height={18} borderRadius={4} />
            <Skeleton width={96} height={16} borderRadius={6} />
          </div>
        </div>
      </div>
    </div>
  );
};

export interface SkeletonNotificationItemProps {
  titleWidth?: number | string;
  bodyWidth?: number | string;
  dateWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonNotificationItem: React.FC<SkeletonNotificationItemProps> = ({
  titleWidth = '45%',
  bodyWidth = '80%',
  dateWidth = 60,
  className = '',
  style = {},
}) => {
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem',
        background: 'var(--surface-color, #fff)',
        border: '1px solid var(--accent-light, var(--border-color, rgba(0, 0, 0, 0.08)))',
        borderRadius: 'var(--radius-md, 12px)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <SkeletonCircle size={42} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Skeleton width={titleWidth} height={16} borderRadius={6} />
        <Skeleton width={bodyWidth} height={13} borderRadius={4} />
        <div style={{ marginTop: '2px' }}>
          <Skeleton width={dateWidth} height={11} borderRadius={4} />
        </div>
      </div>
    </div>
  );
};

export interface SkeletonNotificationListProps {
  count?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonNotificationList: React.FC<SkeletonNotificationListProps> = ({
  count = 3,
  className = '',
  style = {},
}) => {
  const titleWidths = ['45%', '60%', '35%', '50%'];
  const bodyWidths = ['85%', '70%', '90%', '65%'];

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando notificaciones..."
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        ...style,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonNotificationItem
          key={i}
          titleWidth={titleWidths[i % titleWidths.length]}
          bodyWidth={bodyWidths[i % bodyWidths.length]}
        />
      ))}
    </div>
  );
};
