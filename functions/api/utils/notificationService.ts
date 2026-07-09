import { eq } from 'drizzle-orm';
import { certificates, appMetadata } from '../../../src/db/schema';
import { decryptText } from './crypto';
import { getEmailProvider } from './email';

export interface ExpiryCheckResult {
  success: boolean;
  processed: number;
  sent: number;
  errors: string[];
}

/**
 * Runs the check for expiring certificates and sends email notifications.
 */
export async function checkAndSendExpiryNotifications(
  db: any,
  env: any
): Promise<ExpiryCheckResult> {
  const result: ExpiryCheckResult = {
    success: true,
    processed: 0,
    sent: 0,
    errors: [],
  };

  try {
    // 1. Fetch all app settings from D1 app_metadata
    const metadataList = await db.select().from(appMetadata).all();
    const config: Record<string, string> = {};
    for (const meta of metadataList) {
      config[meta.key] = meta.value || '';
    }

    const emailEnabled = config.email_enabled === 'true';
    if (!emailEnabled) {
      console.log('Notification Service: Email notifications are disabled in settings.');
      return result;
    }

    const providerName = config.email_provider || 'resend';
    const senderEmail = config.email_sender || 'onboarding@resend.dev';
    const encryptedApiKey = config.email_api_key;
    const warningDaysStr = config.email_warning_days || '30,14,7';

    if (!encryptedApiKey) {
      const err = 'Email API Key is not configured.';
      result.errors.push(err);
      result.success = false;
      return result;
    }

    // 2. Decrypt Email Provider API Key
    const secret = env.ENCRYPTION_SECRET;
    if (!secret) {
      const err = 'Failed to decrypt: Encryption secret is missing.';
      result.errors.push(err);
      result.success = false;
      return result;
    }
    let apiKey = '';
    try {
      apiKey = await decryptText(encryptedApiKey, secret);
    } catch (err: any) {
      const errMsg = `Failed to decrypt API Key: ${err.message || String(err)}`;
      console.error(errMsg);
      result.errors.push(errMsg);
      result.success = false;
      return result;
    }

    // 3. Parse warning days (thresholds)
    const warningDays = warningDaysStr
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b); // Ascending: [7, 14, 30]

    if (warningDays.length === 0) {
      result.errors.push('No valid warning days thresholds configured.');
      result.success = false;
      return result;
    }

    // 4. Initialize Email Provider
    const emailProvider = getEmailProvider(providerName, { apiKey, from: senderEmail });

    // 5. Fetch all active certificates
    const activeCerts = await db
      .select()
      .from(certificates)
      .where(eq(certificates.status, 'active'))
      .all();

    result.processed = activeCerts.length;

    for (const cert of activeCerts) {
      const expiresTime = new Date(cert.expiresOn).getTime();
      const now = Date.now();
      const remainingDays = Math.ceil((expiresTime - now) / (1000 * 60 * 60 * 24));

      if (remainingDays <= 0) {
        // Already expired
        continue;
      }

      // Parse already sent notifications
      let sentList: number[] = [];
      if (cert.expiryNotificationsSent) {
        sentList = cert.expiryNotificationsSent
          .split(',')
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n));
      }

      // Find the smallest threshold D such that remainingDays <= D and D was not notified
      const thresholdToNotify = warningDays.find(
        (d) => remainingDays <= d && !sentList.includes(d)
      );

      if (thresholdToNotify !== undefined) {
        console.log(
          `Notification Service: Cert ${cert.commonName} (ID: ${cert.id}) has ${remainingDays} days left. Triggering warning for ${thresholdToNotify} days.`
        );

        const emailHtml = getCertificateExpiryEmailTemplate({
          commonName: cert.commonName,
          serialNumber: cert.serialNumber || 'N/A',
          expiresOn: new Date(cert.expiresOn).toLocaleDateString(),
          remainingDays,
        });

        const subject = `Urgent: mTLS Client Certificate Expiring in ${remainingDays} days`;

        // Send Email
        const emailResult = await emailProvider.sendEmail({
          to: cert.issuedTo,
          subject,
          html: emailHtml,
        });

        if (emailResult.success) {
          result.sent++;
          // Update notified thresholds: add current threshold, plus any larger thresholds that are now in the past
          const newSentList = Array.from(
            new Set([...sentList, thresholdToNotify, ...warningDays.filter((t) => t > thresholdToNotify)])
          ).sort((a, b) => a - b).join(',');

          await db
            .update(certificates)
            .set({ expiryNotificationsSent: newSentList })
            .where(eq(certificates.id, cert.id))
            .run();
        } else {
          const err = `Failed to send email for ${cert.commonName} to ${cert.issuedTo}: ${emailResult.error}`;
          console.error(err);
          result.errors.push(err);
        }
      }
    }
  } catch (err: any) {
    const errMsg = `Notification service runtime error: ${err.message || String(err)}`;
    console.error(errMsg);
    result.errors.push(errMsg);
    result.success = false;
  }

  return result;
}

