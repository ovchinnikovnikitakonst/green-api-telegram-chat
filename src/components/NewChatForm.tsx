import { useRef, useState } from "react";
import { errorText } from "../api/greenApi";
import { normalizeRecipient } from "../utils/validation";
import type { Recipient } from "../types";

export function NewChatForm({
  onOpen,
}: {
  onOpen: (recipient: Recipient) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  return (
    <form
      className="new-chat"
      onSubmit={async (event) => {
        event.preventDefault();
        if (locked.current) return;
        locked.current = true;
        setBusy(true);
        setError("");
        try {
          await onOpen(normalizeRecipient(recipient));
          setRecipient("");
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError"))
            setError(errorText(error));
        } finally {
          locked.current = false;
          setBusy(false);
        }
      }}
    >
      <label htmlFor="phone">Новый разговор</label>
      <div className="phone-row">
        <input
          id="phone"
          type="text"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="+код страны… или @username"
          required
          disabled={busy}
          aria-describedby="phone-error"
          aria-invalid={Boolean(error)}
        />
        <button
          type="submit"
          className="primary"
          disabled={busy}
          aria-label={busy ? "Поиск аккаунта" : "Создать чат"}
        >
          {busy ? "…" : "+"}
        </button>
      </div>
      {busy && <small role="status">Ищем аккаунт Telegram…</small>}
      <small className="error" id="phone-error" role="alert">
        {error}
      </small>
    </form>
  );
}
