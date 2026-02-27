import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
import Layout from './components/Layout';
import Encryption from './pages/Encryption';
import History from './pages/History';
import SharedFiles from './pages/SharedFiles';
import ReceivedFiles from './pages/ReceivedFiles';
import AccessControl from './pages/AccessControl';
import GroupManager from './pages/GroupManager';
import Settings from './pages/Settings';

export default function App() {
  const { user } = useAuth();

  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Encryption />} />
        <Route path="/history" element={<History />} />
        <Route path="/shared" element={<SharedFiles />} />
        <Route path="/received" element={<ReceivedFiles />} />
        <Route path="/groups" element={<GroupManager />} />
        <Route path="/access" element={<AccessControl />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
