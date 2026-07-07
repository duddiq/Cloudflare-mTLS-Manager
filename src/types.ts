export interface Certificate {
  id: string;
  issuedTo: string;
  commonName: string;
  validityDays: number;
  certificatePem: string;
  status: 'active' | 'revoked';
  expiresOn: string;
  fingerprintSha256: string;
  serialNumber: string;
  createdAt: string;
}
