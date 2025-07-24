/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Chain of Thought Types
export interface IChainOfThoughtStep {
	step: number;
	description: string;
	reasoning: string;
	conclusion: string;
	confidence: number;
}

export interface IChainOfThoughtResponse {
	query: string;
	steps: IChainOfThoughtStep[];
	finalAnswer: string;
	overallConfidence: number;
	metadata: {
		totalSteps: number;
		processingTime: number;
		model: string;
	};
}

// ReAct (Reasoning + Acting) Types
export interface IReActThought {
	content: string;
	reasoning: string;
	nextAction?: string;
}

export interface IReActAction {
	type: 'search' | 'code_analysis' | 'file_read' | 'web_search' | 'tool_call' | 'observe';
	description: string;
	parameters: Record<string, any>;
	reasoning: string;
}

export interface IReActObservation {
	action: IReActAction;
	result: any;
	success: boolean;
	error?: string;
	insights?: string[];
}

export interface IReActCycle {
	thought: IReActThought;
	action: IReActAction;
	observation: IReActObservation;
}

export interface IReActResponse {
	task: string;
	cycles: IReActCycle[];
	finalAnswer: string;
	success: boolean;
	metadata: {
		totalCycles: number;
		successfulActions: number;
		failedActions: number;
		processingTime: number;
		model: string;
	};
}

// RAG (Retrieval-Augmented Generation) Types
export interface IRAGSource {
	id: string;
	content: string;
	metadata: {
		path: string;
		title?: string;
		language?: string;
		lastModified: number;
		relevanceScore: number;
		chunkIndex?: number;
	};
	embedding?: number[];
}

export interface IRAGQuery {
	query: string;
	filters?: {
		language?: string[];
		fileTypes?: string[];
		dateRange?: { start: Date; end: Date };
		paths?: string[];
	};
	limit?: number;
	threshold?: number;
}

export interface IRAGResponse {
	query: string;
	answer: string;
	sources: IRAGSource[];
	confidence: number;
	metadata: {
		retrievalTime: number;
		generationTime: number;
		totalSources: number;
		usedSources: number;
		model: string;
	};
}

// Code Analysis Types
export interface ICodeIssue {
	type: 'error' | 'warning' | 'suggestion' | 'info';
	severity: 'high' | 'medium' | 'low';
	message: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	rule?: string;
	fixable: boolean;
	suggestedFix?: string;
}

export interface ICodeMetrics {
	complexity: number;
	maintainability: number;
	testability: number;
	readability: number;
	performance: number;
	security: number;
}

export interface ICodeAnalysisResponse {
	code: string;
	language: string;
	issues: ICodeIssue[];
	metrics: ICodeMetrics;
	suggestions: string[];
	summary: string;
	metadata: {
		linesOfCode: number;
		analysisTime: number;
		model: string;
	};
}

// Code Refactoring Types
export interface IRefactoringOption {
	type: 'extract_method' | 'rename' | 'inline' | 'move' | 'optimize' | 'modernize';
	description: string;
	impact: 'low' | 'medium' | 'high';
	confidence: number;
	preview: string;
	reasoning: string;
}

export interface IRefactoringResponse {
	originalCode: string;
	refactoredCode: string;
	instruction: string;
	options: IRefactoringOption[];
	selectedOption: IRefactoringOption;
	explanation: string;
	benefits: string[];
	risks: string[];
	metadata: {
		language: string;
		refactoringTime: number;
		model: string;
	};
}

// Streaming Types
export interface IStreamChunk {
	type: 'content' | 'reasoning' | 'action' | 'observation' | 'metadata' | 'error' | 'done';
	data: any;
	timestamp: number;
}

export interface IStreamResponse {
	id: string;
	chunks: AsyncIterable<IStreamChunk>;
	metadata: {
		model: string;
		startTime: number;
	};
}

// Tool Calling Types
export interface IToolDefinition {
	name: string;
	description: string;
	parameters: {
		type: 'object';
		properties: Record<string, {
			type: string;
			description: string;
			required?: boolean;
		}>;
		required: string[];
	};
}

export interface IToolCall {
	id: string;
	name: string;
	parameters: Record<string, any>;
	reasoning?: string;
}

export interface IToolResult {
	id: string;
	success: boolean;
	result: any;
	error?: string;
	executionTime: number;
}

// Model Capabilities
export interface IModelCapabilities {
	maxContextLength: number;
	maxOutputLength: number;
	supportsStreaming: boolean;
	supportsToolCalling: boolean;
	supportsChainOfThought: boolean;
	supportsReAct: boolean;
	supportsRAG: boolean;
	supportedLanguages: string[];
	supportedFormats: string[];
}

// Performance Metrics
export interface IPerformanceMetrics {
	requestTime: number;
	responseTime: number;
	totalTime: number;
	tokensPerSecond: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cost?: number;
	model: string;
}

// Basic AI Service Types
export interface IModelConfiguration {
	id: string;
	name: string;
	type: 'local' | 'cloud';
	endpoint: string;
	apiKey?: string;
	parameters: Record<string, any>;
	isDefault: boolean;
	capabilities?: IModelCapabilities;
}

export interface IWorkspaceInfo {
	name: string;
	folders: string[];
}

export interface ICodeContext {
	activeFile?: string;
	selectedText?: string;
	surroundingCode?: string;
	cursorPosition?: { lineNumber: number; column: number };
	openFiles?: string[];
	workspaceInfo?: IWorkspaceInfo;
}
