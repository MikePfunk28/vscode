/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiChatPanel.css';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { defaultSelectBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ISelectOptionItem } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { IAIService } from '../../../services/ai/common/aiService.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { AIChatPanelStateService } from './aiChatPanelState.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

export interface IChatMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
	modelId?: string;
}

export class AIChatPanel extends ViewPane {
	static readonly ID = 'workbench.panel.ai.chat';
	static readonly TITLE = nls.localize('aiChat', "AI Chat");

	private _container!: HTMLElement;
	private _messagesContainer!: HTMLElement;
	private _inputContainer!: HTMLElement;
	private _messageInput!: HTMLTextAreaElement;
	private _sendButton!: Button;
	private _modelSelector!: SelectBox;
	private _messages: IChatMessage[] = [];
	private _currentModelId: string = '';
	private _stateService: AIChatPanelStateService;

	private readonly _onDidSendMessage = this._register(new Emitter<string>());
	readonly onDidSendMessage: Event<string> = this._onDidSendMessage.event;

	private readonly _onDidSelectModel = this._register(new Emitter<string>());
	readonly onDidSelectModel: Event<string> = this._onDidSelectModel.event;

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IStorageService storageService: IStorageService,
		@IAIService private readonly aiService: IAIService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._stateService = this._register(new AIChatPanelStateService(storageService));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = dom.append(container, dom.$('.ai-chat-panel'));

		this._createHeader();
		this._createMessagesArea();
		this._createInputArea();

