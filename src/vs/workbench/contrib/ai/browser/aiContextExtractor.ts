/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Position } from '../../../../editor/common/core/position.js';
import { ICodeContext } from '../../../services/ai/common/aiService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';

export interface IExtractedContext extends ICodeContext {
	surroundingCode?: string;
	fileContent?: string;
	projectStructure?: string[];
	recentChanges?: string;
}

export class AIContextExtractor extends Disposable {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService
	) {
		super();
	}

	public async extractCurrentContext(): Promise<IExtractedContext | undefined> {
		const activeEditor = this.editorService.activeTextEditorControl;
		if (!activeEditor) {
			return this._getWorkspaceOnlyContext();
		}

		const model = activeEditor.getModel() as ITextModel;
		if (!model) {
			return this._getWorkspaceOnlyContext();
		}

		const selection = activeEditor.getSelection();
		const position = activeEditor.getPosition();

		const context: IExtractedContext = {
			activeFile: model.uri.toString(),
			cursorPosition: position ? { line: position.lineNumber, column: position.column } : undefined,
			workspaceInfo: this._getWorkspaceInfo(),
			openFiles: this._getOpenFiles(),
			fileContent: model.getValue(),
			surroundingCode: this._getSurroundingCode(model, position),
			projectStructure: await this._getProjectStructure()
		};

		// Add selected text if there's a selection
		if (selection && !selection.isEmpty()) {
			context.selectedText = model.getValueInRange(selection);
		}

		return context;
	}

	public async extractContextForFile(fileUri: URI): Promise<IExtractedContext | undefined> {
		try {
			const fileContent = await this.fileService.readFile(fileUri);
			const content = fileContent.value.toString();

			return {
				activeFile: fileUri.toString(),
				workspaceInfo: this._getWorkspaceInfo(),
				fileContent: content,
				projectStructure: await this._getProjectStructure()
			};
		} catch (error) {
			console.warn('Failed to read file for context:', error);
			return undefined;
		}
	}

	public getContextSummary(context: IExtractedContext): string {
		const parts: string[] = [];

		if (context.activeFile) {
			const fileName = context.activeFile.split('/').pop() || context.activeFile;
			parts.push(`File: ${fileName}`);
		}

		if (context.selectedText) {
			parts.push(`Selected: ${context.selectedText.length} characters`);
		}

		if (context.cursorPosition) {
			parts.push(`Line: ${context.cursorPosition.line}, Column: ${context.cursorPosition.column}`);
		}

		if (context.workspaceInfo?.rootPath) {
			const workspaceName = context.workspaceInfo.rootPath.split('/').pop() || 'Workspace';
			parts.push(`Workspace: ${workspaceName}`);
		}

		return parts.join(' | ');
	}

	private _getWorkspaceOnlyContext(): IExtractedContext {
		return {
			workspaceInfo: this._getWorkspaceInfo(),
			openFiles: this._getOpenFiles()
		};
	}

	private _getWorkspaceInfo() {
		const workspace = this.workspaceContextService.getWorkspace();
		return {
			rootPath: workspace.folders[0]?.uri.toString(),
			language: undefined // Will be set per file
		};
	}

	private _getOpenFiles(): string[] {
		return this.editorService.editors
			.map(editor => editor.resource?.toString())
			.filter(Boolean) as string[];
	}

	private _getSurroundingCode(model: ITextModel, position: Position | null): string | undefined {
		if (!position) {
			return undefined;
		}

		const contextLines = 20; // 10 lines before and after
		const startLine = Math.max(1, position.lineNumber - contextLines / 2);
		const endLine = Math.min(model.getLineCount(), position.lineNumber + contextLines / 2);

		const contextRange = new Range(startLine, 1, endLine, model.getLineMaxColumn(endLine));
		return model.getValueInRange(contextRange);
	}

	private async _getProjectStructure(): Promise<string[]> {
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders.length) {
			return [];
		}

		try {
			const rootFolder = workspace.folders[0].uri;
			const structure: string[] = [];

			// Get top-level files and directories
			const entries = await this.fileService.resolve(rootFolder);
			if (entries.children) {
				for (const child of entries.children) {
					if (child.isDirectory) {
						structure.push(`${child.name}/`);
						// Get one level deep for directories
						try {
							const subEntries = await this.fileService.resolve(child.resource);
							if (subEntries.children) {
								for (const subChild of subEntries.children.slice(0, 5)) { // Limit to 5 items
									structure.push(`  ${subChild.name}${subChild.isDirectory ? '/' : ''}`);
								}
								if (subEntries.children.length > 5) {
									structure.push(`  ... and ${subEntries.children.length - 5} more`);
								}
							}
						} catch {
							// Ignore errors for subdirectories
						}
					} else {
						structure.push(child.name);
					}
				}
			}

			return structure;
		} catch (error) {
			console.warn('Failed to get project structure:', error);
			return [];
		}
	}

	public formatContextForAI(context: IExtractedContext): string {
		const parts: string[] = [];

		if (context.workspaceInfo?.rootPath) {
			parts.push(`## Workspace Context`);
			parts.push(`Root: ${context.workspaceInfo.rootPath}`);
			parts.push('');
		}

		if (context.projectStructure && context.projectStructure.length > 0) {
			parts.push(`## Project Structure`);
			parts.push(context.projectStructure.join('\n'));
			parts.push('');
		}

		if (context.activeFile) {
			parts.push(`## Current File`);
			parts.push(`File: ${context.activeFile}`);

			if (context.cursorPosition) {
				parts.push(`Cursor: Line ${context.cursorPosition.line}, Column ${context.cursorPosition.column}`);
			}
			parts.push('');
		}

		if (context.selectedText) {
			parts.push(`## Selected Code`);
			parts.push('```');
			parts.push(context.selectedText);
			parts.push('```');
			parts.push('');
		}

		if (context.surroundingCode && !context.selectedText) {
			parts.push(`## Surrounding Code Context`);
			parts.push('```');
			parts.push(context.surroundingCode);
			parts.push('```');
			parts.push('');
		}

		if (context.openFiles && context.openFiles.length > 0) {
			parts.push(`## Open Files`);
			context.openFiles.slice(0, 10).forEach(file => {
				const fileName = file.split('/').pop() || file;
				parts.push(`- ${fileName}`);
			});
			if (context.openFiles.length > 10) {
				parts.push(`... and ${context.openFiles.length - 10} more files`);
			}
			parts.push('');
		}

		return parts.join('\n');
	}
}
