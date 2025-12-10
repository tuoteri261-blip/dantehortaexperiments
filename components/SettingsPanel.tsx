import React from 'react';
import { Settings, Cpu, Image as ImageIcon, Volume2, X } from 'lucide-react';
import { AppSettings, ModelType } from '../types';
import { MAX_THINKING_BUDGET_FLASH, DEFAULT_THINKING_BUDGET } from '../constants';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, settings, onSettingsChange }) => {
  if (!isOpen) return null;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSettingsChange({ ...settings, model: e.target.value as ModelType });
  };

  const toggleThinking = () => {
    onSettingsChange({ 
      ...settings, 
      enableThinking: !settings.enableThinking,
      thinkingBudget: !settings.enableThinking ? DEFAULT_THINKING_BUDGET : 0 
    });
  };

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, thinkingBudget: parseInt(e.target.value) });
  };

  const toggleTTS = () => {
    onSettingsChange({ ...settings, enableTTS: !settings.enableTTS });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="w-80 h-full bg-surface border-l border-white/10 p-6 shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5" /> Configuration
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Model Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-400 mb-2">Core Model</label>
          <div className="relative">
            <select 
              value={settings.model}
              onChange={handleModelChange}
              className="w-full bg-darker border border-white/10 rounded-lg p-3 text-white appearance-none focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            >
              <option value={ModelType.FLASH}>Gemini 2.5 Flash (Fast)</option>
              <option value={ModelType.PRO}>Gemini 3 Pro (Smart)</option>
            </select>
            <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Select the brain that powers the assistant.
          </p>
        </div>

        {/* Thinking Mode */}
        <div className="mb-8 p-4 bg-darker rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-medium text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              Thinking Mode
            </label>
            <button 
              onClick={toggleThinking}
              className={`w-11 h-6 rounded-full transition-colors relative ${settings.enableThinking ? 'bg-secondary' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.enableThinking ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          
          {settings.enableThinking && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Budget</span>
                <span>{settings.thinkingBudget} tokens</span>
              </div>
              <input 
                type="range" 
                min="1024" 
                max={MAX_THINKING_BUDGET_FLASH} 
                step="1024"
                value={settings.thinkingBudget}
                onChange={handleBudgetChange}
                className="w-full accent-secondary h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <p className="text-xs text-gray-500">
                Higher budget allows for deeper reasoning on complex tasks.
              </p>
            </div>
          )}
        </div>

        {/* Audio Settings */}
        <div className="mb-8 p-4 bg-darker rounded-xl border border-white/5">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-white flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary" />
              Auto-Read Responses
            </label>
            <button 
              onClick={toggleTTS}
              className={`w-11 h-6 rounded-full transition-colors relative ${settings.enableTTS ? 'bg-primary' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${settings.enableTTS ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* System Instruction */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-400 mb-2">System Instruction</label>
          <textarea
            value={settings.systemInstruction}
            onChange={(e) => onSettingsChange({...settings, systemInstruction: e.target.value})}
            className="w-full h-32 bg-darker border border-white/10 rounded-lg p-3 text-sm text-gray-300 focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
            placeholder="Define how the AI should behave..."
          />
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;