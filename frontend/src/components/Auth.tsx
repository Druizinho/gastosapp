import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import './Auth.css';
import {
  Wallet, Mail, Lock, Phone, User, Eye, EyeOff,
  Loader2, ArrowLeft, KeyRound, CheckCircle, AlertTriangle
} from 'lucide-react';

// ─── Utilidad: Traducir errores de Supabase al español ────────────────
const translateError = (msg?: string): string => {
  if (!msg) return 'Error desconocido. Intenta de nuevo.';
  const map: Record<string, string> = {
    'Invalid login credentials': 'Correo electrónico o contraseña incorrectos.',
    'Email not confirmed': 'Tu correo no ha sido verificado. Revisa tu bandeja de entrada.',
    'User already registered': 'Ya existe una cuenta con este correo electrónico.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'El formato del correo electrónico no es válido.',
    'Signup requires a valid password': 'Debes ingresar una contraseña válida.',
    'For security purposes, you can only request this once every 60 seconds': 'Por seguridad, solo puedes solicitar esto una vez cada 60 segundos.',
    'New password should be different from the old password.': 'La nueva contraseña debe ser diferente a la anterior.',
    'Auth session missing!': 'Sesión no encontrada. Por favor inicia sesión de nuevo.',
    'Failed to fetch': 'Error de conexión. Verifica tu internet e intenta de nuevo.',
    'NetworkError when attempting to fetch resource.': 'Error de conexión. Verifica tu internet e intenta de nuevo.',
  };
  // Also catch partial matches for network errors
  if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('load failed')) {
    return 'Error de conexión. Verifica tu internet e intenta de nuevo.';
  }
  return map[msg] || msg;
};

// ─── Tipos ────────────────────────────────────────────────────────────
type AuthView = 'login' | 'register' | 'forgot' | 'forgot-sent';

type MessageState = { type: 'error' | 'success'; text: string } | null;

// ─── Componente: Barra de fortaleza de contraseña ─────────────────────
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  const checks = {
    length: password.length >= 6,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const percent = (passed / 3) * 100;
  const color = percent <= 33 ? 'var(--expense-color)' : percent <= 66 ? 'var(--warning-color)' : 'var(--income-color)';
  const label = percent <= 33 ? 'Débil' : percent <= 66 ? 'Media' : 'Fuerte';

  if (!password) return null;

  return (
    <div className="password-strength">
      <div className="strength-bar-track">
        <div className="strength-bar-fill" style={{ width: `${percent}%`, background: color }} />
      </div>
      <div className="strength-details">
        <span className="strength-label" style={{ color }}>{label}</span>
        <div className="strength-checks">
          <span className={checks.length ? 'check-pass' : 'check-fail'}>6+ caracteres</span>
          <span className={checks.uppercase ? 'check-pass' : 'check-fail'}>1 mayúscula</span>
          <span className={checks.number ? 'check-pass' : 'check-fail'}>1 número</span>
        </div>
      </div>
    </div>
  );
};

// ─── Componente: Input de contraseña con toggle de visibilidad ────────
const PasswordInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}> = ({ value, onChange, placeholder = 'Contraseña', autoFocus, inputRef }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-group">
      <Lock className="input-icon" size={20} />
      <input
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(!visible)}
        tabIndex={-1}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL: Auth (Login / Registro / Forgot Password)
