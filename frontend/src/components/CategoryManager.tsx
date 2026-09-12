import React, { useState, useEffect } from 'react';
import type { Category } from '../types';
import { getCategories, createCategory, deleteCategory, updateCategory } from '../api';
import { 
  Trash2, Plus, Edit2, X, 
  ShoppingCart, Car, Home, Tv, HeartPulse, 
  Shirt, Plane, Lightbulb, Coffee, Smartphone,
  Utensils, Gamepad2, Briefcase, GraduationCap, Gift,
  Package
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface CategoryManagerProps {
  onCategoriesChanged: () => void;
}

export const ICON_MAP: Record<string, React.FC<any>> = {
  ShoppingCart, Car, Home, Tv, HeartPulse, 
  Shirt, Plane, Lightbulb, Coffee, Smartphone,
  Utensils, Gamepad2, Briefcase, GraduationCap, Gift
};

const DEFAULT_ICONS = Object.keys(ICON_MAP);

const CategoryManager: React.FC<CategoryManagerProps> = ({ onCategoriesChanged }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(DEFAULT_ICONS[0]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, categoryId: '' });

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
      setError('Error cargando categorías');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleAddOrUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setError('');
      if (editingCategory) {
        await updateCategory(editingCategory.id, { name: newCatName.trim(), color: newCatColor });
      } else {
        await createCategory({ name: newCatName.trim(), color: newCatColor });
      }
      handleCancelEdit();
      await fetchCategories();
      onCategoriesChanged();
    } catch (err: any) {
      setError(err.response?.data?.detail || (editingCategory ? 'Error actualizando categoría' : 'Error creando categoría'));
    }
  };

  const handleEditClick = (category: Category) => {
    setEditingCategory(category);
    setNewCatName(category.name);
    setNewCatColor(category.color || DEFAULT_ICONS[0]);
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setNewCatName('');
    setNewCatColor(DEFAULT_ICONS[0]);
    setError('');
  };

  const openDeleteConfirm = (id: string) => {
    setConfirmModal({ isOpen: true, categoryId: id });
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteCategory(confirmModal.categoryId);
      setConfirmModal({ isOpen: false, categoryId: '' });
      await fetchCategories();
      onCategoriesChanged();
    } catch (err) {
      console.error(err);
      setError('Error borrando categoría');
      setConfirmModal({ isOpen: false, categoryId: '' });
    }
  };

  return (
    <div className="category-manager">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title="¿Borrar categoría?"
        message="¿Seguro que quieres borrar esta categoría? Los gastos asociados se moverán a 'Sin Categoría'."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmModal({ isOpen: false, categoryId: '' })}
      />
      <div className="soft-card" style={{ padding: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Mis Categorías</h2>
        
        {error && <div style={{ color: 'var(--expense-color)', marginBottom: '1rem', fontSize: '0.9rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '8px' }}>{error}</div>}

        <div style={{ marginBottom: '2rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {isLoading ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>Cargando...</p>
          ) : categories.length === 0 ? (
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>No tienes categorías personalizadas.</p>
          ) : (
            categories.map(c => {
              const IconComponent = ICON_MAP[c.color] || Package;
              return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: 'var(--surface-muted)', marginBottom: '0.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'var(--surface-color)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <IconComponent size={18} />
                  </div>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</span>
                </div>
                {c.name !== 'Sin Categoría' && (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button 
                      onClick={() => handleEditClick(c)} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Editar"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => openDeleteConfirm(c.id)} 
                      style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Borrar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleAddOrUpdateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: 'var(--surface-muted)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {editingCategory ? <Edit2 size={18} color="var(--accent-color)" /> : <Plus size={18} color="var(--accent-color)" />}
              {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
            </h3>
            {editingCategory && (
              <button 
                type="button" 
                onClick={handleCancelEdit}
                style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
              >
                <X size={16} /> Cancelar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Nombre de la Categoría</label>
            <input 
              type="text" 
              value={newCatName} 
              onChange={e => setNewCatName(e.target.value)} 
              placeholder="Ej. Gimnasio"
              required
              style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Icono</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {DEFAULT_ICONS.map(iconName => {
                const IconComponent = ICON_MAP[iconName];
                const isSelected = newCatColor === iconName;
                return (
                  <div 
                    key={iconName}
                    onClick={() => setNewCatColor(iconName)}
                    style={{ 
                      width: '40px', height: '40px', borderRadius: '10px', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSelected ? 'var(--accent-light)' : 'var(--surface-color)',
                      color: isSelected ? 'var(--accent-color)' : 'var(--text-tertiary)',
                      cursor: 'pointer', 
                      border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <IconComponent size={20} />
                  </div>
                );
              })}
            </div>
          </div>
          <button 
            type="submit" 
            style={{ marginTop: '0.5rem', padding: '0.875rem', borderRadius: '12px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
          >
            {editingCategory ? 'Guardar Cambios' : 'Agregar Categoría'}
          </button>
        </form>

      </div>
    </div>
  );
};

export default CategoryManager;
