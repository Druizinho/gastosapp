import React, { useState, useMemo } from 'react';
import type { Category } from '../types';
import { useCategories } from '../context/CategoriesContext';
import {
  createCategory,
  deleteCategory,
  updateCategory,
  seedDefaultCategories,
} from '../api';
import {
  ICON_MAP,
  CATEGORY_COLORS,
  DEFAULT_ICONS,
  resolveCategoryVisuals,
} from '../utils/categoryVisuals';
import {
  Trash2,
  Plus,
  Pencil,
  X,
  RotateCcw,
  Search,
  Check,
  AlertTriangle,
  Layers,
  Package,
} from 'lucide-react';

// Re-export visual helpers for backward compatibility
export { ICON_MAP, CATEGORY_COLORS, DEFAULT_ICONS, resolveCategoryVisuals };

interface CategoryManagerProps {
  onCategoriesChanged?: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ onCategoriesChanged }) => {
  const { categories, loading: isContextLoading, refreshCategories, setCategories } = useCategories();

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Form states (Create / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(CATEGORY_COLORS[0].value);
  const [catIcon, setCatIcon] = useState('Utensils');
  const [iconFilter, setIconFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Delete modal state
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered categories in list
  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const q = searchTerm.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchTerm]);

  // Filtered icons in icon picker
  const filteredIcons = useMemo(() => {
    if (!iconFilter.trim()) return DEFAULT_ICONS;
    const q = iconFilter.toLowerCase();
    return DEFAULT_ICONS.filter((name) => name.toLowerCase().includes(q));
  }, [iconFilter]);

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setCatName('');
    setCatColor(CATEGORY_COLORS[0].value);
    setCatIcon('Utensils');
    setIconFilter('');
    setErrorMessage('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    const { iconName, hexColor } = resolveCategoryVisuals(category);
    setEditingCategory(category);
    setCatName(category.name);
    setCatColor(hexColor);
    setCatIcon(iconName);
    setIconFilter('');
    setErrorMessage('');
    setIsFormOpen(true);
  };

  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setCatName('');
    setErrorMessage('');
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = catName.trim();
    if (!trimmed) {
      setErrorMessage('Ingresa un nombre para la categoría');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      if (editingCategory) {
        const updated = await updateCategory(editingCategory.id, {
          name: trimmed,
          color: catColor,
          icon: catIcon,
        });
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCategory({
          name: trimmed,
          color: catColor,
          icon: catIcon,
        });
        setCategories((prev) => [...prev, created]);
      }
      await refreshCategories();
      onCategoriesChanged?.();
      handleCancelForm();
    } catch (err: any) {
      console.error('Error saving category:', err);
      const msg = err.response?.data?.detail || 'Error al guardar la categoría';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSeedDefaults = async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    setErrorMessage('');
    try {
      const seeded = await seedDefaultCategories();
      setCategories(seeded);
      await refreshCategories();
      onCategoriesChanged?.();
    } catch (err: any) {
      console.error('Error restoring default categories:', err);
      setErrorMessage('Error al restaurar las categorías por defecto');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      await deleteCategory(deletingCategory.id, reassignTo || undefined);
      setCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      await refreshCategories();
      onCategoriesChanged?.();
      setDeletingCategory(null);
      setReassignTo('');
    } catch (err: any) {
      console.error('Error deleting category:', err);
      setErrorMessage('Error al eliminar la categoría');
    } finally {
      setIsDeleting(false);
    }
  };

  const PreviewIcon = ICON_MAP[catIcon] || Package;

  return (
    <div className="category-manager" style={{ maxWidth: '640px', margin: '0 auto' }}>
      {/* Top Header Card */}
      <div className="category-manager-card soft-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Mis Categorías
            </h2>
            <p
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                margin: '0.2rem 0 0 0',
              }}
            >
              Personaliza nombres, colores e íconos en toda tu app
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={isSeeding}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                background: 'var(--surface-color)',
                color: 'var(--text-secondary)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: isSeeding ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s ease, transform 0.15s ease',
              }}
              title="Restaurar o completar las categorías recomendadas del sistema"
            >
              <RotateCcw size={13} className={isSeeding ? 'spin' : ''} />
              <span>{isSeeding ? 'Restaurando...' : 'Restaurar por defecto'}</span>
            </button>

            {!isFormOpen && (
              <button
                type="button"
                onClick={handleOpenCreate}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--accent-color)',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'background-color 0.15s ease, transform 0.15s ease',
                }}
              >
                <Plus size={15} />
                <span>Nueva Categoría</span>
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#EF4444',
              fontSize: '0.82rem',
              marginBottom: '1rem',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Create / Edit Form Panel */}
        {isFormOpen && (
          <form
            onSubmit={handleSaveCategory}
            style={{
              padding: '1.25rem',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {editingCategory ? `Editar Categoría: ${editingCategory.name}` : 'Nueva Categoría'}
              </span>
              <button
                type="button"
                onClick={handleCancelForm}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  padding: '0.2rem',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Live Preview Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0.85rem',
                background: 'var(--surface-color)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: `${catColor}20`,
                  border: `1.5px solid ${catColor}50`,
                  color: catColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                }}
              >
                <PreviewIcon size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Vista previa
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {catName.trim() || 'Nombre de la categoría'}
                </div>
              </div>
            </div>

            {/* Name Input */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '0.35rem',
                }}
              >
                Nombre *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Ej. Cuidado Personal, Restaurantes..."
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--surface-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Color Palette Picker (12 swatches) */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: '0.45rem',
                }}
              >
                Color distintivo
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {CATEGORY_COLORS.map((c) => {
                  const isSelected = catColor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCatColor(c.value)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: c.value,
                        border: isSelected ? '2px solid var(--surface-color)' : '1px solid transparent',
                        boxShadow: isSelected ? `0 0 0 2.5px ${c.value}` : 'none',
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
                      {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Icon Picker with Filter */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.45rem',
                }}
              >
                <label
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    margin: 0,
                  }}
                >
                  Ícono
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    background: 'var(--surface-color)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <Search size={12} color="var(--text-tertiary)" />
                  <input
                    type="text"
                    value={iconFilter}
                    onChange={(e) => setIconFilter(e.target.value)}
                    placeholder="Filtrar ícono..."
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      outline: 'none',
                      width: '100px',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
                  gap: '0.4rem',
                  padding: '0.5rem',
                  background: 'var(--surface-color)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {filteredIcons.map((name) => {
                  const Comp = ICON_MAP[name] || Package;
                  const isSelected = catIcon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setCatIcon(name)}
                      style={{
                        height: '36px',
                        borderRadius: '8px',
                        border: isSelected ? `2px solid ${catColor}` : '1px solid var(--border-color)',
                        background: isSelected ? `${catColor}20` : 'transparent',
                        color: isSelected ? catColor : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'background-color 0.15s ease, transform 0.15s ease',
                      }}
                      title={name}
                    >
                      <Comp size={18} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleCancelForm}
                disabled={isSaving}
                style={{
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  borderRadius: 'var(--radius-sm)',
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
                type="submit"
                disabled={isSaving || !catName.trim()}
                style={{
                  padding: '0.55rem 1.25rem',
                  fontSize: '0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: catColor,
                  color: '#FFFFFF',
                  fontWeight: 600,
                  cursor: isSaving || !catName.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSaving || !catName.trim() ? 0.6 : 1,
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'opacity 0.15s ease, transform 0.15s ease',
                }}
              >
                {isSaving ? 'Guardando...' : editingCategory ? 'Guardar Cambios' : 'Crear Categoría'}
              </button>
            </div>
          </form>
        )}

        {/* Search input when categories list is large */}
        {categories.length > 5 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              background: 'var(--surface-muted)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              marginBottom: '1rem',
            }}
          >
            <Search size={16} color="var(--text-tertiary)" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar categoría..."
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
                width: '100%',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Category List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isContextLoading ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1.5rem 0' }}>
              Cargando categorías...
            </p>
          ) : categories.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2.5rem 1rem',
                color: 'var(--text-secondary)',
              }}
            >
              <Layers size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>No tienes categorías personalizadas</p>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                Toca &quot;Restaurar por defecto&quot; para cargar el set recomendado o crea una nueva.
              </p>
            </div>
          ) : filteredCategories.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1.5rem 0' }}>
              No se encontraron categorías que coincidan con &quot;{searchTerm}&quot;.
            </p>
          ) : (
            filteredCategories.map((c) => {
              const { IconComponent, hexColor } = resolveCategoryVisuals(c);
              const totalUsage = c.usage_count ?? 0;
              const isDefaultSinCat = c.name.trim().toLowerCase() === 'sin categoría' || c.name.trim().toLowerCase() === 'sin categoria';

              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    background: 'var(--surface-color)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: `${hexColor}18`,
                        border: `1.5px solid ${hexColor}40`,
                        color: hexColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <IconComponent size={18} />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          fontSize: '0.92rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {c.name}
                      </div>

                      {/* Usage breakdown badge */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          marginTop: '0.2rem',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: totalUsage > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                            background: totalUsage > 0 ? 'var(--surface-muted)' : 'transparent',
                            padding: totalUsage > 0 ? '0.12rem 0.5rem' : 0,
                            borderRadius: 'var(--radius-full)',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.3,
                          }}
                          title={`Gastos: ${c.expense_count || 0} · Gastos fijos: ${c.fixed_count || 0} · Deudas: ${c.debt_count || 0} · Metas: ${c.saving_count || 0} · Presupuestos: ${c.budget_count || 0}`}
                        >
                          {totalUsage === 1 ? '1 gasto asociado' : `${totalUsage} gastos asociados`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(c)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'var(--surface-muted)',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'color 0.15s ease, background-color 0.15s ease',
                      }}
                      title="Editar categoría"
                    >
                      <Pencil size={15} />
                    </button>

                    {!isDefaultSinCat && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingCategory(c);
                          setReassignTo('');
                        }}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: 'var(--surface-muted)',
                          border: 'none',
                          color: 'var(--expense-color)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.15s ease, background-color 0.15s ease',
                        }}
                        title="Eliminar categoría"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Reassignment Delete Modal */}
      {deletingCategory && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div
            className="expense-form-container soft-card"
            style={{
              maxWidth: '440px',
              width: '90%',
              padding: '1.5rem',
              animation: 'slideUp 0.25s cubic-bezier(0.2, 0, 0, 1) forwards',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#EF4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={18} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                ¿Eliminar categoría?
              </h3>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: '0 0 1rem' }}>
              Estás a punto de eliminar <strong>&quot;{deletingCategory.name}&quot;</strong>.
              {deletingCategory.usage_count && deletingCategory.usage_count > 0 ? (
                <span>
                  {' '}Esta categoría está asociada a <strong>{deletingCategory.usage_count}</strong> {deletingCategory.usage_count === 1 ? 'gasto asociado' : 'gastos asociados'} (gastos, deudas, gastos fijos, etc.).
                </span>
              ) : null}
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '0.35rem',
                }}
              >
                Reasignar gastos asociados a:
              </label>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--surface-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              >
                <option value="">Sin Categoría</option>
                {categories
                  .filter((c) => c.id !== deletingCategory.id && c.name.toLowerCase() !== 'sin categoría')
                  .map((other) => (
                    <option key={other.id} value={other.name}>
                      {other.name}
                    </option>
                  ))}
              </select>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '0.35rem 0 0 0' }}>
                Todos los gastos, deudas y presupuestos vinculados serán transferidos automáticamente.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeletingCategory(null)}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                  background: 'var(--surface-muted)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                style={{
                  flex: 1,
                  padding: '0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--expense-color)',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.7 : 1,
                }}
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar y Reasignar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManager;
