import { AppSettings, ModelType } from './types';

export const INITIAL_SETTINGS: AppSettings = {
  model: ModelType.FLASH,
  enableThinking: false,
  thinkingBudget: 0, // Disabled by default
  enableTTS: false,
  systemInstruction: "You are Nova, an advanced AI assistant. You are helpful, precise, and creative. Use Markdown for formatting.",
};

export const MAX_THINKING_BUDGET_FLASH = 24576;
export const MAX_THINKING_BUDGET_PRO = 32768;

export const DEFAULT_THINKING_BUDGET = 4096;

export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
export const LIVE_VOICE_NAME = 'Zephyr'; // Puck, Charon, Kore, Fenrir, Zephyr
