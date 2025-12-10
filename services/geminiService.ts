import { GoogleGenAI, GenerateContentResponse, Chat, Modality, LiveServerMessage } from "@google/genai";
import { AppSettings, Attachment, ChatMessage, MessageRole, ModelType } from "../types";
import { LIVE_MODEL, LIVE_VOICE_NAME } from "../constants";

// Ensure API key is present
const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Sends a message to the chat model.
 * Uses `ai.chats.create` for history management internally for simplicity in this demo,
 * but re-creates context each time to allow dynamic setting changes (like switching models).
 */
export const sendMessageToGemini = async (
  history: ChatMessage[],
  currentMessage: string,
  attachments: Attachment[],
  settings: AppSettings
): Promise<string> => {
  
  // 1. Construct the history in the format GenAI expects
  // We filter out local-only states like error messages or thinking placeholders
  const pastHistory = history
    .filter(m => !m.isError && !m.isThinking)
    .map(m => ({
      role: m.role,
      parts: m.attachments && m.attachments.length > 0 
        ? [
            ...m.attachments.map(a => ({ inlineData: { mimeType: a.mimeType, data: a.data } })),
            { text: m.text }
          ]
        : [{ text: m.text }]
    }));

  // 2. Configure the model
  const modelName = settings.model;
  
  // Logic for Thinking Config
  let thinkingConfig = undefined;
  if (settings.enableThinking && settings.thinkingBudget > 0) {
    // Thinking is only available on 2.5 series or 3.0 pro. 
    // Flash supports it. Pro supports it.
    thinkingConfig = { thinkingBudget: settings.thinkingBudget };
  }

  // 3. Prepare the new message content
  const newParts = [];
  if (attachments.length > 0) {
    attachments.forEach(att => {
      newParts.push({
        inlineData: {
          mimeType: att.mimeType,
          data: att.data
        }
      });
    });
  }
  newParts.push({ text: currentMessage });

  // 4. Create Chat Session
  // We recreate the chat to ensure the latest system instructions and model config are applied
  const chatSession: Chat = ai.chats.create({
    model: modelName,
    history: pastHistory,
    config: {
      systemInstruction: settings.systemInstruction,
      thinkingConfig: thinkingConfig,
    },
  });

  // 5. Send Message
  // Note: sendMessage accepts { message: string | Part[] } 
  // However, the SDK type definition for `message` in sendMessage is strictly `string | string[] | Part | Part[]` 
  // or a complex object depending on version. The safest is to use the `parts` structure if we have images.
  
  try {
    const result: GenerateContentResponse = await chatSession.sendMessage({
      message: newParts.length === 1 && !attachments.length ? currentMessage : newParts 
    });
    return result.text || "";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    throw error;
  }
};

/**
 * Generates an image using the specialized image generation model.
 */
export const generateImageWithGemini = async (
  prompt: string,
  aspectRatio: "1:1" | "16:9" | "9:16" = "1:1"
): Promise<{ imageUrl: string, caption?: string }> => {
  
  try {
    const response = await ai.models.generateContent({
      model: ModelType.IMAGE_GEN,
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
        }
      }
    });

    let imageUrl = "";
    let caption = "";

    // Iterate through parts to find image and optional text
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        } else if (part.text) {
          caption = part.text;
        }
      }
    }

    if (!imageUrl) {
      throw new Error("No image data received from the model.");
    }

    return { imageUrl, caption };

  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

/**
 * Generates speech from text.
 */
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned");

    return base64ToArrayBuffer(base64Audio);

  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};

/* -------------------------------------------------------------------------- */
/*                                LIVE API                                    */
/* -------------------------------------------------------------------------- */

interface LiveConnectionCallbacks {
  onOpen: () => void;
  onMessage: (message: LiveServerMessage) => void;
  onClose: (event: CloseEvent) => void;
  onError: (event: ErrorEvent) => void;
}

export const connectToLiveSession = (callbacks: LiveConnectionCallbacks) => {
  return ai.live.connect({
    model: LIVE_MODEL,
    callbacks: {
      onopen: callbacks.onOpen,
      onmessage: callbacks.onMessage,
      onclose: callbacks.onClose,
      onerror: callbacks.onError,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: LIVE_VOICE_NAME } },
      },
      systemInstruction: "You are Nova, a helpful AI assistant. You are having a voice conversation with the user. Keep your responses concise and natural for spoken conversation.",
    },
  });
};

/* -------------------------------------------------------------------------- */
/*                            AUDIO HELPERS                                   */
/* -------------------------------------------------------------------------- */

/**
 * Converts Float32 audio data (web audio api) to PCM16 (Gemini API requirement)
 */
export function createPcmBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp values
    const s = Math.max(-1, Math.min(1, data[i]));
    // Convert to PCM16
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Manual Base64 to ArrayBuffer decoder
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Manual ArrayBuffer to Base64 encoder
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
