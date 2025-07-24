/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const IModelConfigurationService = createDecorator<IModelConfigurationService>('modelConfigurationService');

export interface IModelConfiguration {
	id: string;
	name: string;
	type: 'local' | 'cloud';
	provider: 'ollama' | 'lmstudio' | 'llamacpp' | 'openai' | 'anthropic' | 'huggingface' | 'custom';
	endpoint: string;
	apiKey?: string;
	model: string;
	parameters: IModelParameters;
	isDefault: boolean;
	enabled: boolean;
	capabilities: {
		chat: boolean;
		completion: boolean;
		refactoring: boolean;
		analysis: boolean;
		chainOfThought: boolean;
		react: boolean;
		rag: boolean;
		streaming: boolean;
		contextWindow: number;
		maxTokens: number;
	};
	metadata?: {
		description?: string;
		version?: string;
		size?: string;
		quantization?: string;
	};
}

export interface IModelParameters {
	temperature: number;
	maxTokens: number;
	topP?: number;
	topK?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	stopSequences?: string[];
	systemPrompt?: string;
	// ReAct specific parameters
	maxActions?: number;
	actionTimeout?: number;
	// RAG specific parameters
	retrievalCount?: number;
	similarityThreshold?: number;
	// Chain of Thought parameters
	reasoningSteps?: number;
	showReasoning?: boolean;
}

export interface IModelValidationResult {
	isValid: boolean;
	error?: string;
	latency?: number;
	capabilities?: string[];
}

export interface IModelConfigurationService {
	readonly _serviceBrand: undefined;

	// Events
	readonly onDidChangeConfiguration: Event<IModelConfiguration>;
	readonly onDidAddModel: Event<IModelConfiguration>;
	readonly onDidRemoveModel: Event<string>;
	readonly onDidChangeDefaultModel: Event<string>;

	// Configuration Management
	getConfiguration(modelId: string): IModelConfiguration | undefined;
	getAllConfigurations(): IModelConfiguration[];
	addConfiguration(config: IModelConfiguration): Promise<void>;
	updateConfiguration(modelId: string, config: Partial<IModelConfiguration>): Promise<void>;
	removeConfiguration(modelId: string): Promise<void>;

	// Default Model Management
	getDefaultModel(): IModelConfiguration | undefined;
	setDefaultModel(modelId: string): Promise<void>;

	// Model Discovery
	discoverLocalModels(): Promise<IModelConfiguration[]>;
	validateConfiguration(config: IModelConfiguration): Promise<IModelValidationResult>;

	// Security
	encryptApiKey(apiKey: string): Promise<string>;
	decryptApiKey(encryptedKey: string): Promise<string>;

	// Import/Export
	exportConfigurations(): Promise<string>;
	importConfigurations(data: string): Promise<void>;

	// Presets
	getPresetConfigurations(): IModelConfiguration[];
	createFromPreset(presetId: string, customizations?: Partial<IModelConfiguration>): IModelConfiguration;
}

// Preset configurations for popular models
export const MODEL_PRESETS: Record<string, Partial<IModelConfiguration>> = {
	'ollama-llama3.1': {
		name: 'Llama 3.1 (Ollama)',
		type: 'local',
		provider: 'ollama',
		endpoint: 'http://localhost:11434/api/generate',
		model: 'llama3.1',
		parameters: {
			temperature: 0.7,
			maxTokens: 4096,
			topP: 0.9,
			maxActions: 5,
			retrievalCount: 10,
			reasoningSteps: 3,
			showReasoning: true
		},
		capabilities: {
			chat: true,
			completion: true,
			refactoring: true,
			analysis: true,
			chainOfThought: true,
			react: true,
			rag: true,
			streaming: true,
			contextWindow: 8192,
			maxTokens: 4096
		}
	},
	'lmstudio-codellama': {
		name: 'Code Llama (LM Studio)',
		type: 'local',
		provider: 'lmstudio',
		endpoint: 'http://localhost:1234/v1/chat/completions',
		model: 'codellama',
		parameters: {
			temperature: 0.3,
			maxTokens: 2048,
			topP: 0.95,
			maxActions: 3,
			reasoningSteps: 2
		},
		capabilities: {
			chat: true,
			completion: true,
			refactoring: true,
			analysis: true,
			chainOfThought: true,
			react: false,
			rag: false,
			streaming: true,
			contextWindow: 4096,
			maxTokens: 2048
		}
	},
	'openai-gpt4': {
		name: 'GPT-4 (OpenAI)',
		type: 'cloud',
		provider: 'openai',
		endpoint: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-4',
		parameters: {
			temperature: 0.3,
			maxTokens: 4096,
			topP: 1.0,
			frequencyPenalty: 0,
			presencePenalty: 0,
			maxActions: 10,
			retrievalCount: 15,
			reasoningSteps: 5,
			showReasoning: true
		},
		capabilities: {
			chat: true,
			completion: true,
			refactoring: true,
			analysis: true,
			chainOfThought: true,
			react: true,
			rag: true,
			streaming: true,
			contextWindow: 8192,
			maxTokens: 4096
		}
	},
	'anthropic-claude': {
		name: 'Claude 3.5 Sonnet (Anthropic)',
		type: 'cloud',
		provider: 'anthropic',
		endpoint: 'https://api.anthropic.com/v1/messages',
		model: 'claude-3-5-sonnet-20241022',
		parameters: {
			temperature: 0.3,
			maxTokens: 4096,
			topP: 1.0,
			maxActions: 8,
			retrievalCount: 12,
			reasoningSteps: 4,
			showReasoning: true
		},
		capabilities: {
			chat: true,
			completion: true,
			refactoring: true,
			analysis: true,
			chainOfThought: true,
			react: true,
			rag: true,
			streaming: true,
			contextWindow: 200000,
			maxTokens: 4096
		}
	}
};
