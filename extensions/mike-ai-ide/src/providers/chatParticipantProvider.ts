import * as vscode from 'vscode';
import { AIModelManager } from '../services/aiModelManager';
import { AdvancedModelManager } from '../services/advancedModelManager';
import { AppleContextWindow } from '../services/appleContextWindow';
import { RAGPipeline } from '../services/ragPipeline';
import { DarwinGodelMachine } from '../services/darwinGodelMachine';
import { Logger } from '../utils/logger';

/**
 * Chat Participant Provider for MikeIDE
 * Implements VS Code Chat Participant API for @mikeide commands
 */
export class ChatParticipantProvider {
    private chatParticipant: vscode.ChatParticipant;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private aiModelManager: AIModelManager,
        private advancedModelManager: AdvancedModelManager,
        private appleContextWindow: AppleContextWindow,
        private ragPipeline: RAGPipeline,
        private darwinGodelMachine: DarwinGodelMachine
    ) {
        // Create the chat participant
        this.chatParticipant = vscode.chat.createChatParticipant(
            'mike-ai.mikeide',
            this.handleChatRequest.bind(this)
        );

        // Set participant properties
        this.chatParticipant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'mike-ai-icon.png');
        this.chatParticipant.followupProvider = {
            provideFollowups: this.provideFollowups.bind(this)
        };

        // Register for disposal
        this.context.subscriptions.push(this.chatParticipant);

        this.logger.info('🤖 Chat Participant Provider initialized');
    }

    /**
     * Handle chat requests with @mikeide commands
     */
    private async handleChatRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        try {
            this.logger.info(`🗨️ Chat request: ${request.command || 'chat'} - ${request.prompt}`);

            // Show thinking indicator
            response.progress('🤔 Processing your request...');

            // Get current editor context
            const editorContext = this.getEditorContext();

            // Get relevant context from Apple Context Window and RAG
            const contextInfo = await this.gatherContext(request.prompt, editorContext);

            // Route to appropriate handler based on command
            switch (request.command) {
                case 'explain':
                    return await this.handleExplainCommand(request, response, contextInfo, token);
                case 'refactor':
                    return await this.handleRefactorCommand(request, response, contextInfo, token);
                case 'test':
                    return await this.handleTestCommand(request, response, contextInfo, token);
                case 'review':
                    return await this.handleReviewCommand(request, response, contextInfo, token);
                case 'optimize':
                    return await this.handleOptimizeCommand(request, response, contextInfo, token);
                case 'debug':
                    return await this.handleDebugCommand(request, response, contextInfo, token);
                case 'document':
                    return await this.handleDocumentCommand(request, response, contextInfo, token);
                default:
                    return await this.handleGeneralChat(request, response, contextInfo, token);
            }
        } catch (error) {
            this.logger.error('❌ Error in chat request:', error instanceof Error ? error : undefined);
            response.markdown('❌ Sorry, I encountered an error processing your request. Please try again.');
            return {};
        }
    }

    /**
     * Handle /explain command
     */
    private async handleExplainCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('📖 Analyzing code...');

        const prompt = this.buildPrompt(
            'code_explanation',
            request.prompt,
            contextInfo,
            'Explain the following code in detail, including its purpose, how it works, and any notable patterns or potential issues.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle /refactor command
     */
    private async handleRefactorCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('🔧 Analyzing code for refactoring opportunities...');

        const prompt = this.buildPrompt(
            'code_refactoring',
            request.prompt,
            contextInfo,
            'Analyze the code and suggest refactoring improvements. Provide the refactored code with explanations of the changes made.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle /test command
     */
    private async handleTestCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('🧪 Generating unit tests...');

        const prompt = this.buildPrompt(
            'test_generation',
            request.prompt,
            contextInfo,
            'Generate comprehensive unit tests for the following code. Include edge cases, error scenarios, and mock dependencies as needed.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle /review command
     */
    private async handleReviewCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('🔍 Performing code review...');

        const prompt = this.buildPrompt(
            'code_review',
            request.prompt,
            contextInfo,
            'Perform a thorough code review. Check for bugs, security issues, performance problems, code style, and best practices.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle /optimize command
     */
    private async handleOptimizeCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('⚡ Analyzing performance optimization opportunities...');

        const prompt = this.buildPrompt(
            'code_optimization',
            request.prompt,
            contextInfo,
            'Analyze the code for performance optimization opportunities. Suggest specific improvements and provide optimized code examples.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle /debug command
     */
    private async handleDebugCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('🐛 Analyzing for potential bugs...');

        const prompt = this.buildPrompt(
            'debug_assistance',
            request.prompt,
            contextInfo,
            'Help debug this code. Identify potential bugs, logical errors, and suggest debugging strategies.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle /document command
     */
    private async handleDocumentCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('📚 Generating documentation...');

        const prompt = this.buildPrompt(
            'documentation',
            request.prompt,
            contextInfo,
            'Generate comprehensive documentation for this code, including JSDoc comments, README sections, and usage examples.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Handle general chat without specific command
     */
    private async handleGeneralChat(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        contextInfo: any,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.progress('💭 Thinking...');

        const prompt = this.buildPrompt(
            'general_chat',
            request.prompt,
            contextInfo,
            'You are an AI coding assistant. Help the user with their programming question or task.'
        );

        await this.streamAIResponse(response, prompt, token);

        return {};
    }

    /**
     * Get current editor context
     */
    private getEditorContext() {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return null;
        }

        const document = activeEditor.document;
        const selection = activeEditor.selection;
        const selectedText = selection.isEmpty ? '' : document.getText(selection);

        return {
            fileName: document.fileName,
            language: document.languageId,
            selectedText,
            cursorPosition: selection.active,
            entireDocument: document.getText(),
            workspaceFolder: vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
        };
    }

    /**
     * Gather context from various sources
     */
    private async gatherContext(prompt: string, editorContext: any) {
        const context: any = {
            editor: editorContext,
            timestamp: new Date().toISOString()
        };

        try {
            // Get context from Apple Context Window
            if (this.appleContextWindow) {
                context.contextWindows = await this.appleContextWindow.getRelevantContext(prompt);
            }

            // Get RAG search results
            if (this.ragPipeline) {
                context.ragResults = await this.ragPipeline.search(prompt, 5);
            }

            // Get Darwin Godel Machine insights
            if (this.darwinGodelMachine) {
                context.dgmInsights = this.darwinGodelMachine.getSuggestions('chat_request', editorContext);
            }
        } catch (error) {
            this.logger.error('Error gathering context:', error instanceof Error ? error : undefined);
        }

        return context;
    }

    /**
     * Build prompt for AI model
     */
    private buildPrompt(type: string, userPrompt: string, context: any, systemInstruction: string): string {
        let prompt = `${systemInstruction}\n\n`;

        // Add user request
        prompt += `User Request: ${userPrompt}\n\n`;

        // Add editor context if available
        if (context.editor) {
            prompt += `Current File: ${context.editor.fileName}\n`;
            prompt += `Language: ${context.editor.language}\n`;

            if (context.editor.selectedText) {
                prompt += `Selected Code:\n\`\`\`${context.editor.language}\n${context.editor.selectedText}\n\`\`\`\n\n`;
            } else {
                // Include a snippet of the current file for context
                const snippet = context.editor.entireDocument.slice(0, 1000);
                prompt += `Current File Context:\n\`\`\`${context.editor.language}\n${snippet}${snippet.length >= 1000 ? '...' : ''}\n\`\`\`\n\n`;
            }
        }

        // Add RAG context if available
        if (context.ragResults?.length > 0) {
            prompt += `Relevant Context from Knowledge Base:\n`;
            context.ragResults.forEach((result: any, index: number) => {
                prompt += `${index + 1}. ${result.content}\n`;
            });
            prompt += '\n';
        }

        // Add Darwin Godel Machine insights
        if (context.dgmInsights) {
            prompt += `AI Insights: ${context.dgmInsights}\n\n`;
        }

        prompt += 'Please provide a helpful, accurate, and detailed response.';

        return prompt;
    }

    /**
     * Stream AI response to chat
     */
    private async streamAIResponse(
        response: vscode.ChatResponseStream,
        prompt: string,
        token: vscode.CancellationToken
    ): Promise<void> {
        try {
            // Use the advanced model manager for better local LLM support
            const config = vscode.workspace.getConfiguration('mike-ai');
            const useAdvanced = config.get('useAdvancedModelManager', true);

            const modelManager = useAdvanced ? this.advancedModelManager : this.aiModelManager;

            // Get AI response (streaming if supported)
            const aiResponse = await modelManager.generateCompletion(modelManager.getModels()[0]?.id || '', prompt, {
                stream: false,
                max_tokens: config.get('maxTokens', 1000),
                temperature: config.get('temperature', 0.7)
            });

            // Stream the response
            response.markdown(aiResponse);

            // Update Darwin Godel Machine with this interaction
            if (this.darwinGodelMachine) {
                await this.darwinGodelMachine.learn('chat_interaction', {
                    prompt,
                    modelId: modelManager.getModels()[0]?.id
                }, {
                    type: 'success',
                    score: 1.0,
                    metadata: { operation: 'chat_response' }
                });
            }

        } catch (error) {
            this.logger.error('Error generating AI response:', error instanceof Error ? error : undefined);
            response.markdown('❌ Sorry, I encountered an error generating the response. Please check your AI model configuration.');
        }
    }

    /**
     * Provide follow-up suggestions
     */
    private provideFollowups(
        result: vscode.ChatResult,
        context: vscode.ChatContext,
        token: vscode.CancellationToken
    ): vscode.ChatFollowup[] {
        const followups: vscode.ChatFollowup[] = [];

        // Add common follow-ups based on the last message
        const lastMessage = context.history[context.history.length - 1];
        if (lastMessage && 'prompt' in lastMessage) {
            followups.push(
                {
                    prompt: '@mikeide /explain Can you explain this in more detail?',
                    label: '🔍 Explain in detail'
                },
                {
                    prompt: '@mikeide /test Generate tests for this code',
                    label: '🧪 Generate tests'
                },
                {
                    prompt: '@mikeide /review Review this code for issues',
                    label: '👁️ Code review'
                },
                {
                    prompt: '@mikeide /refactor How can I refactor this?',
                    label: '🔧 Refactor code'
                }
            );
        }

        return followups;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.chatParticipant?.dispose();
    }
}