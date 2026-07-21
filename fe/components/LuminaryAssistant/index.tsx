'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAssistant } from '../../contexts/AssistantContext';
import DOMPurify from 'dompurify';

function renderMarkdown(md: string): string {
  if (!md) return '';
  let html = md;
  // Bolding
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>');
  // Newlines
  html = html.replace(/\n/g, '<br />');
  
  if (typeof window !== 'undefined') {
    return DOMPurify.sanitize(html);
  }
  return html;
}

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export function LuminaryAssistant() {
  const { isChatOpen, toggleChat, currentPage, currentJobId, currentJobTitle } = useAssistant();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', parts: [{ text: 'Chào bạn, tôi là Luminary AI. Tôi có thể giúp gì cho bạn?' }] }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, parts: [{ text: userMsg }] }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          conversationHistory: messages.slice(1), 
          context: { currentPage, currentJobId, currentJobTitle }
        })
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('RATE_LIMIT_EXCEEDED');
        }
        throw new Error('API request failed');
      }

      const data = await res.json();
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: data.reply }] }
      ]);
      
      if (data.toolResult?.guide) {
        setMessages(prev => [
          ...prev,
          { role: 'model', parts: [{ text: `💡 **Hướng dẫn:**\n${data.toolResult.guide}` }] }
        ]);
      }
      
      if (data.toolResult?.redirectTo) {
         window.location.href = data.toolResult.redirectTo;
      }
      
    } catch (err: any) {
      const errorMsg = err.message === 'RATE_LIMIT_EXCEEDED' 
        ? 'Bạn đã dùng hết lượt chat hôm nay. Thử lại vào ngày mai.'
        : 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại sau.';
      
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: errorMsg }] }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isChatOpen) {
    return (
      <button 
        onClick={toggleChat}
        className="fixed bottom-6 right-6 px-4 py-3 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition-colors z-50 flex items-center justify-center gap-2 font-semibold text-sm"
      >
        <span>✨</span>
        <span className="hidden sm:inline">Luminary AI</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 max-h-[70vh] h-[480px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
      <div className="bg-blue-600 text-white p-3 flex justify-between items-center shadow-md z-10 shrink-0">
        <h3 className="font-bold flex items-center gap-2 text-sm">✨ Luminary Assistant</h3>
        <button onClick={toggleChat} className="text-white hover:text-blue-200 text-xl font-bold p-1 leading-none">&times;</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 dark:bg-slate-800/50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
              msg.role === 'user' 
                ? 'bg-blue-500 text-white rounded-tr-none' 
                : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-none'
            }`}>
              {msg.role === 'model' ? (
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.parts[0].text) }}
                />
              ) : (
                <span className="whitespace-pre-wrap text-sm">{msg.parts[0].text}</span>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-200 dark:border-slate-700 p-2 bg-white dark:bg-slate-900 flex gap-2 shrink-0">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi Luminary AI..."
          className="flex-1 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded-full px-3 py-1.5 outline-none transition-all dark:text-slate-200 min-w-0 text-sm"
        />
        <button 
          type="submit" 
          disabled={!input.trim() || isLoading}
          className="bg-blue-600 text-white rounded-full w-9 h-9 mt-0.5 flex items-center justify-center disabled:opacity-50 hover:bg-blue-700 transition-colors shrink-0"
        >
          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
