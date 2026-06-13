// ============================================
// SHARED TYPESCRIPT INTERFACES
// ============================================

export interface PlaceholderResult {
    cleanedText: string;
    formulas: string[];
    figures: string[];
    citations: string[];
}

export interface JobStatusExtra {
    s3OutputKey?: string;
    error?: string;
    completedAt?: number;
    hasFormula?: boolean;
    hasDiagram?: boolean;
    hasCitation?: boolean;
}

export interface AgentInput {
    jobId: string;
    fileName: string;
    text: string;
    formulas?: string[];
    figures?: string[];
    citations?: string[];
}

export interface AgentResult {
    agentName: string;
    success: boolean;
    output?: string;
    outputKey?: string;
    error?: string;
}

export interface SupervisorInput {
    jobId: string;
    fileName: string;
    extractedText: string;
}

export interface SupervisorOutput {
    jobId: string;
    status: string;
    outputKey?: string;
    hasFormula: boolean;
    hasDiagram: boolean;
    hasCitation: boolean;
    agentResults: AgentResult[];
}

export interface MergeAgentInput {
    jobId: string;
    fileName: string;
    cleanedText: string;
    agentResults: AgentResult[];
}

export interface MergeAgentResult {
    jobId: string;
    success: boolean;
    outputKey?: string;
    error?: string;
}

export interface ExecutiveSummary {
    tldr: string;
    keyContributions: string[];
    methodology: string;
    limitations: string;
}

export interface RelatedParagraph {
    chunkIndex: number;
    text_original: string;
    text_translated: string;
}

