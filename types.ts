export enum ModelType {
  FLASH = 'gemini-2.5-flash',
  PRO = 'gemini-3-pro-preview',
  IMAGE_GEN = 'gemini-2.5-flash-image',
}

export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
}

export interface Attachment {
  mimeType: string;
  data: string; // Base64
  previewUrl: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  attachments?: Attachment[];
  timestamp: number;
  isError?: boolean;
  isThinking?: boolean;
}

export interface AppSettings {
  model: ModelType;
  enableThinking: boolean;
  thinkingBudget: number;
  enableTTS: boolean;
  systemInstruction: string;
}