import { useState } from "react";
import type { Credentials } from "../types";
import { normalizeApiUrl } from "../utils/validation";

export function CredentialsForm({
  onConnect,
}: {
  onConnect: (credentials: Credentials) => void;
}) {
  const [error, setError] = useState("");
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand">
          <span className="brand-icon">➤</span> Telegram{" "}
          <span className="brand-divider">/</span>{" "}
          <span className="green-brand">GREEN-API</span>
        </div>
        <div>
          <span className="eyebrow">ПРОСТО ОСТАВАЙТЕСЬ НА СВЯЗИ</span>
          <h1>
            Ваши разговоры.
            <br />В одном окне.
          </h1>
          <p>
            Лёгкий клиент для текстовых сообщений в Telegram через GREEN-API.
          </p>
        </div>
        <span className="intro-foot">
          Только нужное. Сообщения и ничего лишнего.
        </span>
      </section>
      <section className="login-card">
        <span className="eyebrow">ПОДКЛЮЧЕНИЕ</span>
        <h2>Добро пожаловать</h2>
        <p className="muted">Введите параметры вашего Telegram-инстанса.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            try {
              const apiUrl = normalizeApiUrl(String(data.get("apiUrl")));
              const idInstance = String(data.get("idInstance")).trim();
              const apiTokenInstance = String(
                data.get("apiTokenInstance"),
              ).trim();
              if (!/^\d+$/.test(idInstance))
                throw new Error("idInstance должен содержать только цифры.");
              if (!apiTokenInstance || /\s/.test(apiTokenInstance))
                throw new Error("Введите токен без пробелов.");
              onConnect({ apiUrl, idInstance, apiTokenInstance });
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Проверьте параметры.",
              );
            }
          }}
        >
          <label htmlFor="apiUrl">API URL</label>
          <input
            id="apiUrl"
            name="apiUrl"
            type="url"
            placeholder="https://ваш-кластер.api.green-api.com"
            required
            autoComplete="off"
            aria-describedby="api-hint"
          />
          <small id="api-hint">
            Скопируйте apiUrl из параметров доступа инстанса GREEN-API.
          </small>
          <label htmlFor="idInstance">ID инстанса</label>
          <input
            id="idInstance"
            name="idInstance"
            inputMode="numeric"
            placeholder="idInstance"
            required
            autoComplete="off"
          />
          <label htmlFor="apiTokenInstance">Токен доступа</label>
          <input
            id="apiTokenInstance"
            name="apiTokenInstance"
            type="password"
            placeholder="apiTokenInstance"
            required
            autoComplete="off"
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary connect-button" type="submit">
            Открыть чат <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="privacy-note">
          Параметры хранятся только в памяти этой вкладки и удаляются при выходе
          или обновлении страницы.
        </p>
        <details>
          <summary>Перед подключением</summary>
          <p>
            Авторизуйте Telegram-инстанс в личном кабинете GREEN-API. В
            настройках включите «Получать уведомления о входящих сообщениях и
            файлах» (incomingWebhook) и оставьте webhookUrl пустым. Без
            incomingWebhook новые ответы не попадут в приложение. Откройте
            только один клиент для этой очереди.
          </p>
        </details>
      </section>
    </main>
  );
}
