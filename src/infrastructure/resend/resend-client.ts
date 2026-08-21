import { ConfigurationError } from "../../lib/errors";

interface SendEmailInput {
  html: string;
  subject: string;
  text: string;
  to: string;
}

export class ResendClient {
  constructor(
    private readonly apiKey?: string,
    private readonly fromEmail?: string,
    private readonly baseUrl = "https://api.resend.com",
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.fromEmail);
  }

  async sendPasswordResetEmail(input: {
    passwordResetUrl: string;
    to: string;
  }): Promise<void> {
    await this.sendEmail({
      html: `<p>You requested a password reset.</p><p><a href="${input.passwordResetUrl}">Reset password</a></p>`,
      subject: "Reset your Raid Ledger password",
      text: `Reset your password: ${input.passwordResetUrl}`,
      to: input.to,
    });
  }

  async sendVerificationEmail(input: {
    to: string;
    verificationUrl: string;
  }): Promise<void> {
    await this.sendEmail({
      html: `<p>Welcome to Raid Ledger.</p><p><a href="${input.verificationUrl}">Verify your email</a></p>`,
      subject: "Verify your Raid Ledger email",
      text: `Verify your email: ${input.verificationUrl}`,
      to: input.to,
    });
  }

  private async sendEmail(input: SendEmailInput): Promise<void> {
    if (!this.apiKey || !this.fromEmail) {
      throw new ConfigurationError(
        "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured",
      );
    }

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "raid-ledger-api/0.1.0",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        html: input.html,
        subject: input.subject,
        text: input.text,
        to: [input.to],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend send failed (${response.status}): ${body}`);
    }
  }
}
