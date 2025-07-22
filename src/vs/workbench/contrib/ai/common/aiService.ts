/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';

export interface IAIMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp?: number;
}

export interface IAIProvider {
	id: string;
	name: string;
	apiEndpoint?: string;
	models: string[];
	supportsChat: boolean;
	supportsCompletion: boolean;
	supportsCodeGeneration: boolean;
}

export interface IAIProviderConfig {
	provider: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	temperature?: number;
	maxTokens?: number;
}

export interface IChatResponse {
	content: string;
	model: string;
	provider: string;
	usage?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
}

export interface ICodeCompletionRequest {
	prefix: string;
	suffix?: string;
	language: string;
	filepath?: string;
}

export interface ICodeCompletionResponse {
	completions: string[];
	model: string;
	provider: string;
}

export const IAIService = createDecorator<IAIService>('aiService');

export interface IAIService {
	readonly _serviceBrand: undefined;

	/**
	 * Event fired when the AI service configuration changes
	 */
	readonly onDidChangeConfiguration: Event<void>;

	/**
	 * Get available AI providers
	 */
	getAvailableProviders(): IAIProvider[];

	/**
	 * Get current configuration
	 */
	getConfiguration(): IAIProviderConfig;

	/**
	 * Set configuration for AI service
	 */
	setConfiguration(config: IAIProviderConfig): void;

	/**
	 * Check if AI service is configured and ready
	 */
	isReady(): boolean;

	/**
	 * Send a chat message and get response
	 */
	chat(messages: IAIMessage[], context?: any): Promise<IChatResponse>;

	/**
	 * Get code completion suggestions
	 */
	getCodeCompletion(request: ICodeCompletionRequest): Promise<ICodeCompletionResponse>;

	/**
	 * Explain selected code
	 */
	explainCode(code: string, language: string): Promise<string>;

	/**
	 * Generate code from natural language description
	 */
	generateCode(description: string, language: string, context?: string): Promise<string>;

	/**
	 * Fix code issues
	 */
	fixCode(code: string, language: string, issue?: string): Promise<string>;

	/**
	 * Optimize code
	 */
	optimizeCode(code: string, language: string): Promise<string>;

	/**
	 * Test the connection to AI service
	 */
	testConnection(): Promise<boolean>;

	// ===== ADVANCED POCKETFLOW WORKFLOW METHODS =====

	/**
	 * Execute a multi-agent workflow with supervisor pattern
	 */
	executeMultiAgentWorkflow(
		task: string, 
		agents: Array<{id: string, role: string, provider?: string, model?: string}>
	): Promise<{[agentId: string]: string}>;

	/**
	 * Execute RAG (Retrieval-Augmented Generation) workflow
	 */
	executeRAGWorkflow(
		query: string, 
		documents: string[], 
		context?: string
	): Promise<{answer: string, sources: string[]}>;

	/**
	 * Execute map-reduce workflow for processing large datasets
	 */
	executeMapReduceWorkflow<T, R>(
		items: T[], 
		mapFunction: (item: T) => Promise<string>,
		reducePrompt: string
	): Promise<{results: string[], summary: string}>;

	/**
	 * Execute batch processing workflow
	 */
	executeBatchWorkflow(
		items: any[],
		processor: (item: any) => Promise<string>,
		batchSize?: number
	): Promise<string[]>;

	/**
	 * Execute structured output workflow with validation
	 */
	executeStructuredOutputWorkflow<T>(
		prompt: string,
		schema: any,
		validator?: (data: any) => boolean
	): Promise<T>;

	/**
	 * Execute human-in-the-loop workflow
	 */
	executeHITLWorkflow(
		task: string,
		humanCallback: (aiResponse: string, context?: any) => Promise<{approved: boolean, feedback?: string}>
	): Promise<string>;

	/**
	 * Execute conversation flow with memory management
	 */
	executeConversationFlow(
		conversationId: string,
		message: string,
		context?: {maxHistory?: number, systemPrompt?: string}
	): Promise<string>;

	/**
	 * Clear conversation memory for a specific conversation
	 */
	clearConversationMemory(conversationId: string): void;

	/**
	 * Get conversation history
	 */
	getConversationHistory(conversationId: string): IAIMessage[];
}