'use client';

import { useState, useEffect } from 'react';
import { Lock, FileText, Download, ChevronRight, Shield, Eye } from 'lucide-react';

const NDA_VERSION = '1.0';

const NDA_TEXT = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of the date of electronic acceptance below, by and between HMU Cash Ride Corp., a Georgia corporation ("Company"), and the undersigned party ("Recipient").

1. PURPOSE
The Company intends to disclose certain confidential and proprietary information ("Confidential Information") to the Recipient for the purpose of evaluating a potential business relationship, investment opportunity, or partnership.

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means all non-public information disclosed by the Company, whether in writing, orally, visually, or in any other form, including but not limited to:
(a) Business plans, financial projections, revenue models, and pricing strategies;
(b) Technical data, product designs, algorithms, source code, and system architecture;
(c) Customer data, user metrics, growth statistics, and market analysis;
(d) Legal documents, contracts, and intellectual property filings;
(e) Any other information marked or identified as confidential at the time of disclosure.

3. OBLIGATIONS OF THE RECIPIENT
The Recipient agrees to:
(a) Hold all Confidential Information in strict confidence;
(b) Not disclose any Confidential Information to any third party without the prior written consent of the Company;
(c) Use the Confidential Information solely for the purpose of evaluating the potential business relationship;
(d) Not copy, reproduce, or distribute any Confidential Information except as necessary for the permitted purpose;
(e) Restrict access to Confidential Information to those individuals within the Recipient's organization who have a need to know and who are bound by obligations of confidentiality at least as restrictive as those contained herein.

4. EXCLUSIONS
This Agreement does not apply to information that:
(a) Is or becomes publicly available through no fault of the Recipient;
(b) Was already known to the Recipient prior to disclosure, as evidenced by written records;
(c) Is independently developed by the Recipient without use of or reference to the Confidential Information;
(d) Is lawfully obtained from a third party without restriction on disclosure.

5. TERM
This Agreement and the obligations herein shall remain in effect for a period of two (2) years from the date of acceptance, regardless of whether the potential business relationship is pursued.

6. RETURN OF MATERIALS
Upon written request by the Company, the Recipient shall promptly return or destroy all Confidential Information and any copies thereof.

7. NO LICENSE
Nothing in this Agreement grants the Recipient any rights or license to the Company's intellectual property, trademarks, or proprietary technology.

8. REMEDIES
The Recipient acknowledges that any breach of this Agreement may cause irreparable harm to the Company, and the Company shall be entitled to seek equitable relief, including injunction and specific performance, in addition to any other remedies available at law.

9. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of the State of Georgia, without regard to its conflict of laws principles.

