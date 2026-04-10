/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Marketplace } from './pages/Marketplace';
import { Wallet } from './pages/Wallet';
import { Analytics } from './pages/Analytics';
import { useWeb3 } from './hooks/useWeb3';
import { Admin } from './pages/Admin';

export default function App() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const { account, connectWallet, disconnectWallet } = useWeb3();

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-emerald-500/30">
      <Navbar 
        account={account} 
        onConnect={connectWallet} 
        onDisconnect={disconnectWallet}
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
      />
      
      <main className="animate-in fade-in duration-700">
        {activeTab === 'marketplace' && <Marketplace account={account} />}
        {activeTab === 'wallet' && <Wallet account={account} />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'admin' && <Admin account={account} />}
      </main>
    </div>
  );
}

