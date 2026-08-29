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
    verificationCode: string;
    to: string;
    verificationUrl: string;
  }): Promise<void> {
    const safeVerificationUrl = escapeHtml(input.verificationUrl);
    const safeVerificationCode = escapeHtml(input.verificationCode);

    await this.sendEmail({
      html:
        `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937">` +
        `<h2 style="margin:0 0 12px">Verify your Raid Ledger email</h2>` +
        `<p style="margin:0 0 12px">Welcome to Raid Ledger. Confirm this email address to finish setting up your account.</p>` +
        `<p style="margin:0 0 12px"><a href="${safeVerificationUrl}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px">Verify email</a></p>` +
        `<p style="margin:0 0 8px">If the button does not work, copy and paste this URL into your browser:</p>` +
        `<p style="margin:0 0 12px;word-break:break-all"><a href="${safeVerificationUrl}">${safeVerificationUrl}</a></p>` +
        `<p style="margin:0 0 4px"><strong>Your verification code:</strong> ${safeVerificationCode}</p>` +
        `<p style="margin:0">This code expires in 15 minutes.</p>` +
        `</div>`,
      subject: "Verify your Raid Ledger email",
      text:
        "Verify your Raid Ledger email.\n\n" +
        `Open this link: ${input.verificationUrl}\n\n` +
        `Your verification code: ${input.verificationCode}\n` +
        "This code expires in 15 minutes.",
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
