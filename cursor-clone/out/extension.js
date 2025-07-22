"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const chatProvider_1 = require("./chatProvider");
const aiService_1 = require("./aiService");
function activate(context) {
    console.log('Cursor AI Assistant is now active!');
    const aiService = new aiService_1.AIService();
    const chatProvider = new chatProvider_1.ChatProvider(context, aiService);
    // Register the chat view
    vscode.window.registerWebviewViewProvider('cursorAIChat', chatProvider);
    // Register commands
    const openChatCommand = vscode.commands.registerCommand('cursor-ai-assistant.openChat', () => {
        vscode.commands.executeCommand('cursorAIChat.focus');
    });
    const explainCodeCommand = vscode.commands.registerCommand('cursor-ai-assistant.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        if (!selectedText) {
            vscode.window.showWarningMessage('No code selected');
            return;
        }
        try {
            const explanation = await aiService.explainCode(selectedText);
            chatProvider.addMessage('AI', explanation);
            vscode.commands.executeCommand('cursorAIChat.focus');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error explaining code: ${error}`);
        }
    });
    // Register inline completion provider
    const completionProvider = vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, {
        provideInlineCompletionItems: async (document, position, context, token) => {
            const line = document.lineAt(position.line);
            const prefix = line.text.substring(0, position.character);
            if (prefix.trim().length < 3) {
                return [];
            }
            try {
                const completion = await aiService.getCodeCompletion(prefix, document.languageId);
                if (completion) {
                    return [
                        new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))
                    ];
                }
            }
            catch (error) {
                console.error('Error getting completion:', error);
            }
            return [];
        }
    });
    context.subscriptions.push(openChatCommand, explainCodeCommand, completionProvider);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map