/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IAIService } from '../../../services/ai/common/aiService.js';
import { ICodeContext } from '../../../services/ai/common/aiTypes.js';
import { IAdvancedAIService } from '../../../services/ai/common/advancedAIService.js';
import { ContextCategory, IInterleavedContext, ITextSegment, ICodeSegment } from '../../../services/ai/common/advancedAITypes.js';
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
		@IAdvancedAIService private readonly advancedAIService: IAdvancedAIService,
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

			// Build interleaved context for advanced AI processing
			const interleavedContext = await this._buildInterleavedContext(message, extractedContext);

			// Use advanced AI service with all features enabled
			const response = await this.advancedAIService.processAdvancedQuery(message, {
				useChainOfThought: true,
				useSequentialThinking: message.toLowerCase().includes('problem') || message.toLowerCase().includes('solve'),
				useRAG: true,
				ragCategories: [
					ContextCategory.CODE_CONTEXT,
					ContextCategory.DOCUMENTATION,
					ContextCategory.EXAMPLES,
					ContextCategory.BEST_PRACTICES
				],
				useAttention: true,
				useSemanticSearch: true
			}, interleavedContext);

			// Format response with reasoning if available
			let formattedResponse = response.content;

			if (response.reasoning && response.reasoning.steps.length > 0) {
				formattedResponse += '\n\n**Reasoning:**\n';
				response.reasoning.steps.forEach((step, index) => {
					formattedResponse += `${index + 1}. ${step.thought}\n   *${step.reasoning}*\n`;
				});
			}

			if (response.sources && response.sources.length > 0) {
				formattedResponse += '\n\n**Sources:**\n';
				response.sources.forEach(source => {
					formattedResponse += `- ${source.title} (${source.type})\n`;
				});
			}

			// Display response in chat panel
			this._chatPanel.addAssistantMessage(formattedResponse);
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

	private async _buildInterleavedContext(message: string, extractedContext?: any): Promise<IInterleavedContext> {
		const textSegments: ITextSegment[] = [];
		const codeSegments: ICodeSegment[] = [];
		const sequenceOrder: number[] = [];
		const attentionWeights: number[] = [];

		// Add user message as text segment
		textSegments.push({
			id: 'user_message',
			content: message,
			type: 'instruction',
			position: 0,
			relevanceScore: 1.0
		});
		sequenceOrder.push(0);
		attentionWeights.push(1.0);

		if (extractedContext) {
			// Add workspace context
			if (extractedContext.workspaceInfo?.rootPath) {
				textSegments.push({
					id: 'workspace_context',
					content: `Workspace: ${extractedContext.workspaceInfo.rootPath}`,
					type: 'documentation',
					position: 1,
					relevanceScore: 0.6
				});
				sequenceOrder.push(1);
				attentionWeights.push(0.6);
			}

			// Add active file as code segment
			if (extractedContext.activeFile && extractedContext.fileContent) {
				const embedding = await this._createMockEmbedding(extractedContext.fileContent);
				codeSegments.push({
					id: 'active_file',
					content: extractedContext.fileContent,
					language: extractedContext.workspaceInfo?.language || 'typescript',
					type: 'function',
					position: 2,
					dependencies: [],
					semanticEmbedding: embedding
				});
				sequenceOrder.push(2);
				attentionWeights.push(0.9);
			}

			// Add selected text as high-priority code segment
			if (extractedContext.selectedText) {
				const embedding = await this._createMockEmbedding(extractedContext.selectedText);
				codeSegments.push({
					id: 'selected_code',
					content: extractedContext.selectedText,
					language: extractedContext.workspaceInfo?.language || 'typescript',
					type: 'expression',
					position: 3,
					dependencies: [],
					semanticEmbedding: embedding
				});
				sequenceOrder.push(3);
				attentionWeights.push(1.0);
			}

			// Add surrounding code context
			if (extractedContext.surroundingCode && extractedContext.surroundingCode !== extractedContext.selectedText) {
				const embedding = await this._createMockEmbedding(extractedContext.surroundingCode);
				codeSegments.push({
					id: 'surrounding_code',
					content: extractedContext.surroundingCode,
					language: extractedContext.workspaceInfo?.language || 'typescript',
					type: 'function',
					position: 4,
					dependencies: [],
					semanticEmbedding: embedding
				});
				sequenceOrder.push(4);
				attentionWeights.push(0.7);
			}

			// Add project structure as documentation
			if (extractedContext.projectStructure && extractedContext.projectStructure.length > 0) {
				textSegments.push({
					id: 'project_structure',
					content: `Project Structure:\n${extractedContext.projectStructure.join('\n')}`,
					type: 'documentation',
					position: 5,
					relevanceScore: 0.5
				});
				sequenceOrder.push(5);
				attentionWeights.push(0.5);
			}
		}

		return {
			textSegments,
			codeSegments,
			visualSegments: [], // Not implemented yet
			sequenceOrder,
			attentionWeights
		};
	}

	private async _createMockEmbedding(text: string): Promise<number[]> {
		// Create a simple mock embedding based on text characteristics
		// In a real implementation, this would call an embedding model
		const dimensions = 1536; // Standard OpenAI embedding size
		const embedding = new Array(dimensions);

		// Simple hash-based embedding for consistency
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		// Generate deterministic values based on hash
		for (let i = 0; i < dimensions; i++) {
			const seed = hash + i;
			embedding[i] = (Math.sin(seed) + Math.cos(seed * 2)) / 2;
		}

		// Normalize the embedding
		const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
		return embedding.map(val => val / norm);
	}
}
