/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IAIServiceProvider, IAIMessage, IAIResponse, IAICapabilities } from 'vs/workbench/services/ai/common/aiService';
import { AIError, AIErrorCode } from 'vs/workbench/services/ai/common/aiErrors';
import { ILogService } from 'vs/platform/log/common/log';
import { IRequestOptions } from 'vs/base/parts/request/common/request';
import { IRequestService } from 'vs/platform/request/common/request';
import { IModelConfiguration } from 'vs/workbench/services/ai/common/modelConfiguration';
import { timeout } from 'vs/base/common/async';
import { streamToIterator } from 'vs/base/common/stream';

export interface ILocalModelProvider {
	readonly id: string;
	readonly name: string;
	readonly baseUrl: string;
	readonly defaultPort: number;
	readonly healthEndpoint: string;
	readonly chatEndpoint: string;
	readonly completionEndpoint: string;
	readonly modelsEndpoint: string;
	readonly streamingSupported: boolean;
	readonly defaultParameters: Record<string, any>;
	readonly defaultHeaders: Record<string, string>;
	readonly requestFormatter: (messages: IAIMessage[], config: IModelConfiguration) => any;
	readonly responseFormatter: (response: any) => IAIResponse;
	readonly streamingResponseFormatter: (chunk: any) => string | null;
}

export class OllamaProvider implements ILocalModelProvider {
	readonly id = 'ollama';
	readonly name = 'Ollama';
	readonly baseUrl = 'http://localhost';
	readonly defaultPort = 11434;
	readonly healthEndpoint = '/api/tags';
	readonly chatEndpoint = '/api/chat';
	readonly completionEndpoint = '/api/generate';
	readonly modelsEndpoint = '/api/tags';
	readonly streamingSupported = true;
	readonly defaultParameters = {
		temperature: 0.7,
		max_tokens: 4096,
		top_p: 0.9,
		top_k: 40,
		stream: false
	};
	readonly defaultHeaders = {
		'Content-Type': 'application/json'
	};

	requestFormatter(messages: IAIMessage[], config: IModelConfiguration): any {
		// For chat endpoint
		if (messages.length > 1 || messages.some(m => m.role !== 'user')) {
			return {
				model: config.model,
				messages: messages.map(m => ({
					role: m.role,
					content: m.content
				})),
				stream: false,
				...config.parameters
			};
		}

		// For completion endpoint
		return {
			model: config.model,
			prompt: messages[0].content,
			stream: false,
			...config.parameters
		};
	}

	responseFormatter(response: any): IAIResponse {
		if (response.message) {
			// Chat response
			return {
				content: response.message.content,
				confidence: 0.8,
				metadata: {
					model: response.model,
					tokens: response.total_tokens || 0,
					processingTime: 0
				}
			};
		} else {
			// Completion response
			return {
				content: response.response || '',
				confidence: 0.8,
				metadata: {
					model: response.model,
					tokens: response.eval_count || 0,
					processingTime: 0
				}
			};
		}
	}

	streamingResponseFormatter(chunk: any): string | null {
		if (chunk.message) {
			return chunk.message.content;
		} else if (chunk.response) {
			return chunk.response;
		}
		return null;
	}
}

export class LMStudioProvider implements ILocalModelProvider {
	readonly id = 'lmstudio';
	readonly name = 'LM Studio';
	readonly baseUrl = 'http://localhost';
	readonly defaultPort = 1234;
	readonly healthEndpoint = '/v1/models';
	readonly chatEndpoint = '/v1/chat/completions';
	readonly completionEndpoint = '/v1/completions';
	readonly modelsEndpoint = '/v1/models';
	readonly streamingSupported = true;
	readonly defaultParameters = {
		temperature: 0.3,
		max_tokens: 2048,
		top_p: 0.95,
		stream: false
	};
	readonly defaultHeaders = {
		'Content-Type': 'application/json'
	};

	requestFormatter(messages: IAIMessage[], config: IModelConfiguration): any {
		// For chat endpoint
		if (messages.length > 1 || messages.some(m => m.role !== 'user')) {
			return {
				model: config.model,
				messages: messages.map(m => ({
					role: m.role,
					content: m.content
				})),
				stream: false,
				...config.parameters
			};
		}

		// For completion endpoint
		return {
			model: config.model,
			prompt: messages[0].content,
			stream: false,
			...config.parameters
		};
	}

	responseFormatter(response: any): IAIResponse {
		if (response.choices && response.choices.length > 0) {
			if (response.choices[0].message) {
				// Chat response
				return {
					content: response.choices[0].message.content,
					confidence: 0.8,
					metadata: {
						model: response.model,
						tokens: response.usage?.total_tokens || 0,
						processingTime: 0
					}
				};
			} else {
				// Completion response
				return {
					content: response.choices[0].text || '',
					confidence: 0.8,
					metadata: {
						model: response.model,
						tokens: response.usage?.total_tokens || 0,
						processingTime: 0
					}
				};
			}
		}

		throw new AIError(AIErrorCode.INVALID_RESPONSE, 'Invalid response format from LM Studio');
	}

