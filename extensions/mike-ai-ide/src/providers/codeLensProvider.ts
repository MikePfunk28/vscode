import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from '../services/aiModelManager';
import { DarwinGodelMachine } from '../services/darwinGodelMachine';

export class CodeLensProvider implements vscode.CodeLensProvider {
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private aiModelManager: AIModelManager,
        private darwinGodelMachine: DarwinGodelMachine
    ) {}
    
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        
        // Add code lens for functions
        const text = document.getText();
        const functionRegex = /(function\s+\w+|const\s+\w+\s*=\s*\([^)]*\)\s*=>|class\s+\w+)/g;
        let match;
        
        while ((match = functionRegex.exec(text)) !== null) {
            const line = document.positionAt(match.index).line;
            const range = new vscode.Range(line, 0, line, 0);
            
            codeLenses.push(new vscode.CodeLens(range, {
                title: "🤖 AI Explain",
                command: "mike-ai.explainCode",
                arguments: [document, range]
            }));
            
            codeLenses.push(new vscode.CodeLens(range, {
                title: "🧪 Generate Tests",
                command: "mike-ai.generateTests",
                arguments: [document, range]
            }));
        }
        
        return codeLenses;
    }
}