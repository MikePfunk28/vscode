import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AdvancedModelManager } from '../services/advancedModelManager';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface AgentTool {
    name: string;
    description: string;
    parameters: Record<string, any>;
    execute: (params: any) => Promise<any>;
}

export interface StructuredAgent {
    id: string;
    name: string;
    role: string;
    capabilities: string[];
    tools: AgentTool[];
    systemPrompt: string;
    status: 'idle' | 'thinking' | 'working' | 'completed' | 'error';
    currentTask?: string;
    results?: any;
}

export class StructuredAgentSystem {
    private agents: Map<string, StructuredAgent> = new Map();
    private tools: Map<string, AgentTool> = new Map();
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private modelManager: AdvancedModelManager
    ) {
        this.initializeTools();
    }
    
    private initializeTools(): void {
        // File System Tools
        this.registerTool({
            name: 'read_file',
            description: 'Read contents of a file',
            parameters: { filePath: 'string' },
            execute: async (params) => {
                return fs.readFileSync(params.filePath, 'utf8');
            }
        });
        
        this.registerTool({
            name: 'write_file',
            description: 'Write content to a file',
            parameters: { filePath: 'string', content: 'string' },
            execute: async (params) => {
                fs.writeFileSync(params.filePath, params.content, 'utf8');
                return { success: true, message: `File written: ${params.filePath}` };
            }
        });
        
        this.registerTool({
            name: 'list_files',
            description: 'List files in a directory',
            parameters: { directory: 'string', pattern: 'string?' },
            execute: async (params) => {
                const files = fs.readdirSync(params.directory);
                if (params.pattern) {
                    const regex = new RegExp(params.pattern);
                    return files.filter(f => regex.test(f));
                }
                return files;
            }
        });
        
        // Terminal/Command Tools
        this.registerTool({
            name: 'execute_command',
            description: 'Execute a shell command',
            parameters: { command: 'string', cwd: 'string?' },
            execute: async (params) => {
                const { stdout, stderr } = await execAsync(params.command, {
                    cwd: params.cwd || process.cwd()
                });
                return { stdout, stderr };
            }
        });
        
        // Code Analysis Tools
        this.registerTool({
            name: 'analyze_code',
            description: 'Analyze code structure and patterns',
            parameters: { filePath: 'string', analysisType: 'string' },
            execute: async (params) => {
                const content = fs.readFileSync(params.filePath, 'utf8');
                const analysis = this.performCodeAnalysis(content, params.analysisType);
                return analysis;
            }
        });
        
        // VSCode Integration Tools
        this.registerTool({
            name: 'open_file_in_editor',
            description: 'Open a file in VSCode editor',
            parameters: { filePath: 'string', line: 'number?' },
            execute: async (params) => {
                const uri = vscode.Uri.file(params.filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc);
                if (params.line) {
                    const position = new vscode.Position(params.line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                }
                return { success: true, message: `Opened ${params.filePath}` };
            }
        });
        
        this.registerTool({
            name: 'show_message',
            description: 'Show a message to the user',
            parameters: { message: 'string', type: 'info|warning|error?' },
            execute: async (params) => {
                switch (params.type) {
                    case 'warning':
                        vscode.window.showWarningMessage(params.message);
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(params.message);
                        break;
                    default:
                        vscode.window.showInformationMessage(params.message);
                }
                return { success: true };
            }
        });
        
        // Web/API Tools
        this.registerTool({
            name: 'web_search',
            description: 'Search the web for information',
            parameters: { query: 'string', maxResults: 'number?' },
            execute: async (params) => {
                // Placeholder for web search implementation
                // Would integrate with search APIs
                return { 
                    results: [],
                    message: 'Web search tool needs API integration'
                };
            }
        });
        
        // Git Tools
        this.registerTool({
            name: 'git_status',
            description: 'Get git repository status',
            parameters: { repository: 'string?' },
            execute: async (params) => {
                const cwd = params.repository || vscode.workspace.rootPath || process.cwd();
                const { stdout } = await execAsync('git status --porcelain', { cwd });
                return { status: stdout, cwd };
            }
        });
        
        this.registerTool({
            name: 'git_commit',
            description: 'Create a git commit',
            parameters: { message: 'string', files: 'string[]?' },
            execute: async (params) => {
                const cwd = vscode.workspace.rootPath || process.cwd();
                if (params.files) {
                    for (const file of params.files) {
                        await execAsync(`git add "${file}"`, { cwd });
                    }
                } else {
                    await execAsync('git add .', { cwd });
                }
                const { stdout } = await execAsync(`git commit -m "${params.message}"`, { cwd });
                return { success: true, output: stdout };
            }
        });
        
        this.logger.info(`🔧 Registered ${this.tools.size} agent tools`);
    }
    
    private performCodeAnalysis(content: string, analysisType: string): any {
        switch (analysisType) {
            case 'functions':
                return this.extractFunctions(content);
            case 'classes':
                return this.extractClasses(content);
            case 'imports':
                return this.extractImports(content);
            case 'complexity':
                return this.analyzeComplexity(content);
            default:
                return { error: 'Unknown analysis type' };
        }
    }
    
    private extractFunctions(content: string): any {
        const functionRegex = /function\s+(\w+)\s*\([^)]*\)|const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*:\s*[^=]+=)/g;
        const functions = [];
        let match;
        
        while ((match = functionRegex.exec(content)) !== null) {
            functions.push({
                name: match[1] || match[2],
                line: content.substring(0, match.index).split('\n').length,
                type: match[1] ? 'declaration' : 'arrow'
            });
        }
        
        return { functions, count: functions.length };
    }
    
    private extractClasses(content: string): any {
        const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g;
        const classes = [];
        let match;
        
        while ((match = classRegex.exec(content)) !== null) {
            classes.push({
                name: match[1],
                extends: match[2] || null,
                line: content.substring(0, match.index).split('\n').length
            });
        }
        
        return { classes, count: classes.length };
    }
    
    private extractImports(content: string): any {
        const importRegex = /import\s+(?:{[^}]*}|\w+|\*\s+as\s+\w+)\s+from\s+['"']([^'"']+)['"']/g;
        const imports = [];
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            imports.push({
                module: match[1],
                line: content.substring(0, match.index).split('\n').length,
                statement: match[0]
            });
        }
        
        return { imports, count: imports.length };
    }
    
    private analyzeComplexity(content: string): any {
        const lines = content.split('\n');
        const complexity = {
            lines: lines.length,
            functions: (content.match(/function\s+\w+|const\s+\w+\s*=.*=>/g) || []).length,
            conditions: (content.match(/if\s*\(|else\s*if\s*\(|switch\s*\(/g) || []).length,
            loops: (content.match(/for\s*\(|while\s*\(|do\s*{/g) || []).length,
            complexity: 'medium' // Simplified complexity calculation
        };
        
        const totalComplexity = complexity.functions + complexity.conditions + complexity.loops;
        if (totalComplexity > 50) complexity.complexity = 'high';
        else if (totalComplexity < 10) complexity.complexity = 'low';
        
        return complexity;
    }
    
    registerTool(tool: AgentTool): void {
        this.tools.set(tool.name, tool);
    }
    
    createAgent(config: {
        name: string;
        role: string;
        capabilities: string[];
        toolNames: string[];
        systemPrompt?: string;
    }): string {
        const agentId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const tools: AgentTool[] = [];
        for (const toolName of config.toolNames) {
            const tool = this.tools.get(toolName);
            if (tool) {
                tools.push(tool);
            }
        }
        
        const agent: StructuredAgent = {
            id: agentId,
            name: config.name,
            role: config.role,
            capabilities: config.capabilities,
            tools,
            systemPrompt: config.systemPrompt || this.generateSystemPrompt(config),
            status: 'idle'
        };
        
        this.agents.set(agentId, agent);
        this.logger.info(`🤖 Created structured agent: ${config.name} with ${tools.length} tools`);
        
        return agentId;
    }
    
    private generateSystemPrompt(config: any): string {
        return `You are ${config.name}, a ${config.role} AI agent.

Your capabilities:
${config.capabilities.map((c: string) => `- ${c}`).join('\n')}

Available tools:
${config.toolNames.map((t: string) => `- ${t}: ${this.tools.get(t)?.description || 'Tool not found'}`).join('\n')}

Instructions:
1. Always think step-by-step before acting
2. Use the appropriate tools for each task
3. Provide clear explanations for your actions
4. Ask for clarification if a task is ambiguous
5. Report your progress and results clearly

When you need to use a tool, format your request as:
TOOL_USE: tool_name
PARAMETERS: { parameter1: value1, parameter2: value2 }

Always explain your reasoning before using tools.`;
    }
    
    async executeAgent(agentId: string, task: string): Promise<any> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found`);
        }
        
        agent.status = 'thinking';
        agent.currentTask = task;
        
        try {
            this.logger.info(`🚀 Executing agent ${agent.name} for task: ${task}`);
            
            // Get available models
            const models = this.modelManager.getModels();
            const runningModels = models.filter(m => m.isRunning);
            
            if (runningModels.length === 0) {
                throw new Error('No running AI models available');
            }
            
            const model = runningModels[0]; // Use first available running model
            
            // Create the prompt with task and available tools
            const prompt = `${agent.systemPrompt}

CURRENT TASK: ${task}

Think through this task step by step and use the available tools as needed.
Provide a clear plan and execute it systematically.`;
            
            agent.status = 'working';
            
            // Generate initial response
            const response = await this.modelManager.generateCompletion(
                model.id,
                prompt,
                { temperature: 0.7, max_tokens: 1500 }
            );
            
            // Process tool usage requests in the response
            const results = await this.processAgentResponse(agent, response, task);
            
            agent.status = 'completed';
            agent.results = results;
            
            this.logger.info(`✅ Agent ${agent.name} completed task`);
            return results;
            
        } catch (error) {
            agent.status = 'error';
            agent.results = { error: error instanceof Error ? error.message : String(error) };
            this.logger.error(`❌ Agent ${agent.name} failed`, error as Error);
            throw error;
        }
    }
    
    private async processAgentResponse(agent: StructuredAgent, response: string, originalTask: string): Promise<any> {
        const results = {
            agentResponse: response,
            toolExecutions: [] as any[],
            summary: '',
            success: true
        };
        
        // Look for tool usage patterns in response
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
            
            const tool = agent.tools.find(t => t.name === toolName);
            if (!tool) {
                this.logger.warn(`Agent ${agent.name} requested unknown tool: ${toolName}`);
                continue;
            }
            
            try {
                const toolResult = await tool.execute(parameters);
                results.toolExecutions.push({
                    tool: toolName,
                    parameters,
                    result: toolResult,
                    success: true
                });
                
                this.logger.info(`🔧 Agent ${agent.name} used tool ${toolName}`);
            } catch (error) {
                results.toolExecutions.push({
                    tool: toolName,
                    parameters,
                    error: error instanceof Error ? error.message : String(error),
                    success: false
                });
                
                this.logger.warn(`Failed to execute tool ${toolName} for agent ${agent.name}`);
            }
        }
        
        // Generate summary
        results.summary = `Agent ${agent.name} processed task: "${originalTask}". 
Executed ${results.toolExecutions.length} tools. 
${results.toolExecutions.filter(t => t.success).length} succeeded, ${results.toolExecutions.filter(t => !t.success).length} failed.`;
        
        return results;
    }
    
    getAgent(id: string): StructuredAgent | undefined {
        return this.agents.get(id);
    }
    
    getAgents(): StructuredAgent[] {
        return Array.from(this.agents.values());
    }
    
    getAvailableTools(): AgentTool[] {
        return Array.from(this.tools.values());
    }
    
    // Pre-configured agent templates
    createCodeAnalyzerAgent(): string {
        return this.createAgent({
            name: 'Code Analyzer',
            role: 'senior software engineer specializing in code analysis',
            capabilities: [
                'Analyze code structure and patterns',
                'Identify potential issues and improvements',
                'Extract functions, classes, and dependencies',
                'Calculate code complexity metrics'
            ],
            toolNames: ['read_file', 'analyze_code', 'list_files', 'show_message'],
            systemPrompt: `You are a Code Analyzer agent. Your primary function is to analyze code files and provide insights about structure, quality, and potential improvements. Use the available tools to read and analyze code systematically.`
        });
    }
    
    createProjectManagerAgent(): string {
        return this.createAgent({
            name: 'Project Manager',
            role: 'project management specialist',
            capabilities: [
                'Organize and prioritize tasks',
                'Track project progress',
                'Coordinate team activities',
                'Generate project reports'
            ],
            toolNames: ['list_files', 'read_file', 'write_file', 'git_status', 'show_message'],
            systemPrompt: `You are a Project Manager agent. You help organize projects, track progress, and coordinate development activities. Focus on creating structured plans and maintaining project organization.`
        });
    }
    
    createDevOpsAgent(): string {
        return this.createAgent({
            name: 'DevOps Engineer',
            role: 'development operations specialist',
            capabilities: [
                'Automate deployment processes',
                'Manage system configurations',
                'Monitor application health',
                'Optimize development workflows'
            ],
            toolNames: ['execute_command', 'read_file', 'write_file', 'git_status', 'git_commit'],
            systemPrompt: `You are a DevOps Engineer agent. You specialize in automation, deployment, and system management. Use command-line tools and scripts to streamline development workflows.`
        });
    }
}