		this._loadState();
		this._updateModelSelector();
		this._registerListeners();
	}

	private _createHeader(): void {
		const header = dom.append(this._container, dom.$('.ai-chat-header'));

		const modelSelectorContainer = dom.append(header, dom.$('.model-selector-container'));
		const modelLabel = dom.append(modelSelectorContainer, dom.$('.model-label'));
		modelLabel.textContent = nls.localize('model', "Model:");

		// Create model selector dropdown
		this._modelSelector = this._register(new SelectBox(
			[],
			0,
			this.contextViewService,
			defaultSelectBoxStyles,
			{
				ariaLabel: nls.localize('selectModel', "Select AI Model")
			}
		));

		const modelSelectorElement = dom.append(modelSelectorContainer, dom.$('.model-selector'));
		this._modelSelector.render(modelSelectorElement);
	}

	private _createMessagesArea(): void {
		const messagesWrapper = dom.append(this._container, dom.$('.messages-wrapper'));
		this._messagesContainer = dom.append(messagesWrapper, dom.$('.messages-container'));

		// Add welcome message
		this._addWelcomeMessage();
	}

	private _createInputArea(): void {
		this._inputContainer = dom.append(this._container, dom.$('.input-container'));

		const inputWrapper = dom.append(this._inputContainer, dom.$('.input-wrapper'));

		this._messageInput = dom.append(inputWrapper, dom.$('textarea.message-input')) as HTMLTextAreaElement;
		this._messageInput.placeholder = nls.localize('typeMessage', "Type your message here...");
		this._messageInput.rows = 1;

		const buttonContainer = dom.append(inputWrapper, dom.$('.button-container'));
		this._sendButton = this._register(new Button(buttonContainer, defaultButtonStyles));
		this._sendButton.label = nls.localize('send', "Send");
		this._sendButton.enabled = false;
	}

	private _addWelcomeMessage(): void {
		const welcomeMessage: IChatMessage = {
			id: 'welcome',
			role: 'assistant',
			content: nls.localize('welcomeMessage', "Hello! I'm your AI assistant. How can I help you today?"),
			timestamp: new Date()
		};

		this._messages.push(welcomeMessage);
		this._renderMessage(welcomeMessage);
	}

	private _renderMessage(message: IChatMessage): void {
		const messageElement = dom.append(this._messagesContainer, dom.$('.message'));
		messageElement.classList.add(`message-${message.role}`);

		const messageHeader = dom.append(messageElement, dom.$('.message-header'));
		const roleElement = dom.append(messageHeader, dom.$('.message-role'));
		roleElement.textContent = message.role === 'user' ? nls.localize('you', "You") : nls.localize('assistant', "Assistant");

		const timestampElement = dom.append(messageHeader, dom.$('.message-timestamp'));
		timestampElement.textContent = message.timestamp.toLocaleTimeString();

		if (message.modelId) {
			const modelElement = dom.append(messageHeader, dom.$('.message-model'));
			modelElement.textContent = `(${message.modelId})`;
		}

		const contentElement = dom.append(messageElement, dom.$('.message-content'));
		contentElement.textContent = message.content;

		// Scroll to bottom
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private _registerListeners(): void {
		// Send button click
		this._register(this._sendButton.onDidClick(() => this._sendMessage()));

		// Enter key to send (Shift+Enter for new line)
		this._register(dom.addStandardDisposableListener(this._messageInput, 'keydown', (e: StandardKeyboardEvent) => {
			if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				this._sendMessage();
			}
		}));

		// Input change to enable/disable send button
		this._register(dom.addStandardDisposableListener(this._messageInput, 'input', () => {
			const hasText = this._messageInput.value.trim().length > 0;
			this._sendButton.enabled = hasText;
		}));

		// Model selector change
		this._register(this._modelSelector.onDidSelect(selection => {
			if (selection.selected) {
				this._currentModelId = selection.selected;
				this._onDidSelectModel.fire(selection.selected);
				this._saveState();
			}
		}));

		// Auto-resize textarea
		this._register(dom.addStandardDisposableListener(this._messageInput, 'input', () => {
			this._autoResizeTextarea();
		}));
	}

	private _autoResizeTextarea(): void {
		this._messageInput.style.height = 'auto';
		const scrollHeight = this._messageInput.scrollHeight;
		const maxHeight = 120; // Max 5 lines approximately
		this._messageInput.style.height = Math.min(scrollHeight, maxHeight) + 'px';
	}

	private _sendMessage(): void {
		const message = this._messageInput.value.trim();
		if (!message) {
			return;
		}

		// Add user message
		const userMessage: IChatMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: message,
			timestamp: new Date()
		};

		this._messages.push(userMessage);
		this._renderMessage(userMessage);
		this._saveState();

		// Clear input
		this._messageInput.value = '';
		this._messageInput.style.height = 'auto';
		this._sendButton.enabled = false;

		// Fire event
		this._onDidSendMessage.fire(message);

		// Show typing indicator
		this._showTypingIndicator();
	}

	private _showTypingIndicator(): void {
		const typingElement = dom.append(this._messagesContainer, dom.$('.message.message-assistant.typing'));
		const contentElement = dom.append(typingElement, dom.$('.message-content'));
		contentElement.textContent = nls.localize('typing', "Assistant is typing...");

		// Scroll to bottom
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private _removeTypingIndicator(): void {
		const typingElement = this._messagesContainer.querySelector('.typing');
		if (typingElement) {
			typingElement.remove();
		}
	}





	private async _updateModelSelector(): Promise<void> {
		try {
			// Get available models from AI service
			const models = await this.aiService.getAvailableModels();
			const options: ISelectOptionItem[] = models.map(model => ({
				text: model.name
			}));

			if (options.length > 0) {
				this._modelSelector.setOptions(options);
				this._currentModelId = models[0].id;
				this._modelSelector.select(0);
			} else {
				// No models available
				this._modelSelector.setOptions([{
					text: nls.localize('noModels', "No models available")
				}]);
			}
		} catch (error) {
			console.error('Failed to load AI models:', error);
			this._modelSelector.setOptions([{
				text: nls.localize('errorLoadingModels', "Error loading models")
			}]);
		}
	}



	private _loadState(): void {
		// Load saved messages
		const savedMessages = this._stateService.getMessages();
		if (savedMessages.length > 0) {
			this._messages = savedMessages;
			dom.clearNode(this._messagesContainer);
			savedMessages.forEach(message => this._renderMessage(message));
		}

		// Load selected model
		const savedModelId = this._stateService.getSelectedModelId();
		if (savedModelId) {
			this._currentModelId = savedModelId;
		}
	}

	private _saveState(): void {
		this._stateService.saveMessages(this._messages);
		this._stateService.saveSelectedModelId(this._currentModelId);
	}

	public addAssistantMessage(content: string): void {
		this._removeTypingIndicator();

		const assistantMessage: IChatMessage = {
			id: Date.now().toString(),
			role: 'assistant',
			content: content,
			timestamp: new Date(),
			modelId: this._currentModelId
		};

		this._messages.push(assistantMessage);
		this._renderMessage(assistantMessage);
		this._saveState();
	}

	public addErrorMessage(error: string): void {
		this._removeTypingIndicator();

		const errorMessage: IChatMessage = {
			id: Date.now().toString(),
			role: 'assistant',
			content: nls.localize('errorMessage', "Sorry, I encountered an error: {0}", error),
			timestamp: new Date(),
			modelId: this._currentModelId
		};

		this._messages.push(errorMessage);
		this._renderMessage(errorMessage);
		this._saveState();
	}

	public clearMessages(): void {
		this._messages = [];
		dom.clearNode(this._messagesContainer);
		this._addWelcomeMessage();
		this._saveState();
	}

	public getMessages(): IChatMessage[] {
		return [...this._messages];
	}

	public getCurrentModelId(): string {
		return this._currentModelId;
	}

	override focus(): void {
		super.focus();
		this._messageInput.focus();
	}

	override dispose(): void {
		this._saveState();
		super.dispose();
	}
}
