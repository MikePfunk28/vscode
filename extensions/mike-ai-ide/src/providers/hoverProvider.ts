import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from '../services/aiModelManager';
import { RAGPipeline } from '../services/ragPipeline';

export class HoverProvider implements vscode.HoverProvider {
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private aiModelManager: AIModelManager,
        private ragPipeline: RAGPipeline
    ) {}
    
    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        
        const config = vscode.workspace.getConfiguration('mike-ai');
        if (!config.get('hover.enabled', false)) {
            return undefined;
        }
        
        const range = document.getWordRangeAtPosition(position);
        if (!range) return undefined;
        
        const word = document.getText(range);
        if (word.length < 3) return undefined;
        
        try {
            // Search for relevant documentation
            const docs = await this.ragPipeline.search(word, 3);
            if (docs.length === 0) return undefined;
            
            const relevantContent = docs.map(doc => doc.content.substring(0, 200)).join('\n\n');
            
            return new vscode.Hover(
                new vscode.MarkdownString(`**AI Context:** ${word}\n\n${relevantContent}`)
            );
            
        } catch (error) {
            this.logger.warn('Failed to provide hover information');
            return undefined;
        }
    }
}