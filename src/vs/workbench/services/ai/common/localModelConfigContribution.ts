/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IModelConfigurationService } from 'vs/workbench/services/ai/common/modelConfiguration';
import { LocalModelDiscoveryService } from 'vs/workbench/services/ai/common/localModelDiscovery';
import { LocalModelRegistry } from 'vs/workbench/services/ai/common/localModelRegistry';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';

/**
 * Contribution that initializes local model discovery and registration.
 * This runs when VSCode starts up to discover and register local AI models.
 */
export class LocalModelConfigContribution extends Disposable implements IWorkbenchContribution {
	private readonly discoveryService: LocalModelDiscoveryService;
	private readonly modelRegistry: LocalModelRegistry;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelConfigurationService private readonly modelConfigService: IModelConfigurationService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		// Create local model registry
		this.modelRegistry = this._register(this.instantiationService.createInstance(LocalModelRegistry));

		// Create discovery service
		this.discoveryService = this._register(this.instantiationService.createInstance(LocalModelDiscoveryService));

		// Register event handlers
		this._register(this.discoveryService.onDidDiscoverModels(models => this.handleDiscoveredModels(models)));
		this._register(this.modelConfigService.onDidAddModel(config => this.handleModelAdded(config)));
		this._register(this.modelConfigService.onDidRemoveModel(modelId => this.handleModelRemoved(modelId)));
		this._register(this.modelRegistry.onDidChangeModelHealth(status => this.handleModelHealthChanged(status)));

		// Start automatic discovery
		this.discoveryService.startAutomaticDiscovery();

		// Run initial discovery
		this.runInitialDiscovery();
	}

	private async runInitialDiscovery(): Promise<void> {
		try {
			const discoveredModels = await this.discoveryService.discoverModels();
			this.logService.info(`[LocalModelConfigContribution] Discovered ${discoveredModels.length} local models`);

			// Check if we have any local models configured
			const configs = this.modelConfigService.getAllConfigurations();
			const localConfigs = configs.filter(c => c.type === 'local');

			// If no local models are configured but we discovered some, suggest adding them
			if (localConfigs.length === 0 && discoveredModels.length > 0) {
				this.suggestAddingDiscoveredModels(discoveredModels.map(m => m.config));
			}
		} catch (error) {
			this.logService.error('[LocalModelConfigContribution] Initial discovery failed:', error);
		}
	}

	private async handleDiscoveredModels(models: any[]): Promise<void> {
		// This is handled by the discovery service notifications
	}

	private async handleModelAdded(config: any): Promise<void> {
		if (config.type === 'local' && config.enabled) {
			try {
				await this.modelRegistry.registerModel(config);
				this.logService.info(`[LocalModelConfigContribution] Registered model ${config.name}`);
			} catch (error) {
				this.logService.error(`[LocalModelConfigContribution] Failed to register model ${config.name}:`, error);
			}
		}
	}

	private handleModelRemoved(modelId: string): void {
		try {
			this.modelRegistry.unregisterModel(modelId);
			this.logService.info(`[LocalModelConfigContribution] Unregistered model ${modelId}`);
		} catch (error) {
			this.logService.error(`[LocalModelConfigContribution] Failed to unregister model ${modelId}:`, error);
		}
	}

	private handleModelHealthChanged(status: any): void {
		const modelInfo = this.modelRegistry.getModelInfo(status.modelId);
		if (!modelInfo) {
			return;
		}

		// If model was healthy and is now unhealthy, show notification
		if (!status.isHealthy && status.lastChecked > 0) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize(
					'modelUnhealthy',
					"AI model '{0}' is no longer available: {1}",
					modelInfo.name,
					status.error || 'Connection failed'
				)
			});
		}
	}

	private suggestAddingDiscoveredModels(configs: any[]): void {
		if (configs.length === 0) {
			return;
		}

		this.notificationService.notify({
			severity: Severity.Info,
			message: localize(
				'discoveredLocalModels',
				"Discovered {0} local AI models. Would you like to add them to your configuration?",
				configs.length
			),
			actions: {
				primary: [{
					label: localize('addModels', "Add Models"),
					run: () => this.addDiscoveredModels(configs)
				}]
			}
		});
	}

	private async addDiscoveredModels(configs: any[]): Promise<void> {
		let successCount = 0;
		let failureCount = 0;

		for (const config of configs) {
			try {
				await this.modelConfigService.addConfiguration(config);
				successCount++;
			} catch (error) {
				this.logService.error(`[LocalModelConfigContribution] Failed to add model ${config.name}:`, error);
				failureCount++;
			}
		}

		if (successCount > 0) {
			this.notificationService.info(localize(
				'modelsAdded',
				"Added {0} AI models to configuration",
				successCount
			));
		}

		if (failureCount > 0) {
			this.notificationService.warn(localize(
				'someModelsFailedToAdd',
				"Failed to add {0} AI models",
				failureCount
			));
		}
	}
}
