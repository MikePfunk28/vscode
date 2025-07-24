/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelConfiguration, IModelConfigurationService } from 'vs/workbench/services/ai/common/modelConfiguration';
import { LocalModelFactory } from 'vs/workbench/services/ai/common/localModelFactory';
import { LocalModelService } from 'vs/workbench/services/ai/common/localModelService';
import { IAIServiceProvider } from 'vs/workbench/services/ai/common/aiService';
import { LocalModelHealthMonitor, IModelHealthStatus } from 'vs/workbench/services/ai/common/localModelHealthMonitor';
import { AIError, AIErrorCode } from 'vs/workbench/services/ai/common/aiErrors';

export interface ILocalModelInfo {
	id: string;
	name: string;
	provider: string;
	model: string;
	endpoint: string;
	isHealthy: boolean;
	isDefault: boolean;
	capabilities: string[];
	lastChecked?: number;
	latency?: number;
	error?: string;
}

export interface ILocalModelRegistry {
	readonly onDidRegisterModel: Event<ILocalModelInfo>;
	readonly onDidUnregisterModel: Event<string>;
	readonly onDidChangeModelHealth: Event<IModelHealthStatus>;

	registerModel(config: IModelConfiguration): Promise<IAIServiceProvider>;
	unregisterModel(modelId: string): void;
	getModel(modelId: string): IAIServiceProvider | undefined;
	getModelInfo(modelId: string): ILocalModelInfo | undefined;
	getAllModels(): IAIServiceProvider[];
	getAllModelInfo(): ILocalModelInfo[];
	getHealthyModels(): IAIServiceProvider[];
	checkModelHealth(modelId: string): Promise<IModelHealthStatus>;
}

export class LocalModelRegistry extends Disposable implements ILocalModelRegistry {
	private readonly _onDidRegisterModel = this._register(new Emitter<ILocalModelInfo>());
	readonly onDidRegisterModel = this._onDidRegisterModel.event;

	private readonly _onDidUnregisterModel = this._register(new Emitter<string>());
	readonly onDidUnregisterModel = this._onDidUnregisterModel.event;

	private readonly _onDidChangeModelHealth = this._register(new Emitter<IModelHealthStatus>());
	readonly onDidChangeModelHealth = this._onDidChangeModelHealth.event;

	private readonly models = new Map<string, IAIServiceProvider>();
	private readonly modelConfigs = new Map<string, IModelConfiguration>();
	private readonly healthMonitor: LocalModelHealthMonitor;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelConfigurationService private readonly modelConfigService: IModelConfigurationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		// Create local model factory
		const localModelFactory = this.instantiationService.createInstance(LocalModelFactory);

		// Create health monitor
		this.healthMonitor = this._register(this.instantiationService.createInstance(
			LocalModelHealthMonitor,
			localModelFactory,
			this.modelConfigs
		));

		// Forward health change events
		this._register(this.healthMonitor.onDidChangeModelHealth(status => {
			this._onDidChangeModelHealth.fire(status);
		}));

		// Initialize with existing local models from configuration
		this.initializeFromConfiguration();
	}

	async registerModel(config: IModelConfiguration): Promise<IAIServiceProvider> {
		if (config.type !== 'local') {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, 'Not a local model configuration');
		}

		if (this.models.has(config.id)) {
			throw new AIError(AIErrorCode.CONFIGURATION_ERROR, `Model ${config.id} is already registered`);
		}

		try {
			// Create local model service
			const modelService = this.instantiationService.createInstance(LocalModelService, config);

			// Store model and config
			this.models.set(config.id, modelService);
			this.modelConfigs.set(config.id, config);

			// Start health monitoring
			this.healthMonitor.startMonitoring(config.id);

			// Get initial health status
			const health = await this.healthMonitor.checkModelHealth(config.id);

			// Fire register event
			const modelInfo = this.createModelInfo(config, health);
			this._onDidRegisterModel.fire(modelInfo);

			return modelService;
		} catch (error) {
			this.logService.error(`[LocalModelRegistry] Failed to register model ${config.id}:`, error);
			throw new AIError(
				AIErrorCode.CONFIGURATION_ERROR,
				`Failed to register model ${config.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	unregisterModel(modelId: string): void {
		const model = this.models.get(modelId);
		if (!model) {
			return;
		}

		// Stop health monitoring
		this.healthMonitor.stopMonitoring(modelId);

		// Dispose model
		model.dispose();

		// Remove from maps
		this.models.delete(modelId);
		this.modelConfigs.delete(modelId);

		// Fire unregister event
		this._onDidUnregisterModel.fire(modelId);
	}

	getModel(modelId: string): IAIServiceProvider | undefined {
		return this.models.get(modelId);
	}

	getModelInfo(modelId: string): ILocalModelInfo | undefined {
		const config = this.modelConfigs.get(modelId);
		if (!config) {
			return undefined;
		}

		const health = this.healthMonitor.getModelHealth(modelId);
		return this.createModelInfo(config, health);
	}

	getAllModels(): IAIServiceProvider[] {
		return Array.from(this.models.values());
	}

	getAllModelInfo(): ILocalModelInfo[] {
		return Array.from(this.modelConfigs.entries()).map(([id, config]) => {
			const health = this.healthMonitor.getModelHealth(id);
			return this.createModelInfo(config, health);
		});
	}

	getHealthyModels(): IAIServiceProvider[] {
		const healthyModels: IAIServiceProvider[] = [];

		for (const [id, model] of this.models.entries()) {
			const health = this.healthMonitor.getModelHealth(id);
			if (health?.isHealthy) {
				healthyModels.push(model);
			}
		}

		return healthyModels;
	}

	async checkModelHealth(modelId: string): Promise<IModelHealthStatus> {
		return this.healthMonitor.checkModelHealth(modelId);
	}

	private async initializeFromConfiguration(): Promise<void> {
		const configs = this.modelConfigService.getAllConfigurations();

		for (const config of configs) {
			if (config.type === 'local' && config.enabled) {
				try {
					await this.registerModel(config);
				} catch (error) {
					this.logService.error(`[LocalModelRegistry] Failed to initialize model ${config.id}:`, error);
				}
			}
		}
	}

	private createModelInfo(config: IModelConfiguration, health?: IModelHealthStatus): ILocalModelInfo {
		return {
			id: config.id,
			name: config.name,
			provider: config.provider,
			model: config.model,
			endpoint: config.endpoint,
			isHealthy: health?.isHealthy ?? false,
			isDefault: config.isDefault,
			capabilities: Object.keys(config.capabilities).filter(key =>
				config.capabilities[key as keyof typeof config.capabilities]
			),
			lastChecked: health?.lastChecked,
			latency: health?.latency,
			error: health?.error
		};
	}
}
