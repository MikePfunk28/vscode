import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from '../services/aiModelManager';
import { DarwinGodelMachine } from '../services/darwinGodelMachine';
import { AppleContextWindow } from '../services/appleContextWindow';
import { RAGPipeline } from '../services/ragPipeline';
import { AgentCoordinator } from '../services/agentCoordinator';

export class CommandHandler {
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private aiModelManager: AIModelManager,
        private darwinGodelMachine: DarwinGodelMachine,
        private appleContextWindow: AppleContextWindow,
        private ragPipeline: RAGPipeline,
        private agentCoordinator: AgentCoordinator
    ) {}
    
    async openChat(): Promise<void> {
        const message = await vscode.window.showInputBox({
            prompt: 'What would you like to ask the AI?',
            placeHolder: 'Type your question here...'
        });
        
        if (message) {
            this.logger.info(`User chat message: ${message}`);
            // The chat provider will handle the message
            vscode.window.showInformationMessage(`AI Chat: ${message}`);
        }
    }
    
    async spawnAgent(type?: string): Promise<void> {
        const agentTypes = ['researcher', 'coder', 'reviewer', 'tester', 'planner', 'system-architect'];
        
        const selectedType = type || await vscode.window.showQuickPick(agentTypes, {
            placeHolder: 'Select agent type to spawn'
        });
        
        if (!selectedType) return;
        
        const name = await vscode.window.showInputBox({
            prompt: 'Enter agent name',
            placeHolder: `${selectedType}-agent`
        });
        
        if (!name) return;
        
        const task = await vscode.window.showInputBox({
            prompt: 'Enter task for the agent (optional)',
            placeHolder: 'Describe what the agent should work on...'
        });
        
        const agentId = await this.agentCoordinator.spawnAgent(
            selectedType as any,
            name,
            task
        );
        
        vscode.window.showInformationMessage(`Spawned ${selectedType} agent: ${name}`);
        this.logger.info(`Spawned agent ${agentId}: ${name}`);
    }
    
    async toggleDarwinGodelMachine(): Promise<void> {
        const metrics = this.darwinGodelMachine.getPerformanceMetrics();
        
        if (metrics.isActive) {
            await this.darwinGodelMachine.stop();
            vscode.window.showInformationMessage('Darwin Godel Machine stopped');
        } else {
            await this.darwinGodelMachine.start();
            vscode.window.showInformationMessage('Darwin Godel Machine started');
        }
    }
    
    async openContextViewer(): Promise<void> {
        const contextWindows = this.appleContextWindow.getContextWindows();
        
        if (contextWindows.length === 0) {
            vscode.window.showInformationMessage('No active context windows');
            return;
        }
        
        const items = contextWindows.map(window => ({
            label: `${window.type}: ${window.content.substring(0, 50)}...`,
            description: `Score: ${(window.metadata.relevanceScore || 0).toFixed(2)}`,
            detail: window.content,
            window
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select context window to view'
        });
        
        if (selected) {
            const doc = await vscode.workspace.openTextDocument({
                content: selected.window.content,
                language: selected.window.metadata.language || 'plaintext'
            });
            await vscode.window.showTextDocument(doc);
        }
    }
    
    async searchRAG(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Search knowledge base',
            placeHolder: 'Enter search terms...'
        });
        
        if (!query) return;
        
        const results = await this.ragPipeline.search(query, 10);
        
        if (results.length === 0) {
            vscode.window.showInformationMessage('No results found');
            return;
        }
        
        const items = results.map(doc => ({
            label: doc.metadata.filePath || doc.id,
            description: doc.metadata.type,
            detail: doc.content.substring(0, 100) + '...',
            doc
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select document to open'
        });
        
        if (selected && selected.doc.metadata.filePath) {
            const doc = await vscode.workspace.openTextDocument(selected.doc.metadata.filePath);
            await vscode.window.showTextDocument(doc);
        }
    }
    
    async configureModels(): Promise<void> {
        const models = this.aiModelManager.getModels();
        
        if (models.length === 0) {
            vscode.window.showWarningMessage('No AI models detected. Please configure endpoints in settings.');
            return;
        }
        
        const items = models.map(model => ({
            label: `${model.name} (${model.type})`,
            description: model.isAvailable ? 'Available' : 'Unavailable',
            detail: model.endpoint,
            picked: false
        }));
        
        await vscode.window.showQuickPick(items, {
            placeHolder: 'Available AI Models',
            canPickMany: false
        });
        
        // Open settings
        vscode.commands.executeCommand('workbench.action.openSettings', 'mike-ai');
    }
    
    async showPerformanceMetrics(): Promise<void> {
        const dgmMetrics = this.darwinGodelMachine.getPerformanceMetrics();
        const contextMetrics = this.appleContextWindow.getMetrics();
        const ragMetrics = this.ragPipeline.getMetrics();
        const agentMetrics = this.agentCoordinator.getMetrics();
        
        const report = `# Mike AI IDE Performance Report

## Darwin Godel Machine
- Active: ${dgmMetrics.isActive}
- Learning Entries: ${dgmMetrics.totalLearningEntries}
- Success Rate: ${dgmMetrics.successRate.toFixed(1)}%
- Patterns: ${dgmMetrics.totalPatterns}

## Apple Context Windows
- Total Windows: ${contextMetrics.totalWindows}/${contextMetrics.maxWindows}
- Average Relevance: ${contextMetrics.averageRelevanceScore.toFixed(2)}
- Interleaving: ${contextMetrics.interleavingEnabled}

## RAG Pipeline
- Indexed Documents: ${ragMetrics.totalDocuments}
- Index Terms: ${ragMetrics.totalIndexTerms}
- Average Doc Size: ${Math.round(ragMetrics.averageDocumentSize)} chars

## Agent Coordinator
- Active Agents: ${agentMetrics.totalAgents}
- Average Task Duration: ${agentMetrics.averageTaskDuration}s
`;
        
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    }
    
    async explainCode(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);
        
        if (!text.trim()) {
            vscode.window.showWarningMessage('No code selected');
            return;
        }
        
        try {
            const models = this.aiModelManager.getModels();
            const model = models[0];
            if (!model) {
                vscode.window.showErrorMessage('No AI models available');
                return;
            }
            
            const prompt = `Explain this ${editor.document.languageId} code:\n\n${text}`;
            const explanation = await this.aiModelManager.generateCompletion(model.id, prompt);
            
            vscode.window.showInformationMessage(explanation, 'OK');
            
        } catch (error) {
            this.logger.error('Failed to explain code', error as Error);
            vscode.window.showErrorMessage('Failed to explain code');
        }
    }
    
    async generateTests(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const text = editor.document.getText();
        
        try {
            const models = this.aiModelManager.getModels();
            const model = models[0];
            if (!model) {
                vscode.window.showErrorMessage('No AI models available');
                return;
            }
            
            const prompt = `Generate unit tests for this ${editor.document.languageId} code:\n\n${text}`;
            const tests = await this.aiModelManager.generateCompletion(model.id, prompt);
            
            const doc = await vscode.workspace.openTextDocument({
                content: tests,
                language: editor.document.languageId
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            
        } catch (error) {
            this.logger.error('Failed to generate tests', error as Error);
            vscode.window.showErrorMessage('Failed to generate tests');
        }
    }
    
    async refactorCode(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        
        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        if (!text.trim()) {
            vscode.window.showWarningMessage('No code selected');
            return;
        }
        
        try {
            const models = this.aiModelManager.getModels();
            const model = models[0];
            if (!model) {
                vscode.window.showErrorMessage('No AI models available');
                return;
            }
            
            const prompt = `Refactor this ${editor.document.languageId} code to improve readability and maintainability:\n\n${text}`;
            const refactored = await this.aiModelManager.generateCompletion(model.id, prompt);
            
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, refactored);
            });
            
        } catch (error) {
            this.logger.error('Failed to refactor code', error as Error);
            vscode.window.showErrorMessage('Failed to refactor code');
        }
    }
    
    async optimizeCode(): Promise<void> {
        vscode.window.showInformationMessage('Code optimization feature coming soon!');
    }
    
    async reviewCode(): Promise<void> {
        vscode.window.showInformationMessage('Code review feature coming soon!');
    }
    
    // Internal commands
    async restartServices(): Promise<void> {
        await this.darwinGodelMachine.stop();
        await this.darwinGodelMachine.start();
        await this.aiModelManager.detectModels();
        vscode.window.showInformationMessage('AI services restarted');
    }
    
    showLogs(): void {
        this.logger.show();
    }
    
    async exportData(): Promise<void> {
        vscode.window.showInformationMessage('Data export feature coming soon!');
    }
    
    async importData(): Promise<void> {
        vscode.window.showInformationMessage('Data import feature coming soon!');
    }
}