	streamingResponseFormatter(chunk: any): string | null {
		if (chunk.choices && chunk.choices.length > 0) {
			if (chunk.choices[0].delta?.content) {
				return chunk.choices[0].delta.content;
			} else if (chunk.choices[0].text) {
				return chunk.choices[0].text;
			}
		}
		return null;
	}
}

export class LlamaCppProvider implements ILocalModelProvider {
	readonly id = 'llamacpp';
	readonly name = 'Llama.cpp';
	readonly baseUrl = 'http://localhost';
	readonly defaultPort = 8080;
	readonly healthEndpoint = '/health';
	readonly chatEndpoint = '/completion';
	readonly completionEndpoint = '/completion';
	readonly modelsEndpoint = '/model';
	readonly streamingSupported = true;
	readonly defaultParameters = {
		temperature: 0.7,
		max_tokens: 2048,
		top_p: 0.9,
		top_k: 40,
		stream: false
	};
	readonly defaultHeaders = {
		'Content-Type': 'application/json'
	};

	requestFormatter(messages: IAIMessage[], config: IModelConfiguration): any {
		// Format messages into a prompt
		let prompt = '';
		for (const message of messages) {
			if (message.role === 'system') {
				prompt += `System: ${message.content}\n\n`;
			} else if (message.role === 'user') {
				prompt += `User: ${message.content}\n\n`;
			} else if (message.role === 'assistant') {
				prompt += `Assistant: ${message.content}\n\n`;
			}
		}
		prompt += 'Assistant: ';

		return {
			prompt,
			stream: false,
			...config.parameters
		};
	}

	responseFormatter(response: any): IAIResponse {
		return {
			content: response.content || response.response || '',
			confidence: 0.8,
			metadata: {
				model: 'llama.cpp',
				tokens: response.tokens_predicted || 0,
				processingTime: 0
			}
		};
	}

	streamingResponseFormatter(chunk: any): string | null {
		return chunk.content || null;
	}
}

export class LocalModelService extends Disposable implements IAIServiceProvider {
	readonly id: string;
	readonly name: string;
	readonly capabilities: IAICapabilities;

	private readonly provider: ILocalModelProvider;
	private readonly endpoint: string;
	private readonly requestTimeoutMs = 60000; // 60 seconds
	private readonly healthCheckIntervalMs = 30000; // 30 seconds
	private isHealthy = false;
	private lastHealthCheck = 0;

	constructor(
		private readonly config: IModelConfiguration,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.id = config.id;
		this.name = config.name;
		this.capabilities = {
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

		// Select the appropriate provider based on config
		this.provider = this.getProviderForConfig(config);
		this.endpoint = config.endpoint;

		// Start health check
		this.checkHealth();
	}

	private getProviderForConfig(config: IModelConfiguration): ILocalModelProvider {
		switch (config.provider) {
			case 'ollama':
				return new OllamaProvider();
			case 'lmstudio':
				return new LMStudioProvider();
			case 'llamacpp':
				return new LlamaCppProvider();
			default:
				throw new AIError(AIErrorCode.CONFIGURATION_ERROR, `Unsupported local model provider: ${config.provider}`);
		}
	}

	async sendRequest(messages: IAIMessage[], token?: CancellationToken): Promise<IAIResponse> {
		await this.ensureHealthy();

		const startTime = Date.now();
		const requestBody = this.provider.requestFormatter(messages, this.config);
		const endpoint = this.getEndpointForMessages(messages);

		try {
			const response = await this.makeRequest(endpoint, requestBody, token);
			const aiResponse = this.provider.responseFormatter(response);

			// Add processing time
			if (aiResponse.metadata) {
				aiResponse.metadata.processingTime = Date.now() - startTime;
			}

			return aiResponse;
		} catch (error) {
			this.logService.error(`[LocalModelService] Request failed: ${error}`);
			throw this.handleRequestError(error);
		}
	}

	async *sendStreamRequest(messages: IAIMessage[], token?: CancellationToken): AsyncIterable<string> {
		if (!this.provider.streamingSupported) {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, 'Streaming not supported by this provider');
		}

		await this.ensureHealthy();

		const requestBody = this.provider.requestFormatter(messages, this.config);
		requestBody.stream = true;

		const endpoint = this.getEndpointForMessages(messages);

		try {
			const response = await this.makeStreamingRequest(endpoint, requestBody, token);

			for await (const chunk of response) {
				if (token?.isCancellationRequested) {
					break;
				}

				try {
					const jsonChunk = JSON.parse(chunk);
					const content = this.provider.streamingResponseFormatter(jsonChunk);
					if (content) {
						yield content;
					}
				} catch (error) {
					// Skip invalid chunks
					this.logService.debug(`[LocalModelService] Invalid chunk: ${chunk}`);
				}
			}
		} catch (error) {
			this.logService.error(`[LocalModelService] Streaming request failed: ${error}`);
			throw this.handleRequestError(error);
		}
	}

