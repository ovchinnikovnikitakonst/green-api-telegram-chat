import { expect, test } from "@playwright/test";

test("messenger layout, loading and errors", async ({ page }, testInfo) => {
  let finishSend: (() => Promise<void>) | undefined;
  let delivered = false;
  await page.route("https://4100.api.green-api.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/checkAccount/")) {
      await route.fulfill({ json: { exist: true, chatId: "123" } });
    } else if (url.includes("/sendMessage/")) {
      finishSend = () => route.fulfill({ status: 500 });
    } else if (url.includes("/receiveNotification/")) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (finishSend && !delivered) {
        delivered = true;
        await route.fulfill({
          json: {
            receiptId: 1,
            body: {
              typeWebhook: "incomingMessageReceived",
              instanceData: { typeInstance: "telegram" },
              idMessage: "visual-example",
              timestamp: Math.floor(Date.now() / 1000),
              senderData: { chatId: "456", chatName: "Команда проекта" },
              messageData: {
                typeMessage: "textMessage",
                textMessageData: {
                  textMessage:
                    "Привет! Макеты готовы. Давайте обсудим детали интерфейса и следующий шаг.",
                },
              },
            },
          },
        });
      } else await route.fulfill({ json: null });
    } else await route.fulfill({ json: { result: true } });
  });
  const capture = async (state: string) => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${state}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  };
  await page.goto("/");
  await page
    .getByLabel("API URL", { exact: true })
    .fill("https://4100.api.green-api.com");
  await page.getByLabel("ID инстанса").fill("0");
  await page.getByLabel("Токен доступа").fill("test-token");
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await capture("empty");
  await page.getByLabel("Новый разговор").fill("@example_user");
  await page.getByRole("button", { name: "Создать чат" }).click();
  await expect(
    page.getByRole("heading", { name: "Начните разговор" }),
  ).toBeVisible();
  await capture("one-chat");
  await page
    .getByLabel("Сообщение", { exact: true })
    .fill("Обсудим обновлённый интерфейс завтра?");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page.getByRole("button", { name: "Отправляется" }),
  ).toBeDisabled();
  await expect.poll(() => Boolean(finishSend)).toBe(true);
  await capture("loading");
  await finishSend!();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ошибка 500" }),
  ).toBeVisible();
  await capture("error");
  await expect(page.locator(".chat-item")).toHaveCount(2);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "К списку чатов" }).click();
  }
  await capture("multiple-chats");
  await page.getByRole("button", { name: /Команда проекта/ }).click();
  await expect(page.getByRole("log")).toContainText("Макеты готовы");
  await capture("incoming");
});
