import React, { useState, useRef, useEffect, useId } from 'react';
import type { Category, CategoryKind } from '../../types';
import { useCategories } from '../../context/CategoriesContext';
import { createCategory } from '../../api';
import {
  resolveCategoryVisuals,
  CATEGORY_COLORS,
  ICON_MAP
} from '../../utils/categoryVisuals';
import { Plus, X, Check, Loader2 } from 'lucide-react';

export interface CategorySelectProps {
  value: string;
  onChange: (categoryName: string) => void;
  categories?: Category[];
  kind?: CategoryKind;
  onCategoryCreated?: (newCategory: Category) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  id?: string;
  name?: string;
  className?: string;
  style?: React.CSSProperties;
}

const INLINE_ICONS = [
  'Utensils',
  'Car',
  'Home',
  'Zap',
  'HeartPulse',
  'Tv',
  'ShoppingCart',
  'GraduationCap',
  'Receipt',
  'CreditCard',
  'PiggyBank',
  'Package',
];

export const CategorySelect: React.FC<CategorySelectProps> = ({
  value,
  onChange,
  categories: propCategories,
  kind = 'expense',
  onCategoryCreated,
  allowEmpty = false,
  emptyLabel = '(Sin categoría)',
  disabled = false,
  required = false,
  label,
  id: customId,
  name,
  className,
  style,
}) => {
  const generatedId = useId();
  const selectId = customId || generatedId;

  // Shared context categories with optional override
  const context = useCategories();
  const categories = propCategories || (kind === 'income' ? context.incomeCategories : context.categories);
  const { addCategoryLocally, refreshCategories } = context;

  // Inline creator state
  const [showInlineCreator, setShowInlineCreator] = useState(false);
  const [showPalettePopover, setShowPalettePopover] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0].value);
  const [newCatIcon, setNewCatIcon] = useState<string>('Utensils');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (showInlineCreator) {
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    } else {
      setShowPalettePopover(false);
    }
  }, [showInlineCreator]);

  useEffect(() => {
    if (!showPalettePopover) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!paletteTriggerRef.current || !paletteTriggerRef.current.contains(target))
      ) {
        setShowPalettePopover(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPalettePopover(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPalettePopover]);

  // Find visual representation for currently selected category
  const selectedCatObj = categories.find(
    (c) => c.name.trim().toLowerCase() === (value || '').trim().toLowerCase()
  );
  const { IconComponent: CurrentIcon, hexColor: currentHexColor } = resolveCategoryVisuals(
    selectedCatObj,
    value
  );

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  const handleSaveInline = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setCreatorError('El nombre no puede estar vacío');
      return;
    }

    setIsSubmitting(true);
    setCreatorError(null);
    try {
      const created = await createCategory({
        name: trimmed,
        color: newCatColor,
        icon: newCatIcon,
        kind,
      });

      // Update local shared state instantly
      addCategoryLocally(created);
      if (onCategoryCreated) {
        onCategoryCreated(created);
      }
      refreshCategories().catch(() => {});

      // Auto-select newly created category
      onChange(created.name);

      // Reset & close inline creator & popover
      setNewCatName('');
      setShowInlineCreator(false);
      setShowPalettePopover(false);
    } catch (err: any) {
      console.error('Error creating category inline:', err);
      const msg = err.response?.data?.detail || 'Error al crear la categoría';
      setCreatorError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelInline = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowInlineCreator(false);
    setShowPalettePopover(false);
    setNewCatName('');
    setCreatorError(null);
  };

  const NewPreviewIcon = ICON_MAP[newCatIcon] || ICON_MAP.Package;

  return (
    <div
      className={`category-select-container ${showInlineCreator ? 'category-select-container--creating' : ''} ${className || ''}`.trim()}
      style={{ width: '100%', position: 'relative', ...style }}
    >
      {Boolean(label || !disabled) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.35rem',
            marginBottom: '0.35rem',
          }}
        >
          {label ? (
            <label
              htmlFor={selectId}
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                margin: 0,
              }}
            >
              {label}
              {required && ' *'}
            </label>
          ) : (
            <span />
          )}

          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (showInlineCreator) {
                  handleCancelInline();
                } else {
                  setShowInlineCreator(true);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                border: 'none',
                background: showInlineCreator ? 'var(--surface-muted)' : 'none',
                color: showInlineCreator ? 'var(--text-secondary)' : 'var(--accent-color)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: showInlineCreator ? '0.15rem 0.5rem' : '0.15rem 0.4rem',
                borderRadius: showInlineCreator ? '999px' : '6px',
                transition: 'background-color 0.15s ease, transform 0.15s ease, color 0.15s ease',
              }}
              title={showInlineCreator ? 'Cancelar creación' : 'Crear nueva categoría'}
            >
              {showInlineCreator ? (
                <>
                  <X size={12} />
                  <span>Cancelar</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>Nueva</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Either the Select Row OR the 1-Line Inline Creator */}
      {!showInlineCreator ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            position: 'relative',
          }}
        >
          {/* Visual category icon badge preview */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: value ? `${currentHexColor}18` : 'var(--surface-muted)',
              border: `1px solid ${value ? `${currentHexColor}40` : 'var(--border-color)'}`,
              color: value ? currentHexColor : 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
            }}
            title={value || emptyLabel}
          >
            <CurrentIcon size={18} />
          </div>

          {/* The Native Select */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <select
              id={selectId}
              name={name}
              value={value || ''}
              onChange={handleSelectChange}
              disabled={disabled}
              required={required}
              style={{
                width: '100%',
                padding: '0.65rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-color)',
                color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: '0.9rem',
                fontWeight: 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
            >
              {allowEmpty && <option value="">{emptyLabel}</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div
          className="form-collapse-reveal"
          style={{
            minHeight: '40px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            position: 'relative',
            width: '100%',
          }}
        >
          {/* 1. Palette Trigger Button */}
          <button
            ref={paletteTriggerRef}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowPalettePopover((prev) => !prev);
            }}
            style={{
              width: '38px',
              height: '40px',
              padding: 0,
              borderRadius: 'var(--radius-sm, 10px)',
              border: `1.5px solid ${newCatColor}`,
              background: `${newCatColor}20`,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'transform 150ms ease-out, background-color 150ms ease',
            }}
            title="Personalizar icono y color"
          >
            <NewPreviewIcon size={16} color={newCatColor} />
          </button>

          {/* 2. Category Name Input */}
          <input
            ref={nameInputRef}
            type="text"
            autoFocus
            placeholder="Nombre de categoría..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleSaveInline();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                handleCancelInline();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              height: '40px',
              padding: '0 0.65rem',
              fontSize: '0.85rem',
              borderRadius: 'var(--radius-sm, 10px)',
              border: '1px solid var(--border-color)',
              background: 'var(--surface-color)',
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* 3. Save Button */}
          <button
            type="button"
            onClick={handleSaveInline}
            disabled={isSubmitting || !newCatName.trim()}
            style={{
              width: '38px',
              height: '40px',
              padding: 0,
              borderRadius: 'var(--radius-sm, 10px)',
              border: 'none',
              background: 'var(--accent-color, #111827)',
              color: 'var(--text-inverse, #FFFFFF)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSubmitting || !newCatName.trim() ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || !newCatName.trim() ? 0.6 : 1,
              flexShrink: 0,
              transition: 'transform 150ms ease-out, opacity 150ms ease',
            }}
            title="Guardar categoría"
          >
            {isSubmitting ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
          </button>
        </div>
      )}

      {/* Inline error line right below the bar */}
      {showInlineCreator && creatorError && (
        <div
          style={{
            marginTop: '0.35rem',
            fontSize: '0.75rem',
            color: '#ef4444',
            lineHeight: 1.2,
          }}
        >
          {creatorError}
        </div>
      )}

      {/* Floating Palette Popover */}
      {showInlineCreator && showPalettePopover && (
        <div
          ref={popoverRef}
          className="form-collapse-reveal"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 60,
            width: 'min(290px, 90vw)',
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          {/* Header with live preview badge + Listo button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: `${newCatColor}20`,
                  border: `1px solid ${newCatColor}40`,
                  color: newCatColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <NewPreviewIcon size={14} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Icono y color
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowPalettePopover(false);
              }}
              style={{
                color: 'var(--text-primary)',
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-color)',
                padding: '0.2rem 0.6rem',
                borderRadius: 'var(--radius-xs, 6px)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Listo ✓
            </button>
          </div>

          {/* 12 Color Swatches */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
              Color
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {CATEGORY_COLORS.map((c) => {
                const isSelected = newCatColor === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setNewCatColor(c.value);
                    }}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: c.value,
                      border: isSelected ? '2px solid var(--surface-color)' : '1px solid transparent',
                      outline: isSelected ? '2px solid var(--accent-color)' : 'none',
                      outlineOffset: isSelected ? '2px' : '0',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 150ms ease-out',
                    }}
                    title={c.label}
                  >
                    {isSelected && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 12 Icons */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
              Ícono
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '0.35rem',
              }}
            >
              {INLINE_ICONS.map((iconKey) => {
                const IconComp = ICON_MAP[iconKey] || ICON_MAP.Package;
                const isSelected = newCatIcon === iconKey;
                return (
                  <button
                    key={iconKey}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setNewCatIcon(iconKey);
                    }}
                    style={{
                      height: '28px',
                      borderRadius: '6px',
                      border: isSelected ? `1.5px solid ${newCatColor}` : '1px solid var(--border-color)',
                      background: isSelected ? `${newCatColor}20` : 'var(--bg-color)',
                      color: isSelected ? newCatColor : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'transform 150ms ease-out, background-color 150ms ease',
                    }}
                    title={iconKey}
                  >
                    <IconComp size={15} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySelect;
