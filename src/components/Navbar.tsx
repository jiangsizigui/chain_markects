import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, BarChart3, LayoutDashboard, Coins, ShieldCheck, Bot, LogOut, Copy, CheckCheck, ChevronDown, UserPlus } from 'lucide-react';

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

interface NavbarProps {
  account: string | null;
  role?: string;
  onConnect: () => void;
  onDisconnect: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  account,
  role = 'user',
  onConnect,
  onDisconnect,
  activeTab,
  setActiveTab,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCopy = () => {
    if (account) {
      navigator.clipboard.writeText(account).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  };

  const navItems = [
    { key: 'marketplace', label: '市场大厅', icon: LayoutDashboard },
    { key: 'wallet', label: '钱包管理', icon: Coins },
    { key: 'analytics', label: '数据分析', icon: BarChart3 },
    { key: 'bots', label: '交易机器人', icon: Bot },
    { key: 'admin', label: '管理员', icon: ShieldCheck },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setActiveTab('marketplace')}
            >
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center shadow-md shadow-emerald-500/30">
                <LayoutDashboard className="text-black w-5 h-5" />
              </div>
              <span className="text-white font-bold text-xl tracking-tight">预测市场.IO</span>
            </div>

            {/* Nav links */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    activeTab === key
                      ? 'text-emerald-400 bg-emerald-400/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: account or connect */}
          <div className="flex items-center gap-3">
            {account ? (
              <div className="relative" ref={dropdownRef}>
                {/* Account pill */}
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl transition-all group"
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getAvatarColor(account)} flex items-center justify-center text-white text-xs font-bold shadow`}
                  >
                    {account.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <div className="text-white text-sm font-semibold leading-tight">{account}</div>
                    <div className="text-gray-500 text-[10px] capitalize leading-tight">{role}</div>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-60 bg-[#161616] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-50"
                    >
                      {/* Header */}
                      <div className="px-4 py-4 border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarColor(account)} flex items-center justify-center text-white text-sm font-bold shadow-lg`}
                          >
                            {account.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-white font-semibold">{account}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              <span className="text-gray-500 text-xs capitalize">{role} · 已连接</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-2">
                        <button
                          onClick={handleCopy}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-gray-300 hover:text-white text-sm"
                        >
                          {copied ? (
                            <CheckCheck size={16} className="text-emerald-500" />
                          ) : (
                            <Copy size={16} />
                          )}
                          {copied ? '已复制用户名' : '复制用户名'}
                        </button>

                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            setActiveTab('wallet');
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-gray-300 hover:text-white text-sm"
                        >
                          <Wallet size={16} />
                          查看钱包
                        </button>

                        <div className="h-px bg-white/5 my-1.5" />

                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            onConnect();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-gray-300 hover:text-white text-sm"
                        >
                          <UserPlus size={16} />
                          切换账号
                        </button>

                        <button
                          onClick={() => {
                            setDropdownOpen(false);
                            onDisconnect();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 transition-all text-red-400 text-sm"
                        >
                          <LogOut size={16} />
                          退出登录
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={onConnect}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-5 py-2 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                <Wallet size={18} />
                <span>连接账号</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
