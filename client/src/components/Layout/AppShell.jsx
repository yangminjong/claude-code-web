import React, { useState, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import ChatWindow from '../Chat/ChatWindow.jsx';
import EditorPanel from '../Editor/EditorPanel.jsx';
import ExplorerPanel from '../Explorer/ExplorerPanel.jsx';
import SettingsPage from '../Settings/SettingsPage.jsx';
import CliSessionDetail from '../Session/CliSessionDetail.jsx';
import { useEditorStore } from '../../stores/editorStore.js';
import './Layout.css';

function MainContent({ handleSidebarTabChange }) {
  const isEditorActive = useEditorStore(s => s.isEditorActive);
  const hasEditorTabs = useEditorStore(s => s.tabs.length > 0);

  return (
    <Routes>
      <Route path="/" element={
        isEditorActive && hasEditorTabs ? <EditorPanel /> : <ChatWindow />
      } />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/cli-session" element={<CliSessionDetail onSwitchTab={handleSidebarTabChange} />} />
    </Routes>
  );
}

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
        <MainContent handleSidebarTabChange={handleSidebarTabChange} />
      </main>
      <ExplorerPanel />
    </div>
  );
}
