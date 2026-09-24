export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  direction: "incoming" | "outgoing";
}

export interface Chat {
  id: string;
  name: string;
  recipientKey?: string;
  messages: Message[];
}

// CheckAccount requires exactly one lookup field.
export type Recipient =
  | { phoneNumber: number; username?: never }
  | { username: string; phoneNumber?: never };

export interface ParsedTelegramMessage {
  message: Message;
  name: string;
}
