import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Lock, FileKey2 } from 'lucide-react';
import forge from 'node-forge';

function downloadFile(binaryData: string, filename: string) {
  const buffer = new ArrayBuffer(binaryData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binaryData.length; i++) {
    view[i] = binaryData.charCodeAt(i);
  }

  const blob = new Blob([buffer], { type: 'application/x-pkcs12' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userRole: string;
}

export function CreateCertificateModal({ isOpen, onClose, onSuccess, userRole }: CreateModalProps) {
  const [commonName, setCommonName] = useState('');
  const [password, setPassword] = useState('');
  const [validityDays, setValidityDays] = useState(365);
  const [issuedToEmail, setIssuedToEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');

  const handleClose = () => {
    setCommonName('');
    setPassword('');
    setIssuedToEmail('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setStatusText('Generating RSA Key Pair (this may take a moment)...');

    // Make sure we yield to the UI thread before heavy RSA generation
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      // 1. Generate Key Pair locally
      const keys = forge.pki.rsa.generateKeyPair(2048);
      
      // 2. Generate CSR locally
      setStatusText('Generating Certificate Signing Request...');
      const csr = forge.pki.createCertificationRequest();
      csr.publicKey = keys.publicKey;
      csr.setSubject([{
        name: 'commonName',
        value: commonName
      }]);
      csr.sign(keys.privateKey, forge.md.sha256.create());
      const csrPem = forge.pki.certificationRequestToPem(csr);

      setStatusText('Requesting Certificate from Cloudflare API...');
      // 3. Request Certificate
      const payload: any = { commonName, validityDays, csrPem };
      if (userRole === 'admin' && issuedToEmail.trim() !== '') {
        payload.issuedTo = issuedToEmail.trim();
      }
      const res = await fetch('/api/certs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json() as any;
      
      if (!res.ok || !data.certificate) {
        throw new Error(data.error || 'Failed to create certificate');
      }

      setStatusText('Packaging .p12 file locally...');
      await new Promise(resolve => setTimeout(resolve, 50)); // Yield to UI

      let certPem = data.certificate.certificatePem;
      if (data.certificate.isMock) {
        console.log('Generating self-signed certificate for mock flow...');
        const cert = forge.pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = Math.floor(Math.random() * 100000000).toString();
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);
        
        const attrs = [{ name: 'commonName', value: commonName }];
        cert.setSubject(attrs);
        cert.setIssuer(attrs);
        
        cert.sign(keys.privateKey, forge.md.sha256.create());
        certPem = forge.pki.certificateToPem(cert);
      }

      // 4. Generate PKCS#12 (.p12) file locally
      const certForge = forge.pki.certificateFromPem(certPem);
      
      const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certForge], password, {
        algorithm: 'aes256'
      });
      const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
      const filename = `${commonName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.p12`;
      
      downloadFile(p12Der, filename);

      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setStatusText('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex justify-center items-start sm:items-center">
      <div className="bg-white dark:bg-gray-900 border border-transparent dark:border-gray-800 rounded-2xl shadow-xl w-full max-w-md my-4 sm:my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileKey2 className="w-5 h-5 text-indigo-600" />
            New Certificate
          </h2>
          <button onClick={handleClose} className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-955/30 text-red-700 dark:text-red-400 text-sm border border-red-200 dark:border-red-900/50">
              {error}
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Common Name (CN)</label>
            <input 
              type="text" 
              required
              value={commonName}
              onChange={e => setCommonName(e.target.value)}
              placeholder="e.g. user-iphone-15"
              className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
            />
            <p className="text-xs text-gray-550 dark:text-gray-450">A unique identifier for this device or user.</p>
          </div>

          {userRole === 'admin' && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Issued To Email</label>
              <input 
                type="email" 
                required
                value={issuedToEmail}
                onChange={e => setIssuedToEmail(e.target.value)}
                placeholder="e.g. employee@company.com"
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
              <p className="text-xs text-gray-550 dark:text-gray-450">The email address of the person this certificate is issued to.</p>
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Validity (Days)</label>
            <input 
              type="number" 
              required
              min={1}
              max={3650}
              value={validityDays}
              onChange={e => setValidityDays(parseInt(e.target.value))}
              className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">PKCS#12 Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-3" />
              <input 
                type="password" 
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Secure password for .p12 file"
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all outline-none"
              />
            </div>
            <p className="text-xs text-gray-550 dark:text-gray-450">You will need this password to install the certificate on your device.</p>
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isLoading}
                className="flex-1 px-4 py-2 text-white font-medium bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {isLoading ? 'Processing...' : 'Create & Download'}
              </button>
            </div>
            {isLoading && statusText && (
              <p className="text-center text-xs text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">{statusText}</p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
