import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import Toast from './Toast';
import ProfileModal from './modals/ProfileModal';

/**
 * Layout — page shell with sidebar, top bar, toast stack.
 * Background colour comes from CSS var(--bg) so it tracks theme automatically.
 */
export default function Layout({ children }) {
  const { user } = useAuth();
  const { toasts, removeToast } = useToast();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'var(--overlay)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="relative z-10 flex-1 flex flex-col min-h-screen lg:ml-64">
        <TopBar
          user={user}
          onMenuToggle={() => setSidebarOpen(o => !o)}
          onProfileClick={() => setProfileOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 max-w-[calc(100vw-2rem)]">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
