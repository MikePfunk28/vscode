/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Advanced AI Types for State-of-the-Art Features

// Interleaved Context Types
export interface IInterleavedContext {
	textSegments: ITextSegment[];
	codeSegments: ICodeSegment[];
	visualSegments: IVisualSegment[];
	sequenceOrder: number[];
	attentionWeights: number[];
}

export interface ITextSegment {
	id: string;
	content: string;
	type: 'documentation' | 'comment' | 'natural_language' | 'instruction';
	position: number;
	relevanceScore: number;
}

export interface ICodeSegment {
	id: string;
	content: string;
	language: string;
	type: 'function' | 'class' | 'variable' | 'import' | 'expression';
	position: number;
	dependencies: string[];
	semanticEmbedding: number[];
}

export interface IVisualSegment {
	id: string;
	type: 'diagram' | 'screenshot' | 'flowchart' | 'ui_mockup';
	description: string;
	position: number;
	relatedCode: string[];
}

// Attention-Aware Processing
export interface IAttentionMechanism {
	queryEmbedding: number[];
	keyEmbeddings: number[][];
	valueEmbeddings: number[][];
	attentionScores: number[][];
	contextWindow: number;
	headCount: number;
}

export interface IAttentionResult {
	focusedSegments: string[];
	attentionWeights: Map<string, number>;
	contextRelevance: number;
	semanticSimilarity: number;
}

// Semantic Search Types
export interface ISemanticSearchQuery {
	query: string;
	embedding: number[];
	filters: ISemanticFilter[];
	searchType: 'similarity' | 'hybrid' | 'keyword' | 'semantic';
	maxResults: number;
	threshold: number;
}

export interface ISemanticFilter {
	field: string;
	operator: 'equals' | 'contains' | 'range' | 'exists';
	value: any;
	weight: number;
}

export interface ISemanticSearchResult {
	id: string;
	content: string;
	score: number;
	metadata: Record<string, any>;
	embedding: number[];
	explanation: string;
}

// Chain of Thought Enhanced
export interface IChainOfThoughtStep {
	stepNumber: number;
	thought: string;
	reasoning: string;
	evidence: string[];
	confidence: number;
	alternatives: IAlternativeThought[];
	nextSteps: string[];
}

export interface IAlternativeThought {
	thought: string;
	probability: number;
	reasoning: string;
}

export interface IChainOfThoughtResponse {
	query: string;
	steps: IChainOfThoughtStep[];
	finalAnswer: string;
	overallConfidence: number;
	reasoningPath: string[];
	metadata: {
		totalSteps: number;
		processingTime: number;
		model: string;
		reasoningType: 'deductive' | 'inductive' | 'abductive';
	};
}

// Sequential/Thinking Through Problems
export interface ISequentialThinking {
	problemStatement: string;
	decomposition: IProblemDecomposition;
	solutionSteps: ISolutionStep[];
	verification: IVerificationStep[];
	finalSolution: string;
}

export interface IProblemDecomposition {
	subproblems: ISubproblem[];
	dependencies: IDependency[];
	complexity: 'low' | 'medium' | 'high' | 'very_high';
	estimatedTime: number;
}

export interface ISubproblem {
	id: string;
	description: string;
	priority: number;
	prerequisites: string[];
	expectedOutput: string;
}

export interface IDependency {
	from: string;
	to: string;
	type: 'sequential' | 'parallel' | 'conditional';
	strength: number;
}

