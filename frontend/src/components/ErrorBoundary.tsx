import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  inline?: boolean;
  title?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem 1.5rem', width: '100%', minHeight: '50vh' }}>
            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', borderRadius: '16px', maxWidth: '440px', width: '100%', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <h3 style={{ marginBottom: '0.75rem', color: '#fca5a5', fontSize: '1.25rem', fontWeight: 'bold' }}>
                {this.props.title || 'Error al cargar la sección'}
              </h3>
              <p style={{ marginBottom: '1.5rem', color: '#cbd5e1', fontSize: '0.9rem', lineHeight: '1.4' }}>
                Ocurrió un error inesperado al renderizar esta vista. Puedes reintentar sin recargar toda la aplicación ni perder tu sesión.
              </p>
              <button 
                onClick={() => {
                  this.setState({ hasError: false });
                  if (this.props.onReset) this.props.onReset();
                }} 
                style={{ padding: '0.65rem 1.25rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}
              >
                Reintentar vista
              </button>
            </div>
          </div>
        );
      }

      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', backgroundColor: '#0f172a', color: 'white' }}>
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', borderRadius: '12px', maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '1rem', color: '#fca5a5' }}>Algo salió mal</h2>
            <p style={{ marginBottom: '1.5rem', color: '#cbd5e1' }}>Ha ocurrido un error inesperado. Por favor, intenta recargar la página.</p>
            <button 
              onClick={() => window.location.reload()} 
              style={{ padding: '0.75rem 1.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const RouteErrorBoundary = ({ children, title }: { children?: ReactNode; title?: string }) => {
  return (
    <ErrorBoundary inline={true} title={title}>
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundary;
