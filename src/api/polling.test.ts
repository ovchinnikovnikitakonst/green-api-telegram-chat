import { afterEach, expect, it, vi } from "vitest";
import { ApiError, type GreenApi } from "./greenApi";
import { pollNotifications } from "./polling";

afterEach(() => vi.useRealTimers());
function mockApi(): GreenApi {
  return {
    checkAccount: vi.fn(),
    sendMessage: vi.fn(),
    receive: vi.fn(),
    acknowledge: vi.fn(),
  };
}
it("does not acknowledge null or an unprocessed notification", async () => {
  vi.useFakeTimers();
  const api = mockApi();
  const controller = new AbortController();
  vi.mocked(api.receive)
    .mockResolvedValueOnce(null)
    .mockResolvedValue({ receiptId: 1, body: {} });
  const onBody = vi.fn(() => {
    throw new Error("processing failed");
  });
  const loop = pollNotifications(api, controller.signal, onBody, vi.fn());
  await vi.advanceTimersByTimeAsync(499);
  expect(onBody).not.toHaveBeenCalled();
  expect(api.acknowledge).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(onBody).toHaveBeenCalledTimes(1);
  expect(api.acknowledge).not.toHaveBeenCalled();
  controller.abort();
  await loop;
  expect(vi.getTimerCount()).toBe(0);
});
it("waits before retrying a failed acknowledgement", async () => {
  vi.useFakeTimers();
  const api = mockApi();
  const controller = new AbortController();
  vi.mocked(api.receive).mockResolvedValue({ receiptId: 1, body: {} });
  vi.mocked(api.acknowledge)
    .mockRejectedValueOnce(new ApiError("temporary"))
    .mockImplementation(async () => {
      controller.abort();
    });
  const loop = pollNotifications(api, controller.signal, vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(999);
  expect(api.receive).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await loop;
  expect(api.receive).toHaveBeenCalledTimes(2);
  expect(api.acknowledge).toHaveBeenNthCalledWith(2, 1, controller.signal);
});
it("processes before ack and does not receive again while ack is pending", async () => {
  const api = mockApi();
  const controller = new AbortController();
  const calls: string[] = [];
  let release!: () => void;
  vi.mocked(api.receive).mockResolvedValue({ receiptId: 5, body: {} });
  vi.mocked(api.acknowledge).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        calls.push("ack");
        release = resolve;
      }),
  );
  const loop = pollNotifications(
    api,
    controller.signal,
    () => calls.push("body"),
    vi.fn(),
  );
  await vi.waitFor(() => expect(calls).toEqual(["body", "ack"]));
  expect(api.receive).toHaveBeenCalledTimes(1);
  controller.abort();
  release();
  await loop;
  expect(api.receive).toHaveBeenCalledTimes(1);
});
it("backs off on network errors and cancels the retry timer", async () => {
  vi.useFakeTimers();
  const api = mockApi();
  const controller = new AbortController();
  vi.mocked(api.receive).mockRejectedValue(new ApiError("network"));
  const loop = pollNotifications(api, controller.signal, vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(999);
  expect(api.receive).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(api.receive).toHaveBeenCalledTimes(2);
  controller.abort();
  await loop;
  expect(vi.getTimerCount()).toBe(0);
});
it("stops on invalid credentials without retrying or acknowledging", async () => {
  const api = mockApi();
  vi.mocked(api.receive).mockRejectedValue(new ApiError("unauthorized", 401));
  const status = vi.fn();
  await pollNotifications(api, new AbortController().signal, vi.fn(), status);
  expect(api.receive).toHaveBeenCalledTimes(1);
  expect(api.acknowledge).not.toHaveBeenCalled();
  expect(status).toHaveBeenCalledWith(expect.stringContaining("остановлено"));
});
