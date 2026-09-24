import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApi } from "../api/greenApi";
import { parseIncoming } from "../api/notifications";
import { pollNotifications } from "../api/polling";
import type { Chat, Credentials, Message, Recipient } from "../types";
import { recipientLabel } from "../utils/validation";

export function useMessenger(credentials: Credentials) {
  const api = useMemo(() => createApi(credentials), [credentials]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const sendLock = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const loop = useRef<Promise<void>>(Promise.resolve());

  const append = useCallback((message: Message, name = message.chatId) => {
    setChats((current) => {
      const existing = current.find((chat) => chat.id === message.chatId);
      if (!existing)
        return [...current, { id: message.chatId, name, messages: [message] }];
      if (
        existing.messages.some(
          (item) =>
            item.id === message.id && item.direction === message.direction,
        )
      )
        return current;
      return current.map((chat) =>
        chat.id === message.chatId
          ? {
              ...chat,
              messages: [...chat.messages, message].sort(
                (a, b) => a.timestamp - b.timestamp,
              ),
            }
          : chat,
      );
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Wait for the previous aborted loop, including StrictMode's development remount.
    loop.current = loop.current.then(async () => {
      if (controller.signal.aborted) return;
      await pollNotifications(
        api,
        controller.signal,
        (body) => {
          const parsed = parseIncoming(body);
          if (parsed) append(parsed.message, parsed.name);
        },
        (error) => {
          setPollError(error);
          setConnected(error === null);
        },
      );
    });
    const pending = requests.current;
    return () => {
      controller.abort();
      pending.forEach((request) => request.abort());
      pending.clear();
    };
  }, [api, append]);

  async function withRequest<T>(
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const result = await operation(controller.signal);
      if (controller.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      return result;
    } finally {
      requests.current.delete(controller);
    }
  }

  async function openChat(recipient: Recipient) {
    const name = recipientLabel(recipient);
    const known = chats.find((chat) => chat.recipientKey === name);
    if (known) {
      setActiveId(known.id);
      return;
    }
    const id = await withRequest((signal) =>
      api.checkAccount(recipient, signal),
    );
    setChats((current) =>
      current.some((chat) => chat.id === id)
        ? current.map((chat) =>
            chat.id === id ? { ...chat, recipientKey: name, name } : chat,
          )
        : [...current, { id, name, recipientKey: name, messages: [] }],
    );
    setActiveId(id);
  }

  async function send(chatId: string, text: string) {
    if (sendLock.current)
      throw new Error("Дождитесь завершения предыдущей отправки.");
    sendLock.current = true;
    setSending(true);
    try {
      const id = await withRequest((signal) =>
        api.sendMessage(chatId, text, signal),
      );
      append({
        id,
        chatId,
        text,
        timestamp: Date.now(),
        direction: "outgoing",
      });
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  return {
    chats,
    activeId,
    setActiveId,
    openChat,
    send,
    pollError,
    connected,
    sending,
  };
}
