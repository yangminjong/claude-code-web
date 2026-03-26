import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import ChatWindow from '../Chat/ChatWindow.jsx';
import EditorPanel from '../Editor/EditorPanel.jsx';
import ExplorerPanel from '../Explorer/ExplorerPanel.jsx';
import SettingsPage from '../Settings/SettingsPage.jsx';
import { useEditorStore } from '../../stores/editorStore.js';
import './Layout.css';

function MainContent() {
  const isEditorActive = useEditorStore(s => s.isEditorActive);
  const hasEditorTabs = useEditorStore(s => s.tabs.length > 0);

  return (
    <Routes>
      <Route path="/" element={
        isEditorActive && hasEditorTabs ? <EditorPanel /> : <ChatWindow />
      } />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="app-shell">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      <main className={`main-content ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <MainContent />
      </main>
      <ExplorerPanel />
    </div>
  );
}
