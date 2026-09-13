import React, { useState } from 'react';
import { Lock, User, KeyRound, ShieldCheck, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { FixcatLogo } from './icons/OSIcons';

interface AuthViewProps {
  isRegistered: boolean;
  onLogin: (username: string, password: string) => Promise<boolean>;
  onRegister: (username: string, password: string) => Promise<boolean>;
}

export const AuthView: React.FC<AuthViewProps> = ({ isRegistered, onLogin, onRegister }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Заполните имя пользователя и пароль');
      return;
    }

    if (!isRegistered && password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    if (!isRegistered && password.length < 4) {
      setError('Пароль должен содержать минимум 4 символа');
      return;
    }

    setIsLoading(true);
    try {
      if (isRegistered) {
        const success = await onLogin(username.trim(), password);
        if (!success) setError('Неверное имя пользователя или пароль');
      } else {
        const success = await onRegister(username.trim(), password);
        if (!success) setError('Ошибка при создании администратора');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка подключения к серверу авторизации');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-paper flex items-center justify-center p-4">
      {/* Glow background effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-ok/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md card p-6 sm:p-8">
        {/* Header Branding */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex p-3 rounded-lg bg-accent/10 border border-accent/25 text-accent mb-1">
            <FixcatLogo className="w-10 h-10" />
          </div>
          <div>
            <h1 className="sec-head text-2xl font-medium text-ink tracking-tight flex items-center justify-center gap-2">
              <span>Fixcat OS</span>
              <span className="mono-label text-xs px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/25">
                Manager
              </span>
            </h1>
            <p className="mono-label mt-2">
              {isRegistered
                ? 'Вход в систему управления операционными системами'
                : 'Первичная регистрация администратора панели'}
            </p>
          </div>
        </div>

        {/* Auth Mode Indicator */}
        <div
          className="mb-6 p-3 rounded-lg border flex items-center gap-3 text-xs text-on-graphite"
          style={{ background: 'var(--graphite)', borderColor: 'var(--graphite-rule)' }}
        >
          <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: 'var(--ok)' }} />
          <span className="opacity-90">
            {isRegistered
              ? 'Авторизация с сохранением сессии в локальной БД'
              : 'Введите логин и пароль для создания аккаунта суперадмина'}
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3.5 rounded-lg bg-danger-tint border border-danger/30 flex items-center gap-2.5 text-xs text-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mono-label block mb-1.5">Имя пользователя (Логин)</label>
            <div className="relative">
              <User className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-10 pr-4 py-3 bg-paper-2 border border-rule rounded-md text-ink-2 text-xs focus:border-accent focus:outline-none transition-colors placeholder:text-muted"
                required
              />
            </div>
          </div>

          <div>
            <label className="mono-label block mb-1.5">Пароль</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 bg-paper-2 border border-rule rounded-md text-ink-2 text-xs focus:border-accent focus:outline-none transition-colors placeholder:text-muted"
                required
              />
            </div>
          </div>

          {!isRegistered && (
            <div>
              <label className="mono-label block mb-1.5">Подтверждение пароля</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-paper-2 border border-rule rounded-md text-ink-2 text-xs focus:border-accent focus:outline-none transition-colors placeholder:text-muted"
                  required
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary mt-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Проверка доступа...</span>
              </>
            ) : (
              <>
                <span>{isRegistered ? 'Войти в панель' : 'Зарегистрировать суперадмина'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-rule-2/60 text-center mono-label text-muted">
          Fixcat OS Manager v2.7 &bull; Локальная авторизация
        </div>
      </div>
    </div>
  );
};

export default AuthView;