/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./aiChatView';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewsService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IAIService, IAIMessage } from 'vs/workbench/contrib/ai/common/aiService';
import { Disposable } from 'vs/base/common/lifecycle';
import { $, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { localize } from 'vs/nls';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { MarkdownString } from 'vs/base/common/htmlContent';

export const AI_CHAT_VIEW_ID = 'workbench.panel.ai.chat';

export class AIChatView extends ViewPane {
	private container!: HTMLElement;
	private messagesContainer!: HTMLElement;
	private inputContainer!: HTMLElement;
	private inputBox!: InputBox;
	private sendButton!: Button;
	private clearButton!: Button;
	private providerSelect!: HTMLSelectElement;
	
	private messages: IAIMessage[] = [];
	private isProcessing = false;

	constructor(
		options: any,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService viewsService: IViewsService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAIService private readonly aiService: IAIService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService);

		this._register(this.aiService.onDidChangeConfiguration(() => {
			this.updateProviderSelect();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.container = container;
		this.container.classList.add('ai-chat-view');

		this.createHeader();
		this.createMessagesContainer();
		this.createInputContainer();
		this.updateProviderSelect();
	}

	private createHeader(): void {
		const header = $('.ai-chat-header');
		this.container.appendChild(header);

		const title = $('.ai-chat-title');
		title.textContent = localize('aiChat.title', 'AI Assistant');
		header.appendChild(title);

		const controls = $('.ai-chat-controls');
		header.appendChild(controls);

		// Provider selection
		const providerContainer = $('.provider-container');
		const providerLabel = $('label');
		providerLabel.textContent = localize('aiChat.provider', 'Provider:');
		providerContainer.appendChild(providerLabel);

		this.providerSelect = $('select') as HTMLSelectElement;
		this.providerSelect.classList.add('provider-select');
		providerContainer.appendChild(this.providerSelect);
		controls.appendChild(providerContainer);

		this._register(addDisposableListener(this.providerSelect, EventType.CHANGE, () => {
			const config = this.aiService.getConfiguration();
			config.provider = this.providerSelect.value;
			this.aiService.setConfiguration(config);
		}));

		// Clear button
		this.clearButton = this._register(new Button(controls, { title: localize('aiChat.clear', 'Clear Chat') }));
		this.clearButton.label = '$(clear-all)';
		this._register(attachButtonStyler(this.clearButton, this.themeService));
		this._register(this.clearButton.onDidClick(() => this.clearChat()));
	}

	private createMessagesContainer(): void {
		this.messagesContainer = $('.ai-chat-messages');
		this.messagesContainer.setAttribute('role', 'log');
		this.messagesContainer.setAttribute('aria-live', 'polite');
		this.container.appendChild(this.messagesContainer);
	}

	private createInputContainer(): void {
		this.inputContainer = $('.ai-chat-input-container');
		this.container.appendChild(this.inputContainer);

		// Input box
		this.inputBox = this._register(new InputBox(this.inputContainer, undefined, {
			placeholder: localize('aiChat.inputPlaceholder', 'Ask AI anything...'),
			ariaLabel: localize('aiChat.inputAriaLabel', 'AI Chat Input')
		}));
		this._register(attachInputBoxStyler(this.inputBox, this.themeService));

		// Send button
		const buttonContainer = $('.input-button-container');
		this.inputContainer.appendChild(buttonContainer);
		
		this.sendButton = this._register(new Button(buttonContainer, { title: localize('aiChat.send', 'Send Message') }));
		this.sendButton.label = '$(send)';
		this._register(attachButtonStyler(this.sendButton, this.themeService));

		// Event handlers
		this._register(this.inputBox.onDidChange(() => {
			this.sendButton.enabled = !this.isProcessing && !!this.inputBox.value.trim();
		}));

		this._register(this.inputBox.onEnterPressed(() => {
			if (this.sendButton.enabled) {
				this.sendMessage();
			}
		}));

		this._register(this.sendButton.onDidClick(() => this.sendMessage()));
	}

	private updateProviderSelect(): void {
		if (!this.providerSelect) return;

		const providers = this.aiService.getAvailableProviders();
		const currentConfig = this.aiService.getConfiguration();

		// Clear existing options
		this.providerSelect.innerHTML = '';

		// Add provider options
		providers.forEach(provider => {
			const option = document.createElement('option');
			option.value = provider.id;
			option.textContent = provider.name;
			if (provider.id === currentConfig.provider) {
				option.selected = true;
			}
			this.providerSelect.appendChild(option);
		});
	}

	private async sendMessage(): Promise<void> {
		const message = this.inputBox.value.trim();
		if (!message || this.isProcessing) return;

		if (!this.aiService.isReady()) {
			this.notificationService.warn(localize('aiChat.notConfigured', 'AI service is not configured. Please set up your API key in settings.'));
			return;
		}

		this.isProcessing = true;
		this.updateInputState();

		// Add user message
		const userMessage: IAIMessage = {
			role: 'user',
			content: message,
			timestamp: Date.now()
		};
		this.messages.push(userMessage);
		this.addMessageToUI(userMessage);

		// Clear input
		this.inputBox.value = '';

		try {
			// Send to AI
			const response = await this.aiService.chat(this.messages);
			
			// Add AI response
			const aiMessage: IAIMessage = {
				role: 'assistant',
				content: response.content,
				timestamp: Date.now()
			};
			this.messages.push(aiMessage);
			this.addMessageToUI(aiMessage);

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : localize('aiChat.unknownError', 'Unknown error occurred');
			this.notificationService.error(localize('aiChat.error', 'AI Chat Error: {0}', errorMessage));
			
			// Add error message to chat
			const errorMsg: IAIMessage = {
				role: 'assistant',
				content: `Error: ${errorMessage}`,
				timestamp: Date.now()
			};
			this.addMessageToUI(errorMsg);
		} finally {
			this.isProcessing = false;
			this.updateInputState();
		}
	}

	private addMessageToUI(message: IAIMessage): void {
		const messageElement = $('.ai-chat-message');
		messageElement.classList.add(`ai-chat-message-${message.role}`);

		const avatar = $('.ai-chat-avatar');
		avatar.textContent = message.role === 'user' ? '👤' : '🤖';
		messageElement.appendChild(avatar);

		const contentContainer = $('.ai-chat-message-content');
		messageElement.appendChild(contentContainer);

		const header = $('.ai-chat-message-header');
		const sender = $('.ai-chat-message-sender');
		sender.textContent = message.role === 'user' ? localize('aiChat.you', 'You') : localize('aiChat.ai', 'AI');
		header.appendChild(sender);

		if (message.timestamp) {
			const timestamp = $('.ai-chat-message-timestamp');
			timestamp.textContent = new Date(message.timestamp).toLocaleTimeString();
			header.appendChild(timestamp);
		}
		contentContainer.appendChild(header);

		const content = $('.ai-chat-message-text');
		
		// Render markdown for AI messages
		if (message.role === 'assistant') {
			const markdownContent = renderMarkdown(new MarkdownString(message.content), {
				inline: false
			});
			content.appendChild(markdownContent.element);
		} else {
			content.textContent = message.content;
		}
		
		contentContainer.appendChild(content);
		this.messagesContainer.appendChild(messageElement);

		// Scroll to bottom
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}

	private updateInputState(): void {
		this.inputBox.setEnabled(!this.isProcessing);
		this.sendButton.enabled = !this.isProcessing && !!this.inputBox.value.trim();
		
		if (this.isProcessing) {
			this.sendButton.label = '$(loading~spin)';
		} else {
			this.sendButton.label = '$(send)';
		}
	}

	private clearChat(): void {
		this.messages = [];
		this.messagesContainer.innerHTML = '';
	}

	public addUserMessage(message: string): void {
		if (this.isProcessing) return;
		
		this.inputBox.value = message;
		this.sendMessage();
	}

	override focus(): void {
		super.focus();
		this.inputBox.focus();
	}
}