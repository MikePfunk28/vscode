/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IAIService } from '../../../services/ai/common/aiService.js';
import { ICodeContext } from '../../../services/ai/common/aiTypes.js';
import { AIChatPanel } from './aiChatPanel.js';
import { AI_CHAT_PANEL_ID } from './ai.contribution.js';
import { AIChatPanelStateService } from './aiChatPanelState.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { AIContextExtractor, IExtractedContext } from './aiContextExtractor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextModel } from '../../../../editor/common/model.js';

import { Range } from '../../../../editor/common/core/range.js';

export class AIChatController extends Disposable {
	static readonly ID = 'workbench.contrib.ai.chatController';

	private _chatPanel: AIChatPanel | undefined;
	private _stateService: AIChatPanelStateService;
	private _contextExtractor: AIContextExtractor;

	constructor(
		@IViewsService private readonly viewsService: IViewsService,
		@IAIService private readonly aiService: IAIService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IFileService fileService: IFileService
	) {
		super();
		this._stateService = this._register(new AIChatPanelStateService(storageService));
		this._contextExtractor = this._register(new AIContextExtractor(editorService, workspaceContextService, fileService));
		this._initialize();
	}

	private _initialize(): void {
		// Listen for when the chat panel is opened/closed
		this._register(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id === AI_CHAT_PANEL_ID) {
				if (e.visible) {
					this._onChatPanelOpened();
				}
				this._stateService.saveVisibility(e.visible);
			}
		}));

		// Restore panel visibility if it was open before
		if (this._stateService.getVisibility()) {
			this.openChatPanel();
		}
	}

	private _onChatPanelOpened(): void {
		const chatPanel = this.viewsService.getActiveViewWithId(AI_CHAT_PANEL_ID) as AIChatPanel;
		if (chatPanel && chatPanel !== this._chatPanel) {
			this._chatPanel = chatPanel;
			this._setupChatPanelListeners();
		}
	}

	private _setupChatPanelListeners(): void {
		if (!this._chatPanel) {
			return;
		}

		// Listen for messages sent from the chat panel
		this._register(this._chatPanel.onDidSendMessage(message => {
			this._handleChatMessage(message);
		}));

		// Listen for model selection changes
		this._register(this._chatPanel.onDidSelectModel(modelId => {
			this._handleModelSelection(modelId);
		}));
	}

	private async _handleChatMessage(message: string): Promise<void> {
		if (!this._chatPanel) {
			return;
		}

		try {
			// Get current code context
			const extractedContext = await this._contextExtractor.extractCurrentContext();

			// Format context for AI
			let enhancedMessage = message;
			if (extractedContext) {
				const contextString = this._contextExtractor.formatContextForAI(extractedContext);
				enhancedMessage = `${contextString}\n\n## User Question\n${message}`;
			}

			// Send message to AI service
			const response = await this.aiService.sendChatMessage(enhancedMessage, extractedContext);

			// Display response in chat panel
			this._chatPanel.addAssistantMessage(response.content);
		} catch (error) {
			console.error('Error sending chat message:', error);
			this._chatPanel.addErrorMessage(error instanceof Error ? error.message : String(error));
		}
	}

	private _handleModelSelection(modelId: string): void {
		// Switch the AI service to use the selected model
		this.aiService.switchModel(modelId).catch(error => {
			console.error('Error switching model:', error);
			if (this._chatPanel) {
				this._chatPanel.addErrorMessage(`Failed to switch to model: ${modelId}`);
			}
		});
	}

	private _getCurrentCodeContext(): ICodeContext | undefined {
		const activeEditor = this.editorService.activeTextEditorControl;
		if (!activeEditor) {
			return undefined;
		}

		const model = activeEditor.getModel() as ITextModel;
		if (!model) {
			return undefined;
		}

		const selection = activeEditor.getSelection();
		const position = activeEditor.getPosition();

		const context: ICodeContext = {
			activeFile: model.uri.toString(),
			cursorPosition: position ? { line: position.lineNumber, column: position.column } : undefined,
			workspaceInfo: {
				rootPath: this.workspaceContextService.getWorkspace().folders[0]?.uri.toString(),
				language: model.getLanguageId()
			}
		};

		// Add selected text if there's a selection
		if (selection && !selection.isEmpty()) {
			context.selectedText = model.getValueInRange(selection);
		}

		// Add some context around the cursor
		if (position) {
			const startLine = Math.max(1, position.lineNumber - 10);
			const endLine = Math.min(model.getLineCount(), position.lineNumber + 10);
			const contextRange = new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
			context.surroundingCode = model.getValueInRange(contextRange);
		}

		// Add list of open files
		const openEditors = this.editorService.editors;
		context.openFiles = openEditors.map(editor => editor.resource?.toString()).filter(Boolean) as string[];

		return context;
	}

	public async openChatPanel(): Promise<void> {
		await this.viewsService.openView(AI_CHAT_PANEL_ID, true);
	}

	public async focusChatPanel(): Promise<void> {
		const chatPanel = await this.viewsService.openView(AI_CHAT_PANEL_ID, true);
		if (chatPanel) {
			chatPanel.focus();
		}
	}

	public clearChatHistory(): void {
		if (this._chatPanel) {
			this._chatPanel.clearMessages();
		}
	}
}
