import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, AlertCircle } from 'lucide-react';
import { connectToLiveSession, createPcmBlob, base64ToArrayBuffer } from '../services/geminiService';
import { LiveServerMessage } from '@google/genai';

interface LiveVoiceModeProps {
  isOpen: boolean;
  onClose: () => void;
}

const LiveVoiceMode: React.FC<LiveVoiceModeProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);

  // Audio Contexts & Nodes
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // Audio Queue Management
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Session Management
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    if (isOpen) {
      startSession();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);

  const cleanup = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close()).catch(() => {});
      sessionPromiseRef.current = null;
    }

    // Stop all playing audio
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    activeSourcesRef.current.clear();

    // Close contexts
    if (inputContextRef.current) inputContextRef.current.close();
    if (outputContextRef.current) outputContextRef.current.close();
    
    // Stop tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    inputContextRef.current = null;
    outputContextRef.current = null;
    setStatus('disconnected');
    setVolume(0);
  };

  const startSession = async () => {
    setStatus('connecting');
    nextStartTimeRef.current = 0;

    try {
      // 1. Initialize Audio Contexts
      // Input: 16kHz required by Gemini
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputCtx;

      // Output: 24kHz required by Gemini
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputContextRef.current = outputCtx;
      const outNode = outputCtx.createGain();
      outNode.connect(outputCtx.destination);
      outputNodeRef.current = outNode;

      // 2. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Connect to Live API
      const sessionPromise = connectToLiveSession({
        onOpen: () => {
          setStatus('connected');
          setupAudioInput(inputCtx, stream, sessionPromise);
        },
        onMessage: (msg) => handleServerMessage(msg, outputCtx, outNode),
        onClose: () => setStatus('disconnected'),
        onError: (e) => {
          console.error("Live API Error", e);
          setStatus('error');
        }
      });
      sessionPromiseRef.current = sessionPromise;

    } catch (err) {
      console.error("Failed to start live session", err);
      setStatus('error');
    }
  };

  const setupAudioInput = (ctx: AudioContext, stream: MediaStream, sessionPromise: Promise<any>) => {
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    // Use ScriptProcessor for raw PCM access (Standard for Gemini Live API demos)
    // Buffer size 4096 gives a good balance of latency and stability
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (isMuted) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate volume for visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      const rms = Math.sqrt(sum / inputData.length);
      setVolume(Math.min(rms * 5, 1)); // Scale up for visual effect

      // Create PCM Blob and Send
      const pcmData = createPcmBlob(inputData);
      
      sessionPromise.then(session => {
        session.sendRealtimeInput({ media: pcmData });
      });
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  };

  const handleServerMessage = async (message: LiveServerMessage, ctx: AudioContext, outNode: GainNode) => {
    const serverContent = message.serverContent;
    
    // Handle Audio
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData) {
      const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
      if (base64Audio) {
        playAudioChunk(base64Audio, ctx, outNode);
      }
    }

    // Handle Interruption
    if (serverContent?.interrupted) {
       // Stop all currently playing sources
       activeSourcesRef.current.forEach(source => {
         try { source.stop(); } catch(e) {}
       });
       activeSourcesRef.current.clear();
       nextStartTimeRef.current = 0;
    }
  };

  const playAudioChunk = async (base64Audio: string, ctx: AudioContext, outNode: GainNode) => {
    try {
      const arrayBuffer = base64ToArrayBuffer(base64Audio);
      
      // Create a temporary buffer for decoding PCM data manually would be best
      // But standard decodeAudioData often fails on raw PCM snippets without headers.
      // However, the Service `decodeAudioData` is what we need. 
      // Let's implement the specific decoding logic required for raw PCM 24kHz.
      
      const audioBuffer = await decodeRawPcm(arrayBuffer, ctx);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outNode);
      
      source.onended = () => {
        activeSourcesRef.current.delete(source);
      };

      // Schedule playback
      // Ensure we don't schedule in the past
      const currentTime = ctx.currentTime;
      if (nextStartTimeRef.current < currentTime) {
        nextStartTimeRef.current = currentTime;
      }
      
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      
      activeSourcesRef.current.add(source);

    } catch (error) {
      console.error("Error playing audio chunk", error);
    }
  };

  const decodeRawPcm = (arrayBuffer: ArrayBuffer, ctx: AudioContext): AudioBuffer => {
    const dataInt16 = new Int16Array(arrayBuffer);
    const frameCount = dataInt16.length; 
    // Gemini Output is Mono (1 channel)
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    
    return buffer;
  }

  const toggleMute = () => setIsMuted(!isMuted);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-darker/90 backdrop-blur-xl animate-fade-in">
      
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
         <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-white/80 font-mono text-sm uppercase tracking-widest">Live Voice</span>
         </div>
         <button 
           onClick={onClose}
           className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
         >
           <X className="w-6 h-6" />
         </button>
      </div>

      {/* Main Visualizer */}
      <div className="relative flex items-center justify-center mb-12">
        {/* Pulsing Rings */}
        {status === 'connected' && (
           <>
             <div 
               className="absolute rounded-full border border-primary/30 transition-all duration-75"
               style={{ width: `${200 + volume * 200}px`, height: `${200 + volume * 200}px` }}
             />
             <div 
               className="absolute rounded-full border border-secondary/30 transition-all duration-100 delay-75"
               style={{ width: `${180 + volume * 150}px`, height: `${180 + volume * 150}px` }}
             />
           </>
        )}

        {/* Central Orb */}
        <div className={`
           w-40 h-40 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(99,102,241,0.5)]
           transition-all duration-500
           ${status === 'connecting' ? 'bg-gray-700 animate-pulse' : ''}
           ${status === 'error' ? 'bg-red-500/20 border border-red-500' : ''}
           ${status === 'connected' ? 'bg-gradient-to-br from-primary to-secondary' : ''}
        `}>
          {status === 'connecting' && <Mic className="w-10 h-10 text-white/50" />}
          {status === 'error' && <AlertCircle className="w-10 h-10 text-red-500" />}
          {status === 'connected' && (
             <div className="space-y-1 text-center">
                <div className="flex items-center justify-center gap-1 h-8">
                   {/* Fake frequency bars */}
                   {[1,2,3,4,5].map(i => (
                     <div 
                       key={i} 
                       className="w-1 bg-white rounded-full transition-all duration-100"
                       style={{ height: `${Math.max(10, Math.random() * 30 + volume * 50)}px` }}
                     />
                   ))}
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Status Text */}
      <div className="text-center space-y-2 mb-12">
        <h3 className="text-2xl font-bold text-white">
          {status === 'connecting' && "Connecting..."}
          {status === 'error' && "Connection Failed"}
          {status === 'connected' && (isMuted ? "Microphone Muted" : "Nova is listening")}
        </h3>
        <p className="text-white/50">
           {status === 'connected' ? "Speak naturally to interrupt" : "Establishing secure audio channel..."}
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6">
        <button 
          onClick={toggleMute}
          className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        
        <button 
          onClick={onClose}
          className="px-8 py-4 bg-red-500 hover:bg-red-600 text-white font-medium rounded-full transition-colors shadow-lg shadow-red-500/25"
        >
          End Call
        </button>
      </div>

    </div>
  );
};

export default LiveVoiceMode;
