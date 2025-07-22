/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITextModel } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { InlineCompletion, InlineCompletionContext, InlineCompletionProvider } from 'vs/editor/common/languages';
import { IAIService } from 'vs/workbench/contrib/ai/common/aiService';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class AIInlineCompletionProvider extends Disposable implements InlineCompletionProvider {
	private static readonly COMPLETION_DELAY = 500; // ms
	private static readonly MIN_PREFIX_LENGTH = 3;
	private static readonly MAX_COMPLETION_LENGTH = 200;
	
	private lastCompletionPosition: Position | null = null;
	private lastCompletionTime = 0;
	private debounceTimer: NodeJS.Timeout | null = null;

	constructor(
		@IAIService private readonly aiService: IAIService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	async provideInlineCompletions(
		model: ITextModel,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken
	): Promise<{ items: InlineCompletion[] } | null> {
		// Check if AI completion is enabled
		const isEnabled = this.configurationService.getValue<boolean>('ai.inlineCompletions.enabled') ?? true;
		if (!isEnabled) {
			return null;
		}

		// Check if AI service is ready
		if (!this.aiService.isReady()) {
			return null;
		}

		// Get current line and context
		const currentLine = model.getLineContent(position.lineNumber);
		const prefixOnLine = currentLine.substring(0, position.column - 1);
		
		// Skip if prefix too short or just whitespace
		if (prefixOnLine.trim().length < AIInlineCompletionProvider.MIN_PREFIX_LENGTH) {
			return null;
		}

		// Skip if we just provided a completion at the same position
		if (this.lastCompletionPosition?.equals(position) && 
			Date.now() - this.lastCompletionTime < 2000) {
			return null;
		}

		// Debounce rapid requests
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		return new Promise((resolve) => {
			this.debounceTimer = setTimeout(async () => {
				try {
					const completion = await this.getAICompletion(model, position, token);
					if (completion && !token.isCancellationRequested) {
						this.lastCompletionPosition = position;
						this.lastCompletionTime = Date.now();
						resolve({
							items: [{
								insertText: completion,
								range: new Range(
									position.lineNumber, 
									position.column, 
									position.lineNumber, 
									position.column
								),
								command: {
									id: 'ai.acceptInlineCompletion',
									title: 'Accept AI Suggestion'
								}
							}]
						});
					} else {
						resolve(null);
					}
				} catch (error) {
					this.logService.error('AI Inline Completion error:', error);
					resolve(null);
				}
			}, AIInlineCompletionProvider.COMPLETION_DELAY);
		});
	}

	private async getAICompletion(
		model: ITextModel,
		position: Position,
		token: CancellationToken
	): Promise<string | null> {
		const languageId = model.getLanguageId();
		const fileName = model.uri.path;
		
		// Get context around the cursor
		const contextRange = this.getContextRange(model, position);
		const contextText = model.getValueInRange(contextRange);
		const cursorOffset = this.getCursorOffsetInContext(contextRange, position);
		
		// Build completion prompt
		const prompt = this.buildCompletionPrompt(contextText, cursorOffset, languageId, fileName);
		
		try {
			const completion = await this.aiService.getCodeCompletion(prompt, languageId);
			
			if (token.isCancellationRequested) {
				return null;
			}

			return this.processCompletion(completion);
		} catch (error) {
			this.logService.error('AI completion request failed:', error);
			return null;
		}
	}

	private getContextRange(model: ITextModel, position: Position): Range {
		const startLine = Math.max(1, position.lineNumber - 10);
		const endLine = Math.min(model.getLineCount(), position.lineNumber + 5);
		
		return new Range(
			startLine, 1,
			endLine, model.getLineMaxColumn(endLine)
		);
	}

	private getCursorOffsetInContext(contextRange: Range, position: Position): number {
		let offset = 0;
		
		// Calculate character offset from start of context to cursor
		for (let line = contextRange.startLineNumber; line < position.lineNumber; line++) {
			offset += contextRange.endColumn - 1 + 1; // +1 for newline
		}
		
		offset += position.column - contextRange.startColumn;
		return offset;
	}

	private buildCompletionPrompt(
		contextText: string,
		cursorOffset: number,
		languageId: string,
		fileName: string
	): string {
		const beforeCursor = contextText.substring(0, cursorOffset);
		const afterCursor = contextText.substring(cursorOffset);
		
		// Analyze the context to provide better completions
		const completionType = this.analyzeCompletionContext(beforeCursor, languageId);
		
		let prompt = `You are an AI coding assistant providing intelligent code completions.

Language: ${languageId}
File: ${fileName}
Context: ${completionType.description}

Code before cursor:
\`\`\`${languageId}
${beforeCursor}
\`\`\`

Code after cursor:
\`\`\`${languageId}
${afterCursor}
\`\`\`

Provide a natural completion that fits the context. ${completionType.instructions}

Rules:
- Only provide the completion text, no explanations
- Keep completions concise and relevant
- Match the existing code style and patterns
- Consider the context and intent
- Maximum ${AIInlineCompletionProvider.MAX_COMPLETION_LENGTH} characters

Completion:`;

		return prompt;
	}

	private analyzeCompletionContext(
		beforeCursor: string,
		languageId: string
	): { description: string; instructions: string } {
		const lastLine = beforeCursor.split('\n').slice(-1)[0];
		const trimmedLine = lastLine.trim();
		
		// Function definition
		if (trimmedLine.match(/^(function|def|async\s+function|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=)/)) {
			return {
				description: 'Function definition context',
				instructions: 'Complete the function signature or body appropriately.'
			};
		}
		
		// Class definition
		if (trimmedLine.match(/^(class|interface|type)\s+/)) {
			return {
				description: 'Type definition context',
				instructions: 'Complete the class, interface, or type definition.'
			};
		}
		
		// Import/require statement
		if (trimmedLine.match(/^(import|from|require|include)/)) {
			return {
				description: 'Import statement context',
				instructions: 'Complete the import or require statement with appropriate module names.'
			};
		}
		
		// Comment
		if (trimmedLine.match(/^\s*(\/\/|\/\*|\*|#|<!--)/)) {
			return {
				description: 'Comment context',
				instructions: 'Complete the comment in a helpful and descriptive way.'
			};
		}
		
		// Conditional statement
		if (trimmedLine.match(/^(if|else|elif|switch|case)\s*\(/)) {
			return {
				description: 'Conditional logic context',
				instructions: 'Complete the conditional statement and appropriate logic blocks.'
			};
		}
		
		// Loop
		if (trimmedLine.match(/^(for|while|foreach|do)\s*\(/)) {
			return {
				description: 'Loop context',
				instructions: 'Complete the loop construct with appropriate iteration logic.'
			};
		}
		
		// Object/array literal
		if (trimmedLine.match(/[\{\[][\s\w]*$/)) {
			return {
				description: 'Object or array literal context',
				instructions: 'Complete the object properties or array elements appropriately.'
			};
		}
		
		// Method call
		if (trimmedLine.match(/\.\w*$/)) {
			return {
				description: 'Method call context',
				instructions: 'Complete with an appropriate method or property name.'
			};
		}
		
		return {
			description: 'General code context',
			instructions: 'Provide a logical completion based on the surrounding code context.'
		};
	}

	private processCompletion(rawCompletion: string | null): string | null {
		if (!rawCompletion) {
			return null;
		}
		
		let processed = rawCompletion.trim();
		
		// Remove markdown code blocks if present
		processed = processed.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
		
		// Remove common prefixes that the AI might include
		processed = processed.replace(/^(Completion:|Here's the completion:|The completion is:)\s*/i, '');
		
		// Limit length
		if (processed.length > AIInlineCompletionProvider.MAX_COMPLETION_LENGTH) {
			// Try to cut at a natural boundary
			const cutPoint = processed.lastIndexOf('\n', AIInlineCompletionProvider.MAX_COMPLETION_LENGTH) ||
				processed.lastIndexOf(' ', AIInlineCompletionProvider.MAX_COMPLETION_LENGTH) ||
				processed.lastIndexOf(';', AIInlineCompletionProvider.MAX_COMPLETION_LENGTH) ||
				processed.lastIndexOf(',', AIInlineCompletionProvider.MAX_COMPLETION_LENGTH);
			
			if (cutPoint > 0) {
				processed = processed.substring(0, cutPoint);
			} else {
				processed = processed.substring(0, AIInlineCompletionProvider.MAX_COMPLETION_LENGTH);
			}
		}
		
		// Ensure we don't start with whitespace unless it's indentation
		if (processed.startsWith(' ') && !processed.startsWith('  ')) {
			processed = processed.trimStart();
		}
		
		return processed || null;
	}

	override dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		super.dispose();
	}
}