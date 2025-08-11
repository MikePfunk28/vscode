import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { RAGPipeline } from './ragPipeline';

export interface ContextWindow {
    id: string;
    content: string;
    type: 'file' | 'code' | 'conversation' | 'documentation';
    metadata: {
        timestamp: number;
        relevanceScore?: number;
        filePath?: string;
        language?: string;
        startLine?: number;
        endLine?: number;
        [key: string]: any;
    };
}

export class AppleContextWindow {
    private windows: ContextWindow[] = [];
    private maxWindows: number = 8;
    private interleavingEnabled: boolean = true;
    private ragPipeline?: RAGPipeline;
    private currentProject?: string;
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}
    
    async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('mike-ai');
        this.maxWindows = config.get('contextWindow.maxWindows', 8);
        this.interleavingEnabled = config.get('contextWindow.interleaving', true);
        
        // Load saved context windows
        const savedWindows = this.context.workspaceState.get<ContextWindow[]>('context-windows', []);
        this.windows = savedWindows.slice(-this.maxWindows); // Keep only recent ones
        
        this.logger.info(`Apple Context Window initialized with ${this.windows.length} windows`);
    }
    
    setRAGPipeline(ragPipeline: RAGPipeline): void {
        this.ragPipeline = ragPipeline;
    }
    
    setProject(projectPath: string): void {
        this.currentProject = projectPath;
        this.logger.info(`Context set to project: ${projectPath}`);
    }
    
    async addContextWindow(
        content: string, 
        type: ContextWindow['type'], 
        metadata: Partial<ContextWindow['metadata']> = {}
    ): Promise<string> {
        const windowId = `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Calculate relevance score
        const relevanceScore = await this.calculateRelevanceScore(content, type);
        
        const contextWindow: ContextWindow = {
            id: windowId,
            content: content.length > 2000 ? content.substring(0, 2000) + '...' : content,
            type,
            metadata: {
                timestamp: Date.now(),
                relevanceScore,
                ...metadata
            }
        };
        
        this.windows.push(contextWindow);
        
        // Manage window count
        if (this.windows.length > this.maxWindows) {
            // Remove least relevant or oldest windows
            await this.optimizeWindows();
        }
        
        // Save to workspace state
        await this.saveWindowsState();
        
        this.logger.debug(`Added context window: ${type} (${content.length} chars)`);
        return windowId;
    }
    
    private async calculateRelevanceScore(content: string, type: ContextWindow['type']): Promise<number> {
        let score = 0.5; // Base score
        
        // Type-based scoring
        switch (type) {
            case 'file':
                score += 0.2;
                break;
            case 'code':
                score += 0.3;
                break;
            case 'conversation':
                score += 0.1;
                break;
            case 'documentation':
                score += 0.15;
                break;
        }
        
        // Content-based scoring
        if (content.includes('function') || content.includes('class') || content.includes('interface')) {
            score += 0.2;
        }
        
        if (content.includes('TODO') || content.includes('FIXME') || content.includes('BUG')) {
            score += 0.15;
        }
        
        // Current editor context
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && content.includes(activeEditor.document.languageId)) {
            score += 0.1;
        }
        
        // Use RAG for semantic relevance if available
        if (this.ragPipeline) {
            try {
                const currentContext = this.getCurrentWorkingContext();
                if (currentContext) {
                    const semanticScore = await this.ragPipeline.calculateSimilarity(content, currentContext);
                    score += semanticScore * 0.3;
                }
            } catch (error) {
                this.logger.warn('Failed to calculate semantic relevance');
            }
        }
        
        return Math.min(1.0, score);
    }
    
    private getCurrentWorkingContext(): string {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return '';
        
        const selection = activeEditor.selection;
        if (!selection.isEmpty) {
            return activeEditor.document.getText(selection);
        }
        
        // Return current line context
        const currentLine = activeEditor.selection.active.line;
        const startLine = Math.max(0, currentLine - 5);
        const endLine = Math.min(activeEditor.document.lineCount - 1, currentLine + 5);
        const range = new vscode.Range(startLine, 0, endLine, 0);
        
        return activeEditor.document.getText(range);
    }
    
    private async optimizeWindows(): Promise<void> {
        if (this.windows.length <= this.maxWindows) return;
        
        if (this.interleavingEnabled) {
            // Apple-style interleaving: keep diverse, relevant windows
            await this.performInterleaving();
        } else {
            // Simple approach: keep most recent
            this.windows = this.windows.slice(-this.maxWindows);
        }
    }
    
    private async performInterleaving(): Promise<void> {
        // Group by type
        const groups = new Map<string, ContextWindow[]>();
        this.windows.forEach(window => {
            const key = window.type;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(window);
        });
        
        // Sort each group by relevance and recency
        groups.forEach(group => {
            group.sort((a, b) => {
                const relevanceDiff = (b.metadata.relevanceScore || 0) - (a.metadata.relevanceScore || 0);
                if (Math.abs(relevanceDiff) > 0.1) return relevanceDiff;
                return b.metadata.timestamp - a.metadata.timestamp;
            });
        });
        
        // Interleave to maintain diversity
        const optimized: ContextWindow[] = [];
        const maxPerType = Math.ceil(this.maxWindows / groups.size);
        
        groups.forEach(group => {
            optimized.push(...group.slice(0, maxPerType));
        });
        
        // If still over limit, keep highest relevance scores
        if (optimized.length > this.maxWindows) {
            optimized.sort((a, b) => (b.metadata.relevanceScore || 0) - (a.metadata.relevanceScore || 0));
            this.windows = optimized.slice(0, this.maxWindows);
        } else {
            this.windows = optimized;
        }
    }
    
    getContextWindows(type?: ContextWindow['type']): ContextWindow[] {
        if (type) {
            return this.windows.filter(w => w.type === type);
        }
        return [...this.windows];
    }
    
    getRelevantContext(query: string, maxWindows: number = 5): ContextWindow[] {
        // Score windows based on query relevance
        const scored = this.windows.map(window => ({
            window,
            score: this.calculateQueryRelevance(window, query)
        }));
        
        // Sort by score and return top windows
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, maxWindows).map(item => item.window);
    }
    
    private calculateQueryRelevance(window: ContextWindow, query: string): number {
        let score = window.metadata.relevanceScore || 0.5;
        
        // Simple keyword matching
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentWords = window.content.toLowerCase().split(/\s+/);
        
        const matches = queryWords.filter(word => 
            contentWords.some(contentWord => contentWord.includes(word))
        ).length;
        
        score += (matches / queryWords.length) * 0.5;
        
        // Boost recent windows slightly
        const ageBonus = Math.max(0, 0.1 - (Date.now() - window.metadata.timestamp) / (1000 * 60 * 60 * 24));
        score += ageBonus;
        
        return score;
    }
    
    async removeContextWindow(id: string): Promise<boolean> {
        const initialLength = this.windows.length;
        this.windows = this.windows.filter(w => w.id !== id);
        
        if (this.windows.length < initialLength) {
            await this.saveWindowsState();
            return true;
        }
        return false;
    }
    
    async clearContextWindows(type?: ContextWindow['type']): Promise<void> {
        if (type) {
            this.windows = this.windows.filter(w => w.type !== type);
        } else {
            this.windows = [];
        }
        
        await this.saveWindowsState();
        this.logger.info(`Cleared context windows${type ? ` of type ${type}` : ''}`);
    }
    
    private async saveWindowsState(): Promise<void> {
        await this.context.workspaceState.update('context-windows', this.windows);
    }
    
    async cleanup(): Promise<void> {
        await this.saveWindowsState();
        this.logger.info('Apple Context Window cleaned up');
    }
    
    getMetrics(): any {
        const typeDistribution = new Map<string, number>();
        this.windows.forEach(w => {
            typeDistribution.set(w.type, (typeDistribution.get(w.type) || 0) + 1);
        });
        
        const avgRelevance = this.windows.reduce((sum, w) => sum + (w.metadata.relevanceScore || 0), 0) / this.windows.length;
        
        return {
            totalWindows: this.windows.length,
            maxWindows: this.maxWindows,
            interleavingEnabled: this.interleavingEnabled,
            averageRelevanceScore: avgRelevance || 0,
            typeDistribution: Object.fromEntries(typeDistribution),
            oldestWindow: this.windows.length > 0 ? Math.min(...this.windows.map(w => w.metadata.timestamp)) : null,
            newestWindow: this.windows.length > 0 ? Math.max(...this.windows.map(w => w.metadata.timestamp)) : null
        };
    }
}