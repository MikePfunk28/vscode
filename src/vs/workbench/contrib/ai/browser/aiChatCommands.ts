/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AI_CHAT_PANEL_ID } from './ai.contribution.js';

import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';

// Open AI Chat Panel Command
class OpenAIChatPanelAction extends Action2 {
	static readonly ID = 'workbench.action.ai.chat.open';

	constructor() {
		super({
			id: OpenAIChatPanelAction.ID,
			title: nls.localize2('openAIChat', "Open AI Chat"),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: 200,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView(AI_CHAT_PANEL_ID, true);
	}
}

// Focus AI Chat Panel Command
class FocusAIChatPanelAction extends Action2 {
	static readonly ID = 'workbench.action.ai.chat.focus';

	constructor() {
		super({
			id: FocusAIChatPanelAction.ID,
			title: nls.localize2('focusAIChat', "Focus AI Chat"),
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const chatPanel = await viewsService.openView(AI_CHAT_PANEL_ID, true);
		if (chatPanel) {
			chatPanel.focus();
		}
	}
}

// Clear AI Chat History Command
class ClearAIChatHistoryAction extends Action2 {
	static readonly ID = 'workbench.action.ai.chat.clear';

	constructor() {
		super({
			id: ClearAIChatHistoryAction.ID,
			title: nls.localize2('clearAIChatHistory', "Clear AI Chat History"),
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const chatPanel = viewsService.getActiveViewWithId(AI_CHAT_PANEL_ID);
		if (chatPanel && 'clearMessages' in chatPanel) {
			(chatPanel as any).clearMessages();
		}
	}
}

// Toggle AI Chat Panel Command
class ToggleAIChatPanelAction extends Action2 {
	static readonly ID = 'workbench.action.ai.chat.toggle';

	constructor() {
		super({
			id: ToggleAIChatPanelAction.ID,
			title: nls.localize2('toggleAIChat', "Toggle AI Chat"),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: 200,
				primary: KeyMod.CtrlCmd | KeyCode.KeyJ,
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const isVisible = viewsService.isViewVisible(AI_CHAT_PANEL_ID);

		if (isVisible) {
			viewsService.closeView(AI_CHAT_PANEL_ID);
		} else {
			await viewsService.openView(AI_CHAT_PANEL_ID, true);
		}
	}
}

// Register all commands
registerAction2(OpenAIChatPanelAction);
registerAction2(FocusAIChatPanelAction);
registerAction2(ClearAIChatHistoryAction);
registerAction2(ToggleAIChatPanelAction);
