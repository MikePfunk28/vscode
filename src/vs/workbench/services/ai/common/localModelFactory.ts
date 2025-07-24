/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LocalModelService } from 'vs/workbench/services/ai/common/localModelService';
import { IModelConfiguration } from 'vs/workbench/services/ai/common/modelConfiguration';
import { IAIServiceProvider } from 'vs/workbench/services/ai/common/aiService';
import { AIError, AIErrorCode } from 'vs/workbench/services/ai/common/aiErrors';

export class LocalModelFactory {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) { }

	createLocalModelProvider(config: IModelConfiguration): IAIServiceProvider {
		if (config.type !== 'local') {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, 'Not a local model configuration');
		}

		switch (config.provider) {
			case 'ollama':
			case 'lmstudio':
			case 'llamacpp':
				return this.instantiationService.createInstance(LocalModelService, config);
			default:
				throw new AIError(AIErrorCode.CONFIGURATION_ERROR, `Unsupported local model provider: ${config.provider}`);
		}
	}

	async discoverLocalModels(): Promise<IModelConfiguration[]> {
		const discovered: IModelConfiguration[] = [];

		// Try to discover Ollama models
		try {
			const ollamaModels = await this.discoverOllamaModels();
			discovered.push(...ollamaModels);
		} catch (error) {
			// Ollama not available, continue
		}

		// Try to discover LM Studio models
		try {
			const lmStudioModels = await this.discoverLMStudioModels();
			discovered.push(...lmStudioModels);
		} catch (error) {
			// LM Studio not available, continue
		}

		// Try to discover Llama.cpp models
		try {
			const llamaCppModels = await this.discoverLlamaCppModels();
			discovered.push(...llamaCppModels);
		} catch (error) {
			// Llama.cpp not available, continue
		}

		return discovered;
	}

	private async discoverOllamaModels(): Promise<IModelConfiguration[]> {
		const response = await fetch('http://localhost:11434/api/tags');
		if (!response.ok) {
			throw new Error('Ollama not available');
		}

		const data = await response.json();
		const models: IModelConfiguration[] = [];

		for (const model of data.models || []) {
			models.push({
				id: `ollama-${model.name}`,
				name: `${model.name} (Ollama)`,
				type: 'local',
				provider: 'ollama',
				endpoint: 'http://localhost:11434',
				model: model.name,
				enabled: true,
				isDefault: false,
				parameters: {
					temperature: 0.7,
					maxTokens: 4096,
					topP: 0.9,
					topK: 40,
					frequencyPenalty: 0,
					presencePenalty: 0,
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
				},
				metadata: {
					description: `Ollama model: ${model.name}`,
					size: model.size
				}
			});
		}

		return models;
	}

	private async discoverLMStudioModels(): Promise<IModelConfiguration[]> {
		const response = await fetch('http://localhost:1234/v1/models');
		if (!response.ok) {
			throw new Error('LM Studio not available');
		}

		const data = await response.json();
		const models: IModelConfiguration[] = [];

		for (const model of data.data || []) {
			models.push({
				id: `lmstudio-${model.id}`,
				name: `${model.id} (LM Studio)`,
				type: 'local',
				provider: 'lmstudio',
				endpoint: 'http://localhost:1234',
				model: model.id,
				enabled: true,
				isDefault: false,
				parameters: {
					temperature: 0.3,
					maxTokens: 2048,
					topP: 0.95,
					frequencyPenalty: 0,
					presencePenalty: 0,
					maxActions: 3,
					retrievalCount: 5,
					reasoningSteps: 2,
					showReasoning: true
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
				},
				metadata: {
					description: `LM Studio model: ${model.id}`
				}
			});
		}

		return models;
	}

	private async discoverLlamaCppModels(): Promise<IModelConfiguration[]> {
		try {
			const response = await fetch('http://localhost:8080/model');
			if (!response.ok) {
				throw new Error('Llama.cpp not available');
			}

			const data = await response.json();
			const modelName = data.model || 'default';

			return [{
				id: `llamacpp-${modelName}`,
				name: `${modelName} (Llama.cpp)`,
				type: 'local',
				provider: 'llamacpp',
				endpoint: 'http://localhost:8080',
				model: modelName,
				enabled: true,
				isDefault: false,
				parameters: {
					temperature: 0.7,
					maxTokens: 2048,
					topP: 0.9,
					topK: 40,
					frequencyPenalty: 0,
					presencePenalty: 0,
					maxActions: 3,
					retrievalCount: 5,
					reasoningSteps: 2,
					showReasoning: true
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
				},
				metadata: {
					description: `Llama.cpp model: ${modelName}`
				}
			}];
		} catch (error) {
			throw new Error('Llama.cpp not available');
		}
	}

	async testLocalModelConnection(config: IModelConfiguration): Promise<{ success: boolean; error?: string; capabilities?: string[] }> {
		try {
			const url = new URL(config.provider === 'ollama' ? '/api/tags' :
				config.provider === 'lmstudio' ? '/v1/models' :
					'/health', config.endpoint).toString();

			const response = await fetch(url);
			if (!response.ok) {
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`
				};
			}

			// If we get here, the connection is successful
			return {
				success: true,
				capabilities: Object.keys(config.capabilities).filter(key =>
					config.capabilities[key as keyof typeof config.capabilities]
				)
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Connection test failed'
			};
		}
	}
}
