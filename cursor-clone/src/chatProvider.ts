import * as vscode from 'vscode';
import { AIService } from './aiService';

export class ChatProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'cursorAIChat';
  private _view?: vscode.WebviewView;
  private _messages: Array<{role: string, content: string}> = [];

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _aiService: AIService
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        this._extensionContext.extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async data => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleUserMessage(data.message);
          break;
        case 'clearChat':
          this._messages = [];
          this._updateWebview();
          break;
      }
    });
  }

  private async _handleUserMessage(message: string) {
    this._messages.push({ role: 'user', content: message });
    this._updateWebview();

    try {
      const response = await this._aiService.chat(message);
      this._messages.push({ role: 'assistant', content: response });
    } catch (error) {
      this._messages.push({ 
        role: 'assistant', 
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      });
    }
    
    this._updateWebview();
  }

  public addMessage(role: string, content: string) {
    this._messages.push({ role, content });
    this._updateWebview();
  }

  private _updateWebview() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateMessages',
        messages: this._messages
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Assistant</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 10px;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        #messages {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 10px;
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            border-radius: 4px;
        }
        .message {
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 4px;
        }
        .user-message {
            background-color: var(--vscode-inputValidation-infoBorder);
            margin-left: 20px;
        }
        .assistant-message {
            background-color: var(--vscode-editor-selectionBackground);
            margin-right: 20px;
        }
        .input-container {
            display: flex;
            gap: 5px;
        }
        #messageInput {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
        }
        button {
            padding: 8px 12px;
            border: none;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #clearButton {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
    </style>
</head>
<body>
    <div id="messages"></div>
    <div class="input-container">
        <input type="text" id="messageInput" placeholder="Ask AI anything..." />
        <button id="sendButton">Send</button>
        <button id="clearButton">Clear</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const clearButton = document.getElementById('clearButton');

        function addMessage(role, content) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (role === 'user' ? 'user-message' : 'assistant-message');
            messageDiv.innerHTML = '<strong>' + (role === 'user' ? 'You' : 'AI') + ':</strong><br>' + content.replace(/\\n/g, '<br>');
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }

        function sendMessage() {
            const message = messageInput.value.trim();
            if (message) {
                vscode.postMessage({
                    type: 'sendMessage',
                    message: message
                });
                messageInput.value = '';
            }
        }

        sendButton.addEventListener('click', sendMessage);
        clearButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'clearChat' });
            messagesDiv.innerHTML = '';
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateMessages':
                    messagesDiv.innerHTML = '';
                    message.messages.forEach(msg => {
                        addMessage(msg.role, msg.content);
                    });
                    break;
            }
        });
    </script>
</body>
</html>`;
  }
}