/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets';
import {
	IModelConfigurationService,
	IModelConfiguration,
	IModelValidationResult,
	MODEL_PRESETS
} from 'vs/workbench/services/ai/common/modelConfiguration';
import { AIError, AIErrorCode } from 'vs/workbench/services/ai/common/aiErrors';

const STORAGE_KEY = 'ai.modelConfigurations';
const DEFAULT_MODEL_KEY = 'ai.defaultModel';
const SECRET_KEY_PREFIX = 'ai.apiKey.';

export class ModelConfigurationService extends Disposable implements IModelConfigurationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<IModelConfiguration>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private readonly _onDidAddModel = this._register(new Emitter<IModelConfiguration>());
	readonly onDidAddModel = this._onDidAddModel.event;

	private readonly _onDidRemoveModel = this._register(new Emitter<string>());
	readonly onDidRemoveModel = this._onDidRemoveModel.event;

	private readonly _onDidChangeDefaultModel = this._register(new Emitter<string>());
	readonly onDidChangeDefaultModel = this._onDidChangeDefaultModel.event;

	private configurations = new Map<string, IModelConfiguration>();
	private defaultModelId: string | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService
	) {
		super();
		this.loadConfigurations();
		this.loadDefaultModel();
	}

	// Configuration Management
	getConfiguration(modelId: string): IModelConfiguration | undefined {
		return this.configurations.get(modelId);
	}

	getAllConfigurations(): IModelConfiguration[] {
		return Array.from(this.configurations.values());
	}

	async addConfiguration(config: IModelConfiguration): Promise<void> {
		// Validate configuration
		const validation = await this.validateConfiguration(config);
		if (!validation.isValid) {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, validation.error || 'Invalid configuration');
		}

		// Encrypt API key if present
		if (config.apiKey) {
			await this.encryptAndStoreApiKey(config.id, config.apiKey);
			// Remove plain text API key from stored config
			config = { ...config, apiKey: undefined };
		}

		this.configurations.set(config.id, config);
		await this.saveConfigurations();
		this._onDidAddModel.fire(config);

		// Set as default if it's the first model or explicitly marked as default
		if (config.isDefault || this.configurations.size === 1) {
			await this.setDefaultModel(config.id);
		}
	}

	async updateConfiguration(modelId: string, updates: Partial<IModelConfiguration>): Promise<void> {
		const existing = this.configurations.get(modelId);
		if (!existing) {
			throw AIError.modelNotFound(modelId);
		}

		const updated = { ...existing, ...updates };

		// Validate updated configuration
		const validation = await this.validateConfiguration(updated);
		if (!validation.isValid) {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, validation.error || 'Invalid configuration');
		}

		// Handle API key updates
		if (updates.apiKey !== undefined) {
			if (updates.apiKey) {
				await this.encryptAndStoreApiKey(modelId, updates.apiKey);
			} else {
				await this.removeApiKey(modelId);
			}
			// Remove plain text API key from stored config
			updated.apiKey = undefined;
		}

		this.configurations.set(modelId, updated);
		await this.saveConfigurations();
		this._onDidChangeConfiguration.fire(updated);
	}

	async removeConfiguration(modelId: string): Promise<void> {
		const config = this.configurations.get(modelId);
		if (!config) {
			return;
		}

		// Remove API key from secret storage
		await this.removeApiKey(modelId);

		this.configurations.delete(modelId);
		await this.saveConfigurations();
		this._onDidRemoveModel.fire(modelId);

		// Update default model if this was the default
		if (this.defaultModelId === modelId) {
			const remaining = this.getAllConfigurations();
			if (remaining.length > 0) {
				await this.setDefaultModel(remaining[0].id);
			} else {
				this.defaultModelId = undefined;
				this.storageService.remove(DEFAULT_MODEL_KEY, StorageScope.PROFILE);
			}
		}
	}

	// Default Model Management
	getDefaultModel(): IModelConfiguration | undefined {
		return this.defaultModelId ? this.configurations.get(this.defaultModelId) : undefined;
	}

	async setDefaultModel(modelId: string): Promise<void> {
		const config = this.configurations.get(modelId);
		if (!config) {
			throw AIError.modelNotFound(modelId);
		}

		// Update isDefault flag on all configurations
		for (const [id, cfg] of this.configurations) {
			cfg.isDefault = id === modelId;
		}

		this.defaultModelId = modelId;
		this.storageService.store(DEFAULT_MODEL_KEY, modelId, StorageScope.PROFILE, StorageTarget.USER);
		await this.saveConfigurations();
		this._onDidChangeDefaultModel.fire(modelId);
	}

	// Model Discovery
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

		return discovered;
	}

	async validateConfiguration(config: IModelConfiguration): Promise<IModelValidationResult> {
		try {
			const startTime = Date.now();

			// Basic validation
			if (!config.id || !config.name || !config.endpoint || !config.model) {
				return {
					isValid: false,
					error: 'Missing required fields: id, name, endpoint, or model'
				};
			}

			// Validate endpoint URL
			try {
				new URL(config.endpoint);
			} catch {
				return {
					isValid: false,
					error: 'Invalid endpoint URL'
				};
			}

			// Test connection to the model
			const testResult = await this.testModelConnection(config);
			const latency = Date.now() - startTime;

			return {
				isValid: testResult.success,
				error: testResult.error,
				latency,
				capabilities: testResult.capabilities
			};
		} catch (error) {
			return {
				isValid: false,
				error: error instanceof Error ? error.message : 'Unknown validation error'
			};
		}
	}

	// Security
	async encryptApiKey(apiKey: string): Promise<string> {
		// In a real implementation, this would use proper encryption
		// For now, we'll use the secret storage service
		const keyId = this.generateKeyId();
		await this.secretStorageService.set(SECRET_KEY_PREFIX + keyId, apiKey);
		return keyId;
	}

	async decryptApiKey(encryptedKey: string): Promise<string> {
		const apiKey = await this.secretStorageService.get(SECRET_KEY_PREFIX + encryptedKey);
		if (!apiKey) {
			throw new AIError(AIErrorCode.AUTHENTICATION_FAILED, 'API key not found');
		}
		return apiKey;
	}

	// Import/Export
	async exportConfigurations(): Promise<string> {
		const configs = this.getAllConfigurations();
		const exportData = {
			version: '1.0',
			configurations: configs.map(config => ({
				...config,
				apiKey: config.apiKey ? '[ENCRYPTED]' : undefined
			})),
			defaultModel: this.defaultModelId
		};
		return JSON.stringify(exportData, null, 2);
	}

	async importConfigurations(data: string): Promise<void> {
		try {
			const importData = JSON.parse(data);

			if (!importData.configurations || !Array.isArray(importData.configurations)) {
				throw new Error('Invalid import data format');
			}

			// Clear existing configurations
			this.configurations.clear();

			// Import configurations
			for (const config of importData.configurations) {
				if (config.apiKey === '[ENCRYPTED]') {
					config.apiKey = undefined; // Will need to be re-entered
				}
				await this.addConfiguration(config);
			}

			// Set default model
			if (importData.defaultModel && this.configurations.has(importData.defaultModel)) {
				await this.setDefaultModel(importData.defaultModel);
			}
		} catch (error) {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, 'Failed to import configurations: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	}

	// Presets
	getPresetConfigurations(): IModelConfiguration[] {
		return Object.entries(MODEL_PRESETS).map(([id, preset]) => ({
			id,
			enabled: true,
			isDefault: false,
			...preset
		} as IModelConfiguration));
	}

	createFromPreset(presetId: string, customizations?: Partial<IModelConfiguration>): IModelConfiguration {
		const preset = MODEL_PRESETS[presetId];
		if (!preset) {
			throw new Error(`Preset ${presetId} not found`);
		}

		return {
			id: customizations?.id || presetId,
			enabled: true,
			isDefault: false,
			...preset,
			...customizations
		} as IModelConfiguration;
	}

	// Private Methods
	private loadConfigurations(): void {
		const stored = this.storageService.get(STORAGE_KEY, StorageScope.PROFILE);
		if (stored) {
			try {
				const configs = JSON.parse(stored);
				for (const config of configs) {
					this.configurations.set(config.id, config);
				}
			} catch (error) {
				console.error('Failed to load model configurations:', error);
			}
		}
	}

	private loadDefaultModel(): void {
		this.defaultModelId = this.storageService.get(DEFAULT_MODEL_KEY, StorageScope.PROFILE);
	}

	private async saveConfigurations(): Promise<void> {
		const configs = Array.from(this.configurations.values());
		this.storageService.store(STORAGE_KEY, JSON.stringify(configs), StorageScope.PROFILE, StorageTarget.USER);
	}

	private async encryptAndStoreApiKey(modelId: string, apiKey: string): Promise<void> {
		await this.secretStorageService.set(SECRET_KEY_PREFIX + modelId, apiKey);
	}

	private async removeApiKey(modelId: string): Promise<void> {
		await this.secretStorageService.delete(SECRET_KEY_PREFIX + modelId);
	}

	private generateKeyId(): string {
		return Math.random().toString(36).substring(2) + Date.now().toString(36);
	}

	private async discoverOllamaModels(): Promise<IModelConfiguration[]> {
		// Try to connect to Ollama API
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
				endpoint: 'http://localhost:11434/api/generate',
				model: model.name,
				enabled: true,
				isDefault: false,
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
		// Try to connect to LM Studio API
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
				endpoint: 'http://localhost:1234/v1/chat/completions',
				model: model.id,
				enabled: true,
				isDefault: false,
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
				},
				metadata: {
					description: `LM Studio model: ${model.id}`
				}
			});
		}

		return models;
	}

	private async testModelConnection(config: IModelConfiguration): Promise<{ success: boolean; error?: string; capabilities?: string[] }> {
		try {
			// Create a simple test request based on provider type
			let testRequest: any;
			let headers: Record<string, string> = {
				'Content-Type': 'application/json'
			};

			if (config.apiKey) {
				const apiKey = await this.decryptApiKey(config.apiKey);
				if (config.provider === 'openai') {
					headers['Authorization'] = `Bearer ${apiKey}`;
				} else if (config.provider === 'anthropic') {
					headers['x-api-key'] = apiKey;
				}
			}

			switch (config.provider) {
				case 'ollama':
					testRequest = {
						model: config.model,
						prompt: 'Hello',
						stream: false
					};
					break;
				case 'lmstudio':
				case 'openai':
					testRequest = {
						model: config.model,
						messages: [{ role: 'user', content: 'Hello' }],
						max_tokens: 10
					};
					break;
				case 'anthropic':
					testRequest = {
						model: config.model,
						messages: [{ role: 'user', content: 'Hello' }],
						max_tokens: 10
					};
					break;
				default:
					return { success: false, error: 'Unsupported provider' };
			}

			const response = await fetch(config.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(testRequest)
			});

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
