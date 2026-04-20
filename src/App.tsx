/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { Marketplace } from './pages/Marketplace';
import { Wallet } from './pages/Wallet';
import { Analytics } from './pages/Analytics';
import { useWeb3 } from './hooks/useWeb3';
import { Admin } from './pages/Admin';
import { Bots } from './pages/Bots';

export default function App() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const {
    account,
    role,
    token,
    modalOpen,
    connectWallet,
    onLoginSuccess,
    disconnectWallet,
    closeModal,
  } = useWeb3();

  // 管理员 token 实时读取（支持登录后立即更新）
  const adminToken = token && role === 'admin' ? token : (typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null);

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-emerald-500/30">
      <Navbar
        account={account}
        role={role}
        onConnect={connectWallet}
        onDisconnect={disconnectWallet}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="animate-in fade-in duration-700">
        {activeTab === 'marketplace' && <Marketplace account={account} />}
        {activeTab === 'wallet' && <Wallet account={account} />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'bots' && <Bots adminToken={adminToken} />}
        {activeTab === 'admin' && <Admin userId={account} />}
      </main>

      {/* 登录/注册模态框 */}
      <AuthModal
        isOpen={modalOpen}
        onClose={closeModal}
        onLoginSuccess={onLoginSuccess}
      />
    </div>
  );
}