export interface ISolutionStep {
	id: string;
	description: string;
	approach: string;
	implementation: string;
	validation: string;
	status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface IVerificationStep {
	id: string;
	testCase: string;
	expectedResult: string;
	actualResult: string;
	passed: boolean;
	feedback: string;
}

// Enhanced RAG Types
export interface IRAGContext {
	categories: IRAGCategory[];
	vectorStores: IVectorStore[];
	retrievalStrategy: IRetrievalStrategy;
	generationConfig: IGenerationConfig;
}

export interface IRAGCategory {
	name: string;
	description: string;
	vectorStore: string;
	embeddingModel: string;
	chunkSize: number;
	overlapSize: number;
	filters: ISemanticFilter[];
}

export interface IVectorStore {
	id: string;
	name: string;
	type: 'faiss' | 'pinecone' | 'weaviate' | 'chroma' | 'qdrant';
	dimensions: number;
	indexType: string;
	metadata: Record<string, any>;
	connectionConfig: Record<string, any>;
}

export interface IRetrievalStrategy {
	type: 'similarity' | 'mmr' | 'hybrid' | 'rerank';
	topK: number;
	diversityLambda?: number;
	rerankModel?: string;
	fusionWeights?: number[];
}

export interface IGenerationConfig {
	model: string;
	temperature: number;
	maxTokens: number;
	contextWindow: number;
	systemPrompt: string;
	fewShotExamples: IFewShotExample[];
}

export interface IFewShotExample {
	query: string;
	context: string;
	response: string;
	explanation: string;
}

// Context Categories for Vector Database
export enum ContextCategory {
	CODE_CONTEXT = 'code_context',
	DOCUMENTATION = 'documentation',
	API_REFERENCE = 'api_reference',
	EXAMPLES = 'examples',
	PATTERNS = 'patterns',
	BEST_PRACTICES = 'best_practices',
	ERROR_SOLUTIONS = 'error_solutions',
	ARCHITECTURE = 'architecture',
	DEPENDENCIES = 'dependencies',
	TESTING = 'testing',
	DEPLOYMENT = 'deployment',
	PERFORMANCE = 'performance',
	SECURITY = 'security',
	USER_INTERACTIONS = 'user_interactions',
	BUSINESS_LOGIC = 'business_logic'
}

export interface ICategorizedContext {
	category: ContextCategory;
	content: string;
	embedding: number[];
	metadata: {
		source: string;
		timestamp: number;
		language?: string;
		framework?: string;
		tags: string[];
		relevanceScore: number;
	};
	relationships: IContextRelationship[];
}

export interface IContextRelationship {
	targetId: string;
	type: 'depends_on' | 'related_to' | 'implements' | 'extends' | 'uses' | 'calls';
	strength: number;
	description: string;
}

// Advanced AI Agent Response
export interface IAdvancedAIResponse {
	content: string;
	reasoning: IChainOfThoughtResponse;
	sequentialThinking?: ISequentialThinking;
	ragResults: IRAGResult[];
	attentionAnalysis: IAttentionResult;
	semanticContext: ICategorizedContext[];
	confidence: number;
	sources: ISourceReference[];
	metadata: {
		model: string;
		processingTime: number;
		tokensUsed: number;
		reasoningDepth: number;
		contextCategories: ContextCategory[];
	};
}

export interface IRAGResult {
	query: string;
	retrievedDocuments: IRetrievedDocument[];
	generatedResponse: string;
	confidence: number;
	category: ContextCategory;
}

export interface IRetrievedDocument {
	id: string;
	content: string;
	score: number;
	category: ContextCategory;
	metadata: Record<string, any>;
	embedding: number[];
}

export interface ISourceReference {
	id: string;
	title: string;
	url?: string;
	type: 'documentation' | 'code' | 'example' | 'api' | 'tutorial';
	relevance: number;
	excerpt: string;
}

// Agent Capabilities
export interface IAdvancedAICapabilities {
	interleavedContext: boolean;
	attentionMechanism: boolean;
	semanticSearch: boolean;
	chainOfThought: boolean;
	sequentialThinking: boolean;
	ragSupport: boolean;
	vectorDatabase: boolean;
	contextCategorization: boolean;
	multimodalSupport: boolean;
	realtimeProcessing: boolean;
	adaptiveLearning: boolean;
	explainableAI: boolean;
}
