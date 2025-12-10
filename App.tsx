import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Image as ImageIcon, Mic, Settings, Plus, X, Sparkles, Loader2, StopCircle, Headphones } from 'lucide-react';
import SettingsPanel from './components/SettingsPanel';
import ChatMessageBubble from './components/ChatMessageBubble';
import LiveVoiceMode from './components/LiveVoiceMode';
import { ChatMessage, MessageRole, AppSettings, Attachment, ModelType } from './types';
import { INITIAL_SETTINGS } from './constants';
import { sendMessageToGemini, generateImageWithGemini, generateSpeech } from './services/geminiService';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLiveModeOpen, setIsLiveModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  // Audio state
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentAudioSource, setCurrentAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);

  // Refs for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setAttachments(prev => [...prev, {
          mimeType: file.type,
          data: base64String,
          previewUrl: URL.createObjectURL(file)
        }]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const stopAudio = useCallback(() => {
    if (currentAudioSource) {
      currentAudioSource.stop();
      setCurrentAudioSource(null);
    }
    setPlayingMessageId(null);
  }, [currentAudioSource]);

  const playAudio = async (text: string, messageId: string) => {
    // Stop any currently playing audio
    stopAudio();

    try {
      const audioData = await generateSpeech(text);
      const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
      if (!audioContext) setAudioContext(ctx);

      const buffer = await ctx.decodeAudioData(audioData);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setPlayingMessageId(null);
      source.start();
      
      setCurrentAudioSource(source);
      setPlayingMessageId(messageId);
    } catch (err) {
      console.error("Failed to play audio", err);
    }
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMsgId = Date.now().toString();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role: MessageRole.USER,
      text: input,
      attachments: [...attachments],
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      // Check for special "image generation" command or mode
      const isImageGenRequest = newUserMsg.text.toLowerCase().startsWith('/image') || newUserMsg.text.toLowerCase().startsWith('generate image');

      let responseText = '';
      let responseImageUrl = '';

      if (isImageGenRequest) {
        // Image Gen Mode
        const prompt = newUserMsg.text.replace(/^\/image|generate image/i, '').trim();
        const result = await generateImageWithGemini(prompt);
        responseImageUrl = result.imageUrl;
        responseText = result.caption || `Generated image for: "${prompt}"`;
        // Format markdown to show image
        responseText = `![Generated Image](${responseImageUrl})\n\n${responseText}`;
      } else {
        // Chat Mode
        responseText = await sendMessageToGemini(messages, newUserMsg.text, newUserMsg.attachments || [], settings);
      }

      const botMsgId = (Date.now() + 1).toString();
      const newBotMsg: ChatMessage = {
        id: botMsgId,
        role: MessageRole.MODEL,
        text: responseText,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, newBotMsg]);

      // Auto TTS if enabled
      if (settings.enableTTS && !isImageGenRequest) {
        playAudio(responseText, botMsgId);
      }

    } catch (error: any) {
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: MessageRole.MODEL,
        text: error.message || "Something went wrong. Please try again.",
        timestamp: Date.now(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-darker text-gray-200 font-sans selection:bg-primary/30">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight">Nova Workspace</h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${settings.model === ModelType.PRO ? 'bg-secondary' : 'bg-green-400'}`}></span>
              <span className="text-xs text-gray-400 font-mono">{settings.model}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              stopAudio();
              setIsLiveModeOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all font-medium text-sm"
          >
            <Headphones className="w-4 h-4" />
            <span>Voice Chat</span>
          </button>
          
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      <SettingsPanel 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        settings={settings}
        onSettingsChange={setSettings}
      />

      {/* Live Voice Mode Overlay */}
      <LiveVoiceMode 
        isOpen={isLiveModeOpen} 
        onClose={() => setIsLiveModeOpen(false)} 
      />

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto relative flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
            <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary/20 to-secondary/20 flex items-center justify-center mb-6 animate-pulse-slow">
              <Sparkles className="w-10 h-10 text-white/50" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">How can Nova help you?</h2>
            <p className="text-gray-400 max-w-md mb-8">
              Experience the power of Gemini 2.5 & 3.0. Ask complex questions, generate images, or analyze photos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
              <button onClick={() => setInput("Explain quantum entanglement to a 5-year-old")} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/50 transition-all text-left text-sm">
                ⚛️ Explain quantum entanglement
              </button>
              <button onClick={() => setInput("/image A futuristic city on Mars, neon lights, 4k")} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-secondary/50 transition-all text-left text-sm">
                🎨 Generate a futuristic Mars city
              </button>
              <button onClick={() => setInput("Write a Python script to visualize stock data")} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-primary/50 transition-all text-left text-sm">
                🐍 Python stock viz script
              </button>
              <button onClick={() => setInput("Analyze this image and tell me the ingredients")} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-secondary/50 transition-all text-left text-sm">
                🍲 Analyze food ingredients
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col pb-4">
            {messages.map((msg) => (
              <ChatMessageBubble 
                key={msg.id} 
                message={msg} 
                isPlaying={playingMessageId === msg.id}
                onPlayAudio={(text) => playAudio(text, msg.id)}
                onStopAudio={stopAudio}
              />
            ))}
            {isLoading && (
              <ChatMessageBubble 
                message={{ 
                  id: 'thinking', 
                  role: MessageRole.MODEL, 
                  text: '', 
                  timestamp: Date.now(), 
                  isThinking: true 
                }} 
              />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-darker">
        <div className="max-w-4xl mx-auto relative">
          {/* Attachments Preview */}
          {attachments.length > 0 && (
            <div className="flex gap-3 mb-3 overflow-x-auto p-2">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-white/20">
                  <img src={att.previewUrl} alt="preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeAttachment(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative flex items-end gap-2 bg-surface border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-all">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileUpload}
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors shrink-0"
              title="Add Image"
            >
              <Plus className="w-5 h-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={attachments.length > 0 ? "Ask about this image..." : "Ask anything or type /image..."}
              className="w-full bg-transparent border-none text-white placeholder-gray-500 focus:ring-0 resize-none py-3 max-h-48"
              rows={1}
            />

            <button 
              onClick={handleSendMessage}
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              className={`p-3 rounded-xl transition-all duration-300 shrink-0 ${
                isLoading || (!input.trim() && attachments.length === 0)
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                  : 'bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 hover:scale-105'
              }`}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
          
          <div className="text-center mt-2 text-xs text-gray-600">
            Nova may display inaccurate info, including about people, so double-check its responses.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
