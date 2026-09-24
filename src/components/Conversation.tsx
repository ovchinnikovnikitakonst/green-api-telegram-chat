import { useEffect, useRef, useState } from "react";
import type { Chat } from "../types";
import { errorText } from "../api/greenApi";

const timeFormat = new Intl.DateTimeFormat("ru", {
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru", {
  day: "numeric",
  month: "long",
});

export function Conversation({
  chat,
  sending,
  onSend,
  onBack,
}: {
  chat: Chat;
  sending: boolean;
  onSend: (id: string, text: string) => Promise<void>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textarea.current?.focus();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [chat.messages.length]);
  async function submit() {
    const text = draft.trim();
    if (!text || locked.current || sending || text.length > 4096) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await onSend(chat.id, text);
      setDraft("");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setError(
          `${errorText(error)} Автоматически не повторяем отправку. Если результат неизвестен, проверьте Telegram перед повтором.`,
        );
    } finally {
      locked.current = false;
      setBusy(false);
      textarea.current?.focus();
    }
  }
  return (
    <section className="conversation" aria-label={`Чат ${chat.name}`}>
      <header className="chat-header">
        <button
          className="back-button secondary"
          onClick={onBack}
          aria-label="К списку чатов"
        >
          ←
        </button>
        <span className="avatar">{chat.name.replace("+", "").slice(0, 2)}</span>
        <div>
          <h2>{chat.name}</h2>
          <small className="muted">Telegram · текстовые сообщения</small>
        </div>
      </header>
      <div
        className="messages"
        role="log"
        aria-label="История сообщений"
        aria-live="polite"
      >
        {chat.messages.length === 0 && (
          <div className="conversation-empty">
            <span className="empty-icon" aria-hidden="true">
              ↗
            </span>
            <h3>Начните разговор</h3>
            <p>Напишите первое сообщение для {chat.name}.</p>
          </div>
        )}
        {chat.messages.map((message, index) => {
          const previous = chat.messages[index - 1];
          const showDate =
            !previous ||
            new Date(previous.timestamp).toDateString() !==
              new Date(message.timestamp).toDateString();
          return (
            <div key={`${message.direction}:${message.id}`}>
              {showDate && (
                <div className="date-divider">
                  {dateFormat.format(message.timestamp)}
                </div>
              )}
              <article
                className={`bubble ${message.direction}`}
                aria-label={
                  message.direction === "incoming"
                    ? "Входящее сообщение"
                    : "Исходящее сообщение"
                }
              >
                <p>{message.text}</p>
                <div className="message-meta">
                  <time dateTime={new Date(message.timestamp).toISOString()}>
                    {timeFormat.format(message.timestamp)}
                  </time>
                  {message.direction === "outgoing" && (
                    <span title="Принято API в очередь; доставка не подтверждена">
                      {" "}
                      · принято API
                    </span>
                  )}
                </div>
              </article>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && (
          <p id="send-error" className="error send-error" role="alert">
            {error}
          </p>
        )}
        <div className="composer-row">
          <label className="sr-only" htmlFor="message">
            Сообщение
          </label>
          <textarea
            ref={textarea}
            id="message"
            rows={2}
            value={draft}
            readOnly={busy}
            maxLength={4096}
            aria-describedby={
              error ? "composer-hint send-error" : "composer-hint"
            }
            placeholder="Напишите сообщение…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <button
            className="primary send-button"
            type="submit"
            disabled={sending || busy || !draft.trim()}
            aria-label={busy ? "Отправляется" : "Отправить сообщение"}
          >
            {busy ? "…" : "↑"}
          </button>
        </div>
        <div id="composer-hint" className="composer-hint">
          <span>Enter — отправить · Shift + Enter — новая строка</span>
          <span>{draft.length} / 4096</span>
        </div>
      </form>
    </section>
  );
}
