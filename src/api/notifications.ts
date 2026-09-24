import type { ParsedTelegramMessage } from "../types";
import { isRecord } from "./greenApi";

export function parseIncoming(body: unknown): ParsedTelegramMessage | null {
  if (
    !isRecord(body) ||
    body.typeWebhook !== "incomingMessageReceived" ||
    !isRecord(body.instanceData) ||
    body.instanceData.typeInstance !== "telegram"
  )
    return null;
  const { senderData, messageData, idMessage, timestamp } = body;
  if (
    !isRecord(senderData) ||
    !isRecord(messageData) ||
    typeof idMessage !== "string" ||
    !idMessage ||
    typeof senderData.chatId !== "string" ||
    !senderData.chatId ||
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp > 8_640_000_000_000
  )
    return null;
  let text: unknown;
  if (
    messageData.typeMessage === "textMessage" &&
    isRecord(messageData.textMessageData)
  )
    text = messageData.textMessageData.textMessage;
  if (
    messageData.typeMessage === "extendedTextMessage" &&
    isRecord(messageData.extendedTextMessageData)
  )
    text = messageData.extendedTextMessageData.text;
  if (typeof text !== "string" || !text) return null;
  return {
    name:
      typeof senderData.chatName === "string" && senderData.chatName
        ? senderData.chatName
        : senderData.chatId,
    message: {
      id: idMessage,
      chatId: senderData.chatId,
      text,
      timestamp: timestamp * 1000,
      direction: "incoming",
    },
  };
}
