import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import axios from 'axios';
import { spawn } from 'child_process';

export interface ModelInfo {
    id: string;
    name: string;
    type: 'ollama' | 'lmstudio' | 'llamacpp' | 'koboldcpp' | 'gguf' | 'onnx' | 'openrouter' | 'openai' | 'anthropic';
    path?: string;
    endpoint?: string;
    isLocal: boolean;
    isRunning: boolean;
    size?: number;
    format?: 'gguf' | 'onnx' | 'safetensors' | 'pytorch';
    architecture?: string;
    parameters?: string;
}

export class AdvancedModelManager {
    private models: ModelInfo[] = [];
    private runningProcesses: Map<string, any> = new Map();
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}
    
    async initialize(): Promise<void> {
        this.logger.info('🚀 Initializing Advanced Model Manager...');
        
        // Detect all types of models
        await this.detectOllamaModels();
        await this.detectLMStudioModels();
        await this.detectLocalModels();
        await this.detectRunningInstances();
        
        this.logger.info(`✅ Advanced Model Manager initialized with ${this.models.length} models`);
    }
    
    private async detectOllamaModels(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('mike-ai');
            const endpoint = config.get<string>('endpoints.ollama', 'http://localhost:11434');
            
            const response = await axios.get(`${endpoint}/api/tags`, { timeout: 3000 });
            if (response.data?.models) {
                for (const model of response.data.models) {
                    this.models.push({
                        id: `ollama-${model.name}`,
                        name: model.name,
                        type: 'ollama',
                        endpoint: endpoint,
                        isLocal: true,
                        isRunning: true,
                        size: model.size,
                        format: 'gguf', // Ollama uses GGUF internally
                        parameters: model.details?.parameter_size || 'unknown'
                    });
                }
                this.logger.info(`📦 Detected ${response.data.models.length} Ollama models`);
            }
        } catch (error) {
            this.logger.debug('Ollama not available or not running');
        }
    }
    
    private async detectLMStudioModels(): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('mike-ai');
            const endpoint = config.get<string>('endpoints.lmstudio', 'http://192.168.1.160:1234');
            
            const response = await axios.get(`${endpoint}/v1/models`, { timeout: 3000 });
            if (response.data?.data) {
                for (const model of response.data.data) {
                    this.models.push({
                        id: `lmstudio-${model.id}`,
                        name: model.id,
                        type: 'lmstudio',
                        endpoint: endpoint,
                        isLocal: true,
                        isRunning: true,
                        format: 'gguf' // LM Studio typically uses GGUF
                    });
                }
                this.logger.info(`🖥️ Detected ${response.data.data.length} LM Studio models`);
            }
        } catch (error) {
            this.logger.debug('LM Studio not available or not running');
        }
    }
    
    private async detectLocalModels(): Promise<void> {
        // Common model directories
        const searchDirs = [
            'C:\\Users\\mikep\\AppData\\Local\\LM Studio\\models',
            'C:\\models',
            '/home/mikep/models',
            '/models',
            './models'
        ];
        
        for (const dir of searchDirs) {
            await this.scanDirectoryForModels(dir);
        }
    }
    
    private async scanDirectoryForModels(directory: string): Promise<void> {
        try {
            if (!fs.existsSync(directory)) return;
            
            const items = fs.readdirSync(directory);
            
            for (const item of items) {
                const fullPath = path.join(directory, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    // Recursively scan subdirectories
                    await this.scanDirectoryForModels(fullPath);
                } else if (stat.isFile()) {
                    await this.analyzeModelFile(fullPath);
                }
            }
        } catch (error) {
            this.logger.debug(`Cannot scan directory ${directory}`);
        }
    }
    
    private async analyzeModelFile(filePath: string): Promise<void> {
        const ext = path.extname(filePath).toLowerCase();
        const basename = path.basename(filePath, ext);
        
        let modelInfo: Partial<ModelInfo> = {
            id: `local-${basename}`,
            name: basename,
            path: filePath,
            isLocal: true,
            isRunning: false,
            size: fs.statSync(filePath).size
        };
        
        // Detect model format and type
        switch (ext) {
            case '.gguf':
                modelInfo.type = 'gguf';
                modelInfo.format = 'gguf';
                // Try to extract model info from filename
                const ggufInfo = this.parseGGUFFilename(basename);
                modelInfo.parameters = ggufInfo.parameters;
                modelInfo.architecture = ggufInfo.architecture;
                break;
                
            case '.onnx':
                modelInfo.type = 'onnx';
                modelInfo.format = 'onnx';
                break;
                
            case '.bin':
                // Could be various formats
                if (basename.includes('ggml')) {
                    modelInfo.type = 'llamacpp';
                    modelInfo.format = 'gguf';
                } else {
                    modelInfo.type = 'gguf';
                    modelInfo.format = 'pytorch';
                }
                break;
                
            case '.safetensors':
                modelInfo.type = 'gguf';
                modelInfo.format = 'safetensors';
                break;
                
            default:
                return; // Skip unsupported formats
        }
        
        this.models.push(modelInfo as ModelInfo);
        this.logger.debug(`📁 Found local model: ${basename} (${ext})`);
    }
    
    private parseGGUFFilename(filename: string): { parameters?: string; architecture?: string } {
        const result: { parameters?: string; architecture?: string } = {};
        
        // Common patterns in GGUF filenames
        const paramMatch = filename.match(/(\d+)[Bb]/);
        if (paramMatch) {
            result.parameters = paramMatch[1] + 'B';
        }
        
        const archMatch = filename.match(/(llama|mistral|qwen|gemma|phi|deepseek)/i);
        if (archMatch) {
            result.architecture = archMatch[1].toLowerCase();
        }
        
        return result;
    }
    
    private async detectRunningInstances(): Promise<void> {
        // Check for KoboldCPP (typically runs on port 5001)
        await this.checkKoboldCPP('http://localhost:5001');
        
        // Check for llama.cpp server (various ports)
        const llamacppPorts = [8080, 8081, 8082];
        for (const port of llamacppPorts) {
            await this.checkLlamaCPP(`http://localhost:${port}`);
        }
    }
    
    private async checkKoboldCPP(endpoint: string): Promise<void> {
        try {
            const response = await axios.get(`${endpoint}/api/v1/model`, { timeout: 2000 });
            if (response.status === 200) {
                this.models.push({
                    id: 'koboldcpp-running',
                    name: response.data.result || 'KoboldCPP Model',
                    type: 'koboldcpp',
                    endpoint: endpoint,
                    isLocal: true,
                    isRunning: true,
                    format: 'gguf'
                });
                this.logger.info('🐉 Detected running KoboldCPP instance');
            }
        } catch (error) {
            this.logger.debug('KoboldCPP not detected on ' + endpoint);
        }
    }
    
    private async checkLlamaCPP(endpoint: string): Promise<void> {
        try {
            const response = await axios.get(`${endpoint}/v1/models`, { timeout: 2000 });
            if (response.data?.data?.[0]) {
                const model = response.data.data[0];
                this.models.push({
                    id: `llamacpp-${model.id}`,
                    name: model.id,
                    type: 'llamacpp',
                    endpoint: endpoint,
                    isLocal: true,
                    isRunning: true,
                    format: 'gguf'
                });
                this.logger.info('🦙 Detected running llama.cpp server');
            }
        } catch (error) {
            this.logger.debug('llama.cpp not detected on ' + endpoint);
        }
    }
    
    async startLocalModel(modelId: string): Promise<boolean> {
        const model = this.getModel(modelId);
        if (!model || !model.path) {
            return false;
        }
        
        try {
            switch (model.format) {
                case 'gguf':
                    return await this.startGGUFModel(model);
                default:
                    this.logger.warn(`Cannot start model format: ${model.format}`);
                    return false;
            }
        } catch (error) {
            this.logger.error(`Failed to start model ${modelId}`, error as Error);
            return false;
        }
    }
    
    private async startGGUFModel(model: ModelInfo): Promise<boolean> {
        // Try to find llama.cpp or similar executable
        const possibleExecutables = [
            'llama-server.exe',
            'llama-server',
            './llama.cpp/llama-server',
            'C:\\llama.cpp\\llama-server.exe'
        ];
        
        let executable = '';
        for (const exe of possibleExecutables) {
            try {
                if (fs.existsSync(exe)) {
                    executable = exe;
                    break;
                }
            } catch (error) {
                // Continue searching
            }
        }
        
        if (!executable) {
            this.logger.warn('llama.cpp server not found. Please install llama.cpp');
            vscode.window.showWarningMessage('llama.cpp server not found. Please install llama.cpp to run GGUF models locally.');
            return false;
        }
        
        const port = 8080 + this.runningProcesses.size;
        const args = [
            '-m', model.path!,
            '--port', port.toString(),
            '--host', '0.0.0.0',
            '-c', '4096', // context size
            '--log-disable' // disable verbose logging
        ];
        
        this.logger.info(`Starting ${model.name} on port ${port}...`);
        
        const process = spawn(executable, args);
        
        process.stdout?.on('data', (data) => {
            this.logger.debug(`llama.cpp: ${data.toString()}`);
        });
        
        process.stderr?.on('data', (data) => {
            this.logger.debug(`llama.cpp stderr: ${data.toString()}`);
        });
        
        process.on('close', (code) => {
            this.logger.info(`llama.cpp process exited with code ${code}`);
            this.runningProcesses.delete(model.id);
            model.isRunning = false;
        });
        
        this.runningProcesses.set(model.id, process);
        model.isRunning = true;
        model.endpoint = `http://localhost:${port}`;
        
        // Wait a moment for the server to start
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return true;
    }
    
    async generateCompletion(modelId: string, prompt: string, options: any = {}): Promise<string> {
        const model = this.getModel(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }
        
        if (!model.isRunning && model.isLocal) {
            const started = await this.startLocalModel(modelId);
            if (!started) {
                throw new Error(`Failed to start model ${modelId}`);
            }
        }
        
        // Generate completion based on model type
        switch (model.type) {
            case 'ollama':
                return await this.generateOllamaCompletion(model, prompt, options);
            case 'lmstudio':
            case 'llamacpp':
            case 'koboldcpp':
                return await this.generateOpenAICompatibleCompletion(model, prompt, options);
            default:
                throw new Error(`Unsupported model type: ${model.type}`);
        }
    }
    
    private async generateOllamaCompletion(model: ModelInfo, prompt: string, options: any): Promise<string> {
        const response = await axios.post(`${model.endpoint}/api/generate`, {
            model: model.name.replace('ollama-', ''),
            prompt: prompt,
            stream: false,
            options: {
                temperature: options.temperature || 0.7,
                top_p: options.top_p || 0.9,
                top_k: options.top_k || 40
            }
        });
        
        return response.data.response;
    }
    
    private async generateOpenAICompatibleCompletion(model: ModelInfo, prompt: string, options: any): Promise<string> {
        const response = await axios.post(`${model.endpoint}/v1/chat/completions`, {
            model: model.name.includes('-') ? model.name.split('-').slice(1).join('-') : model.name,
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature || 0.7,
            max_tokens: options.max_tokens || 1000,
            stream: false
        });
        
        return response.data.choices[0].message.content;
    }
    
    getModels(): ModelInfo[] {
        return this.models;
    }
    
    getModel(id: string): ModelInfo | undefined {
        return this.models.find(m => m.id === id);
    }
    
    getRunningModels(): ModelInfo[] {
        return this.models.filter(m => m.isRunning);
    }
    
    async stopModel(modelId: string): Promise<boolean> {
        const process = this.runningProcesses.get(modelId);
        if (process) {
            process.kill();
            this.runningProcesses.delete(modelId);
            const model = this.getModel(modelId);
            if (model) {
                model.isRunning = false;
            }
            return true;
        }
        return false;
    }
    
    async stopAllModels(): Promise<void> {
        for (const [modelId] of this.runningProcesses) {
            await this.stopModel(modelId);
        }
    }
}