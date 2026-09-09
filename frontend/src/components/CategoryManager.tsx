import React, { useState, useEffect } from 'react';
import type { Category } from '../types';
import { getCategories, createCategory, deleteCategory } from '../api';
import { Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

interface CategoryManagerProps {
  onClose: () => void;
  onCategoriesChanged: () => void;
}

const DEFAULT_COLORS = ['#ff9f43', '#54a0ff', '#ee5253', '#10ac84', '#f368e0', '#c8d6e5', '#feca57', '#48dbfb'];

const CategoryManager: React.FC<CategoryManagerProps> = ({ onClose, onCategoriesChanged }) => {
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
    <div className="modal-backdrop">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        title="¿Borrar categoría?"
        message="¿Seguro que quieres borrar esta categoría? Los gastos asociados se moverán a 'Sin Categoría'."
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmModal({ isOpen: false, categoryId: '' })}
      />
      <div className="expense-form-container glass-panel" style={{ maxWidth: '400px', width: '100%' }}>
        <h2>Mis Categorías</h2>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <div style={{ marginBottom: '2rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '10px' }}>
          {isLoading ? (
            <p>Cargando...</p>
          ) : categories.length === 0 ? (
            <p style={{ color: '#94a3b8' }}>No tienes categorías personalizadas.</p>
          ) : (
            categories.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: '0.5rem', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: c.color }}></div>
                  <span>{c.name}</span>
                </div>
                {c.name !== 'Sin Categoría' && (
                  <button onClick={() => openDeleteConfirm(c.id)} className="action-btn delete-btn" style={{ padding: '0.25rem' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Nombre de la Categoría</label>
            <input 
              type="text" 
              value={newCatName} 
              onChange={e => setNewCatName(e.target.value)} 
              placeholder="Ej. Gimnasio"
              required
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Color</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {DEFAULT_COLORS.map(color => (
                <div 
                  key={color}
                  onClick={() => setNewCatColor(color)}
                  style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', backgroundColor: color, 
                    cursor: 'pointer', border: newCatColor === color ? '2px solid white' : 'none' 
                  }}
                />
              ))}
            </div>
          </div>
          <button type="submit" className="btn-submit" style={{ marginTop: '0.5rem' }}>Agregar</button>
        </form>

        <button onClick={onClose} className="btn-cancel" style={{ width: '100%', marginTop: '1rem' }}>Cerrar</button>
      </div>
    </div>
  );
};

export default CategoryManager;
