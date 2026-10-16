import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Check, 
  X, 
  Clock, 
  AlertCircle, 
  ArrowLeft, 
  Home, 
  CreditCard, 
  ChevronRight, 
  Search,
  Inbox,
  PiggyBank
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  getConnections, 
  getPanasOverview, 
  acceptConnection, 
  rejectConnection, 
  deleteConnection 
} from '../api';
import type { Connection, PanasGlobalOverview, PanaSummary } from '../types';
import { InvitePanaModal } from '../components/InvitePanaModal';
import { PanaDetailModal } from '../components/PanaDetailModal';

export const PanasPage: React.FC = () => {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [overview, setOverview] = useState<PanasGlobalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs: 'panas' | 'requests'
  const [activeTab, setActiveTab] = useState<'panas' | 'requests'>('panas');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [connectionsData, overviewData] = await Promise.all([
        getConnections(),
        getPanasOverview()
      ]);
      setConnections(connectionsData);
      setOverview(overviewData);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al cargar los panas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAccept = async (id: string) => {
    try {
      await acceptConnection(id);
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al aceptar la solicitud');
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('¿Rechazar esta solicitud de conexión?')) return;
    try {
      await rejectConnection(id);
      await fetchData();
    } catch (err: any) {
      setError('Error al rechazar la solicitud');
    }
  };

  const handleCancelInvite = async (id: string) => {
    if (!confirm('¿Cancelar esta invitación enviada?')) return;
    try {
      await deleteConnection(id);
      await fetchData();
    } catch (err: any) {
      setError('Error al cancelar la invitación');
    }
  };

  const pendingReceived = connections.filter(c => !c.is_requester && c.status === 'pending');
  const pendingSent = connections.filter(c => c.is_requester && c.status === 'pending');
  const activePanas = overview?.panas || [];

  const filteredPanas = activePanas.filter(p => 
    p.partner_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.partner_email && p.partner_email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalRequestsCount = pendingReceived.length + pendingSent.length;

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '640px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: '0.75rem', 
        marginBottom: '1.25rem', 
        paddingTop: '0.5rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <button
            onClick={() => navigate('/herramientas')}
            style={{
              width: '40px', 
              height: '40px', 
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-color)', 
              border: 'none', 
              display: 'flex',
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)', 
              color: 'var(--text-primary)',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Panas
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
              Finanzas compartidas con tus compañeros
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsInviteModalOpen(true)}
          style={{
            padding: '0.55rem 0.95rem',
            background: 'var(--primary-color)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            cursor: 'pointer',
            flexShrink: 0,
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <UserPlus size={16} />
          <span>Invitar</span>
        </button>
      </header>

      {error && (
        <div style={{ 
          padding: '0.85rem 1rem', 
          background: 'rgba(239, 68, 68, 0.1)', 
          color: '#EF4444', 
          borderRadius: 'var(--radius-md)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          marginBottom: '1.25rem', 
          fontSize: '0.85rem' 
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Global Summary Card */}
      {overview && overview.total_active_panas > 0 && (
        <div className="soft-card" style={{ 
          padding: '1.25rem', 
          marginBottom: '1.25rem',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.04))',
          border: '1px solid rgba(99, 102, 241, 0.2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Resumen Conjunto
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {overview.total_active_panas} {overview.total_active_panas === 1 ? 'Pana conectado' : 'Panas conectados'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            {/* Gastos fijos stats */}
            <div style={{ 
              background: 'var(--surface-color)', 
              padding: '0.85rem', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                <Home size={15} style={{ color: 'var(--primary-color)' }} />
                <span>Gastos Fijos</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {overview.total_shared_fixed_expenses}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: overview.pending_shared_fixed_expenses_this_month > 0 ? '#F59E0B' : '#10B981', fontWeight: 500 }}>
                {overview.pending_shared_fixed_expenses_this_month > 0 
                  ? `${overview.pending_shared_fixed_expenses_this_month} pendiente(s) este mes`
                  : 'Al día este mes'
                }
              </div>
            </div>

            {/* Deudas compartidas stats */}
            <div style={{ 
              background: 'var(--surface-color)', 
              padding: '0.85rem', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                <CreditCard size={15} style={{ color: '#6366F1' }} />
                <span>Deudas Terceros</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {overview.total_shared_debts}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {Object.keys(overview.shared_debts_remaining_by_currency).length > 0 ? (
                  Object.entries(overview.shared_debts_remaining_by_currency).map(([curr, amount]) => (
                    `${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${curr}`
                  )).join(' • ')
                ) : (
                  'Sin saldo pendiente'
                )}
              </div>
            </div>

            {/* Fondos de ahorro compartidos stats */}
            <div style={{ 
              background: 'var(--surface-color)', 
              padding: '0.85rem', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--accent-light)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.78rem', marginBottom: '0.35rem' }}>
                <PiggyBank size={15} style={{ color: '#10B981' }} />
                <span>Fondos de Ahorro</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {overview.total_shared_saving_goals || 0}
              </div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.2rem', color: '#10B981', fontWeight: 500 }}>
                Metas conjuntas
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        background: 'var(--surface-muted)',
        borderRadius: 'var(--radius-md)',
        padding: '0.25rem',
        marginBottom: '1.25rem'
      }}>
        <button
          onClick={() => setActiveTab('panas')}
          style={{
            flex: 1,
            padding: '0.6rem',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: activeTab === 'panas' ? 'var(--surface-color)' : 'transparent',
            color: activeTab === 'panas' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'panas' ? 700 : 500,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            boxShadow: activeTab === 'panas' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          <Users size={16} />
          Mis Panas ({activePanas.length})
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          style={{
            flex: 1,
            padding: '0.6rem',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: activeTab === 'requests' ? 'var(--surface-color)' : 'transparent',
            color: activeTab === 'requests' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'requests' ? 700 : 500,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.45rem',
            cursor: 'pointer',
            boxShadow: activeTab === 'requests' ? 'var(--shadow-sm)' : 'none',
            position: 'relative',
            transition: 'all 0.2s'
          }}
        >
          <Inbox size={16} />
          Solicitudes ({totalRequestsCount})
          {pendingReceived.length > 0 && (
            <span style={{
              width: '8px',
              height: '8px',
              background: '#EF4444',
              borderRadius: '50%',
              display: 'inline-block'
            }} />
          )}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : activeTab === 'panas' ? (
        /* TAB 1: MIS PANAS */
        <div>
          {activePanas.length > 3 && (
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Buscar por nombre..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem 0.65rem 2.4rem',
                  border: '1px solid var(--accent-light)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem'
                }}
              />
            </div>
          )}

          {filteredPanas.length === 0 ? (
            <div className="soft-card" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                color: 'var(--primary-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem'
              }}>
                <Users size={28} />
              </div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
                {activePanas.length === 0 ? 'Aún no tienes panas conectados' : 'No se encontraron panas'}
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem', maxWidth: '380px', marginInline: 'auto' }}>
                {activePanas.length === 0 
                  ? 'Conecta con tu pareja, roomie o familiar para compartir gastos fijos de la casa o deudas conjuntas ante terceros.'
                  : 'Prueba buscando con otro término.'}
              </p>
              {activePanas.length === 0 && (
                <button
                  onClick={() => setIsInviteModalOpen(true)}
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem'
                  }}
                >
                  <UserPlus size={18} />
                  Invitar a tu primer Pana
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {filteredPanas.map((pana: PanaSummary) => (
                <div
                  key={pana.id}
                  onClick={() => setSelectedPartnerId(pana.partner_id)}
                  className="soft-card"
                  style={{
                    padding: '1.1rem 1.25rem',
                    cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    border: '1px solid var(--accent-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }}
                >
                  {/* Top Pana row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: 'var(--radius-full)',
                        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '1.1rem',
                        flexShrink: 0
                      }}>
                        {pana.partner_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            {pana.partner_name}
                          </span>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#10B981'
                          }} />
                        </div>
                        {pana.partner_email && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                            {pana.partner_email}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--primary-color)', fontSize: '0.8rem', fontWeight: 600 }}>
                      <span>Detalles</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>

                  {/* Shared summary pills */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.6rem', 
                    flexWrap: 'wrap',
                    paddingTop: '0.4rem',
                    borderTop: '1px solid var(--accent-light)'
                  }}>
                    {/* Gastos Fijos pill */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-muted)',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <Home size={13} style={{ color: 'var(--primary-color)' }} />
                      <span>{pana.shared_fixed_expenses_count} gasto(s) fijo(s)</span>
                      {pana.shared_fixed_expenses_count > 0 && (
                        pana.pending_fixed_expenses_this_month > 0 ? (
                          <span style={{ color: '#F59E0B', fontWeight: 600 }}>• {pana.pending_fixed_expenses_this_month} pendiente(s)</span>
                        ) : (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>• Al día</span>
                        )
                      )}
                    </div>

                    {/* Deudas compartidas pill */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-muted)',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <CreditCard size={13} style={{ color: '#6366F1' }} />
                      <span>{pana.shared_debts_count} deuda(s) compartida(s)</span>
                      {Object.keys(pana.debts_currency_summary).length > 0 && (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          • Resta: {Object.entries(pana.debts_currency_summary).map(([curr, amt]) => `${amt} ${curr}`).join(', ')}
                        </span>
                      )}
                    </div>

                    {/* Fondos de ahorro compartidos pill */}
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.65rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--surface-muted)',
                      fontSize: '0.75rem',
                      color: 'var(--text-secondary)'
                    }}>
                      <PiggyBank size={13} style={{ color: '#10B981' }} />
                      <span>{pana.shared_saving_goals_count || 0} fondo(s) de ahorro</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: SOLICITUDES */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Solicitudes Recibidas */}
          <div>
            <h2 style={{ 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              color: 'var(--text-secondary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em', 
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              <Clock size={15} style={{ color: 'var(--primary-color)' }} />
              Solicitudes Recibidas ({pendingReceived.length})
            </h2>

            {pendingReceived.length === 0 ? (
              <div className="soft-card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                No tienes solicitudes pendientes por responder.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {pendingReceived.map(conn => (
                  <div 
                    key={conn.id} 
                    className="soft-card"
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '0.9rem 1rem',
                      border: '1px solid var(--primary-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ 
                        width: '38px', 
                        height: '38px', 
                        background: 'rgba(99, 102, 241, 0.12)', 
                        color: 'var(--primary-color)', 
                        borderRadius: 'var(--radius-full)', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 700
                      }}>
                        {conn.partner_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontSize: '0.95rem' }}>
                          {conn.partner_name}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                          Quiere conectar como Pana contigo
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => handleAccept(conn.id)}
                        title="Aceptar"
                        style={{ 
                          padding: '0.5rem', 
                          background: 'rgba(16, 185, 129, 0.12)', 
                          color: '#10B981', 
                          border: 'none', 
                          borderRadius: 'var(--radius-md)', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => handleReject(conn.id)}
                        title="Rechazar"
                        style={{ 
                          padding: '0.5rem', 
                          background: 'rgba(239, 68, 68, 0.12)', 
                          color: '#EF4444', 
                          border: 'none', 
                          borderRadius: 'var(--radius-md)', 
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invitaciones Enviadas */}
          <div>
            <h2 style={{ 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              color: 'var(--text-secondary)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em', 
              marginBottom: '0.75rem' 
            }}>
              Invitaciones Enviadas ({pendingSent.length})
            </h2>

            {pendingSent.length === 0 ? (
              <div className="soft-card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
                No tienes invitaciones pendientes enviadas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pendingSent.map(conn => (
                  <div 
                    key={conn.id} 
                    className="soft-card"
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '0.75rem 1rem' 
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {conn.partner_name}
                      </span>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                        Esperando que acepte la solicitud
                      </p>
                    </div>

                    <button
                      onClick={() => handleCancelInvite(conn.id)}
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--expense-color)', 
                        fontSize: '0.8rem', 
                        cursor: 'pointer',
                        padding: '0.3rem 0.5rem'
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <InvitePanaModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => {
          fetchData();
          setActiveTab('requests');
        }}
      />

      <PanaDetailModal
        isOpen={!!selectedPartnerId}
        partnerId={selectedPartnerId}
        onClose={() => setSelectedPartnerId(null)}
        onConnectionDeleted={() => {
          fetchData();
        }}
      />
    </div>
  );
};
export default PanasPage;
