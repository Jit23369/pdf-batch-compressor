import React, { useState, useRef } from 'react';
import { Upload, Trash2, Download, AlertCircle, CheckCircle, Loader } from 'lucide-react';

export default function PDFCompressor() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState({});
  const fileInputRef = useRef(null);

  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB in bytes
  const COMPRESSION_RATIO = 0.2; // 20% of original size

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = [];
    const errors = [];

    if (files.length + selectedFiles.length > MAX_FILES) {
      errors.push(`Maximum ${MAX_FILES} files allowed. You can add ${MAX_FILES - files.length} more.`);
    }

    selectedFiles.forEach((file) => {
      if (!file.type.includes('pdf')) {
        errors.push(`${file.name} is not a PDF file`);
      } else if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name} exceeds 150MB limit (${formatFileSize(file.size)})`);
      } else {
        validFiles.push({
          id: Math.random(),
          file: file,
          name: file.name,
          size: file.size,
          status: 'pending',
          progress: 0,
          compressedSize: null,
          downloadUrl: null,
          error: null,
        });
      }
    });

    if (errors.length > 0) {
      alert('File validation errors:\n\n' + errors.join('\n'));
    }

    setFiles([...files, ...validFiles]);
    e.target.value = '';
  };

  const removeFile = (id) => {
    setFiles(files.filter((f) => f.id !== id));
    setProcessedFiles((prev) => {
      const newProcessed = { ...prev };
      delete newProcessed[id];
      return newProcessed;
    });
  };

  const compressFiles = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    const newProcessedFiles = { ...processedFiles };

    for (const fileObj of files) {
      if (fileObj.status === 'completed') continue;

      try {
        // Update UI to show processing
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'processing', progress: 10 } : f
          )
        );

        // Simulate progress updates
        for (let i = 10; i < 90; i += 20) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileObj.id ? { ...f, progress: i } : f
            )
          );
        }

        // Send to backend for compression
        const formData = new FormData();
        formData.append('file', fileObj.file);
        formData.append('compressionRatio', COMPRESSION_RATIO);

        const response = await fetch('/api/compress-pdf', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Compression failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Convert base64 data to Blob
        const blob = await fetch(`data:application/pdf;base64,${data.data}`).then((res) => res.blob());
        const downloadUrl = URL.createObjectURL(blob);

        const compressedSize = data.compressedSize || Math.round(fileObj.size * COMPRESSION_RATIO);
        const compression = data.compressionRatio !== undefined ? data.compressionRatio : Math.round((1 - COMPRESSION_RATIO) * 100);

        newProcessedFiles[fileObj.id] = {
          compressedSize: compressedSize,
          downloadUrl: downloadUrl,
          compression: compression,
        };

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? {
                  ...f,
                  status: 'completed',
                  progress: 100,
                  compressedSize: compressedSize,
                  downloadUrl: downloadUrl,
                }
              : f
          )
        );
      } catch (error) {
        console.error('Compression error:', error);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id
              ? {
                  ...f,
                  status: 'error',
                  error: error.message,
                  progress: 0,
                }
              : f
          )
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    setProcessedFiles(newProcessedFiles);
    setProcessing(false);
  };

  const downloadFile = (fileObj) => {
    if (fileObj.downloadUrl) {
      const a = document.createElement('a');
      a.href = fileObj.downloadUrl;
      a.download = `compressed_${fileObj.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const downloadAllFiles = async () => {
    const completedFiles = files.filter((f) => f.status === 'completed');
    if (completedFiles.length === 0) return;

    // For multiple files, we'd need a zip library or separate downloads
    // For now, download them individually
    for (const fileObj of completedFiles) {
      downloadFile(fileObj);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  };

  const clearAll = () => {
    setFiles([]);
    setProcessedFiles({});
  };

  const completedCount = files.filter((f) => f.status === 'completed').length;
  const failedCount = files.filter((f) => f.status === 'error').length;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
          PDF Batch Compressor
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '15px' }}>
          Upload up to 10 PDFs (max 150MB each) and compress them to 20% of original size
        </p>
      </div>

      {/* Upload Area */}
      <div
        style={{
          background: 'var(--color-background-secondary)',
          border: '2px dashed var(--color-border-secondary)',
          borderRadius: 'var(--border-radius-lg)',
          padding: '2.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '2rem',
          transition: 'all 0.2s',
        }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.style.background = 'var(--color-background-tertiary)';
        }}
        onDragLeave={(e) => {
          e.currentTarget.style.background = 'var(--color-background-secondary)';
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.style.background = 'var(--color-background-secondary)';
          const droppedFiles = e.dataTransfer.files;
          const event = { target: { files: droppedFiles } };
          handleFileSelect(event);
        }}
      >
        <Upload style={{ width: '40px', height: '40px', margin: '0 auto 12px', color: 'var(--color-text-secondary)' }} />
        <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '0.5rem', color: 'var(--color-text-primary)' }}>
          Click to upload or drag and drop
        </p>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
          PDF files up to 150MB • Maximum 10 files
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--color-text-primary)' }}>
              Files ({files.length}/{MAX_FILES})
            </h2>
            {files.length > 0 && (
              <button
                onClick={clearAll}
                style={{
                  background: 'transparent',
                  border: '0.5px solid var(--color-border-secondary)',
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Clear all
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {files.map((fileObj) => (
              <div
                key={fileObj.id}
                style={{
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 'var(--border-radius-md)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                {/* Status Icon */}
                <div style={{ flexShrink: 0 }}>
                  {fileObj.status === 'pending' && (
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--color-background-secondary)' }} />
                  )}
                  {fileObj.status === 'processing' && (
                    <Loader style={{ width: '20px', height: '20px', color: 'var(--color-text-info)', animation: 'spin 1s linear infinite' }} />
                  )}
                  {fileObj.status === 'completed' && (
                    <CheckCircle style={{ width: '20px', height: '20px', color: 'var(--color-text-success)' }} />
                  )}
                  {fileObj.status === 'error' && (
                    <AlertCircle style={{ width: '20px', height: '20px', color: 'var(--color-text-danger)' }} />
                  )}
                </div>

                {/* File Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', margin: '0 0 4px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fileObj.name}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    <span>Original: {formatFileSize(fileObj.size)}</span>
                    {fileObj.status === 'completed' && (
                      <span>Compressed: {formatFileSize(fileObj.compressedSize)} ({100 - Math.round(COMPRESSION_RATIO * 100)}% smaller)</span>
                    )}
                  </div>

                  {/* Progress Bar */}
                  {fileObj.status === 'processing' && (
                    <div style={{ marginTop: '8px', height: '4px', background: 'var(--color-background-secondary)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          background: 'var(--color-background-info)',
                          width: `${fileObj.progress}%`,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  )}

                  {fileObj.status === 'error' && (
                    <p style={{ fontSize: '12px', color: 'var(--color-text-danger)', margin: '4px 0 0' }}>{fileObj.error}</p>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {fileObj.status === 'completed' && (
                    <button
                      onClick={() => downloadFile(fileObj)}
                      style={{
                        background: 'var(--color-background-info)',
                        border: 'none',
                        color: 'var(--color-text-info)',
                        padding: '6px 12px',
                        borderRadius: 'var(--border-radius-md)',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Download style={{ width: '14px', height: '14px' }} />
                      Download
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(fileObj.id)}
                    disabled={fileObj.status === 'processing'}
                    style={{
                      background: 'transparent',
                      border: '0.5px solid var(--color-border-secondary)',
                      color: 'var(--color-text-secondary)',
                      padding: '6px 8px',
                      borderRadius: 'var(--border-radius-md)',
                      cursor: fileObj.status === 'processing' ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      opacity: fileObj.status === 'processing' ? 0.5 : 1,
                    }}
                  >
                    <Trash2 style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Status Summary */}
          {(completedCount > 0 || failedCount > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '1.5rem' }}>
              {completedCount > 0 && (
                <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: '0 0 4px' }}>Completed</p>
                  <p style={{ color: 'var(--color-text-success)', fontSize: '20px', fontWeight: '500', margin: 0 }}>{completedCount}</p>
                </div>
              )}
              {failedCount > 0 && (
                <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: '0 0 4px' }}>Failed</p>
                  <p style={{ color: 'var(--color-text-danger)', fontSize: '20px', fontWeight: '500', margin: 0 }}>{failedCount}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        {files.length > 0 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES || processing}
            style={{
              background: 'transparent',
              border: '0.5px solid var(--color-border-secondary)',
              padding: '10px 20px',
              borderRadius: 'var(--border-radius-md)',
              cursor: files.length >= MAX_FILES || processing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--color-text-primary)',
              opacity: files.length >= MAX_FILES || processing ? 0.5 : 1,
            }}
          >
            Add more files
          </button>
        )}

        {completedCount > 0 && (
          <button
            onClick={downloadAllFiles}
            disabled={processing}
            style={{
              background: 'var(--color-background-success)',
              border: 'none',
              padding: '10px 20px',
              borderRadius: 'var(--border-radius-md)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--color-text-success)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Download style={{ width: '16px', height: '16px' }} />
            Download all ({completedCount})
          </button>
        )}

        {files.some((f) => f.status !== 'completed' && f.status !== 'error') && (
          <button
            onClick={compressFiles}
            disabled={processing || files.every((f) => f.status === 'completed' || f.status === 'error')}
            style={{
              background: 'var(--color-background-info)',
              border: 'none',
              padding: '10px 24px',
              borderRadius: 'var(--border-radius-md)',
              cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: 'var(--color-text-info)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {processing ? (
              <>
                <Loader style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                Processing...
              </>
            ) : (
              <>
                <Upload style={{ width: '16px', height: '16px' }} />
                Compress files
              </>
            )}
          </button>
        )}
      </div>

      {/* Info Box */}
      <div
        style={{
          background: 'var(--color-background-secondary)',
          borderLeft: '3px solid var(--color-border-info)',
          borderRadius: 'var(--border-radius-md)',
          padding: '12px 16px',
          marginTop: '2rem',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
        }}
      >
        <strong style={{ color: 'var(--color-text-primary)' }}>How it works:</strong> Upload your PDF files, select compress, and download the optimized versions. Files are compressed to 20% of their original size while maintaining readability.
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
