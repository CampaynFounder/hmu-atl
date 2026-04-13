'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, FileText, Trash2, RefreshCw, Users, Download, Eye,
  Pencil, X, ExternalLink, Shield,
} from 'lucide-react';

interface Document {
  id: string;
  name: string;
  description: string | null;
  category: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  access_count?: number;
}

interface Consent {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  consented_at: string;
  nda_version: string;
  ip_address?: string | null;
  access_count?: number;
  last_access_at?: string | null;
}

interface AccessLog {
  id: string;
  consent_id?: string;
  full_name?: string;
  email?: string;
  company?: string | null;
  document_name: string | null;
  action: 'view' | 'download';
  ip_address?: string | null;
  accessed_at: string;
}

interface ConsentDetail {
  consent: Consent & {
    user_agent?: string;
    access_code_used?: string;
    revoked_at?: string | null;
  };
  accessLogs: Array<{
    id: string;
    action: 'view' | 'download';
    accessed_at: string;
    ip_address: string | null;
    document_id: string | null;
    document_name: string | null;
    category: string | null;
    version: number | null;
  }>;
}

const CATEGORIES = [
  { value: 'one_pager', label: 'One Pager', icon: '📄' },
  { value: 'pitch_deck', label: 'Pitch Deck', icon: '📊' },
  { value: 'financials', label: 'Financial Model', icon: '📈' },
  { value: 'legal', label: 'Legal', icon: '⚖️' },
  { value: 'other', label: 'Other', icon: '📁' },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label])
);
const CATEGORY_ICONS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.icon])
);

