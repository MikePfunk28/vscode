import * as vscode from 'vscode';
import { AIModelManager } from './services/aiModelManager';
import { AdvancedModelManager } from './services/advancedModelManager';
import { DarwinGodelMachine } from './services/darwinGodelMachine';
import { AppleContextWindow } from './services/appleContextWindow';
import { RAGPipeline } from './services/ragPipeline';
import { AgentCoordinator } from './services/agentCoordinator';
import { StructuredAgentSystem } from './agents/structuredAgentSystem';
import { AutoGenIntegration } from './agents/autoGenIntegration';
import { ChatProvider } from './providers/chatProvider';
import { CompletionProvider } from './providers/completionProvider';
import { CodeLensProvider } from './providers/codeLensProvider';
import { HoverProvider } from './providers/hoverProvider';
import { AgentsViewProvider } from './providers/agentsViewProvider';
import { ContextViewProvider } from './providers/contextViewProvider';
import { CommandHandler } from './handlers/commandHandler';
import { ClaudeFlowIntegration } from './integrations/claudeFlowIntegration';
import { Logger } from './utils/logger';

/**
 * Mike AI IDE Extension for VSCode
 * 
 * Provides comprehensive AI capabilities including:
 * - Darwin Godel Machine (self-learning system)
 * - Apple Context Windows (intelligent context management) 
 * - RAG Pipeline (knowledge base integration)
 * - Multi-model AI integration (Ollama, LM Studio, OpenRouter, etc.)
 * - Agent coordination system
 * - Streaming code completion
 * - Claude Flow MCP integration
 */

let extensionContext: vscode.ExtensionContext;
let logger: Logger;
let aiModelManager: AIModelManager;
let advancedModelManager: AdvancedModelManager;
let darwinGodelMachine: DarwinGodelMachine;
let appleContextWindow: AppleContextWindow;
let ragPipeline: RAGPipeline;
let agentCoordinator: AgentCoordinator;
let structuredAgentSystem: StructuredAgentSystem;
let autoGenIntegration: AutoGenIntegration;
let claudeFlowIntegration: ClaudeFlowIntegration;

