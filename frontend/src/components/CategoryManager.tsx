import React, { useState, useMemo } from 'react';
import type { Category, CategoryKind } from '../types';
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
import ListCard from './ListCard';
import ListCardBottomSheet from './ListCardBottomSheet';
import { SkeletonList } from './ui/Skeleton';
import { SegmentedTabs } from './ui/SegmentedTabs';
import { useToast } from './ui/Toast';

// Re-export visual helpers for backward compatibility
export { ICON_MAP, CATEGORY_COLORS, DEFAULT_ICONS, resolveCategoryVisuals };

export const isSystemCategory = (name: string, kind: CategoryKind): boolean => {
  const norm = name.trim().toLowerCase();
  if (kind === 'income') {
    return norm === 'otros ingresos';
  }
  return norm === 'sin categoría' || norm === 'sin categoria';
};

interface CategoryManagerProps {
  onCategoriesChanged?: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ onCategoriesChanged }) => {
  const toast = useToast();
  const {
    categories: expenseCategories,
    incomeCategories,
    loading: isContextLoading,
    refreshCategories,
    setCategories,
    setIncomeCategories,
  } = useCategories();

  // Active kind selector: 'expense' (Gastos) | 'income' (Ingresos)
  const [activeKind, setActiveKind] = useState<CategoryKind>('expense');

  const currentCategories = activeKind === 'income' ? incomeCategories : expenseCategories;
  const setCurrentCategories = activeKind === 'income' ? setIncomeCategories : setCategories;
  const defaultReassignTarget = activeKind === 'income' ? 'Otros ingresos' : 'Sin Categoría';

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
  const [selectedCategoryForSheet, setSelectedCategoryForSheet] = useState<Category | null>(null);

  // Filtered categories in list
  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return currentCategories;
    const q = searchTerm.toLowerCase();
    return currentCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [currentCategories, searchTerm]);

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
        const updated = await updateCategory(
          editingCategory.id,
          {
            name: trimmed,
            color: catColor,
            icon: catIcon,
            kind: activeKind,
          },
          activeKind
        );
        setCurrentCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } else {
        const created = await createCategory({
          name: trimmed,
          color: catColor,
          icon: catIcon,
          kind: activeKind,
        });
        setCurrentCategories((prev) => [...prev, created]);
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
      const seeded = await seedDefaultCategories(activeKind);
      setCurrentCategories(seeded);
      await refreshCategories();
      onCategoriesChanged?.();
    } catch (err: any) {
      console.error('Error restoring default categories:', err);
      setErrorMessage('Error al restaurar las categorías por defecto');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCancelDelete = () => {
    setDeletingCategory(null);
    setReassignTo('');
  };

  const handleConfirmDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      const target = reassignTo.trim() || defaultReassignTarget;
      await deleteCategory(deletingCategory.id, target, activeKind);
      setCurrentCategories((prev) => prev.filter((c) => c.id !== deletingCategory.id));
      await refreshCategories();
      onCategoriesChanged?.();
      toast.success('Categoría eliminada');
    } catch (err: any) {
      console.error('Error deleting category:', err);
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : err?.message || 'Error al eliminar la categoría';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
      setDeletingCategory(null);
      setReassignTo('');
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

        {/* Kind Selector Tabs (Gastos / Ingresos) */}
        <div style={{ marginBottom: '1rem' }}>
          <SegmentedTabs<'expense' | 'income'>
            tabs={[
              { id: 'expense', label: 'Gastos', count: expenseCategories.length },
              { id: 'income', label: 'Ingresos', count: incomeCategories.length },
            ]}
            activeTab={activeKind}
            onChange={(tab) => {
              setActiveKind(tab);
              setSearchTerm('');
              handleCancelForm();
              setDeletingCategory(null);
            }}
            activeColor={activeKind === 'expense' ? 'var(--expense-color, #EF4444)' : 'var(--income-color, #10B981)'}
          />
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
                {editingCategory ? `Editar Categoría: ${editingCategory.name}` : `Nueva Categoría (${activeKind === 'income' ? 'Ingreso' : 'Gasto'})`}
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
        {currentCategories.length > 5 && (
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
            <div style={{ padding: '8px 0' }}><SkeletonList count={4} /></div>
          ) : currentCategories.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '2.5rem 1rem',
                color: 'var(--text-secondary)',
              }}
            >
              <Layers size={36} color="var(--text-tertiary)" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
                No tienes categorías de {activeKind === 'income' ? 'ingresos' : 'gastos'} personalizadas
              </p>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                Toca &quot;Restaurar por defecto&quot; para cargar el set recomendado o crea una nueva.
              </p>
            </div>
          ) : filteredCategories.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '1.5rem 0' }}>
              No se encontraron categorías de {activeKind === 'income' ? 'ingresos' : 'gastos'} que coincidan con &quot;{searchTerm}&quot;.
            </p>
          ) : (
            filteredCategories.map((c) => {
              const { IconComponent, hexColor } = resolveCategoryVisuals(c);
              const isProtected = isSystemCategory(c.name, activeKind);
              const isIncome = activeKind === 'income';
              const usageCount = isIncome
                ? (c.income_count ?? 0)
                : (c.expense_count ?? c.usage_count ?? 0);
              const usageLabel = isIncome
                ? (usageCount === 1 ? '1 ingreso asociado' : `${usageCount} ingresos asociados`)
                : (usageCount === 1 ? '1 registro asociado' : `${usageCount} registros asociados`);

              const subtitle = (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: usageCount > 0 ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                      background: usageCount > 0 ? 'var(--surface-muted)' : 'transparent',
                      padding: usageCount > 0 ? '0.12rem 0.5rem' : 0,
                      borderRadius: 'var(--radius-full)',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.3,
                    }}
                    title={
                      isIncome
                        ? `Ingresos: ${c.income_count || 0}`
                        : `Gastos: ${c.expense_count || 0} · Gastos fijos: ${c.fixed_count || 0} · Deudas: ${c.debt_count || 0} · Metas: ${c.saving_count || 0} · Presupuestos: ${c.budget_count || 0}`
                    }
                  >
                    {usageLabel}
                  </span>
                </div>
              );

              const badges = isProtected ? (
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-tertiary)',
                    background: 'var(--surface-muted)',
                    padding: '0.1rem 0.45rem',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 500,
                  }}
                >
                  Predeterminada
                </span>
              ) : null;

              const quickAction = (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(c);
                    }}
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

                  {!isProtected && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingCategory(c);
                        setReassignTo(defaultReassignTarget);
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
              );

              return (
                <ListCard
                  key={c.id}
                  statusColor={hexColor}
                  icon={<IconComponent size={18} />}
                  iconBg={`${hexColor}18`}
                  iconColor={hexColor}
                  title={c.name}
                  subtitle={subtitle}
                  badges={badges}
                  quickAction={quickAction}
                  onClick={() => setSelectedCategoryForSheet(c)}
                />
              );
            })
          )}
        </div>
      </div>

      {/* Reassignment Delete Modal */}
      {deletingCategory && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 1100 }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting) handleCancelDelete();
          }}
        >
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
              {(() => {
                const isIncome = activeKind === 'income';
                const count = isIncome
                  ? (deletingCategory.income_count ?? 0)
                  : (deletingCategory.expense_count ?? deletingCategory.usage_count ?? 0);
                const noun = isIncome ? 'ingreso asociado' : 'gasto asociado';
                const nounPlural = isIncome ? 'ingresos asociados' : 'gastos asociados';
                if (count > 0) {
                  return (
                    <span>
                      {' '}Esta categoría está asociada a <strong>{count}</strong> {count === 1 ? noun : nounPlural}
                      {isIncome ? ' (cobros, pagos recibidos, etc.).' : ' (gastos, deudas, gastos fijos, etc.).'}
                    </span>
                  );
                }
                return null;
              })()}
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
                Reasignar {activeKind === 'income' ? 'ingresos asociados' : 'gastos asociados'} a:
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
                <option value={defaultReassignTarget}>{defaultReassignTarget}</option>
                {currentCategories
                  .filter((c) => c.id !== deletingCategory.id && !isSystemCategory(c.name, activeKind))
                  .map((other) => (
                    <option key={other.id} value={other.name}>
                      {other.name}
                    </option>
                  ))}
              </select>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', margin: '0.35rem 0 0 0' }}>
                {activeKind === 'income'
                  ? 'Todos los ingresos vinculados serán transferidos automáticamente.'
                  : 'Todos los gastos, deudas y presupuestos vinculados serán transferidos automáticamente.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCancelDelete}
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

      {/* Mobile Bottom Sheet for Category Details & Breakdown */}
      {selectedCategoryForSheet && (() => {
        const { IconComponent, hexColor } = resolveCategoryVisuals(selectedCategoryForSheet);
        const isProtected = isSystemCategory(selectedCategoryForSheet.name, activeKind);

        const usageItems = activeKind === 'income'
          ? [
              { label: 'Ingresos / Cobros', count: selectedCategoryForSheet.income_count || 0, color: 'var(--income-color, #10B981)' },
            ]
          : [
              { label: 'Gastos', count: selectedCategoryForSheet.expense_count || 0, color: 'var(--expense-color, #EF4444)' },
              { label: 'Gastos Fijos', count: selectedCategoryForSheet.fixed_count || 0, color: 'var(--warning-color, #F59E0B)' },
              { label: 'Deudas', count: selectedCategoryForSheet.debt_count || 0, color: '#8B5CF6' },
              { label: 'Ahorros / Proyectos', count: selectedCategoryForSheet.saving_count || 0, color: 'var(--accent-color, #6366F1)' },
              { label: 'Presupuestos', count: selectedCategoryForSheet.budget_count || 0, color: '#3B82F6' },
            ];

        return (
          <ListCardBottomSheet
            isOpen={!!selectedCategoryForSheet}
            onClose={() => setSelectedCategoryForSheet(null)}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: `${hexColor}18`,
                    color: hexColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconComponent size={16} />
                </div>
                <span>{selectedCategoryForSheet.name}</span>
              </div>
            }
            subtitle="Detalle y uso de la categoría"
            secondaryActions={[
              {
                label: 'Editar',
                icon: <Pencil size={16} />,
                onClick: () => {
                  const target = selectedCategoryForSheet;
                  setSelectedCategoryForSheet(null);
                  handleOpenEdit(target);
                },
              },
              ...(!isProtected
                ? [
                    {
                      label: 'Eliminar',
                      icon: <Trash2 size={16} />,
                      danger: true,
                      onClick: () => {
                        const target = selectedCategoryForSheet;
                        setSelectedCategoryForSheet(null);
                        setDeletingCategory(target);
                        setReassignTo(defaultReassignTarget);
                      },
                    },
                  ]
                : []),
            ]}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Registros asociados por módulo
                </span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '0.6rem',
                    marginTop: '0.5rem',
                  }}
                >
                  {usageItems.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.65rem 0.85rem',
                        background: 'var(--surface-muted)',
                        borderRadius: '10px',
                      }}
                    >
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {item.label}
                      </span>
                      <span
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          color: item.count > 0 ? item.color : 'var(--text-tertiary)',
                        }}
                      >
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ListCardBottomSheet>
        );
      })()}
    </div>
  );
};

export default CategoryManager;
