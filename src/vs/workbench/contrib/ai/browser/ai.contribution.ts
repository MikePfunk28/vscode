/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from '../../../common/views.js';
import { AIChatPanel } from './aiChatPanel.js';
import { AIChatController } from './aiChatController.js';
import './aiChatCommands.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IAdvancedAIService } from '../../../services/ai/common/advancedAIService.js';
import { AdvancedAIServiceManager } from '../../../services/ai/common/advancedAIServiceManager.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';


// Register AI chat icon
const aiChatViewIcon = registerIcon('ai-chat-view-icon', Codicon.commentDiscussion, nls.localize('aiChatViewIcon', 'View icon of the AI chat view.'));

// AI Chat Panel constants
export const AI_CHAT_PANEL_ID = 'workbench.panel.ai.chat';
export const AI_CHAT_VIEW_CONTAINER_ID = 'workbench.view.ai.chat';

// Register AI Chat view container in the panel
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: AI_CHAT_VIEW_CONTAINER_ID,
	title: nls.localize2('aiChat', "AI Chat"),
	icon: aiChatViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AI_CHAT_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: AI_CHAT_VIEW_CONTAINER_ID,
	hideIfEmpty: true,
	order: 2, // Position after terminal
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: false });

// Register AI Chat view
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: AI_CHAT_PANEL_ID,
	name: nls.localize2('aiChat', "AI Chat"),
	containerIcon: aiChatViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(AIChatPanel),
	openCommandActionDescriptor: {
		id: 'workbench.action.ai.chat.focus',
		mnemonicTitle: nls.localize({ key: 'miToggleAIChat', comment: ['&& denotes a mnemonic'] }, "&&AI Chat"),
		keybindings: {
			primary: 0, // No default keybinding, will be set via commands
		},
		order: 2,
	}
}], VIEW_CONTAINER);

// Register Advanced AI Service
registerSingleton(IAdvancedAIService, AdvancedAIServiceManager, InstantiationType.Delayed);

// Register AI Chat Controller as a workbench contribution
registerWorkbenchContribution2(AIChatController.ID, AIChatController, WorkbenchPhase.BlockRestore);