/**
 * Sends a test email using currently configured/provided settings.
 */
export async function sendTestNotification(
  db: any,
  env: any,
  recipientEmail: string,
  testConfig?: { provider?: string; sender?: string; apiKey?: string }
): Promise<{ success: boolean; error?: string; messageId?: string }> {
  try {
    let providerName = testConfig?.provider;
    let senderEmail = testConfig?.sender;
    let apiKey = testConfig?.apiKey;

    // If config details are not provided, read them from DB
    if (!providerName || !senderEmail || !apiKey) {
      const metadataList = await db.select().from(appMetadata).all();
      const config: Record<string, string> = {};
      for (const meta of metadataList) {
        config[meta.key] = meta.value || '';
      }

      providerName = providerName || config.email_provider || 'resend';
      senderEmail = senderEmail || config.email_sender || 'onboarding@resend.dev';
      
      if (!apiKey && config.email_api_key) {
        const secret = env.ENCRYPTION_SECRET;
        if (!secret) {
          return { success: false, error: 'Encryption secret is missing' };
        }
        apiKey = await decryptText(config.email_api_key, secret);
      }
    }

    if (!apiKey) {
      return { success: false, error: 'API key is not configured' };
    }
    if (!senderEmail) {
      return { success: false, error: 'Sender email is not configured' };
    }

    const emailProvider = getEmailProvider(providerName, { apiKey, from: senderEmail });

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-top: 0;">Test Email Notification</h2>
        <p>Hello,</p>
        <p>This is a test notification from your <strong>mTLS Manager</strong> application.</p>
        <p>If you received this message, it means your configuration for email provider <strong>${providerName}</strong> is correct and working properly!</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 12px; color: #6b7280; text-align: center;">Cloudflare mTLS Manager Settings Page</p>
      </div>
    `;

    return await emailProvider.sendEmail({
      to: recipientEmail,
      subject: 'mTLS Manager - Test Email Notification',
      html,
    });
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Returns a styled HTML template for the warning email.
 */
function getCertificateExpiryEmailTemplate(data: {
  commonName: string;
  serialNumber: string;
  expiresOn: string;
  remainingDays: number;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; color: #111827; margin: 0; padding: 20px; }
        .container { max-width: 580px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05); }
        .logo-wrap { display: flex; align-items: center; margin-bottom: 24px; }
        .logo { font-size: 20px; font-weight: bold; color: #4f46e5; letter-spacing: -0.5px; }
        .header { font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 12px; }
        .warning-box { background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin-bottom: 24px; color: #b45309; font-size: 14px; font-weight: 500; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .table th, .table td { text-align: left; padding: 12px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
        .table th { color: #6b7280; font-weight: 500; width: 140px; }
        .table td { color: #111827; font-weight: 600; }
        .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; font-size: 14px; margin-top: 10px; text-align: center; }
        .footer { font-size: 11px; color: #9ca3af; margin-top: 32px; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo-wrap">
          <span class="logo">mTLS Manager</span>
        </div>
        <div class="header">Your client certificate is expiring soon</div>
        <div class="warning-box">
          ⚠️ Action required: Your certificate will expire in ${data.remainingDays} days.
        </div>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 20px;">
          The certificate used to secure your mTLS authentication is approaching its expiration date. Once it expires, you will not be able to authenticate and access secured applications.
        </p>
        <table class="table">
          <tr>
            <th>Common Name</th>
            <td>${data.commonName}</td>
          </tr>
          <tr>
            <th>Serial Number</th>
            <td><code style="font-family: monospace; font-size: 13px; color: #4b5563;">${data.serialNumber}</code></td>
          </tr>
          <tr>
            <th>Expires On</th>
            <td>${data.expiresOn}</td>
          </tr>
        </table>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 24px;">
          Please log in to the mTLS Manager console to generate a new certificate and update your configured client credentials.
        </p>
        <div class="footer">
          This is an automated notification from your Zero Trust mTLS Manager. Please do not reply directly to this email.
        </div>
      </div>
    </body>
    </html>
  `;
}
