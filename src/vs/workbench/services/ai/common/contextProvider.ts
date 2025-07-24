/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICodeContext } from 'vs/workbench/services/ai/common/aiService';
import { URI } from 'vs/base/common/uri';

export const IContextProviderService = createDecorator<IContextProviderService>('contextProviderService');

export interface IContextItem {
	type: 'file' | 'selection' | 'workspace' | 'git' | 'symbol' | 'error' | 'terminal' | 'search';
	content: string;
	metadata: {
		path?: string;
		language?: string;
		lineRange?: { start: number; end: number };
		relevance?: number;
		timestamp?: number;
	};
}

export interface IRAGDocument {
	id: string;
	content: string;
	metadata: {
		path: string;
		language: string;
		lastModified: number;
		size: number;
		type: 'code' | 'documentation' | 'config' | 'test';
	};
	embedding?: number[];
	chunks?: IRAGChunk[];
}

export interface IRAGChunk {
	id: string;
	content: string;
	startLine: number;
	endLine: number;
	embedding?: number[];
	relevanceScore?: number;
}

export interface IContextProviderService {
	readonly _serviceBrand: undefined;

	// Context Extraction
	extractContext(uri?: URI, includeSelection?: boolean): Promise<ICodeContext>;
	getActiveFileContext(): Promise<IContextItem | undefined>;
	getSelectionContext(): Promise<IContextItem | undefined>;
	getWorkspaceContext(): Promise<IContextItem[]>;
	getGitContext(): Promise<IContextItem[]>;
	getSymbolContext(query: string): Promise<IContextItem[]>;
	getErrorContext(): Promise<IContextItem[]>;
	getTerminalContext(): Promise<IContextItem | undefined>;

	// RAG Support
	indexWorkspace(): Promise<void>;
	searchSimilar(query: string, limit?: number): Promise<IRAGDocument[]>;
	getDocumentChunks(documentId: string): Promise<IRAGChunk[]>;
	updateDocumentIndex(uri: URI): Promise<void>;
	removeFromIndex(uri: URI): Promise<void>;

	// Context Formatting
	formatContextForModel(context: ICodeContext, maxTokens?: number): string;
	formatContextItems(items: IContextItem[], maxTokens?: number): string;

	// Context Optimization
	rankContextItems(items: IContextItem[], query: string): IContextItem[];
	truncateContext(context: string, maxTokens: number): string;

	// Embeddings
	generateEmbedding(text: string): Promise<number[]>;
	calculateSimilarity(embedding1: number[], embedding2: number[]): number;

	// Context Caching
	getCachedContext(key: string): ICodeContext | undefined;
	setCachedContext(key: string, context: ICodeContext, ttl?: number): void;
	clearContextCache(): void;
}