export async function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    logger = new Logger(context);
    
    try {
        logger.info('🚀 Activating Mike AI IDE extension...');
        
        // Initialize core services
        await initializeServices();
        
        // Register providers
        await registerProviders();
        
        // Register commands  
        await registerCommands();
        
        // Register event handlers
        registerEventHandlers();
        
        // Set extension as enabled
        vscode.commands.executeCommand('setContext', 'mike-ai.enabled', true);
        
        // Show activation notification
        const config = vscode.workspace.getConfiguration('mike-ai');
        if (config.get('showWelcome', true)) {
            showWelcomeMessage();
        }
        
        logger.info('✅ Mike AI IDE extension activated successfully');
        
        // Claude Flow integration
        if (config.get('claudeFlow.enabled', true)) {
            await claudeFlowIntegration.initialize();
            await claudeFlowIntegration.notifyExtensionActivated();
        }
        
    } catch (error) {
        logger.error('❌ Failed to activate Mike AI IDE extension:', error instanceof Error ? error : undefined);
        vscode.window.showErrorMessage(`Mike AI IDE activation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function deactivate() {
    logger?.info('🔄 Deactivating Mike AI IDE extension...');
    
    return Promise.all([
        darwinGodelMachine?.stop(),
        appleContextWindow?.cleanup(), 
        ragPipeline?.close(),
        agentCoordinator?.terminateAll(),
        claudeFlowIntegration?.cleanup()
    ]).then(() => {
        logger?.info('✅ Mike AI IDE extension deactivated');
    }).catch((error) => {
        logger?.error('❌ Error during deactivation:', error);
    });
}

async function initializeServices() {
    logger.info('🔧 Initializing AI services...');
    
    // Initialize AI Model Manager (legacy)
    aiModelManager = new AIModelManager(extensionContext, logger);
    await aiModelManager.initialize();
    
    // Initialize Advanced Model Manager (new - supports GGUF, llama.cpp, etc.)
    advancedModelManager = new AdvancedModelManager(extensionContext, logger);
    await advancedModelManager.initialize();
    
    // Initialize Darwin Godel Machine
    darwinGodelMachine = new DarwinGodelMachine(extensionContext, logger);
    await darwinGodelMachine.start();
    
    // Initialize Apple Context Window
    appleContextWindow = new AppleContextWindow(extensionContext, logger);
    await appleContextWindow.initialize();
    
    // Initialize RAG Pipeline  
    ragPipeline = new RAGPipeline(extensionContext, logger);
    await ragPipeline.initialize();
    
    // Initialize Agent Coordinator (legacy)
    agentCoordinator = new AgentCoordinator(extensionContext, logger);
    await agentCoordinator.initialize();
    
    // Initialize Structured Agent System (new)
    structuredAgentSystem = new StructuredAgentSystem(extensionContext, logger, advancedModelManager);
    
    // Initialize AutoGen Integration
    autoGenIntegration = new AutoGenIntegration(extensionContext, logger, advancedModelManager, structuredAgentSystem);
    
    // Initialize Claude Flow Integration
    claudeFlowIntegration = new ClaudeFlowIntegration(extensionContext, logger);
    
    // Connect services
    darwinGodelMachine.setAIModelManager(aiModelManager);
    appleContextWindow.setRAGPipeline(ragPipeline);
    agentCoordinator.setAIModelManager(aiModelManager);
    agentCoordinator.setDarwinGodelMachine(darwinGodelMachine);
    
    logger.info('✅ AI services initialized');
}

async function registerProviders() {
    logger.info('📝 Registering providers...');
    
    // Chat Provider
    const chatProvider = new ChatProvider(
        extensionContext,
        logger,
        aiModelManager,
        appleContextWindow,
        darwinGodelMachine
    );
    extensionContext.subscriptions.push(
        vscode.window.registerTreeDataProvider('mike-ai.chatView', chatProvider)
    );
    
    // Completion Provider
    const completionProvider = new CompletionProvider(
        extensionContext,
        logger,
        aiModelManager,
        appleContextWindow,
        ragPipeline
    );
    
    // Register for all supported languages
    const supportedLanguages = [
        'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
        'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'html',
        'css', 'json', 'yaml', 'markdown', 'sql', 'shell'
    ];
    
    for (const language of supportedLanguages) {
        extensionContext.subscriptions.push(
            vscode.languages.registerInlineCompletionItemProvider(
                { language }, 
                completionProvider
            )
        );
    }
    
    // CodeLens Provider
    const codeLensProvider = new CodeLensProvider(
        extensionContext,
        logger,
        aiModelManager,
        darwinGodelMachine
    );
    
    for (const language of supportedLanguages) {
        extensionContext.subscriptions.push(
            vscode.languages.registerCodeLensProvider(
                { language },
                codeLensProvider
            )
        );
    }
    
    // Hover Provider
    const hoverProvider = new HoverProvider(
        extensionContext,
        logger,
        aiModelManager,
        ragPipeline
    );
    
    for (const language of supportedLanguages) {
        extensionContext.subscriptions.push(
            vscode.languages.registerHoverProvider(
                { language },
                hoverProvider
            )
        );
    }
    
    // Agents View Provider
    const agentsViewProvider = new AgentsViewProvider(
        extensionContext,
        logger,
        agentCoordinator
    );
    extensionContext.subscriptions.push(
        vscode.window.registerTreeDataProvider('mike-ai.agentsView', agentsViewProvider)
    );
    
    // Context View Provider
    const contextViewProvider = new ContextViewProvider(
        extensionContext,
        logger,
        appleContextWindow
    );
    extensionContext.subscriptions.push(
        vscode.window.registerTreeDataProvider('mike-ai.contextView', contextViewProvider)
    );
    
    logger.info('✅ Providers registered');
}

async function registerCommands() {
    logger.info('⚙️ Registering commands...');
    
    const commandHandler = new CommandHandler(
        extensionContext,
        logger,
        aiModelManager,
        darwinGodelMachine,
        appleContextWindow,
        ragPipeline,
        agentCoordinator
    );
    
    const commands = [
        vscode.commands.registerCommand('mike-ai.openChat', () => commandHandler.openChat()),
        vscode.commands.registerCommand('mike-ai.spawnAgent', (type?: string) => commandHandler.spawnAgent(type)),
        vscode.commands.registerCommand('mike-ai.toggleDGM', () => commandHandler.toggleDarwinGodelMachine()),
        vscode.commands.registerCommand('mike-ai.openContextViewer', () => commandHandler.openContextViewer()),
        vscode.commands.registerCommand('mike-ai.searchRAG', () => commandHandler.searchRAG()),
        vscode.commands.registerCommand('mike-ai.configureModels', () => commandHandler.configureModels()),
        vscode.commands.registerCommand('mike-ai.showPerformance', () => commandHandler.showPerformanceMetrics()),
        vscode.commands.registerCommand('mike-ai.explainCode', () => commandHandler.explainCode()),
        vscode.commands.registerCommand('mike-ai.generateTests', () => commandHandler.generateTests()),
        vscode.commands.registerCommand('mike-ai.refactorCode', () => commandHandler.refactorCode()),
        vscode.commands.registerCommand('mike-ai.optimizeCode', () => commandHandler.optimizeCode()),
        vscode.commands.registerCommand('mike-ai.reviewCode', () => commandHandler.reviewCode()),
        
        // Internal commands
        vscode.commands.registerCommand('mike-ai.internal.restartServices', () => commandHandler.restartServices()),
        vscode.commands.registerCommand('mike-ai.internal.showLogs', () => commandHandler.showLogs()),
        vscode.commands.registerCommand('mike-ai.internal.exportData', () => commandHandler.exportData()),
        vscode.commands.registerCommand('mike-ai.internal.importData', () => commandHandler.importData())
    ];
    
    commands.forEach(command => extensionContext.subscriptions.push(command));
    
    logger.info('✅ Commands registered');
}

function registerEventHandlers() {
    logger.info('📡 Registering event handlers...');
    
    // Document change handlers
    extensionContext.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = vscode.workspace.getConfiguration('mike-ai');
            
            // Auto-index files for RAG
            if (config.get('rag.indexOnSave', true)) {
                await ragPipeline.indexFile(document.uri.fsPath, document.getText());
            }
            
            // Add to context window
            const contextId = await appleContextWindow.addContextWindow(
                document.getText(),
                'file',
                {
                    filePath: document.uri.fsPath,
                    language: document.languageId,
                    timestamp: Date.now()
                }
            );
            
            // Learn from editing patterns
            if (config.get('darwinGodelMachine.enabled', true)) {
                await darwinGodelMachine.learn(
                    `file_save_${document.languageId}`,
                    { filePath: document.uri.fsPath, contextId },
                    { type: 'success', score: 1.0, metadata: { operation: 'file_save' } }
                );
            }
        })
    );
    
    // Selection change handler
    extensionContext.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(async (event) => {
            const selection = event.textEditor.selection;
            if (!selection.isEmpty) {
                const selectedText = event.textEditor.document.getText(selection);
                
                // Add selection to context window
                await appleContextWindow.addContextWindow(
                    selectedText,
                    'code',
                    {
                        filePath: event.textEditor.document.uri.fsPath,
                        language: event.textEditor.document.languageId,
                        startLine: selection.start.line,
                        endLine: selection.end.line,
                        timestamp: Date.now()
                    }
                );
            }
        })
    );
    
    // Configuration changes
    extensionContext.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (event) => {
            if (event.affectsConfiguration('mike-ai')) {
                logger.info('⚙️ Configuration changed, updating services...');
                
                if (event.affectsConfiguration('mike-ai.primaryModel') ||
                    event.affectsConfiguration('mike-ai.helperModel') ||
                    event.affectsConfiguration('mike-ai.endpoints')) {
                    await aiModelManager.detectModels();
                }
                
                if (event.affectsConfiguration('mike-ai.darwinGodelMachine')) {
                    const config = vscode.workspace.getConfiguration('mike-ai');
                    if (config.get('darwinGodelMachine.enabled', true)) {
                        await darwinGodelMachine.start();
                    } else {
                        await darwinGodelMachine.stop();
                    }
                }
            }
        })
    );
    
    // Window state changes
    extensionContext.subscriptions.push(
        vscode.window.onDidChangeWindowState(async (windowState) => {
            if (windowState.focused) {
                // Window focused - resume AI services
                logger.info('🎯 Window focused - resuming AI services');
            } else {
                // Window lost focus - potentially pause non-essential services
                logger.info('💤 Window lost focus - optimizing AI services');
            }
        })
    );
    
    // Workspace folder changes
    extensionContext.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
            for (const folder of event.added) {
                logger.info(`📁 New workspace folder added: ${folder.uri.fsPath}`);
                
                // Index new workspace
                await ragPipeline.indexProject(folder.uri.fsPath);
                
                // Set as current project for context
                await appleContextWindow.setProject(folder.uri.fsPath);
            }
            
            for (const folder of event.removed) {
                logger.info(`📁 Workspace folder removed: ${folder.uri.fsPath}`);
                // Could clean up indexed data here
            }
        })
    );
    
    logger.info('✅ Event handlers registered');
}

function showWelcomeMessage() {
    const message = `🎉 Mike AI IDE is now active! 

Features available:
• Darwin Godel Machine (self-learning)  
• Apple Context Windows (smart context)
• RAG Knowledge Base (codebase search)
• Multi-Model AI (Ollama, LM Studio, APIs)
• Agent Coordination System
• Streaming Code Completion

Try: Ctrl+Shift+C to open AI Chat`;

    vscode.window.showInformationMessage(
        'Mike AI IDE Activated!',
        'Show Features',
        'Configure Models',
        'Don\'t Show Again'
    ).then(selection => {
        switch (selection) {
            case 'Show Features':
                vscode.window.showInformationMessage(message, { modal: true });
                break;
            case 'Configure Models':
                vscode.commands.executeCommand('mike-ai.configureModels');
                break;
            case 'Don\'t Show Again':
                vscode.workspace.getConfiguration('mike-ai').update('showWelcome', false, vscode.ConfigurationTarget.Global);
                break;
        }
    });
}

// Export services for use by other parts of the extension
export {
    extensionContext,
    logger,
    aiModelManager,
    darwinGodelMachine,
    appleContextWindow,
    ragPipeline,
    agentCoordinator,
    claudeFlowIntegration
};