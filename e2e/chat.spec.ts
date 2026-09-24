import { expect, test } from "@playwright/test";

test("Telegram username and international phone resolve to one chat; 4096 characters are accepted", async ({
  page,
}, testInfo) => {
  const lookups: unknown[] = [];
  await page.route("https://4100.api.green-api.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/checkAccount/")) {
      lookups.push(route.request().postDataJSON());
      await route.fulfill({ json: { exist: true, chatId: "987654321" } });
    } else if (url.includes("/sendMessage/")) {
      expect(route.request().postDataJSON()).toEqual({
        chatId: "987654321",
        message: "x".repeat(4096),
      });
      await route.fulfill({ json: { idMessage: "long-message" } });
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({ json: null });
    }
  });
  await page.goto("/");
  await page
    .getByLabel("API URL", { exact: true })
    .fill("https://4100.api.green-api.com/");
  await page.getByLabel("ID инстанса").fill("0");
  await page.getByLabel("Токен доступа").fill("test-token");
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await page.getByLabel("Новый разговор").fill("@Example_User");
  await page.getByRole("button", { name: "Создать чат" }).click();
  await expect(
    page.getByRole("heading", { name: "@example_user" }),
  ).toBeVisible();
  const message = page.getByLabel("Сообщение", { exact: true });
  await expect(message).toHaveAttribute("maxlength", "4096");
  await message.fill("x".repeat(4096));
  await message.press("Enter");
  await expect(page.locator(".outgoing")).toHaveCount(1);
  await page.screenshot({
    path: `test-results/long-message-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "К списку чатов" }).click();
  await page.getByLabel("Новый разговор").fill("+44 (7700) 900123");
  await page.getByRole("button", { name: "Создать чат" }).click();
  await expect(
    page.getByRole("heading", { name: "+447700900123" }),
  ).toBeVisible();
  await expect(page.locator(".chat-item")).toHaveCount(1);
  await expect(page.locator(".outgoing")).toHaveCount(1);
  expect(lookups).toEqual([
    { username: "@example_user" },
    { phoneNumber: 447700900123 },
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("connect, send, receive, deduplicate and clear session", async ({
  page,
}, testInfo) => {
  let sent = 0;
  let deliveries = 0;
  let acknowledgements = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://4100.api.green-api.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/checkAccount/")) {
      expect(route.request().postDataJSON()).toEqual({
        phoneNumber: 79991234567,
      });
      await route.fulfill({ json: { exist: true, chatId: "123" } });
    } else if (url.includes("/sendMessage/")) {
      sent++;
      expect(route.request().postDataJSON()).toEqual({
        chatId: "123",
        message: "Привет\nTelegram",
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      await route.fulfill({ json: { idMessage: "out1" } });
    } else if (url.includes("/receiveNotification/")) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      if (sent && deliveries < 2) {
        deliveries++;
        await route.fulfill({
          json: {
            receiptId: 7,
            body: {
              typeWebhook: "incomingMessageReceived",
              instanceData: { typeInstance: "telegram" },
              idMessage: "in1",
              timestamp: Math.floor(Date.now() / 1000),
              senderData: { chatId: "123", chatName: "Собеседник" },
              messageData: {
                typeMessage: "textMessage",
                textMessageData: { textMessage: "Ответ из Telegram" },
              },
            },
          },
        });
      } else await route.fulfill({ json: null });
    } else if (url.includes("/deleteNotification/")) {
      expect(route.request().method()).toBe("DELETE");
      acknowledgements++;
      // A failed delete causes redelivery; the same text must still appear once.
      if (acknowledgements === 1)
        await route.fulfill({ status: 500, body: "temporary error" });
      else await route.fulfill({ json: { result: true } });
    } else throw new Error("Unexpected API endpoint");
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("API URL", { exact: true })
    .fill("https://4100.api.green-api.com/");
  await page.getByLabel("ID инстанса").fill("0");
  await page.getByLabel("Токен доступа").fill("test-token");
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await page.getByLabel("Новый разговор").fill("+7 (999) 123-45-67");
  await page.getByRole("button", { name: "Создать чат" }).click();
  await expect(
    page.getByRole("heading", { name: "+79991234567" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Отправить сообщение" }),
  ).toBeDisabled();
  const input = page.getByLabel("Сообщение", { exact: true });
  await expect(input).toBeFocused();
  await input.fill("Привет");
  await input.press("Shift+Enter");
  await input.pressSequentially("Telegram");
  await input.press("Enter");
  await input.press("Enter");
  await expect(page.locator(".outgoing")).toHaveCount(1);
  await expect(page.locator(".incoming")).toHaveCount(1);
  await expect.poll(() => acknowledgements).toBe(2);
  await expect(page.locator(".incoming")).toHaveCount(1);
  expect(sent).toBe(1);
  if (testInfo.project.name === "mobile") {
    await expect(page.locator(".keyboard-hint")).toBeHidden();
    await expect(page.locator(".character-count")).toBeHidden();
    const emptyHeight = await input.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(emptyHeight).toBeGreaterThanOrEqual(48);
    expect(emptyHeight).toBeLessThanOrEqual(56);
    await input.fill("Первая строка\nВторая строка\nТретья строка");
    expect(
      await input.evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThan(emptyHeight);
    await page.screenshot({
      path: "test-results/composer-multiline-mobile.png",
      fullPage: true,
    });
    await input.fill("x".repeat(3500));
    await expect(page.locator(".character-count")).toBeVisible();
    await input.fill("");
  }

  await expect(input).toHaveValue("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/chat-${testInfo.project.name}.png`,
    fullPage: true,
  });
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "К списку чатов" }).click();
  await page.getByRole("button", { name: "Изменить подключение" }).click();
  await expect(page.getByLabel("Токен доступа")).toHaveValue("");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  expect(await page.context().cookies()).toEqual([]);
  expect(errors).toEqual([]);
});

