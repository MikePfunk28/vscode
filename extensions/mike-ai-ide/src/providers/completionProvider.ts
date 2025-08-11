import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from '../services/aiModelManager';
import { AppleContextWindow } from '../services/appleContextWindow';
import { RAGPipeline } from '../services/ragPipeline';

export class CompletionProvider implements vscode.InlineCompletionItemProvider {
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private aiModelManager: AIModelManager,
        private appleContextWindow: AppleContextWindow,
        private ragPipeline: RAGPipeline
    ) {}
    
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
        
        const config = vscode.workspace.getConfiguration('mike-ai');
        if (!config.get('completion.enabled', true)) {
            return undefined;
        }
        
        try {
            // Get current context
            const currentLine = document.lineAt(position.line);
            const textBefore = document.getText(new vscode.Range(
                Math.max(0, position.line - 5),
                0,
                position.line,
                position.character
            ));
            
            // Get relevant context from Apple Context Windows
            const relevantContext = this.appleContextWindow.getRelevantContext(textBefore, 3);
            
            // Generate completion prompt
            const prompt = this.buildCompletionPrompt(
                document.languageId,
                textBefore,
                relevantContext.map(w => w.content).join('\n\n')
            );
            
            // Get completion from AI model
            const models = this.aiModelManager.getModels();
            const primaryModel = models.find(m => m.type === 'lmstudio') || models[0];
            
            if (!primaryModel) {
                return undefined;
            }
            
            const completion = await this.aiModelManager.generateCompletion(
                primaryModel.id,
                prompt,
                {
                    temperature: 0.3,
                    max_tokens: 100
                }
            );
            
            // Process completion
            const processedCompletion = this.processCompletion(completion, currentLine.text, position.character);
            
            if (processedCompletion) {
                return [{
                    insertText: processedCompletion,
                    range: new vscode.Range(position, position)
                }];
            }
            
        } catch (error) {
            this.logger.error('Failed to provide completion', error as Error);
        }
        
        return undefined;
    }
    
    private buildCompletionPrompt(language: string, textBefore: string, contextInfo: string): string {
        return `You are an AI code completion assistant. Complete the following ${language} code.

Context information:
${contextInfo}

Current code:
${textBefore}

Complete the code naturally. Return only the completion text, no explanations:`;
    }
    
    private processCompletion(rawCompletion: string, currentLineText: string, cursorPosition: number): string | undefined {
        if (!rawCompletion || rawCompletion.trim().length === 0) {
            return undefined;
        }
        
        // Clean the completion
        let completion = rawCompletion
            .split('\n')[0] // Take only first line
            .trim();
        
        // Remove any duplicate text that might already exist
        const textAfterCursor = currentLineText.substring(cursorPosition);
        if (completion.includes(textAfterCursor)) {
            completion = completion.replace(textAfterCursor, '');
        }
        
        // Ensure it doesn't duplicate what's already typed
        const textBeforeCursor = currentLineText.substring(0, cursorPosition);
        if (completion.startsWith(textBeforeCursor)) {
            completion = completion.substring(textBeforeCursor.length);
        }
        
        return completion.length > 0 ? completion : undefined;
    }
}