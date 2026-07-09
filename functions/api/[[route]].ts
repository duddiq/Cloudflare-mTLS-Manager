/// <reference types="@cloudflare/workers-types" />

import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { drizzle } from 'drizzle-orm/d1';
import { certificates, users, appMetadata, hostnameAssociations } from '../../src/db/schema';
import { eq, desc } from 'drizzle-orm';
import forge from 'node-forge';

type Env = {
  DB: D1Database;
  CLOUDFLARE_ZONE_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  MOCK_USER_EMAIL?: string;
  ADMIN_USER?: string;
  ENVIRONMENT?: string;
};

const app = new Hono<{ Bindings: Env; Variables: { userEmail: string } }>().basePath('/api');

app.use('*', async (c, next) => {
  const isProduction = c.env.ENVIRONMENT === 'production';
  const headerEmail = c.req.header('cf-access-authenticated-user-email');

  if (isProduction && !headerEmail) {
    return c.json({ error: 'Unauthorized: Missing Cloudflare Access headers' }, 401);
  }

  const email = headerEmail || c.env.MOCK_USER_EMAIL || '';
  c.set('userEmail', email);

  const db = drizzle(c.env.DB);
  try {
    // Seed ADMIN_USER if specified
    if (c.env.ADMIN_USER) {
      await db.insert(users).values({
        email: c.env.ADMIN_USER,
        role: 'admin',
        createdAt: new Date().toISOString()
      }).onConflictDoNothing().run();
    }
    // Insert currently logged-in user (role is 'admin' if they match ADMIN_USER, else 'user')
    await db.insert(users).values({
      email,
      role: email === c.env.ADMIN_USER ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    }).onConflictDoNothing().run();
  } catch (e) {
    console.error('Failed to sync user', e);
  }

  // Cloudflare Certificate Sync
  try {
    const lastSyncMeta = await db.select().from(appMetadata).where(eq(appMetadata.key, 'last_sync')).get();
    const lastSyncTime = lastSyncMeta ? new Date(lastSyncMeta.value).getTime() : 0;
    const now = Date.now();

    if (now - lastSyncTime > 10 * 60 * 1000) {
      console.log('Sync: Initiating Cloudflare sync...');
      const zoneId = c.env.CLOUDFLARE_ZONE_ID;
      const apiToken = c.env.CLOUDFLARE_API_TOKEN;
      const hasCredentials = zoneId && apiToken;

      if (hasCredentials) {
        const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/client_certificates`, {
          headers: {
            'Authorization': `Bearer ${apiToken}`
          }
        });

        if (cfResponse.ok) {
          const cfData = await cfResponse.json() as { result: any[] };
          const cfCerts = cfData.result || [];
          const cfCertIds = new Set<string>();

          for (const cfCert of cfCerts) {
            cfCertIds.add(cfCert.id);

            const existing = await db.select().from(certificates).where(eq(certificates.id, cfCert.id)).get();

            let serialNumber = cfCert.serial_number || '';
            if (!serialNumber && cfCert.certificate) {
              try {
                const forgeCert = forge.pki.certificateFromPem(cfCert.certificate);
                serialNumber = forgeCert.serialNumber;
              } catch (err) {
                console.error('Sync: Failed to parse serial number', err);
              }
            }

            if (!existing) {
              const commonName = cfCert.common_name || '';
              const isEmail = commonName.includes('@');
              const issuedTo = isEmail ? commonName : 'imported-cloudflare-cert';

              // Ensure user exists
              await db.insert(users).values({
                email: issuedTo,
                role: 'user',
                createdAt: new Date().toISOString()
              }).onConflictDoNothing().run();

              await db.insert(certificates).values({
                id: cfCert.id,
                issuedTo,
                commonName,
                validityDays: cfCert.validity_days,
                certificatePem: cfCert.certificate,
                status: cfCert.status,
                expiresOn: cfCert.expires_on,
                fingerprintSha256: cfCert.fingerprint_sha256,
                serialNumber,
                createdAt: cfCert.issued_on || new Date().toISOString()
              }).run();
            } else {
              // Update status to active since it exists on Cloudflare
              await db.update(certificates).set({
                status: cfCert.status,
                fingerprintSha256: cfCert.fingerprint,
                serialNumber: serialNumber || existing.serialNumber
              }).where(eq(certificates.id, cfCert.id)).run();
            }
          }

          // Mark absent ones as revoked
          const localCerts = await db.select().from(certificates).all();
          for (const localCert of localCerts) {
            if (!localCert.id.startsWith('mock-') && !cfCertIds.has(localCert.id) && localCert.status === 'active') {
              console.log(`Sync: Certificate ${localCert.id} missing from Cloudflare list. Revoking locally...`);
              await db.update(certificates).set({ status: 'revoked' }).where(eq(certificates.id, localCert.id)).run();
            }
          }

          // Update sync time
          await db.insert(appMetadata).values({
            key: 'last_sync',
            value: new Date().toISOString()
          }).onConflictDoUpdate({
            target: appMetadata.key,
            set: { value: new Date().toISOString() }
          }).run();
          console.log('Sync: Cloudflare sync completed successfully.');
        } else {
          console.error('Sync: Cloudflare API returned error status', cfResponse.status);
        }
      } else {
        console.log('Sync: Skip, Cloudflare credentials not set.');
      }
    }
  } catch (err) {
    console.error('Sync: Error syncing with Cloudflare API', err);
  }

  await next();
});

app.get('/me', async (c) => {
  const email = c.get('userEmail');
  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  return c.json({ user });
});

app.get('/certs', async (c) => {
  const db = drizzle(c.env.DB);
  const allCerts = await db.select().from(certificates).orderBy(desc(certificates.createdAt)).all();
  return c.json({ certs: allCerts });
});

app.post('/certs', async (c) => {
  const { commonName, validityDays, csrPem, issuedTo: bodyIssuedTo } = await c.req.json();
  const email = c.get('userEmail');

  if (!commonName || !csrPem) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const db = drizzle(c.env.DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  const role = user?.role || 'user';

  let issuedTo = email;
  if (role === 'admin' && bodyIssuedTo) {
    issuedTo = bodyIssuedTo;
  }

  const validity = validityDays ? parseInt(validityDays, 10) : 365;
  const zoneId = c.env.CLOUDFLARE_ZONE_ID;
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;

  const isProduction = c.env.ENVIRONMENT === 'production';
  const hasCredentials = zoneId && apiToken;

  if (isProduction && !hasCredentials) {
    return c.json({ error: 'Cloudflare credentials not configured' }, 500);
  }

  let certData: any;

  if (!hasCredentials) {
    console.log('Cloudflare API credentials not configured. Generating mock certificate...');
    const mockId = `mock-${Math.random().toString(36).substr(2, 9)}`;
    const expires = new Date();
    expires.setDate(expires.getDate() + validity);
    certData = {
      id: mockId,
      common_name: commonName,
      validity_days: validity,
      certificate: `-----BEGIN CERTIFICATE-----\nMOCK_PEM_DATA_FOR_${commonName}\n-----END CERTIFICATE-----`,
      status: 'active',
      expires_on: expires.toISOString(),
      fingerprint_sha256: 'mock_fingerprint_sha256_placeholder',
      serial_number: Math.floor(100000000 + Math.random() * 900000000).toString()
    };
  } else {
    try {
      const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/client_certificates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          csr: csrPem,
          validity_days: validity
        })
      });

      if (!cfResponse.ok) {
        const errorText = await cfResponse.text();
        if (isProduction) {
          console.error('Cloudflare API call failed in production:', errorText);
          return c.json({ error: `Cloudflare API error: ${errorText}` }, 500);
        }
        console.warn('Cloudflare API failed. Falling back to local mock certificate. Details:', errorText);
        const mockId = `mock-${Math.random().toString(36).substr(2, 9)}`;
        const expires = new Date();
        expires.setDate(expires.getDate() + validity);
        certData = {
          id: mockId,
          common_name: commonName,
          validity_days: validity,
          certificate: `-----BEGIN CERTIFICATE-----\nMOCK_PEM_DATA_FOR_${commonName}\n-----END CERTIFICATE-----`,
          status: 'active',
          expires_on: expires.toISOString(),
          fingerprint_sha256: 'mock_fingerprint_sha256_placeholder',
          serial_number: Math.floor(100000000 + Math.random() * 900000000).toString()
        };
      } else {
        const cfData = await cfResponse.json() as any;
        certData = cfData.result;
      }
    } catch (e: any) {
      if (isProduction) {
        console.error('Fetch to Cloudflare API failed with error in production:', e);
        return c.json({ error: `Cloudflare API request failed: ${e.message || e}` }, 500);
      }
      console.error('Fetch to Cloudflare API failed with error. Falling back to mock:', e);
      const mockId = `mock-${Math.random().toString(36).substr(2, 9)}`;
      const expires = new Date();
      expires.setDate(expires.getDate() + validity);
      certData = {
        id: mockId,
        common_name: commonName,
        validity_days: validity,
        certificate: `-----BEGIN CERTIFICATE-----\nMOCK_PEM_DATA_FOR_${commonName}\n-----END CERTIFICATE-----`,
        status: 'active',
        expires_on: expires.toISOString(),
        fingerprint_sha256: 'mock_fingerprint_sha256_placeholder',
        serial_number: Math.floor(100000000 + Math.random() * 900000000).toString()
      };
    }
  }

  // Ensure the target user exists to satisfy foreign key constraints
  await db.insert(users).values({
    email: issuedTo,
    role: 'user',
    createdAt: new Date().toISOString()
  }).onConflictDoNothing().run();

  await db.insert(certificates).values({
    id: certData.id,
    issuedTo,
    commonName: certData.common_name,
    validityDays: certData.validity_days,
    certificatePem: certData.certificate,
    status: certData.status,
    expiresOn: certData.expires_on,
    fingerprintSha256: certData.fingerprint_sha256,
    serialNumber: certData.serial_number,
    createdAt: new Date().toISOString()
  }).run();

  return c.json({
    success: true,
    certificate: {
      id: certData.id,
      commonName: certData.common_name,
      certificatePem: certData.certificate,
      isMock: !hasCredentials || certData.id.startsWith('mock-')
    }
  });
});

app.delete('/certs/:id', async (c) => {
  const id = c.req.param('id');
  const zoneId = c.env.CLOUDFLARE_ZONE_ID;
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;

  const isMock = id.startsWith('mock-');

  if (!isMock && zoneId && apiToken) {
    try {
      const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/client_certificates/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      });
      if (!cfResponse.ok) {
        const errText = await cfResponse.text();
        console.warn('Cloudflare API revoke failed, continuing to database update. Error:', errText);
      }
    } catch (e) {
      console.error('Failed to revoke certificate via Cloudflare API:', e);
    }
  }

  const db = drizzle(c.env.DB);
  await db.update(certificates).set({ status: 'revoked' }).where(eq(certificates.id, id)).run();

  return c.json({ success: true });
});

app.post('/certs/:id/restore', async (c) => {
  const id = c.req.param('id');
  const zoneId = c.env.CLOUDFLARE_ZONE_ID;
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;

  const isMock = id.startsWith('mock-');

  if (!isMock && zoneId && apiToken) {
    try {
      const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/client_certificates/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'active'
        })
      });
      if (!cfResponse.ok) {
        const errText = await cfResponse.text();
        console.warn('Cloudflare API restore failed, continuing to database update. Error:', errText);
      }
    } catch (e) {
      console.error('Failed to restore certificate via Cloudflare API:', e);
    }
  }

  const db = drizzle(c.env.DB);
  await db.update(certificates).set({ status: 'active' }).where(eq(certificates.id, id)).run();

});

app.put('/certs/:id', async (c) => {
  const id = c.req.param('id');
  const email = c.get('userEmail');
  const db = drizzle(c.env.DB);

  // Verify admin authorization
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { commonName, issuedTo } = await c.req.json();
  if (!commonName || !issuedTo) {
    return c.json({ error: 'Missing parameters' }, 400);
  }

  // Ensure the target user exists in users table to prevent FK constraint violation
  await db.insert(users).values({
    email: issuedTo,
    role: 'user',
    createdAt: new Date().toISOString()
  }).onConflictDoNothing().run();

  // Update certificate metadata
  await db.update(certificates).set({
    commonName,
    issuedTo
  }).where(eq(certificates.id, id)).run();

  return c.json({ success: true });
});

app.get('/users', async (c) => {
  const email = c.get('userEmail');
  const db = drizzle(c.env.DB);

  // Verify admin authorization
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const allUsers = await db.select().from(users).all();
  return c.json({ users: allUsers });
});

app.put('/users/:targetEmail/role', async (c) => {
  const targetEmail = decodeURIComponent(c.req.param('targetEmail'));
  const loggedInEmail = c.get('userEmail');
  const db = drizzle(c.env.DB);

  // Verify admin authorization
  const user = await db.select().from(users).where(eq(users.email, loggedInEmail)).get();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { role } = await c.req.json() as { role: 'admin' | 'user' };
  if (role !== 'admin' && role !== 'user') {
    return c.json({ error: 'Invalid role' }, 400);
  }

  // Security prevention: Cannot revoke own admin role
  if (targetEmail === loggedInEmail && role !== 'admin') {
    return c.json({ error: 'You cannot revoke your own administrator permissions.' }, 400);
  }

  await db.update(users).set({ role }).where(eq(users.email, targetEmail)).run();
  return c.json({ success: true });
});

app.get('/hostname-associations', async (c) => {
  const email = c.get('userEmail');
  const db = drizzle(c.env.DB);

  // Verify admin authorization
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const zoneId = c.env.CLOUDFLARE_ZONE_ID;
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;
  const hasCredentials = zoneId && apiToken;

  let associations: { hostname: string; mtls_certificate_id?: string | null; createdAt: string }[] = [];

  if (hasCredentials) {
    try {
      const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/certificate_authorities/hostname_associations`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (cfResponse.ok) {
        const data = await cfResponse.json() as any;
        console.log('Hostname associations data from Cloudflare:', JSON.stringify(data));
        const nowStr = new Date().toISOString();

        // Sync to D1
        const hostnames: string[] = (data.result && Array.isArray(data.result.hostnames)) ? data.result.hostnames : [];
        const certId: string | null = (data.result && typeof data.result.mtls_certificate_id === 'string') ? data.result.mtls_certificate_id : null;

        const cfHostnamesSet = new Set(hostnames);

        // Add new associations or update existing ones (keeping original createdAt timestamp)
        for (const hn of hostnames) {
          const existing = await db.select().from(hostnameAssociations).where(eq(hostnameAssociations.hostname, hn)).get();
          if (!existing) {
            await db.insert(hostnameAssociations).values({
              hostname: hn,
              mtlsCertificateId: certId,
              createdAt: nowStr
            }).run();
          } else if (existing.mtlsCertificateId !== certId) {
            await db.update(hostnameAssociations)
              .set({ mtlsCertificateId: certId })
              .where(eq(hostnameAssociations.hostname, hn))
              .run();
          }
        }

        // Delete local associations that no longer exist on Cloudflare
        const localAssocs = await db.select().from(hostnameAssociations).all();
        for (const local of localAssocs) {
          if (!cfHostnamesSet.has(local.hostname)) {
            await db.delete(hostnameAssociations).where(eq(hostnameAssociations.hostname, local.hostname)).run();
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch hostname associations from Cloudflare:', e);
    }
  }

  // Read from SQLite
  const localAssocs = await db.select().from(hostnameAssociations).all();
  associations = localAssocs.map(a => ({
    hostname: a.hostname,
    mtls_certificate_id: a.mtlsCertificateId,
    createdAt: a.createdAt
  }));

  // If list is empty and we are in mock mode, seed some data
  const isProduction = c.env.ENVIRONMENT === 'production';
  if (associations.length === 0 && !hasCredentials && !isProduction) {
    const defaultAssocs = [
      { hostname: 'vpn.internal.dudka.pro', mtlsCertificateId: 'mock-ca-id-1', createdAt: new Date().toISOString() },
      { hostname: 'api.secure.dudka.pro', mtlsCertificateId: 'mock-ca-id-1', createdAt: new Date().toISOString() }
    ];
    for (const a of defaultAssocs) {
      await db.insert(hostnameAssociations).values({
        hostname: a.hostname,
        mtlsCertificateId: a.mtlsCertificateId,
        createdAt: a.createdAt
      }).onConflictDoNothing().run();
    }
    associations = defaultAssocs.map(a => ({
      hostname: a.hostname,
      mtls_certificate_id: a.mtlsCertificateId,
      createdAt: a.createdAt
    }));
  }

  return c.json({ associations });
});

app.post('/hostname-associations', async (c) => {
  const email = c.get('userEmail');
  const db = drizzle(c.env.DB);

  // Verify admin authorization
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const { hostname, mtls_certificate_id } = await c.req.json() as { hostname: string; mtls_certificate_id?: string };
  if (!hostname || !hostname.trim()) {
    return c.json({ error: 'Hostname is required' }, 400);
  }

  const zoneId = c.env.CLOUDFLARE_ZONE_ID;
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;
  const isProduction = c.env.ENVIRONMENT === 'production';
  const hasCredentials = zoneId && apiToken;

  if (isProduction && !hasCredentials) {
    return c.json({ error: 'Cloudflare credentials not configured' }, 500);
  }

  if (hasCredentials) {
    try {
      // 1. Fetch current associations
      const cfGet = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/certificate_authorities/hostname_associations`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      let currentHostnames: string[] = [];
      let activeCertId = mtls_certificate_id;

      if (cfGet.ok) {
        const data = await cfGet.json() as any;
        if (data.result && Array.isArray(data.result.hostnames)) {
          currentHostnames = data.result.hostnames;
        }
        if (!activeCertId && data.result && data.result.mtls_certificate_id) {
          activeCertId = data.result.mtls_certificate_id;
        }
      }

      if (!currentHostnames.includes(hostname)) {
        currentHostnames.push(hostname);
      }

      // 2. Put back to Cloudflare
      const body: any = {
        hostnames: currentHostnames
      };
      if (activeCertId) {
        body.mtls_certificate_id = activeCertId;
      }

      const cfPut = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/certificate_authorities/hostname_associations`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!cfPut.ok) {
        const errText = await cfPut.text();
        return c.json({ error: `Cloudflare API error: ${errText}` }, 400);
      }
    } catch (e) {
      console.error(e);
      return c.json({ error: 'Failed to communicate with Cloudflare API' }, 500);
    }
  }

  // Save to SQLite
  await db.insert(hostnameAssociations).values({
    hostname: hostname,
    mtlsCertificateId: mtls_certificate_id || null,
    createdAt: new Date().toISOString()
  }).onConflictDoUpdate({
    target: hostnameAssociations.hostname,
    set: { mtlsCertificateId: mtls_certificate_id || null }
  }).run();

  return c.json({ success: true });
});

app.delete('/hostname-associations/:hostname', async (c) => {
  const email = c.get('userEmail');
  const db = drizzle(c.env.DB);

  // Verify admin authorization
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 403);
  }

  const hostname = decodeURIComponent(c.req.param('hostname'));
  const zoneId = c.env.CLOUDFLARE_ZONE_ID;
  const apiToken = c.env.CLOUDFLARE_API_TOKEN;
  const isProduction = c.env.ENVIRONMENT === 'production';
  const hasCredentials = zoneId && apiToken;

  if (isProduction && !hasCredentials) {
    return c.json({ error: 'Cloudflare credentials not configured' }, 500);
  }

  if (hasCredentials) {
    try {
      // 1. Fetch current associations
      const cfGet = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/certificate_authorities/hostname_associations`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      let currentHostnames: string[] = [];
      let activeCertId: string | undefined;

      if (cfGet.ok) {
        const data = await cfGet.json() as any;
        if (data.result && Array.isArray(data.result.hostnames)) {
          currentHostnames = data.result.hostnames;
        }
        if (data.result && data.result.mtls_certificate_id) {
          activeCertId = data.result.mtls_certificate_id;
        }
      }

      const updatedHostnames = currentHostnames.filter(h => h !== hostname);

      // 2. Put back to Cloudflare
      const body: any = {
        hostnames: updatedHostnames
      };
      if (activeCertId) {
        body.mtls_certificate_id = activeCertId;
      }

      const cfPut = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/certificate_authorities/hostname_associations`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!cfPut.ok) {
        const errText = await cfPut.text();
        return c.json({ error: `Cloudflare API error: ${errText}` }, 400);
      }
    } catch (e) {
      console.error(e);
      return c.json({ error: 'Failed to communicate with Cloudflare API' }, 500);
    }
  }

  // Delete from SQLite
  await db.delete(hostnameAssociations).where(eq(hostnameAssociations.hostname, hostname)).run();

  return c.json({ success: true });
});

export const onRequest = handle(app);
