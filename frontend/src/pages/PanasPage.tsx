import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Check, 
  X, 
  Clock, 
  AlertCircle, 
  Home, 
  CreditCard, 
  ChevronRight, 
  Search,
  Inbox,
  PiggyBank,
  Layers,
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
import { PageHeader } from '../components/ui/PageHeader';
import { SummaryHeroCard } from '../components/ui/SummaryHeroCard';
import { SegmentedTabs } from '../components/ui/SegmentedTabs';
import { EmptyState } from '../components/ui/EmptyState';
import { ListCard } from '../components/ListCard';

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
  const totalSharedBudgets = overview?.panas?.reduce((acc, p) => acc + (p.shared_sub_budgets_count || 0), 0) || 0;

  return (
    <div style={{ padding: '1rem', paddingBottom: '6rem', maxWidth: '640px', margin: '0 auto' }}>
      <PageHeader
        title="Panas"
        subtitle="Finanzas compartidas con amigos y equipo"
        onBack={() => navigate('/herramientas')}
        actionLabel="Invitar pana"
        actionIcon={<UserPlus size={16} />}
        onAction={() => setIsInviteModalOpen(true)}
        actionColor="var(--primary-color, #6366F1)"
      />

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

      {overview && (
        <SummaryHeroCard
          eyebrow="RESUMEN CONJUNTO"
          badgeText={`${activePanas.length} ${activePanas.length === 1 ? 'Pana activo' : 'Panas activos'}`}
          badgeIcon={<Users size={13} />}
          mainAmount={String(activePanas.length)}
          statusSubtext={activePanas.length === 1 ? '1 pana conectado sincronizando finanzas' : `${activePanas.length} panas conectados sincronizando finanzas`}
          accentColor="var(--primary-color, #6366F1)"
          metrics={[
            {
              label: 'Gastos Fijos',
              value: String(overview?.total_shared_fixed_expenses || 0),
              subtext: (overview?.pending_shared_fixed_expenses_this_month || 0) > 0 ? `${overview?.pending_shared_fixed_expenses_this_month} pendiente(s)` : 'Al día',
              icon: <Home size={14} />,
              valueColor: (overview?.pending_shared_fixed_expenses_this_month || 0) > 0 ? '#F59E0B' : undefined,
            },
            {
              label: 'Deudas',
              value: String(overview?.total_shared_debts || 0),
              subtext: Object.keys(overview?.shared_debts_remaining_by_currency || {}).length > 0 ? Object.entries(overview!.shared_debts_remaining_by_currency).map(([c, v]) => `${v} ${c}`).join(' · ') : 'Sin saldo',
              icon: <CreditCard size={14} />,
            },
            {
              label: 'Ahorros',
              value: String(overview?.total_shared_saving_goals || 0),
              subtext: 'Metas conjuntas',
              icon: <PiggyBank size={14} />,
            },
            {
              label: 'Subpresupuestos',
              value: String(totalSharedBudgets),
              subtext: 'Compartidos',
              icon: <Layers size={14} />,
            },
          ]}
        />
      )}

      <SegmentedTabs<'panas' | 'requests'>
        activeTab={activeTab}
        onChange={setActiveTab}
        activeColor="var(--primary-color, #6366F1)"
        tabs={[
          {
            id: 'panas',
            label: 'Mis Panas',
            count: activePanas.length,
            icon: <Users size={16} />,
          },
          {
            id: 'requests',
            label: 'Solicitudes',
            count: totalRequestsCount,
            icon: <Inbox size={16} />,
            badgeColor: pendingReceived.length > 0 ? '#EF4444' : undefined,
          },
        ]}
        style={{ marginBottom: '1.25rem' }}
      />

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
            <EmptyState
              icon={<Users size={28} />}
              title={activePanas.length === 0 ? 'Aún no tienes panas conectados' : 'No se encontraron panas'}
              description={
                activePanas.length === 0 
                  ? 'Conecta con tu pareja, roomie o familiar para compartir gastos fijos de la casa o deudas conjuntas ante terceros.'
                  : 'Prueba buscando con otro término.'
              }
              actionLabel={activePanas.length === 0 ? 'Invitar a tu primer Pana' : undefined}
              actionIcon={activePanas.length === 0 ? <UserPlus size={16} /> : undefined}
              onAction={activePanas.length === 0 ? () => setIsInviteModalOpen(true) : undefined}
              actionColor="var(--primary-color, #6366F1)"
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredPanas.map((pana: PanaSummary) => {
                const avatar = (
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                    {pana.partner_name.charAt(0).toUpperCase()}
                  </span>
                );

                const title = (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span>{pana.partner_name}</span>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#10B981',
                        display: 'inline-block',
                      }}
                    />
                  </span>
                );

                const subtitle = pana.partner_email || 'Conectado';

                const badges = (
                  <>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <Home size={12} style={{ color: 'var(--primary-color)' }} />
                      <span>{pana.shared_fixed_expenses_count} fijo(s)</span>
                      {pana.shared_fixed_expenses_count > 0 && (
                        pana.pending_fixed_expenses_this_month > 0 ? (
                          <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                            • {pana.pending_fixed_expenses_this_month} pendiente(s)
                          </span>
                        ) : (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>• Al día</span>
                        )
                      )}
                    </span>

                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <CreditCard size={12} style={{ color: '#6366F1' }} />
                      <span>{pana.shared_debts_count} deuda(s)</span>
                      {Object.keys(pana.debts_currency_summary || {}).length > 0 && (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                          • Resta: {Object.entries(pana.debts_currency_summary).map(([curr, amt]) => `${amt} ${curr}`).join(', ')}
                        </span>
                      )}
                    </span>

                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <PiggyBank size={12} style={{ color: '#10B981' }} />
                      <span>{pana.shared_saving_goals_count || 0} ahorro(s)</span>
                    </span>

                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        background: 'var(--surface-muted)',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <Layers size={12} style={{ color: '#8B5CF6' }} />
                      <span>{pana.shared_sub_budgets_count || 0} presupuestos</span>
                    </span>
                  </>
                );

                return (
                  <ListCard
                    key={pana.id}
                    icon={avatar}
                    iconBg="var(--surface-muted)"
                    iconColor="var(--primary-color)"
                    title={title}
                    subtitle={subtitle}
                    badges={badges}
                    quickAction={<ChevronRight size={18} style={{ color: 'var(--text-tertiary)' }} />}
                    onClick={() => setSelectedPartnerId(pana.partner_id)}
                  />
                );
              })}
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
                  <ListCard
                    key={conn.id}
                    statusColor="#6366F1"
                    icon={
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {conn.partner_name.charAt(0).toUpperCase()}
                      </span>
                    }
                    iconBg="rgba(99, 102, 241, 0.12)"
                    iconColor="var(--primary-color)"
                    title={conn.partner_name}
                    subtitle="Quiere conectar como Pana contigo"
                    quickAction={
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleAccept(conn.id)}
                          title="Aceptar"
                          style={{ 
                            padding: '0.5rem', 
                            background: 'rgba(16, 185, 129, 0.12)', 
                            color: '#10B981', 
                            border: 'none', 
                            borderRadius: 'var(--radius-md, 8px)', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 150ms ease-out',
                          }}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          <Check size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(conn.id)}
                          title="Rechazar"
                          style={{ 
                            padding: '0.5rem', 
                            background: 'rgba(239, 68, 68, 0.12)', 
                            color: '#EF4444', 
                            border: 'none', 
                            borderRadius: 'var(--radius-md, 8px)', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 150ms ease-out',
                          }}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    }
                  />
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {pendingSent.map(conn => (
                  <ListCard
                    key={conn.id}
                    icon={
                      <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                        {conn.partner_name.charAt(0).toUpperCase()}
                      </span>
                    }
                    iconBg="var(--surface-muted)"
                    iconColor="var(--text-tertiary)"
                    title={conn.partner_name}
                    subtitle="Esperando que acepte la solicitud"
                    quickAction={
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(conn.id)}
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          color: 'var(--expense-color, #EF4444)', 
                          fontSize: '0.8rem', 
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '0.4rem 0.6rem',
                          borderRadius: 'var(--radius-sm, 6px)',
                          transition: 'transform 150ms ease-out',
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                      >
                        Cancelar
                      </button>
                    }
                  />
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
