import type { Credentials } from "../types";
import { useMessenger } from "../hooks/useMessenger";
import { Conversation } from "./Conversation";
import { NewChatForm } from "./NewChatForm";

const timeFormat = new Intl.DateTimeFormat("ru", {
  hour: "2-digit",
  minute: "2-digit",
});

export function Messenger({
  credentials,
  onDisconnect,
}: {
  credentials: Credentials;
  onDisconnect: () => void;
}) {
  const messenger = useMessenger(credentials);
  const active = messenger.chats.find((chat) => chat.id === messenger.activeId);
  return (
    <main className={`messenger ${active ? "has-active" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true">
              ➤
            </span>
            Telegram Chat
          </div>
          <span className="powered">GREEN-API</span>
        </div>
        <NewChatForm onOpen={messenger.openChat} />
        <div className="section-label">
          Чаты <span>{messenger.chats.length}</span>
        </div>
        <nav className="chat-list" aria-label="Чаты">
          {messenger.chats.length === 0 && (
            <p className="list-empty">
              Здесь будут ваши разговоры.
              <br />
              Используйте телефон или @username.
            </p>
          )}
          {messenger.chats.map((chat) => {
            const lastMessage = chat.messages.at(-1);
            return (
              <button
                key={chat.id}
                className={`chat-item ${chat.id === messenger.activeId ? "selected" : ""}`}
                onClick={() => messenger.setActiveId(chat.id)}
                aria-current={
                  chat.id === messenger.activeId ? "true" : undefined
                }
              >
                <span className="avatar" aria-hidden="true">
                  {chat.name.replace(/^[@+]/, "").slice(0, 2).toUpperCase()}
                </span>
                <span className="chat-item-text">
                  <span className="chat-item-heading">
                    <strong>{chat.name}</strong>
                    {lastMessage && (
                      <time
                        dateTime={new Date(lastMessage.timestamp).toISOString()}
                      >
                        {timeFormat.format(lastMessage.timestamp)}
                      </time>
                    )}
                  </span>
                  <span className="chat-preview">
                    {lastMessage?.direction === "outgoing" && "Вы: "}
                    {lastMessage?.text ?? "Пока нет сообщений"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        <footer className="sidebar-footer">
          {messenger.pollError && (
            <p className="error mobile-poll-error" role="alert">
              {messenger.pollError}
            </p>
          )}
          <span className="connection-status" role="status">
            <i className={messenger.connected ? "online" : ""} />
            {messenger.pollError
              ? "Нет соединения"
              : messenger.connected
                ? "Получение подключено"
                : "Подключаем получение…"}
          </span>
          <button className="secondary" onClick={onDisconnect}>
            Изменить подключение
          </button>
          <small>Выход очистит историю этой сессии</small>
        </footer>
      </aside>
      <div className="main-panel">
        {messenger.pollError && (
          <div className="connection-error" role="alert">
            {messenger.pollError}
          </div>
        )}
        {active ? (
          <Conversation
            key={active.id}
            chat={active}
            sending={messenger.sending}
            onSend={messenger.send}
            onBack={() => messenger.setActiveId(null)}
          />
        ) : (
          <section className="welcome">
            <span className="welcome-mark" aria-hidden="true">
              ➤
            </span>
            <span className="eyebrow">ВАШ TELEGRAM, ЧУТЬ ПРОЩЕ</span>
            <h1>
              Хороший разговор
              <br />
              начинается с «Привет»
            </h1>
            <p>
              Введите телефон или @username
              <br />
              или выберите разговор слева.
            </p>
            <span className="session-note">
              История доступна до завершения сессии
            </span>
          </section>
        )}
      </div>
    </main>
  );
}
