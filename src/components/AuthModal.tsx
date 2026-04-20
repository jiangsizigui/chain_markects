import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Lock, Loader2, Wallet, UserPlus, LogIn, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (userId: string, token: string, role: string) => void;
}

type Mode = 'login' | 'register';

// 随机头像颜色（根据用户名生成）
const getAvatarColor = (name: string) => {
  const colors = [
    'from-emerald-400 to-teal-600',
    'from-blue-400 to-indigo-600',
    'from-purple-400 to-pink-600',
    'from-orange-400 to-red-600',
    'from-yellow-400 to-orange-600',
    'from-cyan-400 to-blue-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 从 localStorage 读取曾登录过的账号
  const [recentAccounts] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('recentAccounts') || '[]');
    } catch {
      return [];
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !password.trim()) {
      setError('请填写用户名和密码');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        // 先注册
        const regRes = await fetch('/api/fabric/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId.trim(), password }),
        });
        const regData = await regRes.json();
        if (!regRes.ok) {
          setError(regData.error || '注册失败');
          return;
        }
        setSuccess('注册成功！正在登录...');
      }

      // 登录
      const res = await fetch('/api/fabric/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败，请检查用户名和密码');
        return;
      }

      // 保存最近账号
      const recent: string[] = JSON.parse(localStorage.getItem('recentAccounts') || '[]');
      const updated = [data.userId, ...recent.filter((u) => u !== data.userId)].slice(0, 5);
      localStorage.setItem('recentAccounts', JSON.stringify(updated));

      onLoginSuccess(data.userId, data.token, data.role || 'user');
      handleClose();
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (uid: string) => {
    setUserId(uid);
    setMode('login');
  };

  const handleClose = () => {
    setUserId('');
    setPassword('');
    setError('');
    setSuccess('');
    setShowPassword(false);
    onClose();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setSuccess('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-md bg-[#111] border border-white/10 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-8 pt-8 pb-6 border-b border-white/5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                      <Wallet size={20} className="text-black" />
                    </div>
                    <div>
                      <h2 className="text-white font-bold text-xl">预测市场.IO</h2>
                      <p className="text-gray-500 text-xs">区块链预测交易平台</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    className="text-gray-600 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Mode tabs */}
                <div className="flex mt-6 bg-white/5 rounded-xl p-1">
                  <button
                    onClick={() => switchMode('login')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                      mode === 'login'
                        ? 'bg-emerald-500 text-black shadow-lg'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <LogIn size={15} />
                    登录
                  </button>
                  <button
                    onClick={() => switchMode('register')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                      mode === 'register'
                        ? 'bg-emerald-500 text-black shadow-lg'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <UserPlus size={15} />
                    注册
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-8 py-6">
                {/* 最近登录账号 */}
                {mode === 'login' && recentAccounts.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">最近登录</p>
                    <div className="flex gap-2 flex-wrap">
                      {recentAccounts.map((uid) => (
                        <button
                          key={uid}
                          onClick={() => handleQuickLogin(uid)}
                          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group"
                        >
                          <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${getAvatarColor(uid)} flex items-center justify-center text-white text-[10px] font-bold`}>
                            {uid.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-gray-300 text-sm">{uid}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* UserId */}
                  <div>
                    <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
                      用户名
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type="text"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        placeholder="输入用户名"
                        autoFocus
                        autoComplete="username"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all text-sm"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">
                      密码
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="输入密码"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-12 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.07] transition-all text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Error / Success */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm"
                      >
                        <AlertCircle size={15} className="shrink-0" />
                        {error}
                      </motion.div>
                    )}
                    {success && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm"
                      >
                        <CheckCircle2 size={15} className="shrink-0" />
                        {success}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 mt-2"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : mode === 'login' ? (
                      <>
                        <LogIn size={18} />
                        登录
                      </>
                    ) : (
                      <>
                        <UserPlus size={18} />
                        注册并登录
                      </>
                    )}
                  </button>
                </form>

                {/* Hint */}
                <div className="mt-6 pt-6 border-t border-white/5">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span>
                      {mode === 'login'
                        ? '默认管理员账号：admin / admin123'
                        : '注册后自动获得 1000 PMT 测试币'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
