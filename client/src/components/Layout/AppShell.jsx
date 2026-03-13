import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import ChatWindow from '../Chat/ChatWindow.jsx';
import FileExplorer from '../Files/FileExplorer.jsx';
import SettingsPage from '../Settings/SettingsPage.jsx';
import './Layout.css';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <main className={`main-content ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <Routes>
          <Route path="/" element={<ChatWindow />} />
          <Route path="/files" element={<FileExplorer />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
