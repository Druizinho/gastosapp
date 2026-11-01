import React, { useRef, useMemo, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export interface MonthPickerProps {
  /** Month formatted as "YYYY-MM" */
  value: string;
  /** Callback when month value changes (receives "YYYY-MM") */
  onChange: (value: string) => void;
  /** Minimum selectable month "YYYY-MM" */
  min?: string;
  /** Maximum selectable month "YYYY-MM" */
  max?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Optional custom formatter for displaying the month text */
  formatLabel?: (value: string) => string;
  /** Accessible label for screen readers */
  ariaLabel?: string;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles for outer container */
  style?: React.CSSProperties;
  /** Visual variant: 'default' button or 'subtle' pill for headers/subtitles */
  variant?: 'default' | 'subtle';
  /** Format of the month text ('short' e.g. "Nov 2026", or 'full' e.g. "Noviembre 2026") */
  monthFormat?: 'short' | 'full';
}

const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const FULL_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const formatShortMonth = (val: string): string => {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length < 2) return val;
  const [year, monthStr] = parts;
  const monthIdx = parseInt(monthStr, 10) - 1;
  const name = SHORT_MONTHS[monthIdx] || monthStr;
  return `${name} ${year}`;
};

const formatFullMonth = (val: string): string => {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length < 2) return val;
  const [year, monthStr] = parts;
  const monthIdx = parseInt(monthStr, 10) - 1;
  const name = FULL_MONTHS[monthIdx] || monthStr;
  return `${name} ${year}`;
};

export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  formatLabel,
  ariaLabel = 'Seleccionar mes',
  className = '',
  style,
  variant = 'default',
  monthFormat,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const displayLabel = useMemo(() => {
    if (formatLabel) return formatLabel(value);
    if (monthFormat === 'full' || (variant === 'subtle' && monthFormat !== 'short')) {
      return formatFullMonth(value);
    }
    return formatShortMonth(value);
  }, [value, formatLabel, monthFormat, variant]);

  const handleOpenPicker = () => {
    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;

    // Modern browsers support showPicker() on input elements from user gestures
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // In case browser restricts showPicker()
    }

    // Fallback: briefly allow pointer events and trigger focus/click
    try {
      input.style.pointerEvents = 'auto';
      input.focus();
      input.click();
      input.style.pointerEvents = 'none';
    } catch {
      // Safe fallback
    }
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpenPicker}
        onMouseEnter={() => {
          if (!disabled) setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setIsPressed(false);
        }}
        onMouseDown={() => {
          if (!disabled) setIsPressed(true);
        }}
        onMouseUp={() => setIsPressed(false)}
        onTouchStart={() => {
          if (!disabled) setIsPressed(true);
        }}
        onTouchEnd={() => setIsPressed(false)}
        onTouchCancel={() => setIsPressed(false)}
        aria-label={`${ariaLabel}, actual: ${displayLabel}`}
        title={`${ariaLabel} (${displayLabel})`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: variant === 'subtle' ? '0.35rem' : '0.45rem',
          background: variant === 'subtle'
            ? (isHovered && !disabled ? 'var(--surface-color, #FFFFFF)' : 'var(--surface-muted, rgba(0, 0, 0, 0.04))')
            : 'var(--surface-color, #FFFFFF)',
          color: variant === 'subtle'
            ? 'var(--text-secondary, #475569)'
            : 'var(--text-primary, #0F172A)',
          padding: variant === 'subtle'
            ? '0.22rem 0.55rem 0.22rem 0.48rem'
            : '0.42rem 0.65rem',
          borderRadius: variant === 'subtle'
            ? 'var(--radius-full, 9999px)'
            : 'var(--radius-md, 12px)',
          border: variant === 'subtle'
            ? (isHovered && !disabled ? '1px solid var(--border-color, rgba(0,0,0,0.18))' : '1px solid var(--border-color, rgba(0,0,0,0.08))')
            : '1px solid var(--border-color, rgba(0,0,0,0.08))',
          boxShadow: variant === 'subtle'
            ? (isHovered && !disabled ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))' : 'none')
            : 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          fontFamily: 'inherit',
          fontSize: variant === 'subtle' ? '0.78rem' : '0.82rem',
          fontWeight: 600,
          lineHeight: 1.2,
          userSelect: 'none',
          WebkitTapHighlightColor: 'transparent',
          transform: isPressed && !disabled ? 'scale(0.96)' : 'scale(1)',
          transition: 'transform 150ms ease-out, background-color 150ms ease-out, border-color 150ms ease-out, box-shadow 150ms ease-out',
        }}
      >
        <Calendar
          size={variant === 'subtle' ? 13 : 16}
          color="var(--text-secondary, #64748B)"
          aria-hidden="true"
          style={{ flexShrink: 0, pointerEvents: 'none' }}
        />
        <span style={{ pointerEvents: 'none' }}>{displayLabel}</span>
        {variant === 'subtle' && (
          <ChevronDown
            size={13}
            color="var(--text-tertiary, #94A3B8)"
            aria-hidden="true"
            style={{ flexShrink: 0, pointerEvents: 'none', marginLeft: '-1px' }}
          />
        )}
      </button>

      {/* Hidden native month input that provides the calendar picker popup */}
      <input
        ref={inputRef}
        type="month"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value) {
            onChange(e.target.value);
          }
        }}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          pointerEvents: 'none',
          margin: 0,
          padding: 0,
          border: 'none',
        }}
      />
    </div>
  );
};
