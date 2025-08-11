import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from './aiModelManager';

export interface LearningData {
    input: any;
    output: any;
    feedback: {
        type: 'success' | 'error' | 'improvement';
        score?: number;
        metadata?: any;
    };
}

export class DarwinGodelMachine {
    private isActive = false;
    private learningHistory: LearningData[] = [];
    private patterns: Map<string, any> = new Map();
    private aiModelManager?: AIModelManager;
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}
    
    async start(): Promise<void> {
        const config = vscode.workspace.getConfiguration('mike-ai');
        if (!config.get('darwinGodelMachine.enabled', true)) {
            return;
        }
        
        this.logger.info('Starting Darwin Godel Machine...');
        this.isActive = true;
        
        // Load previous learning data from context storage
        const savedData = this.context.globalState.get<LearningData[]>('dgm-learning-data', []);
        this.learningHistory = savedData;
        
        const savedPatterns = this.context.globalState.get<any>('dgm-patterns', {});
        this.patterns = new Map(Object.entries(savedPatterns));
        
        this.logger.info(`DGM started with ${this.learningHistory.length} learning entries and ${this.patterns.size} patterns`);
    }
    
    async stop(): Promise<void> {
        if (!this.isActive) return;
        
        this.logger.info('Stopping Darwin Godel Machine...');
        
        // Save learning data to context storage
        await this.context.globalState.update('dgm-learning-data', this.learningHistory);
        await this.context.globalState.update('dgm-patterns', Object.fromEntries(this.patterns));
        
        this.isActive = false;
        this.logger.info('DGM stopped and data saved');
    }
    
    setAIModelManager(aiModelManager: AIModelManager): void {
        this.aiModelManager = aiModelManager;
    }
    
    async learn(taskId: string, input: any, feedback: LearningData['feedback']): Promise<void> {
        if (!this.isActive) return;
        
        const learningEntry: LearningData = {
            input,
            output: null, // Will be filled by the actual system output
            feedback
        };
        
        this.learningHistory.push(learningEntry);
        
        // Analyze patterns
        await this.analyzePatterns(taskId, learningEntry);
        
        // Self-improve based on feedback
        if (feedback.type === 'success' && feedback.score && feedback.score > 0.8) {
            await this.reinforcePattern(taskId, input);
        } else if (feedback.type === 'error') {
            await this.adjustPattern(taskId, input, feedback);
        }
        
        this.logger.debug(`DGM learned from task ${taskId}: ${feedback.type}`);
    }
    
    private async analyzePatterns(taskId: string, learning: LearningData): Promise<void> {
        // Extract patterns from successful operations
        if (learning.feedback.type === 'success') {
            const patternKey = `pattern_${taskId}`;
            const existingPattern = this.patterns.get(patternKey) || {
                successCount: 0,
                failureCount: 0,
                inputExamples: [],
                bestPractices: []
            };
            
            existingPattern.successCount++;
            existingPattern.inputExamples.push(learning.input);
            
            // Keep only recent examples (last 10)
            if (existingPattern.inputExamples.length > 10) {
                existingPattern.inputExamples = existingPattern.inputExamples.slice(-10);
            }
            
            this.patterns.set(patternKey, existingPattern);
        } else if (learning.feedback.type === 'error') {
            const patternKey = `pattern_${taskId}`;
            const existingPattern = this.patterns.get(patternKey) || {
                successCount: 0,
                failureCount: 0,
                inputExamples: [],
                bestPractices: []
            };
            
            existingPattern.failureCount++;
            this.patterns.set(patternKey, existingPattern);
        }
    }
    
    private async reinforcePattern(taskId: string, input: any): Promise<void> {
        // Strengthen successful patterns
        const patternKey = `pattern_${taskId}`;
        const pattern = this.patterns.get(patternKey);
        
        if (pattern && this.aiModelManager) {
            try {
                // Use AI to identify what made this successful
                const analysisPrompt = `Analyze this successful operation and identify key patterns:
                Task: ${taskId}
                Input: ${JSON.stringify(input)}
                Success rate: ${pattern.successCount / (pattern.successCount + pattern.failureCount)}
                
                What patterns can be extracted for future use?`;
                
                const models = this.aiModelManager.getModels();
                if (models.length > 0) {
                    const analysis = await this.aiModelManager.generateCompletion(
                        models[0].id, 
                        analysisPrompt,
                        { temperature: 0.3 }
                    );
                    
                    pattern.bestPractices.push({
                        timestamp: Date.now(),
                        analysis: analysis.substring(0, 500) // Limit size
                    });
                    
                    // Keep only recent best practices
                    if (pattern.bestPractices.length > 5) {
                        pattern.bestPractices = pattern.bestPractices.slice(-5);
                    }
                }
            } catch (error) {
                this.logger.warn('Failed to analyze pattern with AI');
            }
        }
    }
    
    private async adjustPattern(taskId: string, input: any, feedback: LearningData['feedback']): Promise<void> {
        // Learn from errors to avoid them in future
        const errorKey = `error_${taskId}`;
        const errorPattern = this.patterns.get(errorKey) || {
            commonErrors: [],
            avoidanceStrategies: []
        };
        
        errorPattern.commonErrors.push({
            timestamp: Date.now(),
            input,
            error: feedback.metadata?.error || 'Unknown error'
        });
        
        // Keep only recent errors
        if (errorPattern.commonErrors.length > 10) {
            errorPattern.commonErrors = errorPattern.commonErrors.slice(-10);
        }
        
        this.patterns.set(errorKey, errorPattern);
    }
    
    getSuggestions(taskId: string, currentInput: any): string[] {
        const patternKey = `pattern_${taskId}`;
        const pattern = this.patterns.get(patternKey);
        
        if (!pattern) return [];
        
        const suggestions: string[] = [];
        
        // Add suggestions based on best practices
        if (pattern.bestPractices && pattern.bestPractices.length > 0) {
            pattern.bestPractices.forEach((practice: any) => {
                if (practice.analysis) {
                    suggestions.push(`Best practice: ${practice.analysis.substring(0, 100)}...`);
                }
            });
        }
        
        // Add warnings based on common errors
        const errorKey = `error_${taskId}`;
        const errorPattern = this.patterns.get(errorKey);
        if (errorPattern && errorPattern.commonErrors.length > 0) {
            suggestions.push(`⚠️ Common error pattern detected. Review similar inputs carefully.`);
        }
        
        return suggestions.slice(0, 3); // Limit to 3 suggestions
    }
    
    getPerformanceMetrics(): any {
        const totalLearning = this.learningHistory.length;
        const successCount = this.learningHistory.filter(l => l.feedback.type === 'success').length;
        const errorCount = this.learningHistory.filter(l => l.feedback.type === 'error').length;
        
        return {
            isActive: this.isActive,
            totalLearningEntries: totalLearning,
            successRate: totalLearning > 0 ? (successCount / totalLearning) * 100 : 0,
            totalPatterns: this.patterns.size,
            recentActivity: this.learningHistory.slice(-10).map(l => ({
                type: l.feedback.type,
                timestamp: l.feedback.metadata?.timestamp || Date.now()
            }))
        };
    }
}