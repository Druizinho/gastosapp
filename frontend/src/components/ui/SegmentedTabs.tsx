import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  count?: number;
  icon?: React.ReactNode;
  badgeColor?: string;
}

export interface SegmentedTabsProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  activeColor?: string;
  style?: React.CSSProperties;
  layout?: 'equal' | 'grid-2x2' | 'scrollable';
  className?: string;
}

const SEGMENTED_TABS_CSS = `
.segmented-tabs-root {
  align-items: center;
  background: var(--surface-muted, rgba(0, 0, 0, 0.04));
  padding: 4px;
  border-radius: 14px;
  gap: 4px;
  box-sizing: border-box;
}

.segmented-tabs-equal {
  display: flex;
  width: 100%;
}
.segmented-tabs-equal .segmented-tab-btn {
  flex: 1;
}

.segmented-tabs-scrollable {
  display: flex;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}
.segmented-tabs-scrollable::-webkit-scrollbar {
  display: none;
}
.segmented-tabs-scrollable .segmented-tab-btn {
  flex: 0 0 auto;
}

.segmented-tabs-grid-2x2 {
  display: flex;
  width: 100%;
}
.segmented-tabs-grid-2x2 .segmented-tab-btn {
  flex: 1;
}
@media (max-width: 480px) {
  .segmented-tabs-grid-2x2 {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 6px !important;
    padding: 6px !important;
    border-radius: 16px !important;
  }
  .segmented-tabs-grid-2x2 .segmented-tab-btn {
    width: 100% !important;
    flex: none !important;
  }
}

.segmented-tab-btn {
  min-height: 44px;
  padding: 0.55rem 0.75rem;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1), background-color 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out;
  outline: none;
}
.segmented-tab-btn:active {
  transform: scale(0.96);
}
.segmented-tab-btn:focus-visible {
  outline: 2px solid var(--brand-primary, #6366F1);
  outline-offset: 1px;
}

.tab-label-full {
  display: inline;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-label-short {
  display: none;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 480px) {
  .tab-label-full.has-short {
    display: none !important;
  }
  .tab-label-short {
    display: inline !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .segmented-tab-btn {
    transition: none !important;
    transform: none !important;
  }
}
`;

export function SegmentedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  activeColor,
  style,
  layout = 'equal',
  className,
}: SegmentedTabsProps<T>) {
  const containerClassName = [
    'segmented-tabs-root',
    `segmented-tabs-${layout}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="tablist"
      className={containerClassName}
      style={style}
    >
      <style>{SEGMENTED_TABS_CSS}</style>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            className="segmented-tab-btn"
            onClick={() => onChange(tab.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.75rem',
              minHeight: '44px',
              borderRadius: '10px',
              border: 'none',
              background: isActive ? 'var(--surface-color, #FFFFFF)' : 'transparent',
              color: isActive
                ? activeColor || 'var(--text-primary, #0F172A)'
                : 'var(--text-tertiary, #64748B)',
              fontWeight: isActive ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              boxShadow: isActive ? 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.08))' : 'none',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {tab.icon && (
              <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                {tab.icon}
              </span>
            )}
            {tab.shortLabel ? (
              <>
                <span className="tab-label-full has-short">{tab.label}</span>
                <span className="tab-label-short">{tab.shortLabel}</span>
              </>
            ) : (
              <span className="tab-label-full">{tab.label}</span>
            )}
            {typeof tab.count === 'number' && (
              <span
                className="segmented-tab-badge"
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.4rem',
                  borderRadius: '9999px',
                  flexShrink: 0,
                  background: isActive
                    ? (tab.badgeColor ? `${tab.badgeColor}20` : 'rgba(99, 102, 241, 0.12)')
                    : 'var(--surface-hover, rgba(0, 0, 0, 0.05))',
                  color: isActive
                    ? (tab.badgeColor || activeColor || 'var(--brand-primary, #6366F1)')
                    : 'var(--text-tertiary, #94A3B8)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
