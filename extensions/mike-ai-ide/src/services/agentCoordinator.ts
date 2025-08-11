import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIModelManager } from './aiModelManager';
import { DarwinGodelMachine } from './darwinGodelMachine';

export interface Agent {
    id: string;
    type: 'researcher' | 'coder' | 'reviewer' | 'tester' | 'planner' | 'system-architect';
    name: string;
    status: 'idle' | 'working' | 'completed' | 'error';
    task?: string;
    progress?: number;
    results?: any;
    startTime?: number;
    endTime?: number;
}

export class AgentCoordinator {
    private agents: Map<string, Agent> = new Map();
    private aiModelManager?: AIModelManager;
    private darwinGodelMachine?: DarwinGodelMachine;
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}
    
    async initialize(): Promise<void> {
        this.logger.info('Initializing Agent Coordinator...');
        
        // Load any previously saved agents
        const savedAgents = this.context.workspaceState.get<any>('active-agents', {});
        this.agents = new Map(Object.entries(savedAgents));
        
        this.logger.info(`Agent Coordinator initialized with ${this.agents.size} agents`);
    }
    
    setAIModelManager(aiModelManager: AIModelManager): void {
        this.aiModelManager = aiModelManager;
    }
    
    setDarwinGodelMachine(darwinGodelMachine: DarwinGodelMachine): void {
        this.darwinGodelMachine = darwinGodelMachine;
    }
    
    async spawnAgent(type: Agent['type'], name: string, task?: string): Promise<string> {
        const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const agent: Agent = {
            id: agentId,
            type,
            name,
            status: 'idle',
            task,
            startTime: Date.now()
        };
        
        this.agents.set(agentId, agent);
        await this.saveAgentsState();
        
        this.logger.info(`Spawned ${type} agent: ${name} (${agentId})`);
        
        if (task) {
            await this.assignTask(agentId, task);
        }
        
        return agentId;
    }
    
    async assignTask(agentId: string, task: string): Promise<boolean> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            this.logger.error(`Agent ${agentId} not found`);
            return false;
        }
        
        agent.task = task;
        agent.status = 'working';
        agent.progress = 0;
        agent.startTime = Date.now();
        
        this.logger.info(`Assigned task to ${agent.name}: ${task}`);
        
        // Execute the task asynchronously
        this.executeAgentTask(agent).catch(error => {
            this.logger.error(`Agent ${agentId} task execution failed`, error);
            agent.status = 'error';
            agent.results = { error: error.message };
        });
        
        await this.saveAgentsState();
        return true;
    }
    
    private async executeAgentTask(agent: Agent): Promise<void> {
        if (!this.aiModelManager || !agent.task) {
            throw new Error('AI Model Manager not available or no task assigned');
        }
        
        try {
            // Generate specialized prompt based on agent type
            const prompt = this.generateAgentPrompt(agent.type, agent.task);
            
            // Get available models
            const models = this.aiModelManager.getModels();
            if (models.length === 0) {
                throw new Error('No AI models available');
            }
            
            // Use the first available model (could be made configurable)
            const primaryModel = models.find(m => m.type === 'lmstudio') || models[0];
            
            agent.progress = 25;
            await this.saveAgentsState();
            
            // Generate response
            const response = await this.aiModelManager.generateCompletion(
                primaryModel.id,
                prompt,
                {
                    temperature: 0.7,
                    max_tokens: 1000
                }
            );
            
            agent.progress = 75;
            await this.saveAgentsState();
            
            // Process the response based on agent type
            const processedResults = await this.processAgentResults(agent.type, response);
            
            agent.status = 'completed';
            agent.progress = 100;
            agent.results = processedResults;
            agent.endTime = Date.now();
            
            // Learn from the task completion
            if (this.darwinGodelMachine) {
                await this.darwinGodelMachine.learn(
                    `agent_${agent.type}_task`,
                    { task: agent.task, agentType: agent.type },
                    { type: 'success', score: 0.8, metadata: { duration: agent.endTime - (agent.startTime || 0) } }
                );
            }
            
            this.logger.info(`Agent ${agent.name} completed task successfully`);
            
        } catch (error) {
            agent.status = 'error';
            agent.results = { error: error instanceof Error ? error.message : String(error) };
            agent.endTime = Date.now();
            
            // Learn from the error
            if (this.darwinGodelMachine) {
                await this.darwinGodelMachine.learn(
                    `agent_${agent.type}_task`,
                    { task: agent.task, agentType: agent.type },
                    { type: 'error', metadata: { error: error instanceof Error ? error.message : String(error) } }
                );
            }
            
            throw error;
        } finally {
            await this.saveAgentsState();
        }
    }
    
    private generateAgentPrompt(type: Agent['type'], task: string): string {
        const rolePrompts = {
            researcher: `You are a research specialist AI agent. Your role is to thoroughly investigate and analyze the given task. 
                        Focus on gathering comprehensive information, identifying key insights, and providing detailed analysis.`,
            coder: `You are a coding specialist AI agent. Your role is to write clean, efficient, and well-documented code. 
                   Focus on best practices, proper error handling, and maintainable solutions.`,
            reviewer: `You are a code review specialist AI agent. Your role is to analyze code for quality, security, and maintainability. 
                      Provide constructive feedback and suggestions for improvement.`,
            tester: `You are a testing specialist AI agent. Your role is to create comprehensive test cases and identify potential bugs. 
                    Focus on edge cases, security vulnerabilities, and performance issues.`,
            planner: `You are a project planning specialist AI agent. Your role is to break down complex tasks into manageable steps. 
                     Create detailed project plans with timelines and dependencies.`,
            'system-architect': `You are a system architecture specialist AI agent. Your role is to design scalable and maintainable system architectures. 
                               Focus on design patterns, scalability, and system integration.`
        };
        
        const rolePrompt = rolePrompts[type] || rolePrompts.coder;
        
        return `${rolePrompt}

Task: ${task}

Please provide a detailed response that addresses the task from your specialized perspective. Include:
1. Analysis of the requirements
2. Specific recommendations or solutions
3. Potential challenges and how to address them
4. Next steps or implementation guidance

Response:`;
    }
    
    private async processAgentResults(type: Agent['type'], response: string): Promise<any> {
        // Basic processing - could be enhanced with type-specific logic
        const lines = response.split('\n').filter(line => line.trim());
        
        return {
            type,
            summary: lines.slice(0, 3).join(' '),
            fullResponse: response,
            keyPoints: lines.filter(line => 
                line.includes('1.') || line.includes('2.') || line.includes('3.') ||
                line.includes('•') || line.includes('-')
            ).slice(0, 5),
            timestamp: Date.now()
        };
    }
    
    getAgent(agentId: string): Agent | undefined {
        return this.agents.get(agentId);
    }
    
    getAgents(status?: Agent['status']): Agent[] {
        const allAgents = Array.from(this.agents.values());
        if (status) {
            return allAgents.filter(agent => agent.status === status);
        }
        return allAgents;
    }
    
    async terminateAgent(agentId: string): Promise<boolean> {
        const agent = this.agents.get(agentId);
        if (!agent) return false;
        
        agent.status = 'idle';
        agent.endTime = Date.now();
        
        this.logger.info(`Terminated agent: ${agent.name} (${agentId})`);
        
        const removed = this.agents.delete(agentId);
        if (removed) {
            await this.saveAgentsState();
        }
        
        return removed;
    }
    
    async terminateAll(): Promise<void> {
        this.logger.info('Terminating all agents...');
        
        // Mark all agents as terminated
        this.agents.forEach(agent => {
            agent.status = 'idle';
            agent.endTime = Date.now();
        });
        
        this.agents.clear();
        await this.saveAgentsState();
        
        this.logger.info('All agents terminated');
    }
    
    private async saveAgentsState(): Promise<void> {
        const agentsObj = Object.fromEntries(this.agents);
        await this.context.workspaceState.update('active-agents', agentsObj);
    }
    
    getMetrics(): any {
        const typeDistribution = new Map<string, number>();
        const statusDistribution = new Map<string, number>();
        
        this.agents.forEach(agent => {
            typeDistribution.set(agent.type, (typeDistribution.get(agent.type) || 0) + 1);
            statusDistribution.set(agent.status, (statusDistribution.get(agent.status) || 0) + 1);
        });
        
        const completedAgents = this.getAgents('completed');
        const averageDuration = completedAgents.length > 0 
            ? completedAgents.reduce((sum, agent) => {
                return sum + ((agent.endTime || Date.now()) - (agent.startTime || Date.now()));
            }, 0) / completedAgents.length
            : 0;
        
        return {
            totalAgents: this.agents.size,
            typeDistribution: Object.fromEntries(typeDistribution),
            statusDistribution: Object.fromEntries(statusDistribution),
            averageTaskDuration: Math.round(averageDuration / 1000), // Convert to seconds
            recentActivity: Array.from(this.agents.values())
                .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                .slice(0, 5)
                .map(agent => ({
                    name: agent.name,
                    type: agent.type,
                    status: agent.status,
                    task: agent.task?.substring(0, 50) + (agent.task && agent.task.length > 50 ? '...' : '')
                }))
        };
    }
}