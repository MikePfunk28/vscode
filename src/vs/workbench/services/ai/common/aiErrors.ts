/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export enum AIErrorCode {
	// Connection Errors
	CONNECTION_FAILED = 'CONNECTION_FAILED',
	TIMEOUT = 'TIMEOUT',
	NETWORK_ERROR = 'NETWORK_ERROR',

	// Authentication Errors
	INVALID_API_KEY = 'INVALID_API_KEY',
	AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
	AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',

	// Model Errors
	MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
	MODEL_UNAVAILABLE = 'MODEL_UNAVAILABLE',
	MODEL_OVERLOADED = 'MODEL_OVERLOADED',

	// Request Errors
	INVALID_REQUEST = 'INVALID_REQUEST',
	CONTEXT_TOO_LARGE = 'CONTEXT_TOO_LARGE',
	RATE_LIMITED = 'RATE_LIMITED',
	QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

	// Response Errors
	INVALID_RESPONSE = 'INVALID_RESPONSE',
	PARSING_ERROR = 'PARSING_ERROR',
	INCOMPLETE_RESPONSE = 'INCOMPLETE_RESPONSE',

	// Service Errors
	SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
	CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
	INTERNAL_ERROR = 'INTERNAL_ERROR',

	// AI-Specific Errors
	REASONING_FAILED = 'REASONING_FAILED',
	ACTION_FAILED = 'ACTION_FAILED',
	RAG_SEARCH_FAILED = 'RAG_SEARCH_FAILED',
	EMBEDDING_FAILED = 'EMBEDDING_FAILED'
}

export class AIError extends Error {
	constructor(
		public readonly code: AIErrorCode,
		message: string,
		public readonly details?: any,
		public readonly retryable: boolean = false,
		public readonly retryAfter?: number
	) {
		super(message);
		this.name = 'AIError';
	}

	static connectionFailed(details?: any): AIError {
		return new AIError(
			AIErrorCode.CONNECTION_FAILED,
			'Failed to connect to AI service',
			details,
			true,
			5000
		);
	}

	static timeout(details?: any): AIError {
		return new AIError(
			AIErrorCode.TIMEOUT,
			'Request timed out',
			details,
			true,
			1000
		);
	}

	static invalidApiKey(): AIError {
		return new AIError(
			AIErrorCode.INVALID_API_KEY,
			'Invalid API key provided',
			undefined,
			false
		);
	}

	static modelNotFound(modelId: string): AIError {
		return new AIError(
			AIErrorCode.MODEL_NOT_FOUND,
			`Model '${modelId}' not found`,
			{ modelId },
			false
		);
	}

	static contextTooLarge(size: number, limit: number): AIError {
		return new AIError(
			AIErrorCode.CONTEXT_TOO_LARGE,
			`Context size ${size} exceeds limit of ${limit} tokens`,
			{ size, limit },
			false
		);
	}

	static rateLimited(retryAfter?: number): AIError {
		return new AIError(
			AIErrorCode.RATE_LIMITED,
			'Rate limit exceeded',
			undefined,
			true,
			retryAfter
		);
	}

	static invalidResponse(details?: any): AIError {
		return new AIError(
			AIErrorCode.INVALID_RESPONSE,
			'Invalid response from AI service',
			details,
			true,
			1000
		);
	}

	static reasoningFailed(step: string, details?: any): AIError {
		return new AIError(
			AIErrorCode.REASONING_FAILED,
			`Reasoning failed at step: ${step}`,
			{ step, ...details },
			true,
			2000
		);
	}

	static actionFailed(action: string, details?: any): AIError {
		return new AIError(
			AIErrorCode.ACTION_FAILED,
			`Action '${action}' failed`,
			{ action, ...details },
			true,
			1000
		);
	}

	static ragSearchFailed(query: string, details?: any): AIError {
		return new AIError(
			AIErrorCode.RAG_SEARCH_FAILED,
			`RAG search failed for query: ${query}`,
			{ query, ...details },
			true,
			1000
		);
	}

	static embeddingFailed(text: string, details?: any): AIError {
		return new AIError(
			AIErrorCode.EMBEDDING_FAILED,
			'Failed to generate embedding',
			{ textLength: text.length, ...details },
			true,
			2000
		);
	}
}

export interface IErrorHandler {
	handleError(error: AIError): Promise<boolean>; // Returns true if error was handled
	shouldRetry(error: AIError): boolean;
	getRetryDelay(error: AIError, attempt: number): number;
}

export class DefaultErrorHandler implements IErrorHandler {
	async handleError(error: AIError): Promise<boolean> {
		console.error(`AI Error [${error.code}]: ${error.message}`, error.details);

		switch (error.code) {
			case AIErrorCode.INVALID_API_KEY:
				// Could show a notification to update API key
				return true;

			case AIErrorCode.RATE_LIMITED:
				// Could show a notification about rate limiting
				return true;

			case AIErrorCode.MODEL_NOT_FOUND:
				// Could suggest alternative models
				return true;

			default:
				return false;
		}
	}

	shouldRetry(error: AIError): boolean {
		return error.retryable;
	}

	getRetryDelay(error: AIError, attempt: number): number {
		const baseDelay = error.retryAfter || 1000;
		return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Exponential backoff with max 30s
	}
}
