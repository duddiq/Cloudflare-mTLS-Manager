export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  sendEmail(payload: EmailPayload): Promise<{ success: boolean; error?: string; messageId?: string }>;
}

export class ResendEmailProvider implements EmailProvider {
  private apiKey: string;
  private from: string;

  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey;
    this.from = from;
  }

  async sendEmail(payload: EmailPayload) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Resend API error: ${errorText}` };
      }

      const data = await response.json() as { id: string };
      return { success: true, messageId: data.id };
    } catch (error: any) {
      return { success: false, error: error.message || String(error) };
    }
  }
}

export function getEmailProvider(providerName: string, config: { apiKey: string; from: string }): EmailProvider {
  switch (providerName.toLowerCase()) {
    case 'resend':
      return new ResendEmailProvider(config.apiKey, config.from);
    default:
      throw new Error(`Unsupported email provider: ${providerName}`);
  }
}
