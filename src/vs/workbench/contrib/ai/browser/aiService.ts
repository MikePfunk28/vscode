/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAIService, IAIProvider, IAIProviderConfig, IAIMessage, IChatResponse, ICodeCompletionRequest, ICodeCompletionResponse } from 'vs/workbench/contrib/ai/common/aiService';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { IRequestService } from 'vs/platform/request/common/request';

export class AIService extends Disposable implements IAIService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _configuration: IAIProviderConfig;
	private readonly _providers: IAIProvider[] = [
		{
			id: 'openai',
			name: 'OpenAI',
			apiEndpoint: 'https://api.openai.com/v1',
			models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		},
		{
			id: 'anthropic',
			name: 'Anthropic Claude',
			apiEndpoint: 'https://api.anthropic.com/v1',
			models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		},
		{
			id: 'google',
			name: 'Google Gemini',
			apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
			models: ['gemini-pro', 'gemini-pro-vision'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		},
		{
			id: 'amazon-bedrock',
			name: 'Amazon Bedrock',
			models: ['anthropic.claude-v2', 'anthropic.claude-instant-v1', 'amazon.titan-text-express-v1'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		},
		{
			id: 'openrouter',
			name: 'OpenRouter',
			apiEndpoint: 'https://openrouter.ai/api/v1',
			models: ['openai/gpt-4', 'anthropic/claude-2', 'google/palm-2-chat-bison', 'meta-llama/llama-2-70b-chat'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		},
		{
			id: 'ollama',
			name: 'Ollama (Local)',
			apiEndpoint: 'http://localhost:11434/v1',
			models: ['llama2', 'codellama', 'mistral', 'neural-chat'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		},
		{
			id: 'lmstudio',
			name: 'LM Studio (Local)',
			apiEndpoint: 'http://localhost:1234/v1',
			models: ['local-model'],
			supportsChat: true,
			supportsCompletion: true,
			supportsCodeGeneration: true
		}
	];

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IRequestService private readonly requestService: IRequestService
	) {
		super();
		
		// Load configuration from settings
		this._configuration = this.loadConfiguration();
		
		// Listen for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('ai')) {
				this._configuration = this.loadConfiguration();
				this._onDidChangeConfiguration.fire();
			}
		}));
	}

	private loadConfiguration(): IAIProviderConfig {
		const config = this.configurationService.getValue<any>('ai');
		return {
			provider: config?.provider || 'openai',
			model: config?.model || 'gpt-3.5-turbo',
			apiKey: config?.apiKey || process.env.OPENAI_API_KEY || '',
			baseUrl: config?.baseUrl,
			temperature: config?.temperature || 0.7,
			maxTokens: config?.maxTokens || 2048
		};
	}

	getAvailableProviders(): IAIProvider[] {
		return this._providers;
	}

	getConfiguration(): IAIProviderConfig {
		return { ...this._configuration };
	}

	setConfiguration(config: IAIProviderConfig): void {
		this._configuration = { ...config };
		this._onDidChangeConfiguration.fire();
	}

	isReady(): boolean {
		return !!(this._configuration.provider && (this._configuration.apiKey || this.isLocalProvider()));
	}

	private isLocalProvider(): boolean {
		return this._configuration.provider === 'ollama' || this._configuration.provider === 'lmstudio';
	}

	async chat(messages: IAIMessage[], context?: any): Promise<IChatResponse> {
		if (!this.isReady()) {
			throw new Error('AI service is not configured. Please set up your API key and provider.');
		}

		const provider = this._providers.find(p => p.id === this._configuration.provider);
		if (!provider) {
			throw new Error(`Unknown provider: ${this._configuration.provider}`);
		}

		try {
			switch (this._configuration.provider) {
				case 'openai':
				case 'openrouter':
				case 'ollama':
				case 'lmstudio':
					return await this.chatOpenAICompatible(messages, provider);
				case 'anthropic':
					return await this.chatAnthropic(messages, provider);
				case 'google':
					return await this.chatGoogle(messages, provider);
				case 'amazon-bedrock':
					return await this.chatBedrock(messages, provider);
				default:
					throw new Error(`Provider ${this._configuration.provider} not implemented yet`);
			}
		} catch (error) {
			this.logService.error('AI Service chat error:', error);
			throw error;
		}
	}

	private async chatOpenAICompatible(messages: IAIMessage[], provider: IAIProvider): Promise<IChatResponse> {
		const endpoint = this._configuration.baseUrl || provider.apiEndpoint;
		const response = await this.requestService.request({
			url: `${endpoint}/chat/completions`,
			type: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this._configuration.apiKey}`
			},
			data: JSON.stringify({
				model: this._configuration.model,
				messages: messages.map(m => ({ role: m.role, content: m.content })),
				temperature: this._configuration.temperature,
				max_tokens: this._configuration.maxTokens
			})
		}, {});

		const result = await response.body.json();
		return {
			content: result.choices[0].message.content,
			model: this._configuration.model,
			provider: this._configuration.provider,
			usage: result.usage
		};
	}

	private async chatAnthropic(messages: IAIMessage[], provider: IAIProvider): Promise<IChatResponse> {
		// Anthropic API implementation
		const endpoint = this._configuration.baseUrl || provider.apiEndpoint;
		const response = await this.requestService.request({
			url: `${endpoint}/messages`,
			type: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this._configuration.apiKey,
				'anthropic-version': '2023-06-01'
			},
			data: JSON.stringify({
				model: this._configuration.model,
				max_tokens: this._configuration.maxTokens,
				messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
				system: messages.find(m => m.role === 'system')?.content
			})
		}, {});

		const result = await response.body.json();
		return {
			content: result.content[0].text,
			model: this._configuration.model,
			provider: this._configuration.provider,
			usage: result.usage
		};
	}

	private async chatGoogle(messages: IAIMessage[], provider: IAIProvider): Promise<IChatResponse> {
		// Google Gemini API implementation
		throw new Error('Google Gemini implementation pending');
	}

	private async chatBedrock(messages: IAIMessage[], provider: IAIProvider): Promise<IChatResponse> {
		// Amazon Bedrock implementation
		throw new Error('Amazon Bedrock implementation pending');
	}

	async getCodeCompletion(request: ICodeCompletionRequest): Promise<ICodeCompletionResponse> {
		const prompt = `Complete this ${request.language} code:\n\n${request.prefix}`;
		
		const response = await this.chat([
			{ role: 'system', content: 'You are a code completion assistant. Only return the completion code, no explanations.' },
			{ role: 'user', content: prompt }
		]);

		return {
			completions: [response.content.trim()],
			model: this._configuration.model,
			provider: this._configuration.provider
		};
	}

	async explainCode(code: string, language: string): Promise<string> {
		const response = await this.chat([
			{ role: 'system', content: 'You are a helpful coding assistant. Explain code clearly and concisely.' },
			{ role: 'user', content: `Explain this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`` }
		]);

		return response.content;
	}

	async generateCode(description: string, language: string, context?: string): Promise<string> {
		const prompt = context 
			? `Generate ${language} code for: ${description}\n\nContext:\n${context}`
			: `Generate ${language} code for: ${description}`;

		const response = await this.chat([
			{ role: 'system', content: `You are a code generation assistant. Generate clean, efficient ${language} code.` },
			{ role: 'user', content: prompt }
		]);

		return response.content;
	}

	async fixCode(code: string, language: string, issue?: string): Promise<string> {
		const prompt = issue 
			? `Fix this ${language} code. Issue: ${issue}\n\n\`\`\`${language}\n${code}\n\`\`\``
			: `Fix any issues in this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``;

		const response = await this.chat([
			{ role: 'system', content: 'You are a code debugging assistant. Fix issues and return the corrected code.' },
			{ role: 'user', content: prompt }
		]);

		return response.content;
	}

	async optimizeCode(code: string, language: string): Promise<string> {
		const response = await this.chat([
			{ role: 'system', content: 'You are a code optimization assistant. Improve performance and readability.' },
			{ role: 'user', content: `Optimize this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\`` }
		]);

		return response.content;
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await this.chat([
				{ role: 'user', content: 'Hello, can you respond with just "OK"?' }
			]);
			return response.content.toLowerCase().includes('ok');
		} catch {
			return false;
		}
	}

	// ===== ADVANCED POCKETFLOW WORKFLOW METHODS =====

	/**
	 * Execute a multi-agent workflow with supervisor pattern
	 */
	async executeMultiAgentWorkflow(task: string, agents: Array<{id: string, role: string, provider?: string, model?: string}>): Promise<{[agentId: string]: string}> {
		const results: {[agentId: string]: string} = {};
		
		// Supervisor coordinates the workflow
		const supervisorPrompt = `You are a supervisor AI coordinating a team of specialized agents to complete this task: "${task}"\n\nAgents available: ${agents.map(a => `${a.id} (${a.role})`).join(', ')}\n\nProvide specific instructions for each agent.`;
		
		const supervision = await this.chat([
			{ role: 'system', content: 'You are a supervisor AI that coordinates other AI agents. Provide clear, specific instructions.' },
			{ role: 'user', content: supervisorPrompt }
		]);

		// Execute each agent in parallel
		const agentPromises = agents.map(async agent => {
			const agentPrompt = `You are ${agent.role}. The supervisor has assigned you this task: "${task}"\n\nSupervisor instructions: ${supervision.content}\n\nComplete your part of the task.`;
			
			try {
				const response = await this.chat([
					{ role: 'system', content: `You are a specialized AI agent with the role: ${agent.role}. Work collaboratively and professionally.` },
					{ role: 'user', content: agentPrompt }
				]);
				results[agent.id] = response.content;
			} catch (error) {
				this.logService.error(`Agent ${agent.id} failed:`, error);
				results[agent.id] = `Error: ${error}`;
			}
		});

		await Promise.all(agentPromises);
		return results;
	}

	/**
	 * Execute RAG (Retrieval-Augmented Generation) workflow
	 */
	async executeRAGWorkflow(query: string, documents: string[], context?: string): Promise<{answer: string, sources: string[]}> {
		// Simple document ranking - in real implementation would use embeddings
		const relevantDocs = documents
			.map(doc => ({ doc, relevance: this.calculateRelevance(query, doc) }))
			.sort((a, b) => b.relevance - a.relevance)
			.slice(0, 3)
			.map(item => item.doc);

		const contextPrompt = context 
			? `Context: ${context}\n\nRelevant documents:\n${relevantDocs.map((doc, i) => `[${i+1}] ${doc}`).join('\n\n')}`
			: `Relevant documents:\n${relevantDocs.map((doc, i) => `[${i+1}] ${doc}`).join('\n\n')}`;

		const response = await this.chat([
			{ role: 'system', content: 'You are a knowledgeable assistant. Use the provided documents to answer questions accurately. Cite your sources.' },
			{ role: 'user', content: `${contextPrompt}\n\nQuestion: ${query}` }
		]);

		return {
			answer: response.content,
			sources: relevantDocs
		};
	}

	/**
	 * Execute map-reduce workflow for processing large datasets
	 */
	async executeMapReduceWorkflow<T, R>(
		items: T[], 
		mapFunction: (item: T) => Promise<string>,
		reducePrompt: string
	): Promise<{results: string[], summary: string}> {
		// Map phase - process items in parallel
		const mapResults = await Promise.all(
			items.map(async (item, index) => {
				try {
					return await mapFunction(item);
				} catch (error) {
					this.logService.error(`Map phase error for item ${index}:`, error);
					return `Error processing item ${index}: ${error}`;
				}
			})
		);

		// Reduce phase - combine results
		const summary = await this.chat([
			{ role: 'system', content: 'You are an AI assistant specializing in data analysis and summarization.' },
			{ role: 'user', content: `${reducePrompt}\n\nResults to analyze:\n${mapResults.map((result, i) => `Result ${i+1}: ${result}`).join('\n\n')}` }
		]);

		return {
			results: mapResults,
			summary: summary.content
		};
	}

	/**
	 * Execute batch processing workflow
	 */
	async executeBatchWorkflow(
		items: any[],
		processor: (item: any) => Promise<string>,
		batchSize: number = 5
	): Promise<string[]> {
		const results: string[] = [];
		
		// Process items in batches
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, i + batchSize);
			const batchPromises = batch.map(processor);
			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);
			
			// Small delay between batches to avoid rate limiting
			if (i + batchSize < items.length) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
		
		return results;
	}

	/**
	 * Execute structured output workflow with validation
	 */
	async executeStructuredOutputWorkflow<T>(
		prompt: string,
		schema: any,
		validator?: (data: any) => boolean
	): Promise<T> {
		const structuredPrompt = `${prompt}\n\nPlease respond with valid JSON that matches this schema:\n${JSON.stringify(schema, null, 2)}`;
		
		const response = await this.chat([
			{ role: 'system', content: 'You are an AI assistant that provides structured data responses. Always respond with valid JSON.' },
			{ role: 'user', content: structuredPrompt }
		]);

		try {
			const parsed = JSON.parse(response.content);
			
			if (validator && !validator(parsed)) {
				throw new Error('Response does not match validation criteria');
			}
			
			return parsed as T;
		} catch (error) {
			this.logService.error('Structured output parsing error:', error);
			throw new Error(`Failed to parse structured response: ${error}`);
		}
	}

	/**
	 * Execute human-in-the-loop workflow
	 */
	async executeHITLWorkflow(
		task: string,
		humanCallback: (aiResponse: string, context?: any) => Promise<{approved: boolean, feedback?: string}>
	): Promise<string> {
		let currentResponse = await this.chat([
			{ role: 'system', content: 'You are a collaborative AI assistant working with a human. Provide high-quality responses that can be reviewed and refined.' },
			{ role: 'user', content: task }
		]);

		let attempts = 0;
		const maxAttempts = 3;

		while (attempts < maxAttempts) {
			const humanDecision = await humanCallback(currentResponse.content, { attempt: attempts + 1 });
			
			if (humanDecision.approved) {
				return currentResponse.content;
			}
			
			if (humanDecision.feedback && attempts < maxAttempts - 1) {
				const refinementPrompt = `Please improve your previous response based on this feedback: "${humanDecision.feedback}"\n\nOriginal task: ${task}\nPrevious response: ${currentResponse.content}`;
				
				currentResponse = await this.chat([
					{ role: 'system', content: 'You are improving your response based on human feedback. Address the concerns raised.' },
					{ role: 'user', content: refinementPrompt }
				]);
			}
			
			attempts++;
		}

		return currentResponse.content;
	}

	/**
	 * Execute conversation flow with memory management
	 */
	private conversationMemory: Map<string, IAIMessage[]> = new Map();

	async executeConversationFlow(
		conversationId: string,
		message: string,
		context?: {maxHistory?: number, systemPrompt?: string}
	): Promise<string> {
		const maxHistory = context?.maxHistory || 10;
		const systemPrompt = context?.systemPrompt || 'You are a helpful AI assistant with conversation memory.';

		// Get conversation history
		let history = this.conversationMemory.get(conversationId) || [];
		
		// Add system prompt if this is the start of conversation
		if (history.length === 0) {
			history.push({ role: 'system', content: systemPrompt });
		}

		// Add user message
		history.push({ role: 'user', content: message });

		// Trim history to max length (keep system prompt)
		if (history.length > maxHistory + 1) {
			history = [history[0], ...history.slice(-(maxHistory))];
		}

		const response = await this.chat(history);
		
		// Add AI response to history
		history.push({ role: 'assistant', content: response.content });
		this.conversationMemory.set(conversationId, history);

		return response.content;
	}

	/**
	 * Clear conversation memory for a specific conversation
	 */
	clearConversationMemory(conversationId: string): void {
		this.conversationMemory.delete(conversationId);
	}

	/**
	 * Get conversation history
	 */
	getConversationHistory(conversationId: string): IAIMessage[] {
		return this.conversationMemory.get(conversationId) || [];
	}

	/**
	 * Simple relevance calculation for RAG (would be replaced with embeddings in production)
	 */
	private calculateRelevance(query: string, document: string): number {
		const queryTerms = query.toLowerCase().split(/\s+/);
		const docText = document.toLowerCase();
		
		let score = 0;
		queryTerms.forEach(term => {
			const occurrences = (docText.match(new RegExp(term, 'g')) || []).length;
			score += occurrences;
		});
		
		return score / queryTerms.length;
	}
}