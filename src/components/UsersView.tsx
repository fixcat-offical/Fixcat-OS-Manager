import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldOff,
  Trash2,
  Edit3,
  Check,
  X,
  Search,
  Clock,
  Key,
  RefreshCw,
  Crown,
  Eye,
  EyeOff,
  AlertTriangle,
  Info,
  Download,
} from 'lucide-react';
import { UserRecord } from '../types';

interface UsersViewProps {
  authToken: string | null;
  currentUser: string;
  currentRole: string;
  onUsersChanged?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const ROLES: Record<string, { label: string; color: string; icon: React.FC<any> }> = {
  admin: { label: 'Администратор', color: 'bg-amber-500/10 text-amber-300 border-amber-500/20', icon: Crown },
  user: { label: 'Пользователь', color: 'bg-sky-500/10 text-sky-300 border-sky-500/20', icon: Users },
};

const STATUS_STYLES: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Активен', color: 'bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  disabled: { label: 'Отключён', color: 'bg-rose-500/10 text-rose-300', dot: 'bg-rose-400' },
};

export const UsersView: React.FC<UsersViewProps> = ({
  authToken,
  currentUser,
  currentRole,
  onUsersChanged,
  showToast,
}) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [showChangePw, setShowChangePw] = useState(false);
  const [changePwTarget, setChangePwTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else {
        const err = await res.json();
        setError(err.error || 'Ошибка загрузки');
      }
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const callApi = async (method: string, url: string, body?: any) => {
    const opts: any = {
      method,
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    return data;
  };

  const handleBackup = async () => {
    try {
      const res = await fetch('/api/users/backup', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast?.(data.error || 'Ошибка создания бэкапа', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fixcat-users-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast?.('Бэкап пользователей скачан', 'success');
    } catch {
      showToast?.('Ошибка сети', 'error');
    }
  };

  const toggleStatus = async (u: UserRecord) => {
    const newStatus = (u.status || 'active') === 'active' ? 'disabled' : 'active';
    try {
      await callApi('PUT', `/api/users/${encodeURIComponent(u.username)}`, { status: newStatus });
      showToast?.(`Учётная запись ${u.username} ${newStatus === 'active' ? 'активирована' : 'отключена'}`, 'success');
      fetchUsers();
      onUsersChanged?.();
    } catch (e: any) {
      showToast?.(e.message, 'error');
    }
  };

  const deleteUser = async (username: string) => {
    try {
      await callApi('DELETE', `/api/users/${encodeURIComponent(username)}`);
      showToast?.(`Пользователь ${username} удалён`, 'success');
      setDeletingUser(null);
      fetchUsers();
      onUsersChanged?.();
    } catch (e: any) {
      showToast?.(e.message, 'error');
    }
  };

  const usersArr = Array.isArray(users) ? users : [];
  const filtered = search.trim()
    ? usersArr.filter(
        (u) =>
          u.username.toLowerCase().includes(search.toLowerCase()) ||
          (u.role || 'user').includes(search.toLowerCase()),
      )
    : usersArr;
  const adminCount = usersArr.filter((u) => (u.role || 'admin') === 'admin').length;
  const activeCount = usersArr.filter((u) => (u.status || 'active') === 'active').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-100">Управление пользователями</h1>
            <p className="text-xs text-slate-500">Учётные записи, роли и доступ к панели</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBackup}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
          >
            <Download className="w-4 h-4" /> Бэкап
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/20 transition-all"
          >
            <UserPlus className="w-4 h-4" /> Создать пользователя
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/50 p-4">
          <p className="text-xs text-slate-500 mb-1">Всего</p>
          <p className="text-2xl font-bold text-slate-100">{usersArr.length}</p>
        </div>
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/50 p-4">
          <p className="text-xs text-slate-500 mb-1">Администраторов</p>
          <p className="text-2xl font-bold text-amber-300">{adminCount}</p>
        </div>
        <div className="rounded-xl bg-slate-900/80 border border-slate-800/50 p-4">
          <p className="text-xs text-slate-500 mb-1">Активных</p>
          <p className="text-2xl font-bold text-emerald-300">{activeCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по логину или роли..."
          className="w-full pl-10 pr-4 py-3 bg-slate-900/80 border border-slate-800/50 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 transition-colors"
        />
        <button
          onClick={fetchUsers}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition"
          title="Обновить"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-slate-800/50 overflow-hidden bg-slate-900/40">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
            <span className="ml-3 text-slate-500 text-sm">Загрузка пользователей...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Users className="w-12 h-12 mb-3 text-slate-600" />
            <p className="font-medium">Нет пользователей</p>
            <p className="text-xs mt-1">Создайте первого пользователя для входа в панель</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-5">Пользователь</th>
                <th className="text-left py-3 px-5 hidden sm:table-cell">Роль</th>
                <th className="text-left py-3 px-5">Статус</th>
                <th className="text-left py-3 px-5 hidden lg:table-cell">Создан</th>
                <th className="text-left py-3 px-5 hidden lg:table-cell">Последний вход</th>
                <th className="text-right py-3 px-5">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const role = ROLES[u.role || 'admin'] || ROLES.user;
                const status = STATUS_STYLES[u.status || 'active'] || STATUS_STYLES.active;
                const RoleIcon = role.icon;
                const isSelf = u.username === currentUser;
                const canDelete = currentRole === 'admin' && !isSelf && (adminCount > 1 || (u.role || 'admin') !== 'admin');

                return (
                  <tr
                    key={u.username}
                    className={`border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors ${!isSelf ? '' : 'bg-slate-800/10'}`}
                  >
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${isSelf ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>
                          {u.username[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-100">
                            {u.username}
                            {isSelf && <span className="ml-2 text-xs text-emerald-400">(вы)</span>}
                          </p>
                          <p className="text-xs text-slate-500">{u.lastLoginAt ? `Вход: ${new Date(u.lastLoginAt).toLocaleDateString('ru-RU')}` : 'Не входил'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 hidden sm:table-cell">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${role.color}`}>
                        <RoleIcon className="w-3 h-3" />
                        {role.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${status.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 hidden lg:table-cell text-xs text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="py-3.5 px-5 hidden lg:table-cell text-xs text-slate-500">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {currentRole === 'admin' && (
                          <>
                            <button
                              onClick={() => toggleStatus(u)}
                              title={isSelf ? 'Нельзя отключить себя' : (u.status || 'active') === 'active' ? 'Отключить' : 'Включить'}
                              disabled={isSelf}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              {(u.status || 'active') === 'active' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => setChangePwTarget(u.username)}
                              title="Сменить пароль"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 transition"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeletingUser(u.username)}
                            title="Удалить"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Hint */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-slate-500">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <span>
          Первый зарегистрированный пользователь автоматически становится администратором.
          Администратор может создавать других пользователей, назначать роли и отключать учётные записи.
        </span>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateUserModal
          authToken={authToken}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            fetchUsers();
            onUsersChanged?.();
            setShowCreate(false);
          }}
          showToast={showToast}
        />
      )}

      {/* Change Password Modal */}
      {changePwTarget && (
        <ChangePasswordModal
          authToken={authToken}
          targetUser={changePwTarget}
          onClose={() => setChangePwTarget(null)}
          onDone={() => {
            setChangePwTarget(null);
            showToast?.('Пароль успешно изменён', 'success');
          }}
          showToast={showToast}
        />
      )}

      {/* Delete Confirm */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Удалить пользователя?</h3>
                <p className="text-xs text-slate-500">Это действие нельзя отменить</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-5">
              Все сессии пользователя <strong className="text-rose-300">{deletingUser}</strong> будут аннулированы.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              >
                Отмена
              </button>
              <button
                onClick={() => deleteUser(deletingUser)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/20 hover:bg-rose-500/30 transition"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------- Create User Modal ----------

const CreateUserModal: React.FC<{
  authToken: string | null;
  onClose: () => void;
  onCreated: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ authToken, onClose, onCreated, showToast }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleCreate = async () => {
    if (!username.trim() || !password) {
      setError('Заполните все поля');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      setError('Логин: 3-32 символа, только буквы, цифры, точка, дефис, подчёркивание');
      return;
    }
    if (password.length < 4) {
      setError('Пароль не короче 4 символов');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast?.(`Пользователь ${username} создан`, 'success');
        onCreated();
      } else {
        setError(data.error || 'Ошибка');
      }
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
        <h3 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-400" />
          Новый пользователь
        </h3>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">{error}</div>
        )}

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Логин</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              placeholder="Имя пользователя"
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Пароль</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Минимум 4 символа"
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Роль</label>
            <div className="flex gap-2">
              {(['user', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                    role === r
                      ? r === 'admin'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700/50 hover:border-slate-600'
                  }`}
                >
                  {r === 'admin' ? 'Администратор' : 'Пользователь'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">
            Отмена
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------- Change Password Modal ----------

const ChangePasswordModal: React.FC<{
  authToken: string | null;
  targetUser: string;
  onClose: () => void;
  onDone: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}> = ({ authToken, targetUser, onClose, onDone, showToast }) => {
  const [newPw, setNewPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSave = async () => {
    if (newPw.length < 4) {
      setError('Пароль не короче 4 символов');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(targetUser)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ password: newPw }),
      });
      const data = await res.json();
      if (res.ok) {
        onDone();
      } else {
        setError(data.error || 'Ошибка');
      }
    } catch {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
        <h3 className="text-base font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-400" />
          Смена пароля
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Для пользователя <strong className="text-slate-300">{targetUser}</strong>
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">{error}</div>
        )}

        <div className="mb-5">
          <label className="block text-xs text-slate-500 mb-1">Новый пароль</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setError(''); }}
              placeholder="Минимум 4 символа"
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700/50 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 pr-10"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition">
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/20 hover:bg-blue-500/30 transition disabled:opacity-50"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
};
