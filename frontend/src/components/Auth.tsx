import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Auth.css';
import { Wallet, Mail, Lock, Phone } from 'lucide-react';

export const Auth: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          phone: phone || undefined,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: '¡Registro exitoso! Por favor, revisa tu correo electrónico para verificar tu cuenta.' });
        setIsLogin(true);
        setPassword('');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Ha ocurrido un error.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <Wallet size={40} color="white" />
          </div>
          <h2>{isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h2>
          <p>{isLogin ? 'Inicia sesión para gestionar tus gastos' : 'Comienza a tomar el control de tus finanzas'}</p>
        </div>

        {message && (
          <div className={`auth-message ${message.type}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAuth} className="auth-form">
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

          {!isLogin && (
            <div className="input-group">
              <Phone className="input-icon" size={20} />
              <input
                type="tel"
                placeholder="Número de teléfono (opcional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}

          <div className="input-group">
            <Lock className="input-icon" size={20} />
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
            <button
              type="button"
              className="toggle-button"
              onClick={() => {
                setIsLogin(!isLogin);
                setMessage(null);
              }}
            >
              {isLogin ? 'Regístrate aquí' : 'Inicia sesión'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
