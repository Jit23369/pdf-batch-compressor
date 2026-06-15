import React, { useState, useRef, useEffect } from 'react';
import { Upload, Trash2, Download, AlertCircle, CheckCircle, Loader, Type, RotateCw, Eye } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';

// Configure PDF.js Worker
const pdfjsVersion = pdfjsLib.version || '4.10.38';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

export default function App() {
  const [activeTab, setActiveTab] = useState('compress'); // 'compress' | 'edit'

  // --- COMPRESSION STATES ---
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState({});
  const fileInputRef = useRef(null);

  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB in bytes
  const COMPRESSION_RATIO = 0.2; // 20% of original size

  // --- EDITOR STATES ---
  const [editFile, setEditFile] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [textOverlays, setTextOverlays] = useState([]); // Array of { id, pageIndex, text, x, y, color, fontSize, fontFamily }
  const [selectedOverlayId, setSelectedOverlayId] = useState(null);
  const [pageRotations, setPageRotations] = useState({}); // { pageIndex: degrees }
  const [editorLoading, setEditorLoading] = useState(false);
  const editorFileInputRef = useRef(null);

  const fontOptions = ['Helvetica', 'Times Roman', 'Courier'];
  const colorOptions = [
    { name: 'Charcoal', hex: '#1f2937' },
    { name: 'Crimson', hex: '#dc2626' },
    { name: 'Royal Blue', hex: '#2563eb' },
    { name: 'Forest Green', hex: '#16a34a' },
    { name: 'Gold', hex: '#d97706' },
    { name: 'Purple', hex: '#9333ea' },
  ];
  const sizeOptions = ['12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72'];

  // Common size formatter
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // --- COMPRESSOR HANDLERS ---
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
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileObj.id ? { ...f, status: 'processing', progress: 10 } : f
          )
        );

        for (let i = 10; i < 90; i += 20) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileObj.id ? { ...f, progress: i } : f
            )
          );
        }

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

        // Convert base64 data to Blob safely
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

  // --- EDITOR HANDLERS ---
  const handleEditorFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      alert('Selected file must be a PDF.');
      return;
    }

    setEditorLoading(true);
    setEditFile(file);
    setTextOverlays([]);
    setSelectedOverlayId(null);
    setPageRotations({});

    try {
      const arrayBuffer = await file.arrayBuffer();
      // Use PDF.js to load document details
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
    } catch (err) {
      console.error('Error parsing PDF for rendering:', err);
      alert('Could not load PDF: ' + err.message);
      setEditFile(null);
    } finally {
      setEditorLoading(false);
    }
  };

  const addTextOverlay = (pageIndex) => {
    const newOverlay = {
      id: Math.random(),
      pageIndex: pageIndex,
      text: 'Click here to edit text',
      x: 35, // center relative X %
      y: 15, // relative Y %
      color: '#1f2937',
      fontSize: 18,
      fontFamily: 'Helvetica',
    };
    setTextOverlays([...textOverlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  const updateOverlay = (id, fields) => {
    setTextOverlays(textOverlays.map((o) => (o.id === id ? { ...o, ...fields } : o)));
  };

  const deleteOverlay = (id) => {
    setTextOverlays(textOverlays.filter((o) => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const rotatePage = (pageIndex) => {
    setPageRotations((prev) => {
      const currentRotation = prev[pageIndex] || 0;
      return {
        ...prev,
        [pageIndex]: (currentRotation + 90) % 360,
      };
    });
  };

  const handleEditorSave = async () => {
    if (!editFile) return;

    setEditorLoading(true);
    try {
      const arrayBuffer = await editFile.arrayBuffer();
      const pdfLibDoc = await PDFDocument.load(arrayBuffer);

      // Embed standard fonts
      const helveticaFont = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
      const timesFont = await pdfLibDoc.embedFont(StandardFonts.TimesRoman);
      const courierFont = await pdfLibDoc.embedFont(StandardFonts.Courier);

      const fonts = {
        'Helvetica': helveticaFont,
        'Times Roman': timesFont,
        'Courier': courierFont,
      };

      const pages = pdfLibDoc.getPages();

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        // Apply page rotation
        const rot = pageRotations[i] || 0;
        if (rot !== 0) {
          const originalRot = page.getRotation().angle;
          page.setRotation(degrees((originalRot + rot) % 360));
        }

        // Apply text overlays for this page
        const overlays = textOverlays.filter((o) => o.pageIndex === i);
        if (overlays.length > 0) {
          const { width, height } = page.getSize();

          for (const overlay of overlays) {
            const fontObj = fonts[overlay.fontFamily] || helveticaFont;

            // Hex to rgb
            const hex = overlay.color || '#1f2937';
            const r = parseInt(hex.substring(1, 3), 16) / 255;
            const g = parseInt(hex.substring(3, 5), 16) / 255;
            const b = parseInt(hex.substring(5, 7), 16) / 255;

            // Map HTML top-left percentage to PDF bottom-left coordinates
            const xVal = (overlay.x / 100) * width;
            const yVal = height - ((overlay.y / 100) * height) - (overlay.fontSize * 0.95);

            page.drawText(overlay.text, {
              x: xVal,
              y: yVal,
              size: parseFloat(overlay.fontSize),
              font: fontObj,
              color: rgb(r, g, b),
            });
          }
        }
      }

      const pdfBytes = await pdfLibDoc.save();

      // Download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `edited_${editFile.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Error building edited PDF:', err);
      alert('Failed to edit PDF: ' + err.message);
    } finally {
      setEditorLoading(false);
    }
  };

  const selectedOverlay = textOverlays.find((o) => o.id === selectedOverlayId);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--sans)' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '38px', fontWeight: '600', marginBottom: '0.2rem', color: 'var(--text-h)', letterSpacing: '-1px' }}>
          PDF Workspace
        </h1>
        <p style={{ color: 'var(--text)', fontSize: '15px' }}>
          Compress PDFs in batches or edit/annotate them in real-time
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          background: 'var(--color-background-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--border-radius-md)',
          padding: '4px',
          maxWidth: '400px',
          margin: '0 auto 2.5rem',
        }}
      >
        <button
          onClick={() => setActiveTab('compress')}
          style={{
            flex: 1,
            background: activeTab === 'compress' ? 'var(--accent)' : 'transparent',
            border: 'none',
            color: activeTab === 'compress' ? '#fff' : 'var(--text)',
            padding: '8px 16px',
            borderRadius: 'var(--border-radius-md)',
            fontWeight: '500',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Compress PDF
        </button>
        <button
          onClick={() => setActiveTab('edit')}
          style={{
            flex: 1,
            background: activeTab === 'edit' ? 'var(--accent)' : 'transparent',
            border: 'none',
            color: activeTab === 'edit' ? '#fff' : 'var(--text)',
            padding: '8px 16px',
            borderRadius: 'var(--border-radius-md)',
            fontWeight: '500',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Edit PDF
        </button>
      </div>

      {/* --- COMPRESS TAB CONTENT --- */}
      {activeTab === 'compress' && (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Upload Area */}
          <div
            style={{
              background: 'var(--color-background-secondary)',
              border: '2px dashed var(--border)',
              borderRadius: 'var(--border-radius-lg)',
              padding: '3rem',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '2rem',
              transition: 'all 0.2s',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border)';
              const droppedFiles = e.dataTransfer.files;
              const event = { target: { files: droppedFiles } };
              handleFileSelect(event);
            }}
          >
            <Upload style={{ width: '48px', height: '48px', margin: '0 auto 16px', color: 'var(--accent)', opacity: 0.8 }} />
            <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '0.4rem', color: 'var(--text-h)' }}>
              Click to upload or drag and drop PDFs
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text)' }}>
              PDF files up to 150MB each • Batch upload up to 10 files
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

          {/* File Log List */}
          {files.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '500', color: 'var(--text-h)' }}>
                  Files ({files.length}/{MAX_FILES})
                </h2>
                <button
                  onClick={clearAll}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    padding: '6px 12px',
                    borderRadius: 'var(--border-radius-md)',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--text)',
                    transition: 'all 0.2s',
                  }}
                >
                  Clear all
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {files.map((fileObj) => (
                  <div
                    key={fileObj.id}
                    style={{
                      background: 'var(--color-background-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--border-radius-md)',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: 'var(--shadow)',
                    }}
                  >
                    {/* Status Icons */}
                    <div style={{ flexShrink: 0 }}>
                      {fileObj.status === 'pending' && (
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--border)' }} />
                      )}
                      {fileObj.status === 'processing' && (
                        <Loader style={{ width: '20px', height: '20px', color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }} />
                      )}
                      {fileObj.status === 'completed' && (
                        <CheckCircle style={{ width: '20px', height: '20px', color: '#10b981' }} />
                      )}
                      {fileObj.status === 'error' && (
                        <AlertCircle style={{ width: '20px', height: '20px', color: '#ef4444' }} />
                      )}
                    </div>

                    {/* Meta */}
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <p style={{ fontSize: '14px', fontWeight: '500', margin: '0 0 3px', color: 'var(--text-h)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {fileObj.name}
                      </p>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: 'var(--text)' }}>
                        <span>Original: {formatFileSize(fileObj.size)}</span>
                        {fileObj.status === 'completed' && (
                          <span style={{ color: '#10b981', fontWeight: '500' }}>
                            Compressed: {formatFileSize(fileObj.compressedSize)} ({fileObj.progress === 100 ? (processedFiles[fileObj.id]?.compression) : 80}% smaller)
                          </span>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {fileObj.status === 'processing' && (
                        <div style={{ marginTop: '8px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              background: 'var(--accent)',
                              width: `${fileObj.progress}%`,
                              transition: 'width 0.2s ease',
                            }}
                          />
                        </div>
                      )}

                      {fileObj.status === 'error' && (
                        <p style={{ fontSize: '12px', color: '#ef4444', margin: '4px 0 0' }}>{fileObj.error}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {fileObj.status === 'completed' && (
                        <button
                          onClick={() => downloadFile(fileObj)}
                          style={{
                            background: 'var(--accent-bg)',
                            border: '1px solid var(--accent-border)',
                            color: 'var(--accent)',
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
                          <Download style={{ width: '13px', height: '13px' }} />
                          Download
                        </button>
                      )}
                      <button
                        onClick={() => removeFile(fileObj.id)}
                        disabled={fileObj.status === 'processing'}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          padding: '6px 8px',
                          borderRadius: 'var(--border-radius-md)',
                          cursor: fileObj.status === 'processing' ? 'not-allowed' : 'pointer',
                          opacity: fileObj.status === 'processing' ? 0.4 : 1,
                        }}
                      >
                        <Trash2 style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compress Footer Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            {files.length > 0 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_FILES || processing}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  padding: '10px 20px',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: 'var(--text)',
                  opacity: files.length >= MAX_FILES || processing ? 0.5 : 1,
                }}
              >
                Add more files
              </button>
            )}

            {completedCount > 0 && (
              <button
                onClick={downloadAllFiles}
                style={{
                  background: '#10b981',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Download style={{ width: '15px', height: '15px' }} />
                Download all ({completedCount})
              </button>
            )}

            {files.some((f) => f.status !== 'completed' && f.status !== 'error') && (
              <button
                onClick={compressFiles}
                disabled={processing}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: 'var(--border-radius-md)',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {processing ? (
                  <>
                    <Loader style={{ width: '15px', height: '15px', animation: 'spin 1.5s linear infinite' }} />
                    Compressing...
                  </>
                ) : (
                  <>
                    <Upload style={{ width: '15px', height: '15px' }} />
                    Compress files
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- EDITOR TAB CONTENT --- */}
      {activeTab === 'edit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* File Picker if none selected */}
          {!editFile && (
            <div
              style={{
                background: 'var(--color-background-secondary)',
                border: '2px dashed var(--border)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '4rem',
                textAlign: 'center',
                cursor: 'pointer',
                maxWidth: '900px',
                width: '100%',
                margin: '0 auto',
              }}
              onClick={() => editorFileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = 'var(--border)';
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) {
                  const event = { target: { files: [droppedFile] } };
                  handleEditorFileSelect(event);
                }
              }}
            >
              <Loader style={{ width: '48px', height: '48px', margin: '0 auto 16px', color: 'var(--accent)', display: editorLoading ? 'block' : 'none', animation: 'spin 1.5s linear infinite' }} />
              <div style={{ display: editorLoading ? 'none' : 'block' }}>
                <Upload style={{ width: '48px', height: '48px', margin: '0 auto 16px', color: 'var(--accent)', opacity: 0.8 }} />
                <p style={{ fontSize: '16px', fontWeight: '500', marginBottom: '0.4rem', color: 'var(--text-h)' }}>
                  Upload a PDF file to edit
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text)' }}>
                  Add text overlays, customize styles, rotate pages, and download
                </p>
              </div>
              <input
                ref={editorFileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleEditorFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* Active Workspace */}
          {editFile && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '320px 1fr',
                gap: '20px',
                alignItems: 'start',
                textAlign: 'left',
              }}
            >
              {/* Properties Sidebar */}
              <div
                style={{
                  background: 'var(--color-background-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--border-radius-lg)',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px',
                  position: 'sticky',
                  top: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--text-h)' }}>PDF Editor</h3>
                  <button
                    onClick={() => {
                      setEditFile(null);
                      setPdfDoc(null);
                      setTextOverlays([]);
                      setSelectedOverlayId(null);
                      setPageRotations({});
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Close file
                  </button>
                </div>

                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-h)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {editFile.name}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text)' }}>Size: {formatFileSize(editFile.size)}</p>
                </div>

                {/* Styling Properties for Selected Overlay */}
                {selectedOverlay ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent)' }}>TEXT PROPERTIES</span>
                      <button
                        onClick={() => deleteOverlay(selectedOverlay.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Delete text
                      </button>
                    </div>

                    {/* Text content input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text)', fontWeight: '500' }}>Edit Text</label>
                      <input
                        type="text"
                        value={selectedOverlay.text}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
                        style={{
                          background: 'var(--color-background-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--border-radius-md)',
                          padding: '8px',
                          fontSize: '13px',
                          color: 'var(--text-h)',
                        }}
                      />
                    </div>

                    {/* Font Selector */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text)', fontWeight: '500' }}>Font Family</label>
                      <select
                        value={selectedOverlay.fontFamily}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { fontFamily: e.target.value })}
                        style={{
                          background: 'var(--color-background-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--border-radius-md)',
                          padding: '8px',
                          fontSize: '13px',
                          color: 'var(--text-h)',
                        }}
                      >
                        {fontOptions.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text)', fontWeight: '500' }}>Font Size (pt)</label>
                      <select
                        value={selectedOverlay.fontSize}
                        onChange={(e) => updateOverlay(selectedOverlay.id, { fontSize: parseInt(e.target.value) })}
                        style={{
                          background: 'var(--color-background-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--border-radius-md)',
                          padding: '8px',
                          fontSize: '13px',
                          color: 'var(--text-h)',
                        }}
                      >
                        {sizeOptions.map((s) => (
                          <option key={s} value={s}>
                            {s} pt
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Colors */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text)', fontWeight: '500' }}>Color</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                        {colorOptions.map((c) => (
                          <button
                            key={c.hex}
                            onClick={() => updateOverlay(selectedOverlay.id, { color: c.hex })}
                            title={c.name}
                            style={{
                              width: '100%',
                              paddingBottom: '100%',
                              borderRadius: '4px',
                              background: c.hex,
                              border: selectedOverlay.color === c.hex ? '2.5px solid var(--accent)' : '1px solid rgba(0,0,0,0.1)',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '20px 10px', textAlign: 'center', background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-md)', border: '1px dashed var(--border)' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text)' }}>
                      Select a text overlay on any page to customize its styling (color, font, size).
                    </p>
                  </div>
                )}

                {/* Save & download buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <button
                    onClick={handleEditorSave}
                    disabled={editorLoading}
                    style={{
                      background: 'var(--accent)',
                      border: 'none',
                      color: '#fff',
                      padding: '10px 16px',
                      borderRadius: 'var(--border-radius-md)',
                      fontWeight: '600',
                      fontSize: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {editorLoading ? (
                      <Loader style={{ width: '16px', height: '16px', animation: 'spin 1.5s linear infinite' }} />
                    ) : (
                      <Download style={{ width: '16px', height: '16px' }} />
                    )}
                    Save & Download
                  </button>
                </div>
              </div>

              {/* PDF Pages Viewer */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '30px',
                  alignItems: 'center',
                  background: 'var(--color-background-tertiary)',
                  padding: '2rem 1rem',
                  borderRadius: 'var(--border-radius-lg)',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                }}
              >
                {pdfDoc &&
                  Array.from({ length: numPages }).map((_, index) => (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                      {/* Page controls bar */}
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '600px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 8px',
                          background: 'var(--color-background-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--border-radius-md)',
                        }}
                      >
                        <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--text-h)' }}>
                          Page {index + 1} of {numPages}
                        </span>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => addTextOverlay(index)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--accent)',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            <Type style={{ width: '14px', height: '14px' }} />
                            Add Text
                          </button>

                          <button
                            onClick={() => rotatePage(index)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                            }}
                          >
                            <RotateCw style={{ width: '14px', height: '14px' }} />
                            Rotate
                          </button>
                        </div>
                      </div>

                      {/* PDF Page Rendering Container */}
                      <PDFPage
                        pageNum={index + 1}
                        pdfDoc={pdfDoc}
                        rotation={pageRotations[index] || 0}
                        overlays={textOverlays.filter((o) => o.pageIndex === index)}
                        selectedOverlayId={selectedOverlayId}
                        onSelectOverlay={setSelectedOverlayId}
                        onUpdateOverlay={updateOverlay}
                        onRemoveOverlay={deleteOverlay}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// --- SUB-COMPONENT: PDF PAGE ---
function PDFPage({
  pageNum,
  pdfDoc,
  rotation,
  overlays,
  selectedOverlayId,
  onSelectOverlay,
  onUpdateOverlay,
  onRemoveOverlay,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let renderTask = null;
    const render = async () => {
      if (!pdfDoc) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        
        // Render at scale 1.0 to find natural layout size
        const viewport = page.getViewport({ scale: 1.0, rotation: rotation });
        
        // Scale to a nice container width (e.g. max 600px width for editor)
        const scaleFactor = Math.min(600 / viewport.width, 1.0) || 1.0;
        const scaledViewport = page.getViewport({ scale: scaleFactor + 0.3, rotation: rotation });
        
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        setDimensions({ width: scaledViewport.width, height: scaledViewport.height });

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        renderTask = page.render(renderContext);
        await renderTask.promise;
      } catch (err) {
        console.error('Error rendering PDF page: ', err);
      }
    };

    render();
    return () => {
      if (renderTask) renderTask.cancel();
    };
  }, [pdfDoc, pageNum, rotation]);

  const handleDragStart = (e, overlay) => {
    e.preventDefault();
    onSelectOverlay(overlay.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = overlay.x;
    const initialY = overlay.y;

    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newXPercent = initialX + (deltaX / containerRect.width) * 100;
      const newYPercent = initialY + (deltaY / containerRect.height) * 100;

      // Clamp so overlays stay within the boundaries
      const clampedX = Math.max(0, Math.min(90, newXPercent));
      const clampedY = Math.max(0, Math.min(95, newYPercent));

      onUpdateOverlay(overlay.id, { x: clampedX, y: clampedY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: dimensions.width ? `${dimensions.width}px` : 'auto',
        height: dimensions.height ? `${dimensions.height}px` : 'auto',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        background: '#fff',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Render text overlays */}
      {overlays.map((overlay) => {
        const isSelected = overlay.id === selectedOverlayId;
        return (
          <div
            key={overlay.id}
            onMouseDown={(e) => handleDragStart(e, overlay)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectOverlay(overlay.id);
            }}
            style={{
              position: 'absolute',
              left: `${overlay.x}%`,
              top: `${overlay.y}%`,
              padding: '4px 8px',
              cursor: 'move',
              userSelect: 'none',
              border: isSelected ? '1.5px solid var(--accent)' : '1px dashed rgba(0, 0, 0, 0.3)',
              background: isSelected ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.55)',
              borderRadius: '4px',
              fontSize: `${overlay.fontSize * 0.85}px`, // scaled slightly for canvas display
              color: overlay.color,
              fontFamily: overlay.fontFamily === 'Times Roman' ? 'Times New Roman' : overlay.fontFamily,
              fontWeight: '500',
              zIndex: 10,
              boxShadow: isSelected ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {overlay.text}
          </div>
        );
      })}
    </div>
  );
}
