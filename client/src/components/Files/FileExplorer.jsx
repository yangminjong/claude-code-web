import React, { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import FileItem from './FileItem.jsx';
import UploadButton from './UploadButton.jsx';
import toast from 'react-hot-toast';
import './Files.css';

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState('.');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFiles = async (path) => {
    setLoading(true);
    try {
      const { items } = await api.listFiles(path);
      setItems(items);
      setCurrentPath(path);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles('.');
  }, []);

  const navigateTo = (name) => {
    const newPath = currentPath === '.' ? name : `${currentPath}/${name}`;
    loadFiles(newPath);
  };

  const goUp = () => {
    if (currentPath === '.') return;
    const parts = currentPath.split('/');
    parts.pop();
    loadFiles(parts.length === 0 ? '.' : parts.join('/'));
  };

  const handleDownload = async (name) => {
    try {
      const filePath = currentPath === '.' ? name : `${currentPath}/${name}`;
      const blob = await api.downloadFile(filePath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUploaded = () => {
    loadFiles(currentPath);
  };

  const breadcrumbs = currentPath === '.'
    ? ['workspace']
    : ['workspace', ...currentPath.split('/')];

  return (
    <div className="file-explorer">
      <div className="file-header">
        <div className="breadcrumbs">
          {breadcrumbs.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="breadcrumb-sep">/</span>}
              <span
                className="breadcrumb-item"
                onClick={() => {
                  if (i === 0) loadFiles('.');
                  else loadFiles(breadcrumbs.slice(1, i + 1).join('/'));
                }}
              >
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>
        <UploadButton currentPath={currentPath} onUploaded={handleUploaded} />
      </div>

      <div className="file-list">
        {currentPath !== '.' && (
          <div className="file-item file-item-up" onClick={goUp}>
            <span className="file-icon">&#x1F4C1;</span>
            <span className="file-name">..</span>
          </div>
        )}
        {loading ? (
          <div className="file-loading">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="file-empty">빈 디렉토리</div>
        ) : (
          items
            .sort((a, b) => (b.isDirectory - a.isDirectory) || a.name.localeCompare(b.name))
            .map((item) => (
              <FileItem
                key={item.name}
                item={item}
                onNavigate={() => navigateTo(item.name)}
                onDownload={() => handleDownload(item.name)}
              />
            ))
        )}
      </div>
    </div>
  );
}
