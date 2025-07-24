/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { IModelConfiguration } from 'vs/workbench/services/ai/common/modelConfiguration';
import { LocalModelFactory } from 'vs/workbench/services/ai/common/localModelFactory';
import { RunOnceScheduler } from 'vs/base/common/async';

export interface IModelHealthStatus {
	modelId: string;
	isHealthy: boolean;
	lastChecked: number;
	error?: string;
	latency?: number;
}

export interface ILocalModelHealthMonitor {
	readonly onDidChangeModelHealth: Event<IModelHealthStatus>;
	getModelHealth(modelId: string): IModelHealthStatus | undefined;
	getAllModelHealth(): IModelHealthStatus[];
	checkModelHealth(modelId: string): Promise<IModelHealthStatus>;
	startMonitoring(modelId: string): void;
	stopMonitoring(modelId: string): void;
}

export class LocalModelHealthMonitor extends Disposable implements ILocalModelHealthMonitor {
	private readonly _onDidChangeModelHealth = this._register(new Emitter<IModelHealthStatus>());
	readonly onDidChangeModelHealth = this._onDidChangeModelHealth.event;

	private readonly healthStatus = new Map<string, IModelHealthStatus>();
	private readonly monitoredModels = new Set<string>();
	private readonly healthCheckScheduler: RunOnceScheduler;
	private readonly healthCheckIntervalMs = 30000; // 30 seconds

	constructor(
		private readonly localModelFactory: LocalModelFactory,
		private readonly modelConfigs: Map<string, IModelConfiguration>,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.healthCheckScheduler = this._register(new RunOnceScheduler(() => this.checkAllMonitoredModels(), this.healthCheckIntervalMs));
	}

	getModelHealth(modelId: string): IModelHealthStatus | undefined {
		return this.healthStatus.get(modelId);
	}

	getAllModelHealth(): IModelHealthStatus[] {
		return Array.from(this.healthStatus.values());
	}

	async checkModelHealth(modelId: string): Promise<IModelHealthStatus> {
		const config = this.modelConfigs.get(modelId);
		if (!config) {
			const status: IModelHealthStatus = {
				modelId,
				isHealthy: false,
				lastChecked: Date.now(),
				error: 'Model configuration not found'
			};
			this.updateHealthStatus(status);
			return status;
		}

		if (config.type !== 'local') {
			const status: IModelHealthStatus = {
				modelId,
				isHealthy: false,
				lastChecked: Date.now(),
				error: 'Not a local model'
			};
			this.updateHealthStatus(status);
			return status;
		}

		try {
			const startTime = Date.now();
			const connectionTest = await this.localModelFactory.testLocalModelConnection(config);
			const latency = Date.now() - startTime;

			const status: IModelHealthStatus = {
				modelId,
				isHealthy: connectionTest.success,
				lastChecked: Date.now(),
				error: connectionTest.error,
				latency
			};

			this.updateHealthStatus(status);
			return status;
		} catch (error) {
			const status: IModelHealthStatus = {
				modelId,
				isHealthy: false,
				lastChecked: Date.now(),
				error: error instanceof Error ? error.message : 'Unknown error'
			};
			this.updateHealthStatus(status);
			return status;
		}
	}

	startMonitoring(modelId: string): void {
		if (!this.monitoredModels.has(modelId)) {
			this.monitoredModels.add(modelId);
			this.checkModelHealth(modelId).catch(error => {
				this.logService.error(`[LocalModelHealthMonitor] Failed to check health for model ${modelId}:`, error);
			});

			if (!this.healthCheckScheduler.isScheduled()) {
				this.healthCheckScheduler.schedule();
			}
		}
	}

	stopMonitoring(modelId: string): void {
		this.monitoredModels.delete(modelId);
		if (this.monitoredModels.size === 0) {
			this.healthCheckScheduler.cancel();
		}
	}

	private async checkAllMonitoredModels(): Promise<void> {
		for (const modelId of this.monitoredModels) {
			try {
				await this.checkModelHealth(modelId);
			} catch (error) {
				this.logService.error(`[LocalModelHealthMonitor] Failed to check health for model ${modelId}:`, error);
			}
		}

		if (this.monitoredModels.size > 0) {
			this.healthCheckScheduler.schedule();
		}
	}

	private updateHealthStatus(status: IModelHealthStatus): void {
		this.healthStatus.set(status.modelId, status);
		this._onDidChangeModelHealth.fire(status);
	}
}