	async isHealthy(): Promise<boolean> {
		// If we checked recently, return cached result
		if (Date.now() - this.lastHealthCheck < this.healthCheckIntervalMs) {
			return this.isHealthy;
		}

		return this.checkHealth();
	}

	async getModels(): Promise<string[]> {
		await this.ensureHealthy();

		try {
			const modelsEndpoint = new URL(this.provider.modelsEndpoint, this.endpoint).toString();
			const response = await this.makeRequest(modelsEndpoint, {}, undefined);

			// Extract model IDs based on provider
			if (this.provider.id === 'ollama') {
				return (response.models || []).map((model: any) => model.name);
			} else if (this.provider.id === 'lmstudio') {
				return (response.data || []).map((model: any) => model.id);
			} else if (this.provider.id === 'llamacpp') {
				return [response.model || 'default'];
			}

			return [];
		} catch (error) {
			this.logService.error(`[LocalModelService] Failed to get models: ${error}`);
			return [];
		}
	}

	private async checkHealth(): Promise<boolean> {
		try {
			const healthEndpoint = new URL(this.provider.healthEndpoint, this.endpoint).toString();
			await this.makeRequest(healthEndpoint, {}, undefined, 5000);
			this.isHealthy = true;
		} catch (error) {
			this.isHealthy = false;
			this.logService.warn(`[LocalModelService] Health check failed: ${error}`);
		}

		this.lastHealthCheck = Date.now();
		return this.isHealthy;
	}

	private async ensureHealthy(): Promise<void> {
		if (!await this.isHealthy()) {
			throw new AIError(AIErrorCode.SERVICE_UNAVAILABLE, `Local model service ${this.name} is not available`);
		}
	}

	private getEndpointForMessages(messages: IAIMessage[]): string {
		// Use chat endpoint if multiple messages or non-user messages
		if (messages.length > 1 || messages.some(m => m.role !== 'user')) {
			return new URL(this.provider.chatEndpoint, this.endpoint).toString();
		}

		// Otherwise use completion endpoint
		return new URL(this.provider.completionEndpoint, this.endpoint).toString();
	}

	private async makeRequest(url: string, body: any, token?: CancellationToken, timeoutMs?: number): Promise<any> {
		const options: IRequestOptions = {
			type: 'json',
			headers: {
				...this.provider.defaultHeaders
			},
			timeout: timeoutMs || this.requestTimeoutMs
		};

		if (Object.keys(body).length > 0) {
			options.data = JSON.stringify(body);
		}

		const response = await this.requestService.request({
			url,
			...options
		}, token);

		if (response.statusCode >= 200 && response.statusCode < 300) {
			return response.bodyJson;
		}

		throw new AIError(
			AIErrorCode.INVALID_RESPONSE,
			`Request failed with status ${response.statusCode}: ${response.statusMessage}`
		);
	}

	private async makeStreamingRequest(url: string, body: any, token?: CancellationToken): Promise<AsyncIterable<string>> {
		const options: IRequestOptions = {
			type: 'json',
			headers: {
				...this.provider.defaultHeaders,
				'Accept': 'text/event-stream'
			},
			timeout: this.requestTimeoutMs
		};

		if (Object.keys(body).length > 0) {
			options.data = JSON.stringify(body);
		}

		const response = await this.requestService.request({
			url,
			...options
		}, token);

		if (response.statusCode >= 200 && response.statusCode < 300) {
			// Process the stream
			const stream = response.stream;
			if (!stream) {
				throw new AIError(AIErrorCode.INVALID_RESPONSE, 'No stream in response');
			}

			// Convert the stream to an async iterator of chunks
			const decoder = new TextDecoder();
			const iterator = streamToIterator(stream);

			return {
				[Symbol.asyncIterator]: async function* () {
					for await (const chunk of iterator) {
						const text = decoder.decode(chunk);
						// Split by lines and filter out empty lines and "data: " prefix
						const lines = text.split('\n')
							.filter(line => line.trim() !== '')
							.map(line => line.replace(/^data: /, '').trim())
							.filter(line => line !== '' && line !== '[DONE]');

						for (const line of lines) {
							yield line;
						}
					}
				}
			};
		}

		throw new AIError(
			AIErrorCode.INVALID_RESPONSE,
			`Streaming request failed with status ${response.statusCode}: ${response.statusMessage}`
		);
	}

	private handleRequestError(error: any): AIError {
		if (error instanceof AIError) {
			return error;
		}

		if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
			return new AIError(
				AIErrorCode.CONNECTION_FAILED,
				`Failed to connect to ${this.name} at ${this.endpoint}`,
				error,
				true
			);
		}

		if (error.code === 'ETIMEDOUT') {
			return new AIError(
				AIErrorCode.TIMEOUT,
				`Request to ${this.name} timed out`,
				error,
				true
			);
		}

		return new AIError(
			AIErrorCode.INTERNAL_ERROR,
			`Request to ${this.name} failed: ${error.message || 'Unknown error'}`,
			error,
			true
		);
	}
}
