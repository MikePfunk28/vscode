import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AdvancedModelManager } from '../services/advancedModelManager';
import { StructuredAgentSystem } from './structuredAgentSystem';

export interface AutoGenAgent {
    name: string;
    systemMessage: string;
    humanInputMode: 'NEVER' | 'TERMINATE' | 'ALWAYS';
    maxConsecutiveAutoReply: number;
    tools: string[];
}

export interface ConversationHistory {
    speaker: string;
    message: string;
    timestamp: number;
    toolCalls?: any[];
}

export class AutoGenIntegration {
    private conversations: Map<string, ConversationHistory[]> = new Map();
    private agents: Map<string, AutoGenAgent> = new Map();
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private modelManager: AdvancedModelManager,
        private structuredAgents: StructuredAgentSystem
    ) {
        this.initializeStandardAgents();
    }
    
    private initializeStandardAgents(): void {
        // User Proxy Agent (represents human user)
        this.registerAgent({
            name: 'UserProxy',
            systemMessage: `You are a helpful assistant representing the human user in multi-agent conversations. 
            You coordinate between different AI agents and ensure the human's goals are met.
            Ask clarifying questions when needed and synthesize agent responses for the user.`,
            humanInputMode: 'TERMINATE',
            maxConsecutiveAutoReply: 3,
            tools: ['show_message', 'open_file_in_editor']
        });
        
        // Assistant Agent (main problem solver)
        this.registerAgent({
            name: 'Assistant',
            systemMessage: `You are a senior software developer and problem-solving assistant. 
            You can write code, analyze problems, and coordinate with other specialists.
            Always think step by step and explain your reasoning.
            You can call specialized agents for specific tasks.`,
            humanInputMode: 'NEVER',
            maxConsecutiveAutoReply: 5,
            tools: ['read_file', 'write_file', 'analyze_code', 'execute_command']
        });
        
        // Code Reviewer Agent
        this.registerAgent({
            name: 'CodeReviewer',
            systemMessage: `You are an expert code reviewer. Your role is to:
            - Review code for bugs, security issues, and performance problems
            - Suggest improvements for code quality and maintainability
            - Ensure coding standards and best practices are followed
            - Provide constructive feedback with specific examples`,
            humanInputMode: 'NEVER',
            maxConsecutiveAutoReply: 3,
            tools: ['read_file', 'analyze_code', 'show_message']
        });
        
        // Test Engineer Agent
        this.registerAgent({
            name: 'TestEngineer',
            systemMessage: `You are a test automation engineer. Your responsibilities:
            - Design comprehensive test strategies
            - Write unit tests, integration tests, and end-to-end tests
            - Identify test cases and edge cases
            - Set up test environments and CI/CD pipelines`,
            humanInputMode: 'NEVER',
            maxConsecutiveAutoReply: 4,
            tools: ['write_file', 'execute_command', 'read_file', 'git_commit']
        });
        
        // DevOps Engineer Agent
        this.registerAgent({
            name: 'DevOpsEngineer',
            systemMessage: `You are a DevOps engineer focused on:
            - Setting up development and deployment environments
            - Creating automation scripts and CI/CD pipelines
            - Managing infrastructure and containerization
            - Monitoring and logging solutions`,
            humanInputMode: 'NEVER',
            maxConsecutiveAutoReply: 4,
            tools: ['execute_command', 'write_file', 'read_file', 'git_status', 'git_commit']
        });
        
        this.logger.info(`🎭 Initialized AutoGen with ${this.agents.size} agents`);
    }
    
    registerAgent(config: AutoGenAgent): void {
        this.agents.set(config.name, config);
    }
    
    async startGroupChat(participants: string[], task: string, maxRounds: number = 10): Promise<any> {
        const chatId = `chat_${Date.now()}`;
        this.conversations.set(chatId, []);
        
        this.logger.info(`🗣️ Starting AutoGen group chat with ${participants.length} participants`);
        
        // Initialize conversation with the task
        await this.addToConversation(chatId, 'UserProxy', `Task: ${task}`);
        
        let currentSpeaker = 'UserProxy';
        let round = 0;
        let taskCompleted = false;
        
        while (round < maxRounds && !taskCompleted) {
            round++;
            
            // Determine next speaker
            const nextSpeaker = this.selectNextSpeaker(currentSpeaker, participants, chatId);
            
            if (nextSpeaker === currentSpeaker) {
                // Prevent infinite loops
                break;
            }
            
            // Generate response from next speaker
            const response = await this.generateAgentResponse(nextSpeaker, chatId, task);
            
            // Add to conversation
            await this.addToConversation(chatId, nextSpeaker, response.message, response.toolCalls);
            
            // Check if task is completed
            if (response.message.toLowerCase().includes('task completed') || 
                response.message.toLowerCase().includes('terminate')) {
                taskCompleted = true;
            }
            
            currentSpeaker = nextSpeaker;
            
            this.logger.info(`💬 Round ${round}: ${nextSpeaker} responded`);
        }
        
        const conversation = this.conversations.get(chatId) || [];
        const summary = await this.summarizeConversation(conversation);
        
        return {
            chatId,
            conversation,
            summary,
            rounds: round,
            completed: taskCompleted,
            participants
        };
    }
    
    private selectNextSpeaker(currentSpeaker: string, participants: string[], chatId: string): string {
        const conversation = this.conversations.get(chatId) || [];
        const recentMessages = conversation.slice(-5);
        
        // Simple round-robin with some intelligence
        const currentIndex = participants.indexOf(currentSpeaker);
        const nextIndex = (currentIndex + 1) % participants.length;
        
        // Skip speakers who have spoken too much recently
        const speakerCounts = new Map();
        recentMessages.forEach(msg => {
            speakerCounts.set(msg.speaker, (speakerCounts.get(msg.speaker) || 0) + 1);
        });
        
        let candidateIndex = nextIndex;
        for (let i = 0; i < participants.length; i++) {
            const candidate = participants[candidateIndex];
            if (!speakerCounts.has(candidate) || speakerCounts.get(candidate) < 3) {
                return candidate;
            }
            candidateIndex = (candidateIndex + 1) % participants.length;
        }
        
        return participants[nextIndex]; // Fallback to round-robin
    }
    
    private async generateAgentResponse(agentName: string, chatId: string, originalTask: string): Promise<any> {
        const agent = this.agents.get(agentName);
        if (!agent) {
            throw new Error(`Agent ${agentName} not found`);
        }
        
        const conversation = this.conversations.get(chatId) || [];
        const conversationHistory = conversation.slice(-8).map(msg => 
            `${msg.speaker}: ${msg.message}`
        ).join('\n\n');
        
        const models = this.modelManager.getRunningModels();
        if (models.length === 0) {
            throw new Error('No running models available');
        }
        
        const model = models[0];
        
        const prompt = `${agent.systemMessage}

CONVERSATION HISTORY:
${conversationHistory}

ORIGINAL TASK: ${originalTask}

As ${agentName}, provide your response to continue this multi-agent conversation. 
Consider what has been discussed and what your specific role should contribute.

If you need to use tools, format your response as:
TOOL_USE: tool_name
PARAMETERS: { parameter1: value1 }

Your response:`;
        
        const response = await this.modelManager.generateCompletion(
            model.id,
            prompt,
            { temperature: 0.7, max_tokens: 800 }
        );
        
        // Process any tool calls
        const toolCalls = await this.processToolCalls(agentName, response);
        
        return {
            message: response,
            toolCalls
        };
    }
    
    private async processToolCalls(agentName: string, response: string): Promise<any[]> {
        const toolCalls = [];
        const toolUsageRegex = /TOOL_USE:\s*(\w+)\s*\nPARAMETERS:\s*({[^}]*})/g;
        let match;
        
        while ((match = toolUsageRegex.exec(response)) !== null) {
            const toolName = match[1];
            let parameters;
            
            try {
                parameters = JSON.parse(match[2]);
            } catch (error) {
                this.logger.warn(`Failed to parse tool parameters: ${match[2]}`);
                continue;
            }
            
            const agent = this.agents.get(agentName);
            if (!agent || !agent.tools.includes(toolName)) {
                this.logger.warn(`Agent ${agentName} not authorized to use tool ${toolName}`);
                continue;
            }
            
            // Execute tool through structured agent system
            const availableTools = this.structuredAgents.getAvailableTools();
            const tool = availableTools.find(t => t.name === toolName);
            
            if (tool) {
                try {
                    const result = await tool.execute(parameters);
                    toolCalls.push({
                        tool: toolName,
                        parameters,
                        result,
                        success: true
                    });
                } catch (error) {
                    toolCalls.push({
                        tool: toolName,
                        parameters,
                        error: error instanceof Error ? error.message : String(error),
                        success: false
                    });
                }
            }
        }
        
        return toolCalls;
    }
    
    private async addToConversation(chatId: string, speaker: string, message: string, toolCalls?: any[]): Promise<void> {
        const conversation = this.conversations.get(chatId) || [];
        conversation.push({
            speaker,
            message,
            timestamp: Date.now(),
            toolCalls
        });
        this.conversations.set(chatId, conversation);
    }
    
    private async summarizeConversation(conversation: ConversationHistory[]): Promise<string> {
        if (conversation.length === 0) return 'No conversation to summarize';
        
        const models = this.modelManager.getRunningModels();
        if (models.length === 0) return 'Could not generate summary - no models available';
        
        const conversationText = conversation.map(msg => 
            `${msg.speaker}: ${msg.message}`
        ).join('\n\n');
        
        const prompt = `Summarize this multi-agent conversation:

${conversationText}

Provide a concise summary including:
1. Main task/goal
2. Key decisions made
3. Actions taken
4. Final outcome
5. Participants and their contributions

Summary:`;
        
        try {
            const model = models[0];
            return await this.modelManager.generateCompletion(
                model.id,
                prompt,
                { temperature: 0.3, max_tokens: 500 }
            );
        } catch (error) {
            return `Summary generation failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
    
    // PocketFlow Integration
    async executePocketFlowWorkflow(workflowName: string, context: any): Promise<any> {
        this.logger.info(`🌊 Executing PocketFlow workflow: ${workflowName}`);
        
        switch (workflowName) {
            case 'code_review_workflow':
                return await this.executeCodeReviewWorkflow(context);
            case 'test_generation_workflow':
                return await this.executeTestGenerationWorkflow(context);
            case 'deployment_workflow':
                return await this.executeDeploymentWorkflow(context);
            default:
                throw new Error(`Unknown PocketFlow workflow: ${workflowName}`);
        }
    }
    
    private async executeCodeReviewWorkflow(context: any): Promise<any> {
        const participants = ['UserProxy', 'Assistant', 'CodeReviewer'];
        const task = `Review the code changes in ${context.filePath || 'the current file'} and provide feedback`;
        
        return await this.startGroupChat(participants, task, 6);
    }
    
    private async executeTestGenerationWorkflow(context: any): Promise<any> {
        const participants = ['UserProxy', 'Assistant', 'TestEngineer'];
        const task = `Generate comprehensive tests for ${context.component || 'the current code'} including unit tests and integration tests`;
        
        return await this.startGroupChat(participants, task, 8);
    }
    
    private async executeDeploymentWorkflow(context: any): Promise<any> {
        const participants = ['UserProxy', 'DevOpsEngineer', 'TestEngineer'];
        const task = `Set up deployment pipeline for ${context.project || 'this project'} including CI/CD and monitoring`;
        
        return await this.startGroupChat(participants, task, 10);
    }
    
    getConversation(chatId: string): ConversationHistory[] {
        return this.conversations.get(chatId) || [];
    }
    
    getAgents(): AutoGenAgent[] {
        return Array.from(this.agents.values());
    }
}