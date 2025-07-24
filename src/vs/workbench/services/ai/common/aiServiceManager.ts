/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { CancellationToken } from 'vs/base/common/cancellation';
import {
	IAIService,
	IAIServiceProvider,
	ICodeContext,
	ICompletionItem,
	IAIResponse,
	IAIMessage,
	IAIConversation,
	IAICapabilities,
	IAIError
} from 'vs/workbench/services/ai/common/aiService';
import { IModelConfigurationService, IModelConfiguration } from 'vs/workbench/services/ai/common/modelConfiguration';
import { IContextProviderService } from 'vs/workbench/services/ai/common/contextProvider';
import { AIError, AIErrorCode, IErrorHandler, DefaultErrorHandler } from 'vs/workbench/services/ai/common/aiErrors';
import {
	IChainOfThoughtResponse,
	IReActResponse,
	IRAGResponse,
	ICodeAnalysisResponse,
	IRefactoringResponse,
	IPerformanceMetrics
} from 'vs/workbench/services/ai/common/aiTypes';

export class AIServiceManager extends Disposable implements IAIService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeActiveModel = this._register(new Emitter<string>());
	readonly onDidChangeActiveModel = this._onDidChangeActiveModel.event;

	private readonly _onDidReceiveResponse = this._register(new Emitter<IAIResponse>());
	readonly onDidReceiveResponse = this._onDidReceiveResponse.event;

	private readonly _onDidError = this._register(new Emitter<IAIError>());
	readonly onDidError = this._onDidError.event;

	private readonly providers = new Map<string, IAIServiceProvider>();
	private readonly conversations = new Map<string, IAIConversation>();
	private activeModelId: string | undefined;
	private currentContext: ICodeContext | undefined;
	private readonly errorHandler: IErrorHandler;

	constructor(
		@IModelConfigurationService private readonly modelConfigService: IModelConfigurationService,
		@IContextProviderService private readonly contextProvider: IContextProviderService
	) {
		super();
		this.errorHandler = new DefaultErrorHandler();
		this._register(this.modelConfigService.onDidChangeDefaultModel(modelId => {
			this.switchModel(modelId);
		}));
	}

	// Provider Management
	registerProvider(provider: IAIServiceProvider): void {
		this.providers.set(provider.id, provider);
		this._register(provider);
	}

	unregisterProvider(providerId: string): void {
		const provider = this.providers.get(providerId);
		if (provider) {
			provider.dispose();
			this.providers.delete(providerId);
		}
	}

	// Core AI Operations
	async sendChatMessage(message: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		const messages: IAIMessage[] = [
			{
				role: 'user',
				content: message,
				context: enrichedContext,
				timestamp: Date.now()
			}
		];

		try {
			const response = await this.executeWithRetry(
				() => provider.sendRequest(messages, token),
				token
			);

			this._onDidReceiveResponse.fire(response);
			return response;
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	async *sendChatMessageStream(message: string, context?: ICodeContext, token?: CancellationToken): AsyncIterable<string> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		const messages: IAIMessage[] = [
			{
				role: 'user',
				content: message,
				context: enrichedContext,
				timestamp: Date.now()
			}
		];

		try {
			const stream = provider.sendStreamRequest(messages, token);
			for await (const chunk of stream) {
				if (token?.isCancellationRequested) {
					break;
				}
				yield chunk;
			}
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	async getCodeCompletion(position: { line: number; column: number }, context: string, token?: CancellationToken): Promise<ICompletionItem[]> {
		const provider = await this.getActiveProvider();
		const codeContext = await this.contextProvider.extractContext();

		const prompt = this.buildCompletionPrompt(context, position, codeContext);
		const messages: IAIMessage[] = [
			{
				role: 'user',
				content: prompt,
				context: codeContext,
				timestamp: Date.now()
			}
		];

		try {
			const response = await this.executeWithRetry(
				() => provider.sendRequest(messages, token),
				token
			);

			return this.parseCompletionResponse(response);
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			return []; // Return empty array on error for completions
		}
	}

	async refactorCode(code: string, instruction: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		const prompt = this.buildRefactoringPrompt(code, instruction, enrichedContext);
		const messages: IAIMessage[] = [
			{
				role: 'user',
				content: prompt,
				context: enrichedContext,
				timestamp: Date.now()
			}
		];

		try {
			const response = await this.executeWithRetry(
				() => provider.sendRequest(messages, token),
				token
			);

			this._onDidReceiveResponse.fire(response);
			return response;
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	async analyzeCode(code: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		const prompt = this.buildAnalysisPrompt(code, enrichedContext);
		const messages: IAIMessage[] = [
			{
				role: 'user',
				content: prompt,
				context: enrichedContext,
				timestamp: Date.now()
			}
		];

		try {
			const response = await this.executeWithRetry(
				() => provider.sendRequest(messages, token),
				token
			);

			this._onDidReceiveResponse.fire(response);
			return response;
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	// Modern AI Capabilities
	async chainOfThought(query: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		const prompt = this.buildChainOfThoughtPrompt(query, enrichedContext);
		const messages: IAIMessage[] = [
			{
				role: 'system',
				content: 'You are an AI assistant that uses step-by-step reasoning. Break down complex problems into logical steps, show your reasoning for each step, and provide a clear final answer.',
				timestamp: Date.now()
			},
			{
				role: 'user',
				content: prompt,
				context: enrichedContext,
				timestamp: Date.now()
			}
		];

		try {
			const response = await this.executeWithRetry(
				() => provider.sendRequest(messages, token),
				token
			);

			// Enhance response with CoT metadata
			response.reasoning = this.extractReasoningSteps(response.content);
			this._onDidReceiveResponse.fire(response);
			return response;
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	async reactAgent(task: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		const actions: any[] = [];
		let currentThought = task;
		let maxIterations = 10;
		let iteration = 0;

		const systemPrompt = `You are a ReAct (Reasoning + Acting) agent. For each step:
1. THOUGHT: Reason about what you need to do next
2. ACTION: Choose an action to take (search, analyze, read_file, etc.)
3. OBSERVATION: Process the result and decide next steps

Available actions: search, code_analysis, file_read, web_search, tool_call`;

		try {
			while (iteration < maxIterations && !token?.isCancellationRequested) {
				const messages: IAIMessage[] = [
					{
						role: 'system',
						content: systemPrompt,
						timestamp: Date.now()
					},
					{
						role: 'user',
						content: this.buildReActPrompt(task, currentThought, actions, enrichedContext),
						context: enrichedContext,
						timestamp: Date.now()
					}
				];

				const response = await this.executeWithRetry(
					() => provider.sendRequest(messages, token),
					token
				);

				const { thought, action, shouldContinue } = this.parseReActResponse(response.content);

				if (action) {
					const observation = await this.executeReActAction(action, enrichedContext);
					actions.push({ thought, action, observation });
					currentThought = observation.insights?.join(' ') || 'Continue processing...';
				}

				if (!shouldContinue) {
					break;
				}

				iteration++;
			}

			const finalResponse: IAIResponse = {
				content: this.buildReActFinalResponse(task, actions),
				actions,
				confidence: 0.8,
				metadata: {
					model: provider.id,
					tokens: 0,
					processingTime: 0
				}
			};

			this._onDidReceiveResponse.fire(finalResponse);
			return finalResponse;
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	async ragQuery(query: string, sources?: string[], context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse> {
		const provider = await this.getActiveProvider();
		const enrichedContext = await this.enrichContext(context);

		try {
			// Retrieve relevant documents
			const relevantDocs = await this.contextProvider.searchSimilar(query, 10);
			const retrievedSources = relevantDocs.map(doc => doc.content).join('\n\n');

			const prompt = this.buildRAGPrompt(query, retrievedSources, enrichedContext);
			const messages: IAIMessage[] = [
				{
					role: 'system',
					content: 'You are an AI assistant that answers questions based on provided context. Always cite your sources and indicate when information is not available in the provided context.',
					timestamp: Date.now()
				},
				{
					role: 'user',
					content: prompt,
					context: enrichedContext,
					timestamp: Date.now()
				}
			];

			const response = await this.executeWithRetry(
				() => provider.sendRequest(messages, token),
				token
			);

			// Enhance response with RAG metadata
			response.sources = relevantDocs.map(doc => doc.metadata.path);
			this._onDidReceiveResponse.fire(response);
			return response;
		} catch (error) {
			const aiError = this.handleError(error);
			this._onDidError.fire(aiError);
			throw aiError;
		}
	}

	// Model Management
	async switchModel(modelId: string): Promise<void> {
		const config = this.modelConfigService.getConfiguration(modelId);
		if (!config) {
			throw AIError.modelNotFound(modelId);
		}

		const provider = this.providers.get(config.provider);
		if (!provider) {
			throw new AIError(AIErrorCode.SERVICE_UNAVAILABLE, `Provider ${config.provider} not available`);
		}

		this.activeModelId = modelId;
		this._onDidChangeActiveModel.fire(modelId);
	}

	getActiveModel(): string | undefined {
		return this.activeModelId;
	}

	async getAvailableModels(): Promise<{ id: string; name: string }[]> {
		return this.modelConfigService.getAllConfigurations().map(config => ({
			id: config.id,
			name: config.name
		}));
	}

	async getModelCapabilities(modelId: string): Promise<IAICapabilities> {
		const config = this.modelConfigService.getConfiguration(modelId);
		if (!config) {
			throw AIError.modelNotFound(modelId);
		}

		return {
			chat: config.capabilities.chat,
			codeCompletion: config.capabilities.completion,
			codeRefactoring: config.capabilities.refactoring,
			codeAnalysis: config.capabilities.analysis,
			chainOfThought: config.capabilities.chainOfThought,
			react: config.capabilities.react,
			rag: config.capabilities.rag,
			streaming: config.capabilities.streaming,
			contextWindow: config.capabilities.contextWindow
		};
	}

	// Conversation Management
	createConversation(): string {
		const id = this.generateId();
		const conversation: IAIConversation = {
			id,
			messages: [],
			modelId: this.activeModelId || '',
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		this.conversations.set(id, conversation);
		return id;
	}

	getConversation(id: string): IAIConversation | undefined {
		return this.conversations.get(id);
	}

	deleteConversation(id: string): void {
		this.conversations.delete(id);
	}

	getConversations(): IAIConversation[] {
		return Array.from(this.conversations.values());
	}

	// Context Management
	updateContext(context: ICodeContext): void {
		this.currentContext = context;
	}

	getContext(): ICodeContext | undefined {
		return this.currentContext;
	}

	// Service Management
	isAvailable(): boolean {
		return this.providers.size > 0 && this.activeModelId !== undefined;
	}

	// Private Helper Methods
	private async getActiveProvider(): Promise<IAIServiceProvider> {
		if (!this.activeModelId) {
			const defaultModel = this.modelConfigService.getDefaultModel();
			if (defaultModel) {
				await this.switchModel(defaultModel.id);
			} else {
				throw new AIError(AIErrorCode.CONFIGURATION_ERROR, 'No active model configured');
			}
		}

		const config = this.modelConfigService.getConfiguration(this.activeModelId!);
		if (!config) {
			throw AIError.modelNotFound(this.activeModelId!);
		}

		const provider = this.providers.get(config.provider);
		if (!provider) {
			throw new AIError(AIErrorCode.SERVICE_UNAVAILABLE, `Provider ${config.provider} not available`);
		}

		return provider;
	}

	private async enrichContext(context?: ICodeContext): Promise<ICodeContext> {
		const baseContext = context || this.currentContext || await this.contextProvider.extractContext();
		// Add additional context enrichment logic here
		return baseContext;
	}

	private async executeWithRetry<T>(
		operation: () => Promise<T>,
		token?: CancellationToken,
		maxRetries: number = 3
	): Promise<T> {
		let lastError: any;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			if (token?.isCancellationRequested) {
				throw new AIError(AIErrorCode.TIMEOUT, 'Operation cancelled');
			}

			try {
				return await operation();
			} catch (error) {
				lastError = error;
				const aiError = this.handleError(error);

				if (!this.errorHandler.shouldRetry(aiError) || attempt === maxRetries - 1) {
					throw aiError;
				}

				const delay = this.errorHandler.getRetryDelay(aiError, attempt);
				await this.delay(delay);
			}
		}

		throw this.handleError(lastError);
	}

	private handleError(error: any): AIError {
		if (error instanceof AIError) {
			return error;
		}

		// Convert common errors to AIError
		if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
			return AIError.connectionFailed(error);
		}

		if (error.code === 'ETIMEDOUT') {
			return AIError.timeout(error);
		}

		return new AIError(AIErrorCode.INTERNAL_ERROR, error.message || 'Unknown error', error);
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private generateId(): string {
		return Math.random().toString(36).substring(2) + Date.now().toString(36);
	}

	// Prompt Building Methods
	private buildCompletionPrompt(context: string, position: { line: number; column: number }, codeContext: ICodeContext): string {
		return `Complete the following code at line ${position.line}, column ${position.column}:

\`\`\`
${context}
\`\`\`

Context: ${JSON.stringify(codeContext, null, 2)}

Provide intelligent code completions that are contextually appropriate.`;
	}

	private buildRefactoringPrompt(code: string, instruction: string, context: ICodeContext): string {
		return `Refactor the following code according to the instruction: "${instruction}"

\`\`\`
${code}
\`\`\`

Context: ${JSON.stringify(context, null, 2)}

Provide the refactored code with explanations.`;
	}

	private buildAnalysisPrompt(code: string, context: ICodeContext): string {
		return `Analyze the following code for issues, improvements, and metrics:

\`\`\`
${code}
\`\`\`

Context: ${JSON.stringify(context, null, 2)}

Provide detailed analysis including issues, suggestions, and code metrics.`;
	}

	private buildChainOfThoughtPrompt(query: string, context: ICodeContext): string {
		return `Think step by step to answer this query: "${query}"

Context: ${JSON.stringify(context, null, 2)}

Break down your reasoning into clear steps:
1. Understanding the problem
2. Analyzing the context
3. Considering solutions
4. Evaluating options
5. Final recommendation`;
	}

	private buildReActPrompt(task: string, currentThought: string, actions: any[], context: ICodeContext): string {
		const actionHistory = actions.map((a, i) =>
			`Step ${i + 1}:\nTHOUGHT: ${a.thought}\nACTION: ${JSON.stringify(a.action)}\nOBSERVATION: ${a.observation.result}`
		).join('\n\n');

		return `Task: ${task}

Current Thought: ${currentThought}

Previous Actions:
${actionHistory}

Context: ${JSON.stringify(context, null, 2)}

What should I do next? Respond with:
THOUGHT: [your reasoning]
ACTION: [action to take] or FINAL_ANSWER: [if task is complete]`;
	}

	private buildRAGPrompt(query: string, sources: string, context: ICodeContext): string {
		return `Answer the following query using the provided sources: "${query}"

Sources:
${sources}

Context: ${JSON.stringify(context, null, 2)}

Provide a comprehensive answer based on the sources and cite them appropriately.`;
	}

	// Response Parsing Methods
	private parseCompletionResponse(response: IAIResponse): ICompletionItem[] {
		// Implementation would parse the AI response into completion items
		// This is a simplified version
		return [{
			text: response.content,
			insertText: response.content,
			kind: 1, // Text
			confidence: response.confidence
		}];
	}

	private extractReasoningSteps(content: string): string {
		// Extract reasoning steps from Chain of Thought response
		const steps = content.match(/Step \d+:.*?(?=Step \d+:|$)/gs);
		return steps?.join('\n') || '';
	}

	private parseReActResponse(content: string): { thought: string; action: any; shouldContinue: boolean } {
		const thoughtMatch = content.match(/THOUGHT:\s*(.*?)(?=ACTION:|FINAL_ANSWER:|$)/s);
		const actionMatch = content.match(/ACTION:\s*(.*?)(?=OBSERVATION:|$)/s);
		const finalMatch = content.match(/FINAL_ANSWER:\s*(.*)/s);

		return {
			thought: thoughtMatch?.[1]?.trim() || '',
			action: actionMatch?.[1] ? this.parseAction(actionMatch[1].trim()) : null,
			shouldContinue: !finalMatch
		};
	}

	private parseAction(actionStr: string): any {
		try {
			return JSON.parse(actionStr);
		} catch {
			return { type: 'search', description: actionStr, parameters: {} };
		}
	}

	private async executeReActAction(action: any, context: ICodeContext): Promise<any> {
		// Implementation would execute the actual action
		// This is a simplified version
		return {
			result: `Executed ${action.type} with parameters ${JSON.stringify(action.parameters)}`,
			success: true,
			insights: [`Action ${action.type} completed successfully`]
		};
	}

	private buildReActFinalResponse(task: string, actions: any[]): string {
		return `Task: ${task}

Completed ${actions.length} reasoning and action cycles.

Final Result: Task completed successfully through systematic reasoning and action execution.`;
	}
}
