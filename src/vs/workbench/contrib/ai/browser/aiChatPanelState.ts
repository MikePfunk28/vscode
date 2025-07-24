/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatMessage } from './aiChatPanel.js';

export interface IAIChatPanelState {
	isVisible: boolean;
	selectedModelId: string;
	messages: IChatMessage[];
	panelHeight?: number;
	panelWidth?: number;
}

export class AIChatPanelStateService extends Disposable {
	private static readonly STORAGE_KEY = 'aiChatPanel.state';
	private static readonly DEFAULT_STATE: IAIChatPanelState = {
		isVisible: false,
		selectedModelId: '',
		messages: [],
		panelHeight: 300,
		panelWidth: 400
	};

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
	}

	public getState(): IAIChatPanelState {
		const stored = this.storageService.get(AIChatPanelStateService.STORAGE_KEY, StorageScope.WORKSPACE);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				return { ...AIChatPanelStateService.DEFAULT_STATE, ...parsed };
			} catch (error) {
				console.warn('Failed to parse AI chat panel state:', error);
			}
		}
		return { ...AIChatPanelStateService.DEFAULT_STATE };
	}

	public saveState(state: Partial<IAIChatPanelState>): void {
		const currentState = this.getState();
		const newState = { ...currentState, ...state };

		try {
			this.storageService.store(
				AIChatPanelStateService.STORAGE_KEY,
				JSON.stringify(newState),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
		} catch (error) {
			console.warn('Failed to save AI chat panel state:', error);
		}
	}

	public clearState(): void {
		this.storageService.remove(AIChatPanelStateService.STORAGE_KEY, StorageScope.WORKSPACE);
	}

	public getMessages(): IChatMessage[] {
		return this.getState().messages;
	}

	public saveMessages(messages: IChatMessage[]): void {
		this.saveState({ messages });
	}

	public getSelectedModelId(): string {
		return this.getState().selectedModelId;
	}

	public saveSelectedModelId(modelId: string): void {
		this.saveState({ selectedModelId: modelId });
	}

	public getPanelDimensions(): { height?: number; width?: number } {
		const state = this.getState();
		return {
			height: state.panelHeight,
			width: state.panelWidth
		};
	}

	public savePanelDimensions(height?: number, width?: number): void {
		this.saveState({
			panelHeight: height,
			panelWidth: width
		});
	}

	public getVisibility(): boolean {
		return this.getState().isVisible;
	}

	public saveVisibility(isVisible: boolean): void {
		this.saveState({ isVisible });
	}
}
