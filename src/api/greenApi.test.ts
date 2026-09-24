import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./greenApi";
import {
  normalizeApiUrl,
  normalizePhone,
  normalizeRecipient,
} from "../utils/validation";
import { parseIncoming } from "./notifications";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("validation", () => {
  it("normalizes the host and rejects credential exfiltration URLs", () => {
    expect(normalizeApiUrl(" https://4100.api.green-api.com/ ")).toBe(
      "https://4100.api.green-api.com",
    );
    expect(() =>
      normalizeApiUrl("https://api.green-api.com.evil.example"),
    ).toThrow();
    expect(() =>
      normalizeApiUrl("https://user:secret@4100.api.green-api.com"),
    ).toThrow();
    expect(() => normalizeApiUrl("http://4100.api.green-api.com")).toThrow();
    expect(() =>
      normalizeApiUrl("https://4100.api.green-api.com/v3"),
    ).toThrow();
  });
  it("accepts international phones without rewriting a country code", () => {
    expect(normalizePhone("+81 90 1234 5678")).toBe("819012345678");
    expect(normalizePhone("+44 (7700) 900-123")).toBe("447700900123");
    expect(normalizePhone("8 (999) 123-45-67")).toBe("89991234567");
    expect(normalizePhone("+375 29 123-45-67")).toBe("375291234567");
    expect(() => normalizePhone("abc79991234567")).toThrow();
    expect(() => normalizePhone("+1 555 55")).toThrow();
  });
  it("accepts a username or a phone, never both", () => {
    expect(normalizeRecipient(" @Test_User ")).toEqual({
      username: "@test_user",
    });
    expect(normalizeRecipient("+1 202-555-0123")).toEqual({
      phoneNumber: 12025550123,
    });
    expect(() => normalizeRecipient("@bad username")).toThrow();
    expect(() => normalizeRecipient("https://t.me/test_user")).toThrow();
  });
});
describe("API contract", () => {
  const api = createApi({
    apiUrl: "https://4100.api.green-api.com/",
    idInstance: "0",
    apiTokenInstance: "test-token",
  });
  it("reports invalid JSON safely instead of leaking response text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid-json-test-token")),
    );
    await expect(api.receive(new AbortController().signal)).rejects.toThrow(
      "некорректный JSON",
    );
  });
  it("times out a stalled request and clears its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const result = expect(
      api.receive(new AbortController().signal),
    ).rejects.toThrow("Время ожидания истекло");
    await vi.advanceTimersByTimeAsync(45_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts in-flight requests and cleans up the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();
    const request = api.receive(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("uses the server chatId and creates the documented request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ exist: true, chatId: "123" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await api.checkAccount(
        { phoneNumber: 79991234567 },
        new AbortController().signal,
      ),
    ).toBe("123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://4100.api.green-api.com/waInstance0/checkAccount/test-token",
      expect.objectContaining({
        method: "POST",
        body: '{"phoneNumber":79991234567}',
      }),
    );
  });
  it("looks up username using the Telegram payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ exist: true, chatId: "987654321" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await api.checkAccount(
        { username: "@test_user" },
        new AbortController().signal,
      ),
    ).toBe("987654321");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/checkAccount/"),
      expect.objectContaining({ body: '{"username":"@test_user"}' }),
    );
  });
  it("never exposes a response body containing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("test-token", { status: 401 })),
    );
    await expect(api.receive(new AbortController().signal)).rejects.toThrow(
      "Ошибка 401",
    );
    await expect(api.receive(new AbortController().signal)).rejects.not.toThrow(
      "test-token",
    );
  });
  it("rejects a malformed send result and unconfirmed acknowledgement", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response('{"result":false}')),
        ),
    );
    await expect(
      api.sendMessage("123", "hello", new AbortController().signal),
    ).rejects.toThrow("не подтвердил");
    await expect(
      api.acknowledge(1, new AbortController().signal),
    ).rejects.toThrow("не подтвердил");
  });
});
describe("notification parsing", () => {
  const body = {
    typeWebhook: "incomingMessageReceived",
    instanceData: { typeInstance: "telegram" },
    timestamp: 1700000000,
    idMessage: "m1",
    senderData: { chatId: "123", chatName: "Тест" },
    messageData: {
      typeMessage: "textMessage",
      textMessageData: { textMessage: "Привет" },
    },
  };
  it("extracts text, canonical chat and milliseconds", () => {
    expect(parseIncoming(body)?.message).toEqual({
      id: "m1",
      chatId: "123",
      text: "Привет",
      timestamp: 1700000000000,
      direction: "incoming",
    });
  });
  it("rejects other messengers and routes group text by chatId, not sender", () => {
    expect(
      parseIncoming({ ...body, instanceData: { typeInstance: "whatsapp" } }),
    ).toBeNull();
    expect(
      parseIncoming({ ...body, instanceData: { typeInstance: "v3" } }),
    ).toBeNull();
    expect(parseIncoming({ ...body, instanceData: undefined })).toBeNull();
    expect(
      parseIncoming({
        ...body,
        senderData: {
          chatId: "-1001234567890",
          sender: "123",
          chatType: "supergroup",
        },
      })?.message.chatId,
    ).toBe("-1001234567890");
  });
  it("accepts extended text while ignoring outgoing and file events", () => {
    expect(
      parseIncoming({
        ...body,
        messageData: {
          typeMessage: "extendedTextMessage",
          extendedTextMessageData: { text: "https://example.org" },
        },
      })?.message.text,
    ).toBe("https://example.org");
    expect(
      parseIncoming({ ...body, typeWebhook: "outgoingAPIMessageReceived" }),
    ).toBeNull();
    expect(
      parseIncoming({ ...body, messageData: { typeMessage: "imageMessage" } }),
    ).toBeNull();
    expect(parseIncoming(null)).toBeNull();
  });
});
