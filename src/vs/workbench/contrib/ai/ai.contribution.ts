/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewContainersRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, IViewsRegistry } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { AIChatView, AI_CHAT_VIEW_ID } from './browser/aiChatView.js';
import { AIWorkflowView, AI_WORKFLOW_VIEW_ID } from './browser/aiWorkflowView.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IAIService } from './common/aiService.js';
import { AIService } from './browser/aiService.js';
import { registerAction2, MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';
import { AIExplainCodeAction, AIGenerateCodeAction, AIOptimizeCodeAction, AIFixCodeAction } from './browser/aiActions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';

// Register AI Service
registerSingleton(IAIService, AIService, true);

// Register AI Chat View Container
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: 'ai-assistant',
	title: localize('ai.assistant', 'AI Assistant'),
	icon: Codicon.robot,
	order: 5
}, ViewContainerLocation.Sidebar);

// Register AI Chat View
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: AI_CHAT_VIEW_ID,
	name: localize('ai.chat', 'AI Chat'),
	containerIcon: Codicon.commentDiscussion,
	ctorDescriptor: new SyncDescriptor(AIChatView),
	when: ContextKeyExpr.true(),
	order: 1
}], VIEW_CONTAINER);

// Register AI Workflow View
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: AI_WORKFLOW_VIEW_ID,
	name: localize('ai.workflows', 'AI Workflows'),
	containerIcon: Codicon.gitMerge,
	ctorDescriptor: new SyncDescriptor(AIWorkflowView),
	when: ContextKeyExpr.true(),
	order: 2
}], VIEW_CONTAINER);

// Register AI Actions
registerAction2(AIExplainCodeAction);
registerAction2(AIGenerateCodeAction);
registerAction2(AIOptimizeCodeAction);
registerAction2(AIFixCodeAction);

// Register Context Menu Items
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	command: {
		id: 'ai.explainCode',
		title: localize('ai.explainCode', 'AI: Explain Code')
	},
	when: EditorContextKeys.hasNonEmptySelection,
	group: 'ai@1'
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	command: {
		id: 'ai.generateCode',
		title: localize('ai.generateCode', 'AI: Generate Code')
	},
	when: EditorContextKeys.focus,
	group: 'ai@2'
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	command: {
		id: 'ai.optimizeCode',
		title: localize('ai.optimizeCode', 'AI: Optimize Code')
	},
	when: EditorContextKeys.hasNonEmptySelection,
	group: 'ai@3'
});

MenuRegistry.appendMenuItem(MenuId.EditorContext, {
	command: {
		id: 'ai.fixCode',
		title: localize('ai.fixCode', 'AI: Fix Code')
	},
	when: EditorContextKeys.hasNonEmptySelection,
	group: 'ai@4'
});

// Inline completion provider will be registered separately via workbench contributions