test("disconnect aborts a pending send and receive without restoring old session data", async ({
  page,
}, testInfo) => {
  const pending: Array<() => Promise<void>> = [];
  await page.addInitScript(() => {
    const original = window.fetch;
    let aborted = 0;
    window.fetch = (...args) => {
      args[1]?.signal?.addEventListener(
        "abort",
        () => {
          document.documentElement.dataset.abortedRequests = String(++aborted);
        },
        { once: true },
      );
      return original(...args);
    };
  });
  await page.route("https://4100.api.green-api.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/checkAccount/"))
      await route.fulfill({ json: { exist: true, chatId: "123" } });
    else if (url.includes("/sendMessage/"))
      pending.push(() => route.fulfill({ json: { idMessage: "late-send" } }));
    else pending.push(() => route.fulfill({ json: null }));
  });
  await page.goto("/");
  await page
    .getByLabel("API URL", { exact: true })
    .fill("https://4100.api.green-api.com");
  await page.getByLabel("ID инстанса").fill("0");
  await page.getByLabel("Токен доступа").fill("test-token");
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await page.getByLabel("Новый разговор").fill("@example_user");
  await page.getByRole("button", { name: "Создать чат" }).click();
  await page
    .getByLabel("Сообщение", { exact: true })
    .fill("Pending test message");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect.poll(() => pending.length).toBe(2);
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "К списку чатов" }).click();
  await page.getByRole("button", { name: "Изменить подключение" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-aborted-requests",
    "2",
  );
  await Promise.all(pending.map((complete) => complete()));
  await expect(
    page.getByRole("heading", { name: "Добро пожаловать" }),
  ).toBeVisible();
  await expect(page.getByLabel("Токен доступа")).toHaveValue("");
  await expect(page.locator(".outgoing")).toHaveCount(0);
  expect(pending).toHaveLength(2);
});

test("invalid credentials stop polling with a useful error", async ({
  page,
}) => {
  let receives = 0;
  await page.route("https://4100.api.green-api.com/**", async (route) => {
    receives++;
    await route.fulfill({ status: 401, body: "secret-test-token" });
  });
  await page.goto("/");
  await page
    .getByLabel("API URL", { exact: true })
    .fill("https://4100.api.green-api.com");
  await page.getByLabel("ID инстанса").fill("0");
  await page.getByLabel("Токен доступа").fill("secret-test-token");
  await page.getByRole("button", { name: "Открыть чат" }).click();
  // On mobile the error must remain accessible from the chat list as well.
  await expect(
    page.getByRole("alert").filter({ hasText: "Ошибка 401" }),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(
    "secret-test-token",
  );
  expect(receives).toBe(1);
});

test("routes unknown chats and preserves a failed message draft", async ({
  page,
}, testInfo) => {
  let deliver = false;
  let delivered = false;
  let sends = 0;
  await page.route("https://4100.api.green-api.com/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/checkAccount/")) {
      await route.fulfill({ json: { exist: true, chatId: "123" } });
    } else if (url.includes("/sendMessage/")) {
      sends++;
      deliver = true;
      await route.fulfill({ status: 500, body: "internal details" });
    } else if (url.includes("/receiveNotification/")) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (deliver && !delivered) {
        delivered = true;
        await route.fulfill({
          json: {
            receiptId: 8,
            body: {
              typeWebhook: "incomingMessageReceived",
              instanceData: { typeInstance: "telegram" },
              idMessage: "another-chat",
              timestamp: Math.floor(Date.now() / 1000),
              senderData: { chatId: "456", chatName: "Другой собеседник" },
              messageData: {
                typeMessage: "textMessage",
                textMessageData: { textMessage: "Сообщение другого чата" },
              },
            },
          },
        });
      } else await route.fulfill({ json: null });
    } else await route.fulfill({ json: { result: true } });
  });
  await page.goto("/");
  await page
    .getByLabel("API URL", { exact: true })
    .fill("https://4100.api.green-api.com");
  await page.getByLabel("ID инстанса").fill("0");
  await page.getByLabel("Токен доступа").fill("test-token");
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await page.getByLabel("Новый разговор").fill("+79991234567");
  await page.getByRole("button", { name: "Создать чат" }).click();
  await page
    .getByLabel("Сообщение", { exact: true })
    .fill("Сохранить черновик");
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Ошибка 500" }),
  ).toBeVisible();
  await expect(page.getByLabel("Сообщение", { exact: true })).toHaveValue(
    "Сохранить черновик",
  );
  await expect.poll(() => delivered).toBe(true);
  await expect(page.getByRole("log")).not.toContainText(
    "Сообщение другого чата",
  );
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "К списку чатов" }).click();
  await page.getByRole("button", { name: /Другой собеседник/ }).click();
  await expect(page.getByRole("log")).toContainText("Сообщение другого чата");
  expect(sends).toBe(1);
});
