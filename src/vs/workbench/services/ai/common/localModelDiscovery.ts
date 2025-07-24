/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IModelConfiguration, IModelConfigurationService } from 'vs/workbench/services/ai/common/modelConfiguration';
import { LocalModelFactory } from 'vs/workbench/services/ai/common/localModelFactory';
import { RunOnceScheduler } from 'vs/base/common/async';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';

export interface IDiscoveredModel {
	config: IModelConfiguration;
	isNew: boolean;
	source: string;
}

export interface ILocalModelDiscoveryService {
	readonly onDidDiscoverModels: Event<IDiscoveredModel[]>;
	discoverModels(): Promise<IDiscoveredModel[]>;
	startAutomaticDiscovery(): void;
	stopAutomaticDiscovery(): void;
}

export class LocalModelDiscoveryService extends Disposable implements ILocalModelDiscoveryService {
	private readonly _onDidDiscoverModels = this._register(new Emitter<IDiscoveredModel[]>());
	readonly onDidDiscoverModels = this._onDidDiscoverModels.event;

	private readonly discoveryScheduler: RunOnceScheduler;
	private readonly discoveryIntervalMs = 60000; // 60 seconds
	private isAutomaticDiscoveryActive = false;
	private knownModelIds = new Set<string>();

	constructor(
		private readonly localModelFactory: LocalModelFactory,
		@IModelConfigurationService private readonly modelConfigService: IModelConfigurationService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();

		// Initialize known model IDs
		for (const config of this.modelConfigService.getAllConfigurations()) {
			if (config.type === 'local') {
				this.knownModelIds.add(config.id);
			}
		}

		this.discoveryScheduler = this._register(new RunOnceScheduler(() => this.runDiscovery(), this.discoveryIntervalMs));
	}

	async discoverModels(): Promise<IDiscoveredModel[]> {
		try {
			const discoveredModels = await this.localModelFactory.discoverLocalModels();
			const result: IDiscoveredModel[] = [];

			for (const config of discoveredModels) {
				const isNew = !this.knownModelIds.has(config.id);
				result.push({
					config,
					isNew,
					source: config.provider
				});

				// Add to known models
				this.knownModelIds.add(config.id);
			}

			if (result.length > 0) {
				this._onDidDiscoverModels.fire(result);
			}

			return result;
		} catch (error) {
			this.logService.error('[LocalModelDiscoveryService] Discovery failed:', error);
			return [];
		}
	}

	startAutomaticDiscovery(): void {
		if (!this.isAutomaticDiscoveryActive) {
			this.isAutomaticDiscoveryActive = true;
			this.runDiscovery();
		}
	}

	stopAutomaticDiscovery(): void {
		if (this.isAutomaticDiscoveryActive) {
			this.isAutomaticDiscoveryActive = false;
			this.discoveryScheduler.cancel();
		}
	}

	private async runDiscovery(): Promise<void> {
		try {
			const discoveredModels = await this.discoverModels();
			const newModels = discoveredModels.filter(model => model.isNew);

			if (newModels.length > 0) {
				this.notifyNewModels(newModels);
			}
		} catch (error) {
			this.logService.error('[LocalModelDiscoveryService] Automatic discovery failed:', error);
		}

		if (this.isAutomaticDiscoveryActive) {
			this.discoveryScheduler.schedule();
		}
	}

	private notifyNewModels(newModels: IDiscoveredModel[]): void {
		if (newModels.length === 1) {
			const model = newModels[0];
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize(
					'newModelDiscovered',
					"New AI model discovered: {0}",
					model.config.name
				),
				actions: {
					primary: [{
						label: localize('addModel', "Add Model"),
						run: () => this.addModelToConfiguration(model.config)
					}]
				}
			});
		} else {
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize(
					'newModelsDiscovered',
					"{0} new AI models discovered",
					newModels.length
				),
				actions: {
					primary: [{
						label: localize('addAllModels', "Add All Models"),
						run: () => this.addAllModelsToConfiguration(newModels.map(m => m.config))
					}]
				}
			});
		}
	}

	private async addModelToConfiguration(config: IModelConfiguration): Promise<void> {
		try {
			await this.modelConfigService.addConfiguration(config);
			this.logService.info(`[LocalModelDiscoveryService] Added model ${config.name} to configuration`);
		} catch (error) {
			this.logService.error(`[LocalModelDiscoveryService] Failed to add model ${config.name}:`, error);
			this.notificationService.error(localize(
				'failedToAddModel',
				"Failed to add model {0}: {1}",
				config.name,
				error instanceof Error ? error.message : 'Unknown error'
			));
		}
	}

	private async addAllModelsToConfiguration(configs: IModelConfiguration[]): Promise<void> {
		let successCount = 0;
		let failureCount = 0;

		for (const config of configs) {
			try {
				await this.modelConfigService.addConfiguration(config);
				successCount++;
			} catch (error) {
				this.logService.error(`[LocalModelDiscoveryService] Failed to add model ${config.name}:`, error);
				failureCount++;
			}
		}

		if (successCount > 0) {
			this.notificationService.info(localize(
				'modelsAdded',
				"Added {0} models to configuration",
				successCount
			));
		}

		if (failureCount > 0) {
			this.notificationService.warn(localize(
				'someModelsFailedToAdd',
				"Failed to add {0} models",
				failureCount
			));
		}
	}
}
