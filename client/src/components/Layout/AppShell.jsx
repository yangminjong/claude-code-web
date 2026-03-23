import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import ChatWindow from '../Chat/ChatWindow.jsx';
import FileExplorer from '../Files/FileExplorer.jsx';
import SettingsPage from '../Settings/SettingsPage.jsx';
import CliSessionDetail from '../Session/CliSessionDetail.jsx';
import './Layout.css';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('mine');

  const handleSidebarTabChange = useCallback((tab) => {
    setSidebarTab(tab);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        sidebarTab={sidebarTab}
        onSidebarTabChange={handleSidebarTabChange}
      />
      <main className={`main-content ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <Routes>
          <Route path="/" element={<ChatWindow />} />
          <Route path="/files" element={<FileExplorer />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/cli-session" element={<CliSessionDetail onSwitchTab={handleSidebarTabChange} />} />
        </Routes>
      </main>
    </div>
  );
}
