import { ApiError, errorText, type GreenApi } from "./greenApi";

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function pollNotifications(
  api: GreenApi,
  signal: AbortSignal,
  onBody: (body: unknown) => void,
  onStatus: (error: string | null) => void,
): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const notification = await api.receive(signal);
      if (signal.aborted) return;
      if (notification) {
        onBody(notification.body);
        await api.acknowledge(notification.receiptId, signal);
      }
      if (signal.aborted) return;
      failures = 0;
      onStatus(null);
      // Also guard against a server returning null immediately instead of long polling.
      await delay(notification ? 100 : 500, signal);
    } catch (error) {
      if (signal.aborted) return;
      if (
        error instanceof ApiError &&
        [400, 401, 403].includes(error.status ?? 0)
      ) {
        onStatus(
          `${errorText(error)} Получение остановлено: измените параметры подключения.`,
        );
        return;
      }
      onStatus(`${errorText(error)} Повторяем подключение…`);
      await delay(
        Math.min(1000 * 2 ** Math.min(failures++, 5), 30_000),
        signal,
      );
    }
  }
}
