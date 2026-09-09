import React from 'react';
import CategoryManager from './CategoryManager';
import { supabase } from '../supabaseClient';
import { LogOut } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      <header className="soft-card" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Ajustes</h1>
        <button 
          onClick={handleSignOut} 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.6rem 1rem', 
            borderRadius: '10px', 
            border: 'none', 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: '#ef4444', 
            fontWeight: 600, 
            cursor: 'pointer' 
          }}
        >
          <LogOut size={16} />
          Cerrar Sesión
        </button>
      </header>

      <div className="settings-content">
        <CategoryManager onCategoriesChanged={() => {}} />
      </div>
    </div>
  );
};
