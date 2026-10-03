import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Check, 
  X, 
  Trash2, 
  User, 
  Clock,
  AlertCircle,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getConnections, 
  requestConnection, 
  acceptConnection, 
  rejectConnection, 
  deleteConnection 
} from '../api';
import type { Connection } from '../types';

export const ConnectionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [requesting, setRequesting] = useState(false);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const data = await getConnections();
      setConnections(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cargar conexiones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    
    try {
      setRequesting(true);
      setError(null);
      await requestConnection(newEmail.trim());
      setNewEmail('');
      await fetchConnections();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al enviar solicitud');
    } finally {
      setRequesting(false);
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await acceptConnection(id);
      await fetchConnections();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al aceptar solicitud');
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('¿Rechazar esta solicitud?')) return;
    try {
      await rejectConnection(id);
      await fetchConnections();
    } catch (err: any) {
      setError('Error al rechazar solicitud');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta conexión?')) return;
    try {
      await deleteConnection(id);
      await fetchConnections();
    } catch (err: any) {
      setError('Error al eliminar conexión');
    }
  };

  const pendingReceived = connections.filter(c => !c.is_requester && c.status === 'pending');
  const pendingSent = connections.filter(c => c.is_requester && c.status === 'pending');
  const activeConnections = connections.filter(c => c.status === 'accepted');

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header with back button */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', gap: '0.5rem', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <button
            onClick={() => navigate('/herramientas')}
            style={{
              width: '40px', height: '40px', borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)', border: 'none', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', color: 'var(--text-primary)',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Conexiones
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Conecta con otros usuarios
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Agregar Conexión */}
      <div className="soft-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Añadir Conexión</h2>
        <form onSubmit={handleRequest} style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Correo del usuario..."
            style={{
              flex: 1, padding: '0.75rem', border: '1px solid var(--accent-light)',
              borderRadius: 'var(--radius-md)', background: 'var(--surface-color)',
              color: 'var(--text-primary)', outline: 'none'
            }}
            required
          />
          <button
            type="submit"
            disabled={requesting || !newEmail.trim()}
            style={{
              padding: '0 1.25rem', background: 'var(--primary-color)', color: 'white',
              border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: requesting || !newEmail.trim() ? 'not-allowed' : 'pointer',
              opacity: requesting || !newEmail.trim() ? 0.7 : 1
            }}
          >
            {requesting ? '...' : <><UserPlus size={18} /> Conectar</>}
          </button>
        </form>
      </div>

      {/* Solicitudes Recibidas */}
      {pendingReceived.length > 0 && (
        <div className="soft-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--primary-color)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} style={{ color: 'var(--primary-color)' }} />
            Solicitudes Recibidas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingReceived.map(conn => (
              <div key={conn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--surface-muted)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={20} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{conn.partner_name}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>Quiere conectar contigo</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleAccept(conn.id)}
                    style={{ padding: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                  >
                    <Check size={20} />
                  </button>
                  <button
                    onClick={() => handleReject(conn.id)}
                    style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conexiones Activas */}
      <div className="soft-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>Mis Conexiones</h2>
        {activeConnections.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '2rem 0', fontSize: '0.95rem' }}>
            Aún no tienes conexiones activas.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeConnections.map(conn => (
              <div key={conn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', border: '1px solid var(--accent-light)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={20} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{conn.partner_name}</p>
                    <p style={{ fontSize: '0.75rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.25rem', margin: 0, marginTop: '0.15rem' }}>
                      <span style={{ width: '6px', height: '6px', background: '#10B981', borderRadius: '50%' }}></span> Conectado
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(conn.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--expense-color)', padding: '0.5rem', cursor: 'pointer' }}
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Solicitudes Enviadas */}
      {pendingSent.length > 0 && (
        <div className="soft-card" style={{ padding: '1.5rem', opacity: 0.8 }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Solicitudes Enviadas
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingSent.map(conn => (
              <div key={conn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid var(--accent-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                  <User size={16} />
                  <span style={{ fontSize: '0.9rem' }}>{conn.partner_name}</span>
                </div>
                <button
                  onClick={() => handleDelete(conn.id)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--expense-color)', fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
