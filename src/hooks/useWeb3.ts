import { useState, useCallback, useEffect } from 'react';

export const useWeb3 = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [role, setRole] = useState<string>('user');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('fabricToken'));
  const [isConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // 页面加载时恢复登录状态
  useEffect(() => {
    const uid = localStorage.getItem('fabricUserId');
    const tk = localStorage.getItem('fabricToken');
    const rl = localStorage.getItem('fabricRole') || 'user';
    if (uid && tk) {
      setAccount(uid);
      setToken(tk);
      setRole(rl);
    }
  }, []);

  const connectWallet = useCallback(() => {
    setModalOpen(true);
  }, []);

  const onLoginSuccess = useCallback((userId: string, tk: string, userRole: string) => {
    setAccount(userId);
    setToken(tk);
    setRole(userRole);
    localStorage.setItem('fabricToken', tk);
    localStorage.setItem('fabricUserId', userId);
    localStorage.setItem('fabricRole', userRole);
    // 同步 adminToken（管理员角色自动设置）
    if (userRole === 'admin') {
      localStorage.setItem('adminToken', tk);
    }
    setModalOpen(false);
  }, []);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setToken(null);
    setRole('user');
    localStorage.removeItem('fabricToken');
    localStorage.removeItem('fabricUserId');
    localStorage.removeItem('fabricRole');
    localStorage.removeItem('adminToken');
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  return {
    account,
    role,
    token,
    isConnecting,
    modalOpen,
    connectWallet,
    onLoginSuccess,
    disconnectWallet,
    closeModal,
    // 兼容旧字段
    provider: null,
    chainId: null,
  };
};