const inputClass =
  'w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors text-base';

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function AdminDataRoomPage() {
  const [tab, setTab] = useState<'documents' | 'consents' | 'logs'>('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [consents, setConsents] = useState<Consent[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);

  // Upload / replace modal
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCategory, setUploadCategory] = useState('pitch_deck');
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Edit metadata modal
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('pitch_deck');
  const [editSaving, setEditSaving] = useState(false);

  // Consent drill-down
  const [consentDetail, setConsentDetail] = useState<ConsentDetail | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/data-room/documents');
      if (res.ok) setDocuments((await res.json()).documents);
    } catch (e) {
      console.error('Failed to fetch documents:', e);
    }
  }, []);

  const fetchConsents = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/data-room/consents');
      if (res.ok) setConsents((await res.json()).consents);
    } catch (e) {
      console.error('Failed to fetch consents:', e);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/data-room/logs');
      if (res.ok) setLogs((await res.json()).logs);
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchConsents();
    fetchLogs();
  }, [fetchDocuments, fetchConsents, fetchLogs]);

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadName('');
    setUploadDesc('');
    setUploadCategory('pitch_deck');
    setReplaceId(null);
    setUploadError('');
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
      const res = await fetch('/api/admin/data-room/documents/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploadError(data.error || 'Upload failed');
        return;
      }
      setShowUpload(false);
      resetUploadForm();
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

  const openReplace = (doc: Document) => {
    setReplaceId(doc.id);
    setUploadName(doc.name);
    setUploadDesc(doc.description || '');
    setUploadCategory(doc.category);
    setUploadFile(null);
    setUploadError('');
    setShowUpload(true);
  };

  const openEdit = (doc: Document) => {
    setEditDoc(doc);
    setEditName(doc.name);
    setEditDesc(doc.description || '');
    setEditCategory(doc.category);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDoc) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/data-room/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          category: editCategory,
        }),
      });
      if (res.ok) {
        setEditDoc(null);
        fetchDocuments();
      }
    } catch (e) {
      console.error('Failed to edit:', e);
    } finally {
      setEditSaving(false);
    }
  };

  const openConsentDetail = async (consentId: string) => {
    setConsentLoading(true);
    setConsentDetail({ consent: { id: consentId } as Consent, accessLogs: [] });
    try {
      const res = await fetch(`/api/admin/data-room/consents/${consentId}`);
      if (res.ok) setConsentDetail(await res.json());
    } catch (e) {
      console.error('Failed to fetch consent:', e);
    } finally {
      setConsentLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white" style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#141414] rounded-xl flex items-center justify-center border border-[#1a1a1a] shrink-0">
              <Shield className="w-5 h-5 text-[#00e676]" />
            </div>
            <div className="min-w-0">
              <h1
                className="text-2xl sm:text-3xl text-white truncate"
                style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
              >
                Data Room
              </h1>
              <p className="text-[#888] text-xs sm:text-sm">Investor documents, NDA consents, access audit</p>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href="/data-room"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-[#141414] border border-[#1a1a1a] text-[#bbb] px-4 py-2.5 rounded-full hover:border-[#333] hover:text-white transition-colors text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Investor View</span>
            </a>
            <button
              onClick={() => { resetUploadForm(); setShowUpload(true); }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#00e676] text-[#080808] font-semibold px-4 sm:px-5 py-2.5 rounded-full hover:shadow-[0_0_24px_rgba(0,230,118,0.25)] transition-all text-sm"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Tabs — scroll on mobile */}
        <div className="mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="inline-flex gap-1 bg-[#141414] rounded-xl p-1 border border-[#1a1a1a] whitespace-nowrap">
            {[
              { key: 'documents', label: 'Documents', icon: FileText, count: documents.filter((d) => d.is_active).length },
              { key: 'consents', label: 'Consents', icon: Users, count: consents.length },
              { key: 'logs', label: 'Access Log', icon: Eye, count: logs.length },
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key as typeof tab)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm transition-colors ${
                    active ? 'bg-[#1a1a1a] text-white' : 'text-[#666] hover:text-[#bbb]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{t.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-[#00e676]/20 text-[#00e676]' : 'bg-[#1a1a1a] text-[#555]'}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Documents */}
        {tab === 'documents' && (
          <div className="space-y-3">
            {documents.length === 0 ? (
              <EmptyState icon={FileText} message="No documents uploaded yet." />
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`bg-[#141414] rounded-2xl border border-[#1a1a1a] p-4 ${!doc.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-[#0f0f0f] rounded-xl flex items-center justify-center text-xl border border-[#1a1a1a] shrink-0">
                      {CATEGORY_ICONS[doc.category] || '📁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-white font-medium text-sm sm:text-base break-words">{doc.name}</h3>
                        {!doc.is_active && (
                          <span className="text-[10px] bg-[#ff4444]/20 text-[#ff4444] px-2 py-0.5 rounded-full">INACTIVE</span>
                        )}
                      </div>
                      <p className="text-[#666] text-xs mt-1 break-all">{doc.file_name}</p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-[#666] flex-wrap">
                        <span className="text-[#00e676] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                          {CATEGORY_LABELS[doc.category] || doc.category}
                        </span>
                        <span>·</span>
                        <span>{formatFileSize(doc.file_size_bytes)}</span>
                        <span>·</span>
                        <span>v{doc.version}</span>
                        {typeof doc.access_count === 'number' && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {doc.access_count}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-[#444] text-[10px] mt-1">Updated {formatDate(doc.updated_at)}</p>
                    </div>
                  </div>

                  {doc.is_active && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-[#1a1a1a]">
                      <button
                        onClick={() => openEdit(doc)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f0f0f] border border-[#1a1a1a] rounded-lg px-3 py-2 text-xs text-[#bbb] hover:text-[#00e676] hover:border-[#00e676] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => openReplace(doc)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f0f0f] border border-[#1a1a1a] rounded-lg px-3 py-2 text-xs text-[#bbb] hover:text-[#00e676] hover:border-[#00e676] transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        New Version
                      </button>
                      <button
                        onClick={() => handleDeactivate(doc.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f0f0f] border border-[#1a1a1a] rounded-lg px-3 py-2 text-xs text-[#bbb] hover:text-[#ff4444] hover:border-[#ff4444] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Deactivate
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Consents */}
        {tab === 'consents' && (
          <div>
            {consents.length > 0 && (
              <div className="flex justify-end mb-3">
                <a
                  href="/api/admin/data-room/consents/export"
                  className="flex items-center gap-1.5 text-xs text-[#888] hover:text-[#00e676] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </a>
              </div>
            )}
            <div className="space-y-3">
              {consents.length === 0 ? (
                <EmptyState icon={Users} message="No NDA consents yet." />
              ) : (
                consents.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => openConsentDetail(c.id)}
                    className="w-full text-left bg-[#141414] rounded-2xl border border-[#1a1a1a] p-4 hover:border-[#333] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-white font-medium truncate">{c.full_name}</h3>
                        <p className="text-[#888] text-sm truncate">{c.email}</p>
                        {c.phone && <p className="text-[#666] text-xs">{c.phone}</p>}
                        {c.company && (
                          <p className="text-[#666] text-xs mt-1 truncate">
                            {c.company}{c.title ? ` — ${c.title}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[#00e676] text-[10px] tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>
                          NDA v{c.nda_version}
                        </p>
                        <p className="text-[#666] text-[10px] mt-1">{formatDate(c.consented_at)}</p>
                        {typeof c.access_count === 'number' && (
                          <p className="text-[#888] text-[10px] mt-1 flex items-center gap-1 justify-end">
                            <Eye className="w-3 h-3" />
                            {c.access_count} {c.access_count === 1 ? 'access' : 'accesses'}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Logs */}
        {tab === 'logs' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <EmptyState icon={Eye} message="No access logs yet." />
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-[#141414] rounded-xl border border-[#1a1a1a] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      {log.action === 'download' ? (
                        <Download className="w-4 h-4 text-[#00e676]" />
                      ) : (
                        <Eye className="w-4 h-4 text-[#888]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="text-white font-medium truncate">{log.full_name || 'Unknown'}</span>
                        <span className="text-[#666] text-xs">
                          {log.action === 'download' ? 'downloaded' : 'viewed'}
                        </span>
                      </div>
                      <p className="text-[#bbb] text-xs truncate mt-0.5">
                        {log.document_name || '(deleted document)'}
                      </p>
                      {log.email && (
                        <p className="text-[#555] text-[10px] truncate">{log.email}</p>
                      )}
                    </div>
                    <p className="text-[#444] text-[10px] shrink-0 text-right">
                      {formatDate(log.accessed_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <Modal onClose={() => setShowUpload(false)} title={replaceId ? 'Upload New Version' : 'Upload Document'}>
          <form onSubmit={handleUpload} className="space-y-4">
            <Field label="Document Name *">
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                required
                className={inputClass}
                placeholder="e.g. HMU ATL Pitch Deck Q2 2026"
              />
            </Field>
            <Field label="Category *">
              <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} className={inputClass}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <input
                type="text"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                className={inputClass}
                placeholder="Brief description"
              />
            </Field>
            <Field label="File *">
              <input
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.csv"
                className="w-full text-sm text-[#888] file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#00e676] file:text-[#080808] hover:file:cursor-pointer"
              />
              {uploadFile && (
                <p className="text-[#666] text-xs mt-1">{uploadFile.name} · {formatFileSize(uploadFile.size)}</p>
              )}
            </Field>
            {uploadError && <p className="text-[#ff4444] text-sm">{uploadError}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUpload(false)}
                className="flex-1 bg-[#1a1a1a] text-[#888] py-3 rounded-full hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || !uploadFile || !uploadName}
                className="flex-1 bg-[#00e676] text-[#080808] font-semibold py-3 rounded-full disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : replaceId ? 'Upload New Version' : 'Upload'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Metadata Modal */}
      {editDoc && (
        <Modal onClose={() => setEditDoc(null)} title="Edit Document">
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <Field label="Document Name *">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required className={inputClass} />
            </Field>
            <Field label="Category *">
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className={inputClass}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} className={inputClass} />
            </Field>
            <p className="text-[#555] text-xs">
              To change the file itself, use &ldquo;New Version&rdquo; instead.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditDoc(null)}
                className="flex-1 bg-[#1a1a1a] text-[#888] py-3 rounded-full hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSaving || !editName.trim()}
                className="flex-1 bg-[#00e676] text-[#080808] font-semibold py-3 rounded-full disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Consent Detail Modal */}
      {consentDetail && (
        <Modal onClose={() => setConsentDetail(null)} title="Investor Access History" wide>
          {consentLoading ? (
            <p className="text-[#666] text-sm">Loading...</p>
          ) : (
            <div className="space-y-4">
              <div className="bg-[#0f0f0f] rounded-xl border border-[#1a1a1a] p-4">
                <h4 className="text-white font-medium">{consentDetail.consent.full_name}</h4>
                <p className="text-[#888] text-sm break-all">{consentDetail.consent.email}</p>
                {consentDetail.consent.phone && (
                  <p className="text-[#666] text-xs mt-1">{consentDetail.consent.phone}</p>
                )}
                {consentDetail.consent.company && (
                  <p className="text-[#666] text-xs mt-1">
                    {consentDetail.consent.company}
                    {consentDetail.consent.title ? ` — ${consentDetail.consent.title}` : ''}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 mt-3 text-[11px]">
                  <div>
                    <p className="text-[#555] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>NDA</p>
                    <p className="text-[#bbb]">v{consentDetail.consent.nda_version}</p>
                  </div>
                  <div>
                    <p className="text-[#555] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>Signed</p>
                    <p className="text-[#bbb]">{formatDate(consentDetail.consent.consented_at)}</p>
                  </div>
                  {consentDetail.consent.ip_address && (
                    <div className="col-span-2">
                      <p className="text-[#555] uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)" }}>IP</p>
                      <p className="text-[#bbb] break-all">{consentDetail.consent.ip_address}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h5 className="text-white text-sm font-medium mb-2">
                  Access History ({consentDetail.accessLogs.length})
                </h5>
                {consentDetail.accessLogs.length === 0 ? (
                  <p className="text-[#555] text-xs">No documents accessed yet.</p>
                ) : (
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {consentDetail.accessLogs.map((log) => (
                      <div key={log.id} className="bg-[#0f0f0f] rounded-lg border border-[#1a1a1a] p-3 flex items-start gap-3">
                        <div className="shrink-0 mt-0.5">
                          {log.action === 'download' ? (
                            <Download className="w-4 h-4 text-[#00e676]" />
                          ) : (
                            <Eye className="w-4 h-4 text-[#888]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{log.document_name || '(deleted)'}</p>
                          <p className="text-[#666] text-[10px]">
                            {log.action === 'download' ? 'Downloaded' : 'Viewed'}
                            {log.category ? ` · ${CATEGORY_LABELS[log.category] || log.category}` : ''}
                            {log.version ? ` · v${log.version}` : ''}
                          </p>
                        </div>
                        <p className="text-[#444] text-[10px] shrink-0 text-right">
                          {formatDate(log.accessed_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: typeof FileText; message: string }) {
  return (
    <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-12 text-center">
      <Icon className="w-12 h-12 text-[#333] mx-auto mb-4" />
      <p className="text-[#666]">{message}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="block text-[#888] text-[10px] mb-1.5 uppercase tracking-wider"
        style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({
  children, onClose, title, wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#141414] w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} sm:rounded-2xl rounded-t-2xl border border-[#1a1a1a] max-h-[90vh] overflow-y-auto`}
      >
        <div className="sticky top-0 bg-[#141414] border-b border-[#1a1a1a] px-5 py-4 flex items-center justify-between">
          <h3
            className="text-lg text-white"
            style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 1 }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
