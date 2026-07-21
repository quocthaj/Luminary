'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AssistantContextType {
  currentPage: string;
  currentJobId?: string;
  currentJobTitle?: string;
  setContext: (context: { currentPage: string; currentJobId?: string; currentJobTitle?: string }) => void;
  isChatOpen: boolean;
  toggleChat: () => void;
}

const AssistantContext = createContext<AssistantContextType | undefined>(undefined);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState('unknown');
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(undefined);
  const [currentJobTitle, setCurrentJobTitle] = useState<string | undefined>(undefined);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const setContext = (context: { currentPage: string; currentJobId?: string; currentJobTitle?: string }) => {
    setCurrentPage(context.currentPage);
    setCurrentJobId(context.currentJobId);
    setCurrentJobTitle(context.currentJobTitle);
  };

  const toggleChat = () => setIsChatOpen(!isChatOpen);

  return (
    <AssistantContext.Provider value={{
      currentPage,
      currentJobId,
      currentJobTitle,
      setContext,
      isChatOpen,
      toggleChat
    }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (context === undefined) {
    throw new Error('useAssistant must be used within an AssistantProvider');
  }
  return context;
}
