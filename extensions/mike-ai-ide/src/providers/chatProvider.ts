import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from '../services/aiModelManager';
import { AppleContextWindow } from '../services/appleContextWindow';
import { DarwinGodelMachine } from '../services/darwinGodelMachine';

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export class ChatProvider implements vscode.TreeDataProvider<ChatMessage> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ChatMessage | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private messages: ChatMessage[] = [];
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private aiModelManager: AIModelManager,
        private appleContextWindow: AppleContextWindow,
        private darwinGodelMachine: DarwinGodelMachine
    ) {
        // Load chat history
        this.loadChatHistory();
    }
    
    getTreeItem(element: ChatMessage): vscode.TreeItem {
        const item = new vscode.TreeItem(
            element.role === 'user' ? `You: ${element.content.substring(0, 50)}...` : `AI: ${element.content.substring(0, 50)}...`,
            vscode.TreeItemCollapsibleState.None
        );
        
        item.tooltip = element.content;
        item.iconPath = element.role === 'user' 
            ? new vscode.ThemeIcon('person') 
            : new vscode.ThemeIcon('robot');
        
        return item;
    }
    
    getChildren(element?: ChatMessage): Thenable<ChatMessage[]> {
        if (!element) {
            return Promise.resolve(this.messages.slice(-20)); // Show last 20 messages
        }
        return Promise.resolve([]);
    }
    
    async addUserMessage(content: string): Promise<void> {
        const userMessage: ChatMessage = {
            id: `msg_${Date.now()}_user`,
            role: 'user',
            content,
            timestamp: Date.now()
        };
        
        this.messages.push(userMessage);
        await this.saveChatHistory();
        this.refresh();
        
        // Generate AI response
        await this.generateAIResponse(content);
    }
    
    private async generateAIResponse(userMessage: string): Promise<void> {
        try {
            // Get relevant context
            const context = this.appleContextWindow.getRelevantContext(userMessage, 3);
            const contextText = context.map(w => `${w.type}: ${w.content}`).join('\n\n');
            
            // Build conversation prompt
            const conversationHistory = this.messages
                .slice(-10) // Last 10 messages for context
                .map(msg => `${msg.role}: ${msg.content}`)
                .join('\n');
            
            const prompt = `You are a helpful AI coding assistant. You have access to the following context about the current project:

Context:
${contextText}

Recent conversation:
${conversationHistory}

User: ${userMessage}

Please provide a helpful response:`;
            
            // Get AI models
            const models = this.aiModelManager.getModels();
            const primaryModel = models.find(m => m.type === 'lmstudio') || models[0];
            
            if (!primaryModel) {
                throw new Error('No AI models available');
            }
            
            const response = await this.aiModelManager.generateCompletion(
                primaryModel.id,
                prompt,
                {
                    temperature: 0.7,
                    max_tokens: 500
                }
            );
            
            // Add AI response
            const aiMessage: ChatMessage = {
                id: `msg_${Date.now()}_ai`,
                role: 'assistant',
                content: response.trim(),
                timestamp: Date.now()
            };
            
            this.messages.push(aiMessage);
            await this.saveChatHistory();
            this.refresh();
            
            // Learn from the interaction
            await this.darwinGodelMachine.learn(
                'chat_interaction',
                { userMessage, context: contextText },
                { type: 'success', score: 0.8 }
            );
            
        } catch (error) {
            this.logger.error('Failed to generate AI response', error as Error);
            
            const errorMessage: ChatMessage = {
                id: `msg_${Date.now()}_error`,
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: Date.now()
            };
            
            this.messages.push(errorMessage);
            await this.saveChatHistory();
            this.refresh();
        }
    }
    
    clearChat(): void {
        this.messages = [];
        this.saveChatHistory();
        this.refresh();
    }
    
    private loadChatHistory(): void {
        const saved = this.context.workspaceState.get<ChatMessage[]>('chat-history', []);
        this.messages = saved;
    }
    
    private async saveChatHistory(): Promise<void> {
        // Keep only last 100 messages to prevent storage bloat
        const toSave = this.messages.slice(-100);
        await this.context.workspaceState.update('chat-history', toSave);
    }
    
    private refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}