10. ELECTRONIC ACCEPTANCE
By providing your name, email, and affirmatively consenting below, you acknowledge that you have read, understood, and agree to be bound by the terms of this Agreement. Electronic acceptance constitutes a valid and binding signature.`;

const CATEGORY_LABELS: Record<string, string> = {
  one_pager: 'One Pager',
  pitch_deck: 'Pitch Deck',
  financials: 'Financial Model',
  legal: 'Legal',
  other: 'Other',
};

const CATEGORY_ICONS: Record<string, string> = {
  one_pager: '📄',
  pitch_deck: '📊',
  financials: '📈',
  legal: '⚖️',
  other: '📁',
};

interface Document {
  id: string;
  name: string;
  description: string;
  category: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  version: number;
  created_at: string;
  updated_at: string;
}

type Stage = 'access_code' | 'nda' | 'documents';

export default function DataRoomPage() {
  const [stage, setStage] = useState<Stage>('access_code');
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [loading, setLoading] = useState(false);

  // NDA form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [title, setTitle] = useState('');
  const [ndaConsent, setNdaConsent] = useState(false);
  const [ndaError, setNdaError] = useState('');

  // Documents
  const [consentId, setConsentId] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [docsError, setDocsError] = useState('');

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');
    setLoading(true);

    try {
      const res = await fetch('/api/data-room/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: accessCode }),
      });

      if (!res.ok) {
        setCodeError('Invalid access code');
        return;
      }

      setStage('nda');
    } catch {
      setCodeError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePhone = (v: string) => /^\+?[\d\s\-().]{7,20}$/.test(v.replace(/\s/g, ''));

  const handleNdaConsent = async (e: React.FormEvent) => {
    e.preventDefault();
    setNdaError('');

    if (!ndaConsent) {
      setNdaError('You must agree to the NDA to continue.');
      return;
    }

    if (!fullName || !email || !phone) {
      setNdaError('Name, email, and phone are required.');
      return;
    }

    if (!validateEmail(email)) {
      setNdaError('Please enter a valid email address.');
      return;
    }

    if (!validatePhone(phone)) {
      setNdaError('Please enter a valid phone number.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/data-room/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          company,
          title,
          accessCode,
          ndaVersion: NDA_VERSION,
        }),
      });

      if (!res.ok) {
        setNdaError('Failed to record consent. Try again.');
        return;
      }

      const data = await res.json();
      setConsentId(data.consentId);
      setStage('documents');
    } catch {
      setNdaError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (stage === 'documents' && consentId) {
      fetchDocuments();
    }
  }, [stage, consentId]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/data-room/documents', {
        headers: { 'x-consent-id': consentId },
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      } else {
        setDocsError('Failed to load documents.');
      }
    } catch {
      setDocsError('Failed to load documents.');
    }
  };

  const handleDownload = (doc: Document) => {
    window.open(
      `/api/data-room/documents/${doc.id}/download?consent=${consentId}`,
      '_blank'
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="min-h-screen bg-[#080808] text-white"
      style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}
    >
      {/* Header */}
      <div className="border-b border-[#1a1a1a]">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] rounded-xl flex items-center justify-center border border-[#1a1a1a]">
            <Shield className="w-5 h-5 text-[#00e676]" />
          </div>
          <div>
            <h1
              className="text-2xl text-[#00e676]"
              style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
            >
              HMU ATL Data Room
            </h1>
            <p className="text-xs text-[#666]" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
              CONFIDENTIAL — AUTHORIZED ACCESS ONLY
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Stage 1: Access Code */}
        {stage === 'access_code' && (
          <div className="max-w-md mx-auto">
            <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-8">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-[#0f0f0f] rounded-2xl flex items-center justify-center border border-[#1a1a1a]">
                  <Lock className="w-8 h-8 text-[#00e676]" />
                </div>
              </div>
              <h2
                className="text-center text-3xl mb-2 text-white"
                style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
              >
                Enter Access Code
              </h2>
              <p className="text-center text-[#888] text-sm mb-8">
                This data room contains confidential information. Enter the access code provided to you.
              </p>

              <form onSubmit={handleVerifyCode}>
                <input
                  type="text"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="Access code"
                  className="w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors"
                  style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
                  autoFocus
                />
                {codeError && (
                  <p className="text-[#ff4444] text-sm mt-2">{codeError}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !accessCode}
                  className="w-full mt-4 bg-[#00e676] text-[#080808] font-semibold py-3 rounded-full hover:shadow-[0_0_24px_rgba(0,230,118,0.25)] transition-all disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Continue'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Stage 2: NDA Consent */}
        {stage === 'nda' && (
          <div>
            <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-6 sm:p-8 mb-6">
              <h2
                className="text-2xl mb-4 text-white"
                style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
              >
                Non-Disclosure Agreement
              </h2>
              <p className="text-[#888] text-sm mb-4">
                Please review the NDA below. You must agree to these terms before accessing confidential materials.
              </p>

              {/* NDA Scroll Box */}
              <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl p-4 sm:p-6 max-h-[400px] overflow-y-auto mb-6">
                <pre className="text-[#bbb] text-xs leading-relaxed whitespace-pre-wrap" style={{ fontFamily: "var(--font-body, 'DM Sans', sans-serif)" }}>
                  {NDA_TEXT}
                </pre>
              </div>
            </div>

            {/* Consent Form */}
            <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-6 sm:p-8">
              <h3
                className="text-xl mb-4 text-white"
                style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 1 }}
              >
                Your Information
              </h3>

              <form onSubmit={handleNdaConsent} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                      Phone *
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      placeholder="+1 (555) 555-5555"
                      className="w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                      Company
                    </label>
                    <input
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#888] text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}>
                    Title / Role
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Managing Partner, Angel Investor"
                    className="w-full bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-3 text-white placeholder-[#555] focus:outline-none focus:border-[#00e676] transition-colors"
                  />
                </div>

                {/* Consent Checkbox */}
                <div className="flex items-start gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="nda-consent"
                    checked={ndaConsent}
                    onChange={(e) => setNdaConsent(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded accent-[#00e676]"
                  />
                  <label htmlFor="nda-consent" className="text-sm text-[#bbb] leading-relaxed">
                    I have read and agree to the terms of the Non-Disclosure Agreement above. I understand that the materials in this data room are confidential and proprietary to HMU Cash Ride Corp.
                  </label>
                </div>

                {ndaError && (
                  <p className="text-[#ff4444] text-sm">{ndaError}</p>
                )}

                <button
                  type="submit"
                  disabled={loading || !ndaConsent || !fullName || !email || !phone}
                  className="w-full bg-[#00e676] text-[#080808] font-semibold py-3 rounded-full hover:shadow-[0_0_24px_rgba(0,230,118,0.25)] transition-all disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Agree & Access Data Room'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Stage 3: Documents */}
        {stage === 'documents' && (
          <div>
            <div className="mb-8">
              <h2
                className="text-3xl mb-2 text-white"
                style={{ fontFamily: "var(--font-display, 'Bebas Neue', sans-serif)", letterSpacing: 2 }}
              >
                Confidential Materials
              </h2>
              <p className="text-[#888] text-sm">
                Welcome, {fullName}. All access and downloads are logged. These materials are subject to the NDA you agreed to.
              </p>
            </div>

            {docsError && (
              <p className="text-[#ff4444] text-sm mb-4">{docsError}</p>
            )}

            {documents.length === 0 ? (
              <div className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-12 text-center">
                <FileText className="w-12 h-12 text-[#333] mx-auto mb-4" />
                <p className="text-[#666]">No documents available yet.</p>
                <p className="text-[#444] text-sm mt-1">Check back soon.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="bg-[#141414] rounded-2xl border border-[#1a1a1a] p-5 flex items-center gap-4 hover:border-[rgba(255,255,255,0.15)] transition-colors group"
                  >
                    <div className="w-12 h-12 bg-[#0f0f0f] rounded-xl flex items-center justify-center text-xl border border-[#1a1a1a]">
                      {CATEGORY_ICONS[doc.category] || '📁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate">{doc.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className="text-[10px] text-[#00e676] uppercase tracking-wider"
                          style={{ fontFamily: "var(--font-mono, 'Space Mono', monospace)" }}
                        >
                          {CATEGORY_LABELS[doc.category] || doc.category}
                        </span>
                        <span className="text-[#333]">·</span>
                        <span className="text-[#666] text-xs">
                          {formatFileSize(doc.file_size_bytes)}
                        </span>
                        <span className="text-[#333]">·</span>
                        <span className="text-[#666] text-xs">
                          v{doc.version}
                        </span>
                      </div>
                      {doc.description && (
                        <p className="text-[#666] text-xs mt-1 truncate">{doc.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="flex items-center gap-2 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl px-4 py-2.5 text-sm text-[#bbb] hover:text-[#00e676] hover:border-[#00e676] transition-colors shrink-0"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Access notice */}
            <div className="mt-8 flex items-center gap-2 text-[#444] text-xs">
              <Eye className="w-3 h-3" />
              <span>All access and downloads are monitored and logged for security purposes.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
