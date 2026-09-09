import React, { useState, useEffect } from 'react';
import type { Category } from '../types';
import { getCategories, createCategory, deleteCategory } from '../api';
import { Trash2, Plus } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface CategoryManagerProps {
  onCategoriesChanged: () => void;
}

const DEFAULT_COLORS = ['#ff9f43', '#54a0ff', '#ee5253', '#10ac84', '#f368e0', '#c8d6e5', '#feca57', '#48dbfb'];

const CategoryManager: React.FC<CategoryManagerProps> = ({ onCategoriesChanged }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(DEFAULT_COLORS[0]);
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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setError('');
      await createCategory({ name: newCatName.trim(), color: newCatColor });
      setNewCatName('');
      await fetchCategories();
      onCategoriesChanged();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error creando categoría');
    }
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
            categories.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: 'var(--surface-muted)', marginBottom: '0.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c.color, border: '2px solid var(--surface-color)', boxShadow: '0 0 0 1px var(--border-color)' }}></div>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</span>
                </div>
                {c.name !== 'Sin Categoría' && (
                  <button 
                    onClick={() => openDeleteConfirm(c.id)} 
                    style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: 'var(--surface-muted)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} color="var(--accent-color)" /> Nueva Categoría
          </h3>
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
            <label style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Color</label>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              {DEFAULT_COLORS.map(color => (
                <div 
                  key={color}
                  onClick={() => setNewCatColor(color)}
                  style={{ 
                    width: '32px', height: '32px', borderRadius: '50%', backgroundColor: color, 
                    cursor: 'pointer', 
                    border: newCatColor === color ? '2px solid var(--accent-color)' : '2px solid transparent',
                    boxShadow: newCatColor === color ? '0 0 0 2px var(--surface-color) inset' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                />
              ))}
            </div>
          </div>
          <button 
            type="submit" 
            style={{ marginTop: '0.5rem', padding: '0.875rem', borderRadius: '12px', border: 'none', background: 'var(--accent-color)', color: 'white', fontWeight: 600, cursor: 'pointer' }}
          >
            Agregar Categoría
          </button>
        </form>

      </div>
    </div>
  );
};

export default CategoryManager;
