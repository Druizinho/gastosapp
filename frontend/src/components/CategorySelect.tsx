import React, { useState, useId } from 'react';
import type { Category, CategoryKind } from '../types';
import { useCategories } from '../context/CategoriesContext';
import { createCategory } from '../api';
import {
  resolveCategoryVisuals,
  CATEGORY_COLORS,
  ICON_MAP
} from '../utils/categoryVisuals';
import { Plus, X, Check, Loader2, Sparkles } from 'lucide-react';

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

const POPULAR_ICONS = [
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
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState<string>(CATEGORY_COLORS[0].value);
  const [newCatIcon, setNewCatIcon] = useState<string>('Utensils');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);

  // Find visual representation for currently selected category
  const selectedCatObj = categories.find(
    (c) => c.name.trim().toLowerCase() === (value || '').trim().toLowerCase()
  );
  const { IconComponent: CurrentIcon, hexColor: currentHexColor } = resolveCategoryVisuals(
    selectedCatObj,
    value
  );

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__CREATE_NEW__') {
      setShowInlineCreator(true);
      return;
    }
    onChange(val);
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

      // Reset & close inline creator
      setNewCatName('');
      setShowInlineCreator(false);
    } catch (err: any) {
      console.error('Error creating category inline:', err);
      const msg = err.response?.data?.detail || 'Error al crear la categoría';
      setCreatorError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelInline = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowInlineCreator(false);
    setNewCatName('');
    setCreatorError(null);
  };

  const PreviewIcon = ICON_MAP[newCatIcon] || ICON_MAP.Package;

  return (
    <div className={`category-select-container ${className || ''}`} style={{ width: '100%', ...style }}>
      {label && (
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

          {!disabled && !showInlineCreator && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowInlineCreator(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'none',
                border: 'none',
                color: 'var(--accent-color)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0.15rem 0.4rem',
                borderRadius: '6px',
                transition: 'background-color 0.15s ease, transform 0.15s ease',
              }}
              title="Crear nueva categoría"
            >
              <Plus size={13} />
              <span>+ Nueva</span>
            </button>
          )}
        </div>
      )}

      {/* Main Select Dropdown Row */}
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

        {/* The Native Select for accessible & mobile-friendly usage */}
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
            {!disabled && (
              <option value="__CREATE_NEW__" style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
                ➕ Crear nueva categoría...
              </option>
            )}
          </select>
        </div>
      </div>

      {/* Inline Mini-Creator Panel */}
      {showInlineCreator && (
        <div
          style={{
            marginTop: '0.65rem',
            padding: '0.85rem',
            background: 'var(--surface-muted)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            animation: 'fadeIn 0.15s ease-out',
            boxSizing: 'border-box',
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Sparkles size={13} color="var(--accent-color)" />
              Nueva Categoría Rápida
            </span>
            <button
              type="button"
              onClick={handleCancelInline}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: '0.15rem',
                display: 'flex',
                borderRadius: '4px',
              }}
              title="Cancelar"
            >
              <X size={15} />
            </button>
          </div>

          {creatorError && (
            <div
              style={{
                fontSize: '0.75rem',
                color: '#EF4444',
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '0.35rem 0.5rem',
                borderRadius: '6px',
              }}
            >
              {creatorError}
            </div>
          )}

          {/* Name Input + Live Preview Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: `${newCatColor}20`,
                border: `1px solid ${newCatColor}45`,
                color: newCatColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <PreviewIcon size={16} />
            </div>

            <input
              type="text"
              autoFocus
              placeholder="Nombre (ej. Mascotas, Suscripciones)"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSaveInline();
                }
              }}
              style={{
                flex: '1 1 130px',
                minWidth: 0,
                padding: '0.55rem 0.7rem',
                fontSize: '0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-color)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Color Palette (Compact Dots) */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
              Color
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
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
                      boxShadow: isSelected ? `0 0 0 2px ${c.value}` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                      transition: 'transform 0.15s ease',
                    }}
                    title={c.label}
                  >
                    {isSelected && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Icons (Grid) */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '0.3rem' }}>
              Ícono
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(28px, 1fr))',
                gap: '0.35rem',
              }}
            >
              {POPULAR_ICONS.map((iconKey) => {
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
                      background: isSelected ? `${newCatColor}18` : 'var(--surface-color)',
                      color: isSelected ? newCatColor : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'transform 0.15s ease, background-color 0.15s ease',
                    }}
                    title={iconKey}
                  >
                    <IconComp size={15} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              marginTop: '0.25rem',
            }}
          >
            <button
              type="button"
              onClick={handleCancelInline}
              disabled={isSubmitting}
              style={{
                flex: '1 1 auto',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.4rem 0.75rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-color)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveInline}
              disabled={isSubmitting || !newCatName.trim()}
              style={{
                flex: '1 1 auto',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                borderRadius: '6px',
                border: 'none',
                background: newCatColor,
                color: '#FFFFFF',
                fontWeight: 600,
                cursor: isSubmitting || !newCatName.trim() ? 'not-allowed' : 'pointer',
                opacity: isSubmitting || !newCatName.trim() ? 0.6 : 1,
                gap: '0.3rem',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {isSubmitting && <Loader2 size={12} className="spin" />}
              Guardar Categoría
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategorySelect;
