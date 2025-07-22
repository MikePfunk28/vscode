/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IAIService } from 'vs/workbench/contrib/ai/common/aiService';
import { localize } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IViewsService } from 'vs/workbench/common/views';
import { AI_CHAT_VIEW_ID } from 'vs/workbench/contrib/ai/browser/aiChatView';
import { Codicon } from 'vs/base/common/codicons';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export class AIExplainCodeAction extends Action2 {
	static readonly ID = 'ai.explainCode';

	constructor() {
		super({
			id: AIExplainCodeAction.ID,
			title: { value: localize('ai.explainCode', 'AI: Explain Code'), original: 'AI: Explain Code' },
			category: localize('ai.category', 'AI Assistant'),
			icon: Codicon.commentDiscussion,
			precondition: EditorContextKeys.hasNonEmptySelection,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const aiService = accessor.get(IAIService);
		const notificationService = accessor.get(INotificationService);
		const viewsService = accessor.get(IViewsService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor) {
			notificationService.warn(localize('noActiveEditor', 'No active editor found'));
			return;
		}

		const selection = activeEditor.getSelection();
		if (!selection) {
			notificationService.warn(localize('noSelection', 'No code selected'));
			return;
		}

		const model = activeEditor.getModel();
		if (!model) {
			return;
		}

		const selectedText = model.getValueInRange(selection);
		if (!selectedText.trim()) {
			notificationService.warn(localize('emptySelection', 'Selected text is empty'));
			return;
		}

		try {
			const explanation = await aiService.explainCode(selectedText, model.getLanguageId());
			
			// Show the chat view and add the explanation
			const chatView = await viewsService.openView(AI_CHAT_VIEW_ID);
			if (chatView && 'addMessage' in chatView) {
				(chatView as any).addMessage('AI', explanation, 'explanation');
			}
		} catch (error) {
			notificationService.error(localize('aiError', 'AI Error: {0}', String(error)));
		}
	}
}

export class AIGenerateCodeAction extends Action2 {
	static readonly ID = 'ai.generateCode';

	constructor() {
		super({
			id: AIGenerateCodeAction.ID,
			title: { value: localize('ai.generateCode', 'AI: Generate Code'), original: 'AI: Generate Code' },
			category: localize('ai.category', 'AI Assistant'),
			icon: Codicon.wand,
			precondition: EditorContextKeys.focus,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const aiService = accessor.get(IAIService);
		const notificationService = accessor.get(INotificationService);
		const viewsService = accessor.get(IViewsService);
		const commandService = accessor.get(ICommandService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor) {
			notificationService.warn(localize('noActiveEditor', 'No active editor found'));
			return;
		}

		// Open chat view to get user prompt for code generation
		const chatView = await viewsService.openView(AI_CHAT_VIEW_ID);
		if (chatView && 'setMode' in chatView) {
			(chatView as any).setMode('generate', {
				callback: async (prompt: string) => {
					try {
						const model = activeEditor.getModel();
						const languageId = model?.getLanguageId() || 'plaintext';
						const generatedCode = await aiService.generateCode(prompt, languageId);
						
						// Insert generated code at cursor position
						const position = activeEditor.getPosition();
						if (position && model) {
							activeEditor.executeEdits('ai-generate', [{
								range: {
									startLineNumber: position.lineNumber,
									startColumn: position.column,
									endLineNumber: position.lineNumber,
									endColumn: position.column
								},
								text: generatedCode,
								forceMoveMarkers: true
							}]);
						}
					} catch (error) {
						notificationService.error(localize('aiError', 'AI Error: {0}', String(error)));
					}
				}
			});
		}
	}
}

export class AIOptimizeCodeAction extends Action2 {
	static readonly ID = 'ai.optimizeCode';

	constructor() {
		super({
			id: AIOptimizeCodeAction.ID,
			title: { value: localize('ai.optimizeCode', 'AI: Optimize Code'), original: 'AI: Optimize Code' },
			category: localize('ai.category', 'AI Assistant'),
			icon: Codicon.rocket,
			precondition: EditorContextKeys.hasNonEmptySelection,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const aiService = accessor.get(IAIService);
		const notificationService = accessor.get(INotificationService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor) {
			notificationService.warn(localize('noActiveEditor', 'No active editor found'));
			return;
		}

		const selection = activeEditor.getSelection();
		if (!selection) {
			notificationService.warn(localize('noSelection', 'No code selected'));
			return;
		}

		const model = activeEditor.getModel();
		if (!model) {
			return;
		}

		const selectedText = model.getValueInRange(selection);
		if (!selectedText.trim()) {
			notificationService.warn(localize('emptySelection', 'Selected text is empty'));
			return;
		}

		try {
			const optimizedCode = await aiService.optimizeCode(selectedText, model.getLanguageId());
			
			// Replace selected text with optimized code
			activeEditor.executeEdits('ai-optimize', [{
				range: selection,
				text: optimizedCode,
				forceMoveMarkers: true
			}]);
			
			notificationService.info(localize('codeOptimized', 'Code has been optimized by AI'));
		} catch (error) {
			notificationService.error(localize('aiError', 'AI Error: {0}', String(error)));
		}
	}
}

export class AIFixCodeAction extends Action2 {
	static readonly ID = 'ai.fixCode';

	constructor() {
		super({
			id: AIFixCodeAction.ID,
			title: { value: localize('ai.fixCode', 'AI: Fix Code'), original: 'AI: Fix Code' },
			category: localize('ai.category', 'AI Assistant'),
			icon: Codicon.lightbulb,
			precondition: EditorContextKeys.hasNonEmptySelection,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const aiService = accessor.get(IAIService);
		const notificationService = accessor.get(INotificationService);

		const activeEditor = editorService.activeTextEditorControl;
		if (!activeEditor) {
			notificationService.warn(localize('noActiveEditor', 'No active editor found'));
			return;
		}

		const selection = activeEditor.getSelection();
		if (!selection) {
			notificationService.warn(localize('noSelection', 'No code selected'));
			return;
		}

		const model = activeEditor.getModel();
		if (!model) {
			return;
		}

		const selectedText = model.getValueInRange(selection);
		if (!selectedText.trim()) {
			notificationService.warn(localize('emptySelection', 'Selected text is empty'));
			return;
		}

		try {
			const fixedCode = await aiService.fixCode(selectedText, model.getLanguageId());
			
			// Replace selected text with fixed code
			activeEditor.executeEdits('ai-fix', [{
				range: selection,
				text: fixedCode,
				forceMoveMarkers: true
			}]);
			
			notificationService.info(localize('codeFixed', 'Code issues have been fixed by AI'));
		} catch (error) {
			notificationService.error(localize('aiError', 'AI Error: {0}', String(error)));
		}
	}
}

export class AIOpenWorkflowAction extends Action2 {
	static readonly ID = 'ai.openWorkflow';

	constructor() {
		super({
			id: AIOpenWorkflowAction.ID,
			title: { value: localize('ai.openWorkflow', 'AI: Open Workflow Designer'), original: 'AI: Open Workflow Designer' },
			category: localize('ai.category', 'AI Assistant'),
			icon: Codicon.gitMerge,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openView('workbench.panel.ai.workflow');
	}
}