# Cursor AI Assistant

A VS Code extension that brings AI-powered coding assistance similar to Cursor.

## Features

- **AI Chat Interface**: Interactive chat panel for asking questions about code
- **Code Explanation**: Right-click on selected code to get AI explanations
- **Inline Code Completion**: AI-powered code completions as you type
- **Context-Aware**: Understands your code and provides relevant suggestions

## Installation

1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
3. Type "Extensions: Install from VSIX"
4. Select the `.vsix` file for this extension

## Setup

1. Set your OpenAI API key as an environment variable:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

2. Restart VS Code

## Usage

### AI Chat
- Press `Ctrl+Shift+L` (or `Cmd+Shift+L` on Mac) to open the AI chat
- Type questions about your code or ask for help
- The AI assistant will respond with helpful information

### Code Explanation
- Select any piece of code
- Right-click and choose "Explain Selected Code"
- The AI will explain what the code does in the chat panel

### Code Completion
- Start typing code
- The AI will suggest completions automatically
- Press `Tab` to accept a suggestion

## Extension Structure

```
cursor-clone/
├── src/
│   ├── extension.ts      # Main extension entry point
│   ├── chatProvider.ts   # Chat interface implementation
│   └── aiService.ts      # AI/OpenAI integration
├── package.json          # Extension manifest
└── tsconfig.json         # TypeScript configuration
```

## Development

To modify the extension:

1. Make changes to the TypeScript files in `src/`
2. Run `npm run compile` to build
3. Press `F5` in VS Code to test your changes

## Features Implemented

✅ AI Chat Interface  
✅ Code Explanation  
✅ Inline Code Completion  
✅ Context Menus  
✅ Keyboard Shortcuts  

This extension provides a foundation for building more advanced AI coding features similar to Cursor.