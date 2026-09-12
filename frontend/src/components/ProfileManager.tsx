import React, { useState, useEffect } from 'react';
import { getProfile, updateProfile } from '../api';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const AVATAR_SEEDS = [
  'felix', 'milo', 'charlie', 'coco', 'leo', 
  'max', 'luna', 'daisy', 'bella', 'oliver', 
  'simon', 'zoey', 'jazz', 'cleo', 'toby'
];

const ProfileManager: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('felix');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await getProfile();
      if (profile.display_name) setDisplayName(profile.display_name);
      
      if (profile.avatar_url && profile.avatar_url.includes('dicebear')) {
        const urlParams = new URL(profile.avatar_url).searchParams;
        const seed = urlParams.get('seed');
        if (seed) setSelectedAvatar(seed);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Error al cargar el perfil.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      const avatarUrl = `https://api.dicebear.com/7.x/micah/svg?seed=${selectedAvatar}`;
      
      await updateProfile({
        display_name: displayName,
        avatar_url: avatarUrl
      });
      
      await refreshProfile();
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err.response?.data?.detail || 'Error al guardar el perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Loader2 className="animate-spin text-tertiary" size={24} />
      </div>
    );
  }

  return (
    <div className="soft-card">
      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>
        Editar Perfil
      </h2>

      {error && (
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.5rem', 
          padding: '0.75rem', background: 'var(--expense-bg)', 
          color: 'var(--expense-color)', borderRadius: '8px', 
          marginBottom: '1rem', fontSize: '0.9rem' 
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div style={{ 
          display: 'flex', alignItems: 'center', gap: '0.5rem', 
          padding: '0.75rem', background: 'var(--income-bg)', 
          color: 'var(--income-color)', borderRadius: '8px', 
          marginBottom: '1rem', fontSize: '0.9rem' 
        }}>
          <Check size={16} />
          Perfil guardado exitosamente.
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Nombre a mostrar
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ej. Juan Pérez"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--accent-light)',
              background: 'var(--surface-muted)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '1rem'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Selecciona tu Avatar
          </label>
          <div style={{ 
            display: 'flex', flexWrap: 'wrap', gap: '0.75rem', 
            background: 'var(--surface-muted)', padding: '1rem', borderRadius: 'var(--radius-sm)'
          }}>
            {AVATAR_SEEDS.map((seed) => {
              const isSelected = selectedAvatar === seed;
              return (
                <button
                  key={seed}
                  type="button"
                  onClick={() => setSelectedAvatar(seed)}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: 'var(--radius-full)',
                    border: isSelected ? '3px solid var(--text-primary)' : '2px solid transparent',
                    background: 'var(--surface-color)',
                    padding: 0,
                    cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                    opacity: isSelected ? 1 : 0.7,
                  }}
                >
                  <img 
                    src={`https://api.dicebear.com/7.x/micah/svg?seed=${seed}`} 
                    alt={`Avatar ${seed}`}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          style={{
            marginTop: '0.5rem',
            background: 'var(--text-primary)',
            color: 'var(--surface-color)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            opacity: isSaving ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
          Guardar Cambios
        </button>
      </form>
    </div>
  );
};

export default ProfileManager;
