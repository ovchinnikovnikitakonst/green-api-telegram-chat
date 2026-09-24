import type { Credentials, Recipient } from "../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ||
    (error instanceof Error && error.name === "Error")
    ? error.message
    : "Не удалось выполнить запрос. Проверьте сеть и настройки инстанса.";
}

export function createApi(credentials: Credentials) {
  const { apiUrl, idInstance, apiTokenInstance } = credentials;
  async function request(
    method: string,
    action: string,
    signal: AbortSignal,
    body?: unknown,
    suffix = "",
  ): Promise<unknown> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, 45_000);
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/waInstance${encodeURIComponent(idInstance)}/${action}/${encodeURIComponent(apiTokenInstance)}${suffix}`,
        {
          method,
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
          headers:
            body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const descriptions: Record<number, string> = {
          400: "Проверьте параметры запроса и настройки HTTP API (webhookUrl должен быть пустым).",
          401: "Проверьте idInstance и apiTokenInstance.",
          403: "Доступ запрещён. Проверьте credentials, тариф и ограничения аккаунта.",
          429: "Превышена частота запросов. Подождите перед повторной попыткой.",
          469: "Telegram временно ограничил поиск получателей. Срок снятия ограничения неизвестен; попробуйте через несколько часов.",
        };
        throw new ApiError(
          `Ошибка ${response.status}. ${descriptions[response.status] ?? "Сервис временно недоступен. Попробуйте позже."}`,
          response.status,
        );
      }
      try {
        return (await response.json()) as unknown;
      } catch (error) {
        if (controller.signal.aborted || !(error instanceof SyntaxError)) throw error;
        throw new ApiError("API вернул некорректный JSON. Попробуйте позже.");
      }
    } catch (error) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      if (error instanceof ApiError) throw error;
      // Do not expose fetch errors or response bodies: they can contain a URL with the token.
      throw new ApiError(
        controller.signal.aborted
          ? "Время ожидания истекло. Результат отправки может быть неизвестен."
          : "Ошибка сети или CORS. Проверьте соединение и API URL.",
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    }
  }
  return {
    async checkAccount(
      recipient: Recipient,
      signal: AbortSignal,
    ): Promise<string> {
      const data = await request("POST", "checkAccount", signal, recipient);
      if (isRecord(data) && data.exist === false)
        throw new ApiError(
          "Получатель Telegram не найден или скрыт настройками приватности. Попробуйте номер или @username.",
        );
      if (isRecord(data) && data.status === false)
        throw new ApiError(
          "Не удалось проверить получателя. Проверьте авторизацию инстанса и ограничения поиска Telegram.",
        );
      if (
        !isRecord(data) ||
        data.exist !== true ||
        typeof data.chatId !== "string" ||
        !data.chatId
      )
        throw new ApiError("Неожиданный ответ CheckAccount.");
      return data.chatId;
    },
    async sendMessage(
      chatId: string,
      message: string,
      signal: AbortSignal,
    ): Promise<string> {
      const data = await request("POST", "sendMessage", signal, {
        chatId,
        message,
      });
      if (
        !isRecord(data) ||
        typeof data.idMessage !== "string" ||
        !data.idMessage
      )
        throw new ApiError(
          "API не подтвердил отправку. Проверьте Telegram перед повтором.",
        );
      return data.idMessage;
    },
    async receive(
      signal: AbortSignal,
    ): Promise<{ receiptId: number; body: unknown } | null> {
      const data = await request(
        "GET",
        "receiveNotification",
        signal,
        undefined,
        "?receiveTimeout=30",
      );
      if (data === null) return null;
      if (
        !isRecord(data) ||
        !Number.isSafeInteger(data.receiptId) ||
        typeof data.receiptId !== "number" ||
        !("body" in data)
      )
        throw new ApiError("Неожиданный формат уведомления.");
      return { receiptId: data.receiptId, body: data.body };
    },
    async acknowledge(receiptId: number, signal: AbortSignal): Promise<void> {
      const data = await request(
        "DELETE",
        "deleteNotification",
        signal,
        undefined,
        `/${receiptId}`,
      );
      if (!isRecord(data) || data.result !== true)
        throw new ApiError("Сервис не подтвердил обработку уведомления.");
    },
  };
}
export type GreenApi = ReturnType<typeof createApi>;