// ═══════════════════════════════════════════════════════════════════════
export const Auth: React.FC = () => {
  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Auto-focus al cambiar de vista
  useEffect(() => {
    const timer = setTimeout(() => emailRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [view]);

  // Limpiar mensaje y campos al cambiar vista
  const switchView = (newView: AuthView) => {
    setView(newView);
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  };

  // ─── Login ──────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error: any) {
      setMessage({ type: 'error', text: translateError(error.message) });
    } finally {
      setLoading(false);
    }
  };

  // ─── Registro ───────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName ? displayName.trim() : undefined,
            phone: phone ? phone.trim() : undefined,
          },
        },
      });
      if (error) throw error;
      
      // Do not use switchView('login') because it clears the message
      setView('login');
      setPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: '¡Registro exitoso! Revisa tu correo electrónico para verificar tu cuenta.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: translateError(error?.message) });
    } finally {
      setLoading(false);
    }
  };

  // ─── Recuperar contraseña ───────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw error;
      switchView('forgot-sent');
    } catch (error: any) {
      setMessage({ type: 'error', text: translateError(error.message) });
    } finally {
      setLoading(false);
    }
  };

  // ─── Header dinámico ───────────────────────────────
  const headers: Record<AuthView, { title: string; subtitle: string }> = {
    login: { title: 'Bienvenido de nuevo', subtitle: 'Inicia sesión para gestionar tus gastos' },
    register: { title: 'Crea tu cuenta', subtitle: 'Comienza a tomar el control de tus finanzas' },
    forgot: { title: 'Recuperar contraseña', subtitle: 'Te enviaremos un enlace para restablecerla' },
    'forgot-sent': { title: '¡Correo enviado!', subtitle: 'Revisa tu bandeja de entrada' },
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Header con botón atrás en vistas secundarias */}
        <div className="auth-header">
          {(view === 'forgot' || view === 'forgot-sent') && (
            <button className="auth-back-btn" onClick={() => switchView('login')} type="button">
              <ArrowLeft size={20} />
            </button>
          )}
          <div className="auth-logo">
            {view === 'forgot' || view === 'forgot-sent' ? (
              <KeyRound size={32} />
            ) : (
              <Wallet size={32} />
            )}
          </div>
          <h2>{headers[view].title}</h2>
          <p>{headers[view].subtitle}</p>
        </div>

        {/* Mensajes de error/éxito */}
        {message && (
          <div className={`auth-message ${message.type}`}>
            {message.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {/* ═══ Vista: FORGOT-SENT (confirmación) ═══ */}
        {view === 'forgot-sent' && (
          <div className="forgot-sent-content">
            <div className="forgot-sent-icon">
              <CheckCircle size={48} />
            </div>
            <p>Hemos enviado un enlace de recuperación a:</p>
            <p className="forgot-sent-email">{email}</p>
            <p className="forgot-sent-hint">Si no lo ves, revisa tu carpeta de spam.</p>
            <button className="auth-button" onClick={() => switchView('login')}>
              Volver a Iniciar Sesión
            </button>
          </div>
        )}

        {/* ═══ Vista: FORGOT (pedir email) ═══ */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="input-group">
              <Mail className="input-icon" size={20} />
              <input
                ref={emailRef}
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? (
                <><Loader2 size={20} className="auth-spinner" /> Enviando...</>
              ) : (
                'Enviar enlace de recuperación'
              )}
            </button>
          </form>
        )}

        {/* ═══ Vista: LOGIN ═══ */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="input-group">
              <Mail className="input-icon" size={20} />
              <input
                ref={emailRef}
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <PasswordInput value={password} onChange={setPassword} />
            <div className="forgot-link-row">
              <button type="button" className="forgot-link" onClick={() => switchView('forgot')}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <button type="submit" className="auth-button" disabled={loading}>
              {loading ? (
                <><Loader2 size={20} className="auth-spinner" /> Iniciando sesión...</>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        )}

        {/* ═══ Vista: REGISTER ═══ */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="input-group">
              <User className="input-icon" size={20} />
              <input
                ref={emailRef}
                type="text"
                placeholder="Nombre de usuario"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="input-group">
              <Mail className="input-icon" size={20} />
              <input
                type="email"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <Phone className="input-icon" size={20} />
              <input
                type="tel"
                placeholder="Número de teléfono (opcional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <PasswordInput value={password} onChange={setPassword} placeholder="Contraseña" />
            <PasswordStrength password={password} />
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirmar contraseña" />
            {confirmPassword && password !== confirmPassword && (
              <div className="password-mismatch">
                <AlertTriangle size={14} /> Las contraseñas no coinciden
              </div>
            )}
            <button
              type="submit"
              className="auth-button"
              disabled={loading || password !== confirmPassword}
            >
              {loading ? (
                <><Loader2 size={20} className="auth-spinner" /> Registrando...</>
              ) : (
                'Registrarse'
              )}
            </button>
          </form>
        )}

        {/* Footer: toggle entre login y registro */}
        {(view === 'login' || view === 'register') && (
          <div className="auth-footer">
            <p>
              {view === 'login' ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
              <button
                type="button"
                className="toggle-button"
                onClick={() => switchView(view === 'login' ? 'register' : 'login')}
              >
                {view === 'login' ? 'Regístrate aquí' : 'Inicia sesión'}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTE: ResetPassword (Establecer nueva contraseña post-recovery)
// ═══════════════════════════════════════════════════════════════════════
export const ResetPassword: React.FC = () => {
  const { clearRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSuccess(true);
      setMessage({ type: 'success', text: '¡Contraseña actualizada exitosamente!' });
      setTimeout(() => {
        clearRecovery();
      }, 2000);
    } catch (error: any) {
      setMessage({ type: 'error', text: translateError(error.message) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <KeyRound size={32} />
          </div>
          <h2>{success ? '¡Listo!' : 'Nueva contraseña'}</h2>
          <p>{success ? 'Redirigiendo al inicio...' : 'Ingresa tu nueva contraseña'}</p>
        </div>

        {message && (
          <div className={`auth-message ${message.type}`}>
            {message.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            <span>{message.text}</span>
          </div>
        )}

        {!success && (
          <form onSubmit={handleReset} className="auth-form">
            <PasswordInput value={newPassword} onChange={setNewPassword} placeholder="Nueva contraseña" autoFocus />
            <PasswordStrength password={newPassword} />
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirmar nueva contraseña" />
            {confirmPassword && newPassword !== confirmPassword && (
              <div className="password-mismatch">
                <AlertTriangle size={14} /> Las contraseñas no coinciden
              </div>
            )}
            <button
              type="submit"
              className="auth-button"
              disabled={loading || newPassword !== confirmPassword}
            >
              {loading ? (
                <><Loader2 size={20} className="auth-spinner" /> Actualizando...</>
              ) : (
                'Actualizar contraseña'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
