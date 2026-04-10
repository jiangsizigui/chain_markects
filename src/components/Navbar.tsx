import React from 'react';
import { Wallet, BarChart3, LayoutDashboard, Coins, ShieldCheck } from 'lucide-react';

interface NavbarProps {
  account: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ account, onConnect, onDisconnect, activeTab, setActiveTab }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('marketplace')}>
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <LayoutDashboard className="text-black w-5 h-5" />
              </div>
              <span className="text-white font-bold text-xl tracking-tight">预测市场.IO</span>
            </div>
            
            <div className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => setActiveTab('marketplace')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'marketplace' ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <LayoutDashboard size={18} />
                <span>市场大厅</span>
              </button>
              <button 
                onClick={() => setActiveTab('wallet')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'wallet' ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <Coins size={18} />
                <span>钱包管理</span>
              </button>
              <button 
                onClick={() => setActiveTab('analytics')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'analytics' ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <BarChart3 size={18} />
                <span>数据分析</span>
              </button>
              <button 
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${activeTab === 'admin' ? 'text-emerald-400 bg-emerald-400/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <ShieldCheck size={18} />
                <span>管理员</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {account ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-gray-300 font-mono text-sm">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={onDisconnect}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold px-3 py-2 rounded-lg transition-all border border-red-500/20"
                >
                  断开
                </button>
              </div>
            ) : (
              <button
                onClick={onConnect}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-2 rounded-xl transition-all active:scale-95"
              >
                <Wallet size={18} />
                <span>Fabric 登录</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
