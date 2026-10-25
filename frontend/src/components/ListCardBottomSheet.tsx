import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface BottomSheetAction {
  label: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface BottomSheetPrimaryAction {
  label: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export interface ListCardBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  primaryAction?: BottomSheetPrimaryAction;
  secondaryActions?: BottomSheetAction[];
  children?: React.ReactNode;
  className?: string;
}

export const ListCardBottomSheet: React.FC<ListCardBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  headerExtra,
  primaryAction,
  secondaryActions,
  children,
  className = '',
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="bottom-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bottom-sheet ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-drag-handle" aria-hidden="true" />

        <div className="bottom-sheet-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="bottom-sheet-title">{title}</h3>
            {subtitle && <p className="bottom-sheet-subtitle">{subtitle}</p>}
          </div>
          {headerExtra && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {headerExtra}
            </div>
          )}
        </div>

        <div className="bottom-sheet-content">
          {children}

          {primaryAction && (
            <button
              type="button"
              className={`bottom-sheet-primary-btn ${primaryAction.className || ''}`.trim()}
              onClick={() => {
                primaryAction.onClick();
              }}
              disabled={primaryAction.disabled}
            >
              {primaryAction.icon}
              {primaryAction.label}
            </button>
          )}

          {secondaryActions && secondaryActions.length > 0 && (
            <div className="bottom-sheet-actions-grid">
              {secondaryActions.map((action, index) => (
                <button
                  key={index}
                  type="button"
                  className={`bottom-sheet-action-btn ${action.danger ? 'danger' : ''} ${action.className || ''}`.trim()}
                  onClick={() => {
                    action.onClick();
                  }}
                  disabled={action.disabled}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default React.memo(ListCardBottomSheet);
