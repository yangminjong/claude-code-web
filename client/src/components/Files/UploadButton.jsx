import React, { useRef, useState } from 'react';
import { api } from '../../api/client.js';
import toast from 'react-hot-toast';

export default function UploadButton({ currentPath, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      await api.uploadFile(file, currentPath);
      toast.success(`${file.name} 업로드 완료`);
      onUploaded();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <button
        className="btn btn-primary btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? '업로드 중...' : '파일 업로드'}
      </button>
    </>
  );
}
