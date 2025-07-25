/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import {
	IAdvancedAIResponse,
	IInterleavedContext,
	IAttentionResult,
	ISemanticSearchQuery,
	ISemanticSearchResult,
	IChainOfThoughtResponse,
	ISequentialThinking,
	IRAGContext,
	IRAGResult,
	ICategorizedContext,
	ContextCategory,
	IAdvancedAICapabilities,
	IVectorStore
} from './advancedAITypes.js';

export const IAdvancedAIService = createDecorator<IAdvancedAIService>('advancedAIService');

export interface IAdvancedAIService {
	readonly _serviceBrand: undefined;

	// Events
	readonly onDidProcessContext: Event<IInterleavedContext>;
	readonly onDidUpdateAttention: Event<IAttentionResult>;
	readonly onDidCompleteReasoning: Event<IChainOfThoughtResponse>;
	readonly onDidCategorizeContext: Event<ICategorizedContext[]>;

	// Core Advanced Features
	processInterleavedContext(context: IInterleavedContext, token?: CancellationToken): Promise<IAdvancedAIResponse>;

	// Attention-Aware Processing
	analyzeAttention(query: string, context: IInterleavedContext, token?: CancellationToken): Promise<IAttentionResult>;
	updateAttentionWeights(contextId: string, weights: number[]): Promise<void>;

	// Semantic Search
	semanticSearch(query: ISemanticSearchQuery, token?: CancellationToken): Promise<ISemanticSearchResult[]>;
	indexContent(content: string, category: ContextCategory, metadata?: Record<string, any>): Promise<string>;

	// Chain of Thought Reasoning
	chainOfThoughtReasoning(query: string, context?: IInterleavedContext, token?: CancellationToken): Promise<IChainOfThoughtResponse>;

	// Sequential/Thinking Through Problems
	sequentialProblemSolving(problem: string, context?: IInterleavedContext, token?: CancellationToken): Promise<ISequentialThinking>;

	// RAG (Retrieval-Augmented Generation)
	ragQuery(query: string, categories: ContextCategory[], context?: IInterleavedContext, token?: CancellationToken): Promise<IRAGResult[]>;
	configureRAG(config: IRAGContext): Promise<void>;

	// Vector Database Management
	createVectorStore(config: IVectorStore): Promise<string>;
	updateVectorStore(storeId: string, documents: ICategorizedContext[]): Promise<void>;
	queryVectorStore(storeId: string, query: ISemanticSearchQuery): Promise<ISemanticSearchResult[]>;

	// Context Categorization
	categorizeContext(content: string, existingCategories?: ContextCategory[]): Promise<ContextCategory[]>;
	getCategorizedContext(categories: ContextCategory[]): Promise<ICategorizedContext[]>;

	// Advanced Query Processing
	processAdvancedQuery(
		query: string,
		options: {
			useChainOfThought?: boolean;
			useSequentialThinking?: boolean;
			useRAG?: boolean;
			ragCategories?: ContextCategory[];
			useAttention?: boolean;
			useSemanticSearch?: boolean;
		},
		context?: IInterleavedContext,
		token?: CancellationToken
	): Promise<IAdvancedAIResponse>;

	// Capabilities
	getCapabilities(): Promise<IAdvancedAICapabilities>;
	isFeatureSupported(feature: keyof IAdvancedAICapabilities): Promise<boolean>;

	// Configuration
	updateConfiguration(config: Partial<IAdvancedAIConfiguration>): Promise<void>;
	getConfiguration(): Promise<IAdvancedAIConfiguration>;

	// Performance and Monitoring
	getPerformanceMetrics(): Promise<IAdvancedPerformanceMetrics>;
	optimizePerformance(): Promise<void>;

	// Service Management
	initialize(): Promise<void>;
	dispose(): void;
}

export interface IAdvancedAIConfiguration {
	// Model Configuration
	primaryModel: string;
	fallbackModels: string[];
	embeddingModel: string;
	rerankingModel?: string;

	// Processing Configuration
	maxContextLength: number;
	attentionHeads: number;
	embeddingDimensions: number;

	// RAG Configuration
	defaultVectorStore: string;
	chunkSize: number;
	chunkOverlap: number;
	retrievalTopK: number;

	// Chain of Thought Configuration
	maxReasoningSteps: number;
	confidenceThreshold: number;

	// Performance Configuration
	batchSize: number;
	cacheSize: number;
	parallelProcessing: boolean;

	// Feature Flags
	enabledFeatures: (keyof IAdvancedAICapabilities)[];
}

export interface IAdvancedPerformanceMetrics {
	// Processing Metrics
	averageResponseTime: number;
	contextProcessingTime: number;
	attentionComputeTime: number;
	ragRetrievalTime: number;
	reasoningTime: number;

	// Quality Metrics
	averageConfidence: number;
	contextRelevance: number;
	responseAccuracy: number;

	// Resource Metrics
	memoryUsage: number;
	cpuUsage: number;
	vectorStoreSize: number;
	cacheHitRate: number;

	// Usage Metrics
	totalQueries: number;
	successfulQueries: number;
	failedQueries: number;
	averageTokensPerQuery: number;
}

export interface IAdvancedAIProvider extends IDisposable {
	readonly id: string;
	readonly name: string;
	readonly capabilities: IAdvancedAICapabilities;

	// Core Processing
	processQuery(query: string, context: IInterleavedContext, token?: CancellationToken): Promise<IAdvancedAIResponse>;

	// Specialized Processing
	performChainOfThought(query: string, context?: IInterleavedContext, token?: CancellationToken): Promise<IChainOfThoughtResponse>;
	performSequentialThinking(problem: string, context?: IInterleavedContext, token?: CancellationToken): Promise<ISequentialThinking>;
	performRAGQuery(query: string, categories: ContextCategory[], context?: IInterleavedContext, token?: CancellationToken): Promise<IRAGResult[]>;
	performSemanticSearch(query: ISemanticSearchQuery, token?: CancellationToken): Promise<ISemanticSearchResult[]>;

	// Context Processing
	processInterleavedContext(context: IInterleavedContext, token?: CancellationToken): Promise<IInterleavedContext>;
	analyzeAttention(query: string, context: IInterleavedContext, token?: CancellationToken): Promise<IAttentionResult>;
	categorizeContent(content: string, token?: CancellationToken): Promise<ContextCategory[]>;

	// Vector Operations
	createEmbedding(text: string, token?: CancellationToken): Promise<number[]>;
	computeSimilarity(embedding1: number[], embedding2: number[]): number;

	// Health and Status
	isHealthy(): Promise<boolean>;
	getStatus(): Promise<IProviderStatus>;

	// Configuration
	configure(config: Partial<IAdvancedAIConfiguration>): Promise<void>;
}

export interface IProviderStatus {
	isOnline: boolean;
	responseTime: number;
	errorRate: number;
	lastError?: string;
	capabilities: IAdvancedAICapabilities;
	resourceUsage: {
		memory: number;
		cpu: number;
		storage: number;
	};
}
