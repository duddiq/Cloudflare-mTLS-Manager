import { useState, useEffect } from 'react';
import { X, Copy, Check, Download, Calendar, Shield, Fingerprint, User, FileText, Hash, Trash2, RefreshCcw, Edit2 } from 'lucide-react';
import type { Certificate } from '../types';
import { format } from 'date-fns';

interface DetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: Certificate | null;
  onRevoke?: (id: string) => void;
  onRestore?: (id: string) => void;
  onUpdate?: () => void;
  isAdmin?: boolean;
}

export function CertificateDetailsModal({ isOpen, onClose, certificate, onRevoke, onRestore, onUpdate, isAdmin }: DetailsModalProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editCommonName, setEditCommonName] = useState('');
  const [editIssuedTo, setEditIssuedTo] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Reset editing state when a different certificate is loaded or closed
  useEffect(() => {
    setIsEditing(false);
    setEditError('');
    if (certificate) {
      setEditCommonName(certificate.commonName);
      setEditIssuedTo(certificate.issuedTo);
    }
  }, [certificate, isOpen]);

  if (!isOpen || !certificate) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(certificate.certificatePem);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([certificate.certificatePem], { type: 'application/x-x509-ca-cert' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${certificate.commonName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.crt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 300);
  };

  const handleSave = async () => {
    if (!editCommonName.trim() || !editIssuedTo.trim()) {
      setEditError('Fields cannot be empty.');
      return;
    }
    setIsSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/certs/${certificate.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          commonName: editCommonName,
          issuedTo: editIssuedTo
        })
      });
      if (res.ok) {
        setIsEditing(false);
        // Mutate the passed certificate object locally to reflect visual state changes immediately
        certificate.commonName = editCommonName;
        certificate.issuedTo = editIssuedTo;
        if (onUpdate) onUpdate();
      } else {
        const errData = await res.json() as { error?: string };
        setEditError(errData.error || 'Failed to save metadata.');
      }
    } catch (err) {
      console.error(err);
      setEditError('Failed to save metadata due to network error.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${certificate.status === 'active' ? 'bg-green-100 dark:bg-green-950/40' : 'bg-red-100 dark:bg-red-950/40'}`}>
              <Shield className={`w-5 h-5 ${certificate.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} />
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Common Name (Custom)</label>
                  <input
                    type="text"
                    value={editCommonName}
                    onChange={e => setEditCommonName(e.target.value)}
                    className="px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-850 border border-gray-300 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none w-64 md:w-80"
                  />
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-snug truncate max-w-xs md:max-w-md" title={certificate.commonName}>
                    {certificate.commonName}
                  </h2>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${certificate.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                    }`}>
                    {certificate.status.charAt(0).toUpperCase() + certificate.status.slice(1)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            {isAdmin && !isEditing && (
              <button
                onClick={() => {
                  setEditCommonName(certificate.commonName);
                  setEditIssuedTo(certificate.issuedTo);
                  setIsEditing(true);
                }}
                className="p-2 text-gray-400 hover:text-indigo-600 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition-colors"
                title="Edit Local Label & Owner"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content (Scrollable) */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-850">
              <User className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-450 uppercase tracking-wider">Issued To</p>
                {isEditing ? (
                  <div className="mt-1">
                    <input
                      type="email"
                      value={editIssuedTo}
                      onChange={e => setEditIssuedTo(e.target.value)}
                      className="w-full px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-850 border border-gray-300 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent outline-none"
                    />
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-full" title={certificate.issuedTo}>
                    {certificate.issuedTo}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-850">
              <Hash className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-455 uppercase tracking-wider">Serial Number</p>
                <p className="font-mono text-gray-900 dark:text-gray-250 break-all select-all leading-tight text-xs sm:text-sm mt-1" title={certificate.serialNumber || 'N/A'}>
                  {certificate.serialNumber || 'N/A'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-850">
              <Calendar className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-455 uppercase tracking-wider">Validity Period</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {format(new Date(certificate.createdAt), 'MMM d, yyyy')} - {format(new Date(certificate.expiresOn), 'MMM d, yyyy')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-450 mt-0.5">({certificate.validityDays} days total)</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-850">
              <Fingerprint className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-455 uppercase tracking-wider">SHA-256 Fingerprint</p>
                <p className="text-sm font-mono text-gray-900 dark:text-gray-250 break-all select-all leading-tight text-xs mt-1" title={certificate.fingerprintSha256 || 'N/A'}>
                  {certificate.fingerprintSha256 || 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Certificate ID */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-855 flex items-center justify-between">
            <div className="flex gap-3 items-center min-w-0">
              <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-455 uppercase tracking-wider">Cloudflare Certificate ID</p>
                <p className="text-sm font-mono text-gray-900 dark:text-gray-250 break-all select-all">{certificate.id}</p>
              </div>
            </div>
          </div>

          {/* PEM Display */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Certificate PEM Block</label>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-305 font-medium px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/45 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-305 font-medium px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/45 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .crt
                </button>
              </div>
            </div>
            <div className="relative">
              <pre className="w-full text-[11px] font-mono p-4 bg-gray-900 text-gray-300 rounded-xl border border-gray-800 overflow-x-auto max-h-48 overflow-y-auto leading-relaxed select-all">
                {certificate.certificatePem}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex justify-between items-center gap-3 shrink-0">
          {isEditing ? (
            <>
              {editError && (
                <p className="text-xs text-red-600 font-semibold">{editError}</p>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    setIsEditing(false);
                    setEditError('');
                  }}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-305 bg-white dark:bg-gray-850 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl transition-all shadow-sm focus:outline-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSave}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm focus:outline-none flex items-center gap-1.5"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          ) : (
            <>
              {certificate.status === 'active' ? (
                onRevoke && (
                  <button
                    type="button"
                    onClick={() => {
                      onRevoke(certificate.id);
                      onClose();
                    }}
                    className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-red-200 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Revoke
                  </button>
                )
              ) : (
                onRestore && (
                  <button
                    type="button"
                    onClick={() => {
                      onRestore(certificate.id);
                      onClose();
                    }}
                    className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-green-200 flex items-center gap-2"
                  >
                    <RefreshCcw className="w-4 h-4" />
                    Restore
                  </button>
                )
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-305 bg-white dark:bg-gray-855 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
