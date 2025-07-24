/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { CancellationToken } from 'vs/base/common/cancellation';

export const IAIService = createDecorator<IAIService>('aiService');

export interface ICodeContext {
	activeFile?: string;
	selectedText?: string;
	cursorPosition?: { line: number; column: number };
	openFiles?: string[];
	workspaceInfo?: {
		rootPath?: string;
		language?: string;
		framework?: string;
	};
	gitInfo?: {
		branch?: string;
		recentCommits?: string[];
	};
}

export interface ICompletionItem {
	text: string;
	insertText: string;
	range?: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
	kind: CompletionItemKind;
	detail?: string;
	documentation?: string;
	confidence: number;
}

export enum CompletionItemKind {
	Text = 1,
	Method = 2,
	Function = 3,
	Constructor = 4,
	Field = 5,
	Variable = 6,
	Class = 7,
	Interface = 8,
	Module = 9,
	Property = 10,
	Unit = 11,
	Value = 12,
	Enum = 13,
	Keyword = 14,
	Snippet = 15,
	Color = 16,
	File = 17,
	Reference = 18,
	Folder = 19,
	EnumMember = 20,
	Constant = 21,
	Struct = 22,
	Event = 23,
	Operator = 24,
	TypeParameter = 25
}

export interface IAIResponse {
	content: string;
	reasoning?: string; // For Chain of Thought
	confidence: number;
	sources?: string[]; // For RAG
	actions?: IAIAction[]; // For ReAct
	metadata?: {
		model: string;
		tokens: number;
		processingTime: number;
	};
}

export interface IAIAction {
	type: 'search' | 'code_analysis' | 'file_read' | 'web_search' | 'tool_call';
	description: string;
	parameters: Record<string, any>;
	result?: any;
}

export interface IAIMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	context?: ICodeContext;
	timestamp: number;
	reasoning?: string;
	actions?: IAIAction[];
}

export interface IAIConversation {
	id: string;
	messages: IAIMessage[];
	modelId: string;
	createdAt: number;
	updatedAt: number;
}

export interface IAICapabilities {
	chat: boolean;
	codeCompletion: boolean;
	codeRefactoring: boolean;
	codeAnalysis: boolean;
	chainOfThought: boolean;
	react: boolean;
	rag: boolean;
	streaming: boolean;
	contextWindow: number;
}

export interface IAIError {
	code: string;
	message: string;
	details?: any;
	retryable: boolean;
}

export interface IAIService {
	readonly _serviceBrand: undefined;

	// Events
	readonly onDidChangeActiveModel: Event<string>;
	readonly onDidReceiveResponse: Event<IAIResponse>;
	readonly onDidError: Event<IAIError>;

	// Core AI Operations
	sendChatMessage(message: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse>;
	sendChatMessageStream(message: string, context?: ICodeContext, token?: CancellationToken): AsyncIterable<string>;

	getCodeCompletion(position: { line: number; column: number }, context: string, token?: CancellationToken): Promise<ICompletionItem[]>;
	refactorCode(code: string, instruction: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse>;
	analyzeCode(code: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse>;

	// Modern AI Capabilities
	chainOfThought(query: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse>;
	reactAgent(task: string, context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse>;
	ragQuery(query: string, sources?: string[], context?: ICodeContext, token?: CancellationToken): Promise<IAIResponse>;

	// Model Management
	switchModel(modelId: string): Promise<void>;
	getActiveModel(): string | undefined;
	getAvailableModels(): Promise<{ id: string; name: string }[]>;
	getModelCapabilities(modelId: string): Promise<IAICapabilities>;

	// Conversation Management
	createConversation(): string;
	getConversation(id: string): IAIConversation | undefined;
	deleteConversation(id: string): void;
	getConversations(): IAIConversation[];

	// Context Management
	updateContext(context: ICodeContext): void;
	getContext(): ICodeContext | undefined;

	// Service Management
	isAvailable(): boolean;
	dispose(): void;
}

export interface IAIServiceProvider extends IDisposable {
	readonly id: string;
	readonly name: string;
	readonly capabilities: IAICapabilities;

	sendRequest(messages: IAIMessage[], token?: CancellationToken): Promise<IAIResponse>;
	sendStreamRequest(messages: IAIMessage[], token?: CancellationToken): AsyncIterable<string>;

	isHealthy(): Promise<boolean>;
	getModels(): Promise<string[]>;
}
