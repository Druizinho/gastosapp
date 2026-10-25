import React from 'react';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
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
}

export function SegmentedTabs<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  activeColor,
  style,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--surface-muted, rgba(0, 0, 0, 0.04))',
        padding: '4px',
        borderRadius: '14px',
        gap: '4px',
        width: '100%',
        ...style,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.55rem 0.75rem',
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
              transition: 'transform 150ms ease-out, background 150ms ease-out, color 150ms ease-out, box-shadow 150ms ease-out',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {tab.icon}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.4rem',
                  borderRadius: '9999px',
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
