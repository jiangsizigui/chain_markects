import { useState, useCallback, useEffect } from 'react';

export const useWeb3 = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [provider] = useState<any>(null);
  const [chainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('fabricToken'));

  const connectWallet = useCallback(async () => {
    try {
      setIsConnecting(true);
      const userId = window.prompt('请输入 Fabric 用户名（如 admin 或 user1）');
      if (!userId) return;
      const password = window.prompt('请输入 Fabric 密码');
      if (!password) return;
      const res = await fetch('/api/fabric/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Fabric 登录失败：${data.error || '未知错误'}`);
        return;
      }
      setAccount(data.userId);
      setToken(data.token);
      localStorage.setItem('fabricToken', data.token);
      localStorage.setItem('fabricUserId', data.userId);
    } catch (error) {
      console.error('Fabric login error', error);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setToken(null);
    localStorage.removeItem('fabricToken');
    localStorage.removeItem('fabricUserId');
  }, []);

  useEffect(() => {
    if (!account) {
      const uid = localStorage.getItem('fabricUserId');
      if (uid) setAccount(uid);
    }
  }, [account]);

  return { account, provider, chainId, isConnecting, connectWallet, disconnectWallet, token };
};
