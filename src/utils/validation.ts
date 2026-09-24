import type { Recipient } from "../types";

export function normalizeApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim().replace(/\/+$/, ""));
  } catch {
    throw new Error("Введите корректный API URL из личного кабинета.");
  }
  // Credentials must never be sent to an arbitrary host pasted into the form.
  if (
    url.protocol !== "https:" ||
    (!/^\d+\.api\.green-api\.com$/.test(url.hostname) &&
      url.hostname !== "api.green-api.com")
  ) {
    throw new Error(
      "Нужен HTTPS-адрес API GREEN-API из параметров доступа инстанса.",
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Укажите только адрес API, без credentials, параметров и пути метода.",
    );
  }
  return url.href.replace(/\/+$/, "");
}

export function normalizePhone(value: string): string {
  if (!/^\+?[\d\s()-]+$/.test(value.trim()))
    throw new Error(
      "Введите номер телефона: цифры, пробелы, скобки или дефисы.",
    );
  const phone = value.replace(/\D/g, "");
  // Basic international-number validation, not a country/registration lookup.
  if (!/^[1-9]\d{6,14}$/.test(phone))
    throw new Error(
      "Введите международный номер с кодом страны: от 7 до 15 цифр. Например, +44 7700 900123.",
    );
  return phone;
}

export function normalizeRecipient(value: string): Recipient {
  const input = value.trim();
  if (input.startsWith("@")) {
    if (!/^@[a-zA-Z0-9_]+$/.test(input))
      throw new Error(
        "Введите @username: латинские буквы, цифры и подчёркивание.",
      );
    return { username: input.toLowerCase() };
  }
  return { phoneNumber: Number(normalizePhone(input)) };
}

export function recipientLabel(recipient: Recipient): string {
  return recipient.username ?? `+${recipient.phoneNumber}`;
}
