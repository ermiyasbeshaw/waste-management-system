import "server-only";
import { randomUUID } from "node:crypto";
import { maskPhone } from "@/lib/redact";
import { log } from "@/server/log";

/**
 * Messaging adapters (CLAUDE.md §2, architecture §11). Only the outbox dispatcher calls them — never a request.
 * Development uses console providers that log WHO and HOW LONG, never the text (it may contain an OTP).
 * The Ethio Telecom SMS adapter and the email provider are added when the client supplies accounts.
 */

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<{ providerRef: string }>;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: { to: string; subject: string; html: string }): Promise<{ providerRef: string }>;
}

export interface MessagingProviders {
  sms: SmsProvider;
  email: EmailProvider;
}

export const consoleSmsProvider: SmsProvider = {
  name: "console",
  async send(to, text) {
    const providerRef = `console-sms-${randomUUID()}`;
    log.info("SMS (console provider, not sent)", {
      to: maskPhone(to),
      length: text.length,
      providerRef,
    });
    return { providerRef };
  },
};

export const consoleEmailProvider: EmailProvider = {
  name: "console",
  async send(msg) {
    const providerRef = `console-email-${randomUUID()}`;
    const domain = msg.to.split("@")[1] ?? "?";
    log.info("Email (console provider, not sent)", {
      toDomain: domain,
      subject: msg.subject,
      providerRef,
    });
    return { providerRef };
  },
};

export function getMessagingProviders(): MessagingProviders {
  return { sms: consoleSmsProvider, email: consoleEmailProvider };
}
