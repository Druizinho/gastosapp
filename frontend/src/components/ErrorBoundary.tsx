import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
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

export default ErrorBoundary;
