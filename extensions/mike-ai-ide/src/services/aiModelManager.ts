import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import axios from 'axios';

export interface AIModel {
    id: string;
    name: string;
    type: 'ollama' | 'lmstudio' | 'openrouter' | 'openai' | 'anthropic';
    endpoint: string;
    isAvailable: boolean;
}

export class AIModelManager {
    private models: AIModel[] = [];
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}
    
    async initialize(): Promise<void> {
        this.logger.info('Initializing AI Model Manager...');
        await this.detectModels();
        this.logger.info(`AI Model Manager initialized with ${this.models.length} models`);
    }
    
    async detectModels(): Promise<void> {
        const config = vscode.workspace.getConfiguration('mike-ai');
        
        // Detect Ollama models
        const ollamaEndpoint = config.get<string>('endpoints.ollama', 'http://localhost:11434');
        try {
            const response = await axios.get(`${ollamaEndpoint}/api/tags`, { timeout: 5000 });
            if (response.data?.models) {
                for (const model of response.data.models) {
                    this.models.push({
                        id: `ollama-${model.name}`,
                        name: model.name,
                        type: 'ollama',
                        endpoint: ollamaEndpoint,
                        isAvailable: true
                    });
                }
                this.logger.info(`Detected ${response.data.models.length} Ollama models`);
            }
        } catch (error) {
            this.logger.warn('Ollama not available');
        }
        
        // Detect LM Studio models
        const lmstudioEndpoint = config.get<string>('endpoints.lmstudio', 'http://192.168.1.160:1234');
        try {
            const response = await axios.get(`${lmstudioEndpoint}/v1/models`, { timeout: 5000 });
            if (response.data?.data) {
                for (const model of response.data.data) {
                    this.models.push({
                        id: `lmstudio-${model.id}`,
                        name: model.id,
                        type: 'lmstudio',
                        endpoint: lmstudioEndpoint,
                        isAvailable: true
                    });
                }
                this.logger.info(`Detected ${response.data.data.length} LM Studio models`);
            }
        } catch (error) {
            this.logger.warn('LM Studio not available');
        }
        
        // Add API-based models if configured
        const openrouterKey = config.get<string>('apiKeys.openrouter');
        if (openrouterKey) {
            this.models.push({
                id: 'openrouter-qwen3-coder',
                name: 'Qwen 3 Coder',
                type: 'openrouter',
                endpoint: 'https://openrouter.ai/api/v1',
                isAvailable: true
            });
        }
        
        const openaiKey = config.get<string>('apiKeys.openai');
        if (openaiKey) {
            this.models.push({
                id: 'openai-gpt4',
                name: 'GPT-4',
                type: 'openai',
                endpoint: 'https://api.openai.com/v1',
                isAvailable: true
            });
        }
        
        const anthropicKey = config.get<string>('apiKeys.anthropic');
        if (anthropicKey) {
            this.models.push({
                id: 'anthropic-claude3',
                name: 'Claude 3',
                type: 'anthropic',
                endpoint: 'https://api.anthropic.com/v1',
                isAvailable: true
            });
        }
    }
    
    getModels(): AIModel[] {
        return this.models;
    }
    
    getModel(id: string): AIModel | undefined {
        return this.models.find(model => model.id === id);
    }
    
    async generateCompletion(modelId: string, prompt: string, options: any = {}): Promise<string> {
        const model = this.getModel(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }
        
        try {
            switch (model.type) {
                case 'ollama':
                    return await this.generateOllamaCompletion(model, prompt, options);
                case 'lmstudio':
                    return await this.generateLMStudioCompletion(model, prompt, options);
                case 'openrouter':
                    return await this.generateOpenRouterCompletion(model, prompt, options);
                default:
                    throw new Error(`Model type ${model.type} not implemented yet`);
            }
        } catch (error) {
            this.logger.error(`Failed to generate completion with ${modelId}`, error as Error);
            throw error;
        }
    }
    
    private async generateOllamaCompletion(model: AIModel, prompt: string, options: any): Promise<string> {
        const response = await axios.post(`${model.endpoint}/api/generate`, {
            model: model.name,
            prompt: prompt,
            stream: false,
            options: {
                temperature: options.temperature || 0.7,
                top_p: options.top_p || 0.9
            }
        });
        
        return response.data.response;
    }
    
    private async generateLMStudioCompletion(model: AIModel, prompt: string, options: any): Promise<string> {
        const response = await axios.post(`${model.endpoint}/v1/chat/completions`, {
            model: model.name,
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 1000
        });
        
        return response.data.choices[0].message.content;
    }
    
    private async generateOpenRouterCompletion(model: AIModel, prompt: string, options: any): Promise<string> {
        const config = vscode.workspace.getConfiguration('mike-ai');
        const apiKey = config.get<string>('apiKeys.openrouter');
        
        const response = await axios.post(`${model.endpoint}/chat/completions`, {
            model: 'qwen/qwen3-coder',
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 1000
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.choices[0].message.content;
    }
}