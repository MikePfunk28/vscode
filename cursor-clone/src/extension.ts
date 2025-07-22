import * as vscode from 'vscode';
import { ChatProvider } from './chatProvider';
import { AIService } from './aiService';

export function activate(context: vscode.ExtensionContext) {
  console.log('Cursor AI Assistant is now active!');

  const aiService = new AIService();
  const chatProvider = new ChatProvider(context, aiService);

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
    } catch (error) {
      vscode.window.showErrorMessage(`Error explaining code: ${error}`);
    }
  });

  // Register inline completion provider
  const completionProvider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: '**' },
    {
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
        } catch (error) {
          console.error('Error getting completion:', error);
        }
        
        return [];
      }
    }
  );

  context.subscriptions.push(
    openChatCommand,
    explainCodeCommand,
    completionProvider
  );
}

export function deactivate() {}