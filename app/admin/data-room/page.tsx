'use client';

import { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, RefreshCw, Users, Download, Eye } from 'lucide-react';

interface Document {
  id: string;
  name: string;
  description: string;
  category: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Consent {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  consented_at: string;
  nda_version: string;
}

interface AccessLog {
  id: string;
  full_name: string;
  email: string;
  document_name: string;
  action: string;
  accessed_at: string;
}

const CATEGORIES = [
  { value: 'one_pager', label: 'One Pager' },
  { value: 'pitch_deck', label: 'Pitch Deck' },
  { value: 'financials', label: 'Financial Model' },
  { value: 'legal', label: 'Legal' },
  { value: 'other', label: 'Other' },
];

export default function AdminDataRoomPage() {
  const [tab, setTab] = useState<'documents' | 'consents' | 'logs'>('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Upload form
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('pitch_deck');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    fetchDocuments();
    fetchConsents();
    fetchLogs();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/admin/data-room/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } catch (e) {
      console.error('Failed to fetch documents:', e);
    }
  };

  const fetchConsents = async () => {
    try {
      const res = await fetch('/api/admin/data-room/consents');
      if (res.ok) {
        const data = await res.json();
        setConsents(data.consents);
      }
    } catch (e) {
      console.error('Failed to fetch consents:', e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/admin/data-room/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadName) return;

    setUploading(true);
    setUploadError('');

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('name', uploadName);
    formData.append('description', uploadDesc);
    formData.append('category', uploadCategory);
    if (replaceId) formData.append('replaceId', replaceId);

    try {
      const res = await fetch('/api/data-room/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setUploadError(data.error || 'Upload failed');
        return;
      }

      setShowUpload(false);
      setUploadFile(null);
      setUploadName('');
      setUploadDesc('');
      setReplaceId(null);
      fetchDocuments();
    } catch {
      setUploadError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeactivate = async (docId: string) => {
    if (!confirm('Deactivate this document? Investors will no longer see it.')) return;

    try {
      await fetch(`/api/admin/data-room/documents/${docId}`, { method: 'DELETE' });
      fetchDocuments();
    } catch (e) {
      console.error('Failed to deactivate:', e);
    }
  };

  const handleReplace = (doc: Document) => {
    setReplaceId(doc.id);
    setUploadName(doc.name);
    setUploadDesc(doc.description || '');
    setUploadCategory(doc.category);
    setShowUpload(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const inputClass = "w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors";

  return (
    <div className="p-6 max-w-5xl mx-auto" style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-3xl text-white"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
          >
            Data Room Management
          </h1>
          <p className="text-[#888] text-sm mt-1">Upload documents, track NDA consents, monitor access</p>
        </div>
        <button
          onClick={() => { setReplaceId(null); setUploadName(''); setUploadDesc(''); setShowUpload(true); }}
          className="flex items-center gap-2 bg-[#00e676] text-[#080808] font-semibold px-5 py-2.5 rounded-full hover:shadow-[0_0_24px_rgba(0,230,118,0.25)] transition-all"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#141414] rounded-xl p-1 border border-[#1a1a1a] w-fit">
        {[
          { key: 'documents', label: 'Documents', icon: FileText },
          { key: 'consents', label: `NDA Consents (${consents.length})`, icon: Users },
          { key: 'logs', label: 'Access Logs', icon: Eye },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              tab === t.key ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-[#bbb]'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3
              className="text-xl mb-4 text-white"
              style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 1 }}
            >
              {replaceId ? 'Replace Document (New Version)' : 'Upload Document'}
            </h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                  Document Name *
                </label>
                <input type="text" value={uploadName} onChange={(e) => setUploadName(e.target.value)} required className={inputClass} placeholder="e.g. HMU ATL Pitch Deck Q2 2026" />
              </div>
              <div>
                <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                  Category *
                </label>
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className={inputClass}>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                  Description
                </label>
                <input type="text" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} className={inputClass} placeholder="Brief description" />
              </div>
              <div>
                <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                  File *
                </label>
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv"
                  className="w-full text-sm text-[#888] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#00e676] file:text-[#080808] hover:file:cursor-pointer"
                />
              </div>
              {uploadError && <p className="text-[#ff4444] text-sm">{uploadError}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowUpload(false)} className="flex-1 bg-[#1a1a1a] text-[#888] py-3 rounded-full hover:text-white transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={uploading || !uploadFile || !uploadName} className="flex-1 bg-[#00e676] text-[#080808] font-semibold py-3 rounded-full disabled:opacity-50">
                  {uploading ? 'Uploading...' : replaceId ? 'Upload New Version' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {tab === 'documents' && (
        <div className="space-y-3">
          {documents.length === 0 ? (
            <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-12 text-center">
              <FileText className="w-12 h-12 text-[#333] mx-auto mb-4" />
              <p className="text-[#666]">No documents uploaded yet.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className={`bg-[#141414] rounded-xl border border-[#1a1a1a] p-4 flex items-center gap-4 ${!doc.is_active ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium">{doc.name}</h3>
                    {!doc.is_active && <span className="text-[10px] bg-[#ff4444]/20 text-[#ff4444] px-2 py-0.5 rounded-full">INACTIVE</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-[#666]">
                    <span className="text-[#00e676] uppercase" style={{ fontFamily: "var(--font-mono)" }}>{doc.category.replace('_', ' ')}</span>
                    <span>·</span>
                    <span>{doc.file_name}</span>
                    <span>·</span>
                    <span>{formatFileSize(doc.file_size_bytes)}</span>
                    <span>·</span>
                    <span>v{doc.version}</span>
                    <span>·</span>
                    <span>{formatDate(doc.updated_at)}</span>
                  </div>
                </div>
                {doc.is_active && (
                  <div className="flex gap-2">
                    <button onClick={() => handleReplace(doc)} className="p-2 text-[#888] hover:text-[#00e676] transition-colors" title="Upload new version">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeactivate(doc.id)} className="p-2 text-[#888] hover:text-[#ff4444] transition-colors" title="Deactivate">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Consents Tab */}
      {tab === 'consents' && (
        <div className="space-y-3">
          {consents.length === 0 ? (
            <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-12 text-center">
              <Users className="w-12 h-12 text-[#333] mx-auto mb-4" />
              <p className="text-[#666]">No NDA consents yet.</p>
            </div>
          ) : (
            consents.map((c) => (
              <div key={c.id} className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">{c.full_name}</h3>
                    <p className="text-[#888] text-sm">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
                    {c.company && <p className="text-[#666] text-xs">{c.company}{c.title ? ` — ${c.title}` : ''}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[#00e676] text-xs" style={{ fontFamily: "var(--font-mono)" }}>NDA v{c.nda_version}</p>
                    <p className="text-[#666] text-xs">{formatDate(c.consented_at)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Logs Tab */}
      {tab === 'logs' && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-12 text-center">
              <Eye className="w-12 h-12 text-[#333] mx-auto mb-4" />
              <p className="text-[#666]">No access logs yet.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-[#141414] rounded-lg border border-[#1a1a1a] px-4 py-3 flex items-center gap-3 text-sm">
                {log.action === 'download' ? (
                  <Download className="w-4 h-4 text-[#00e676] shrink-0" />
                ) : (
                  <Eye className="w-4 h-4 text-[#888] shrink-0" />
                )}
                <span className="text-white">{log.full_name}</span>
                <span className="text-[#666]">{log.action === 'download' ? 'downloaded' : 'viewed'}</span>
                <span className="text-[#bbb] truncate">{log.document_name || 'data room'}</span>
                <span className="text-[#444] ml-auto shrink-0 text-xs">{formatDate(log.accessed_at)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
