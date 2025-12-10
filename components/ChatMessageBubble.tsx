import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, User, AlertCircle, Play, Pause } from 'lucide-react';
import { ChatMessage, MessageRole } from '../types';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isPlaying?: boolean;
  onPlayAudio?: (text: string) => void;
  onStopAudio?: () => void;
}

const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message, isPlaying, onPlayAudio, onStopAudio }) => {
  const isUser = message.role === MessageRole.USER;
  const isModel = message.role === MessageRole.MODEL;
  const isThinking = message.isThinking;

  if (isThinking) {
    return (
      <div className="flex gap-4 p-4 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-secondary" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/4"></div>
          <div className="h-4 bg-white/5 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 p-6 ${isModel ? 'bg-white/5' : ''} border-b border-white/5`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-white text-darker' : 'bg-gradient-to-br from-primary to-secondary text-white'}`}>
        {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
      </div>
      
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-semibold text-sm text-white">
            {isUser ? 'You' : 'Nova AI'}
          </span>
          <span className="text-xs text-gray-500">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
          {isModel && !message.isError && (
            <button 
              onClick={() => isPlaying ? onStopAudio?.() : onPlayAudio?.(message.text)}
              className="ml-auto p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title={isPlaying ? "Stop reading" : "Read aloud"}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {message.attachments.map((att, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-white/10">
                <img src={att.previewUrl} alt="attachment" className="h-32 w-auto object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* Message Content */}
        {message.isError ? (
           <div className="flex items-center gap-2 text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-400/20">
             <AlertCircle className="w-4 h-4" />
             <p>{message.text}</p>
           </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
            {/* Custom renderer for images inside markdown if they exist (e.g. from Image Gen) */}
            <ReactMarkdown 
              components={{
                img: ({node, ...props}) => (
                  <img {...props} className="rounded-lg shadow-lg border border-white/10 max-w-sm" alt={props.alt || 'Generated Content'} />
                )
              }}
            >
              {message.text}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
