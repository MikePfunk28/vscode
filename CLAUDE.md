# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a VS Code fork being developed into a Cursor/Windsurf-style AI-powered IDE. The project builds upon the VS Code architecture while integrating AI coding assistance features similar to Cursor, Windsurf, and other AI-enhanced editors. The codebase includes both the core VS Code foundation and custom AI integration layers.

## Development Commands

### Building & Compilation
- `npm run compile` - Compile TypeScript source to JavaScript
- `npm run compile-build` - Build with mangling for production
- `npm run compile-web` - Compile web version
- `npm run compile-cli` - Compile CLI components
- `npm run gulp [task]` - Run specific Gulp build tasks

### Development & Watching
- `npm run watch` - Watch and recompile both client and extensions
- `npm run watch-client` - Watch only client source changes
- `npm run watch-extensions` - Watch only extension changes
- `npm run watch-web` - Watch web version changes
- `npm run watchd` - Watch with deemon daemon
- `npm run kill-watchd` - Stop watch daemon
- `npm run restart-watchd` - Restart watch daemon

### Testing
- `npm run test-node` - Run Node.js unit tests with Mocha
- `npm run test-browser` - Run browser-based tests with Playwright
- `npm run test-extension` - Run extension tests with vscode-test
- `npm run smoketest` - Run smoke tests (compile first)
- `npm run smoketest-no-compile` - Run smoke tests without compilation
- Scripts in `scripts/` directory:
  - `./scripts/test.sh` - General test runner
  - `./scripts/test-integration.sh` - Integration tests
  - `./scripts/test-web-integration.sh` - Web integration tests

### Code Quality & Validation
- `npm run eslint` - Run ESLint linting
- `npm run stylelint` - Run Stylelint for CSS
- `npm run hygiene` - Run hygiene checks
- `npm run valid-layers-check` - Validate architectural layer dependencies
- `npm run monaco-compile-check` - Type check Monaco editor code
- `npm run vscode-dts-compile-check` - Type check VS Code API definitions
- `npm run tsec-compile-check` - Run TypeScript security checks

### Development Scripts
- `./scripts/code.sh` - Run development build locally
- `./scripts/code-server.sh` - Run VS Code server
- `./scripts/code-web.sh` - Run web version
- `./scripts/code-cli.sh` - Run CLI

## Architecture Overview

VS Code follows a strict layered architecture with dependency injection:

### Core Layers (src/vs/)
1. **base/** - Foundation utilities, cross-platform abstractions, no dependencies on other VS Code layers
2. **platform/** - Platform services with dependency injection infrastructure
3. **editor/** - Text editor implementation, language services, syntax highlighting
4. **workbench/** - Main application UI and feature integration

### Key Source Directories
- **src/vs/base/** - Core utilities (arrays, strings, DOM, events, async patterns)
- **src/vs/platform/** - Services (files, configuration, commands, keybindings, etc.)
- **src/vs/editor/** - Text editor engine and language features
- **src/vs/workbench/** - Main application workbench
  - `workbench/browser/` - Core workbench UI components
  - `workbench/services/` - Workbench-level service implementations
  - `workbench/contrib/` - Feature contributions (git, debug, search, terminal, **AI**)
  - `workbench/api/` - Extension host and VS Code API implementation
- **src/vs/code/** - Electron main process implementation
- **src/vs/server/** - Server-specific implementation

### AI Integration Architecture
- **src/vs/workbench/contrib/ai/** - Core AI service integration
  - `browser/aiService.ts` - Multi-provider AI service (OpenAI, Anthropic, Google, etc.)
  - `browser/aiChatView.ts` - AI chat interface component
  - `common/aiService.ts` - AI service interfaces and types
- **cursor-clone/** - Standalone VS Code extension for AI features
  - Extension-based AI implementation for development/testing
  - Includes chat provider, code completion, and explanation features

### Built-in Extensions (extensions/)
- Language support: `typescript-language-features/`, `html-language-features/`, `css-language-features/`
- Core features: `git/`, `debug-auto-launch/`, `emmet/`, `markdown-language-features/`
- Themes: `theme-*` directories
- Development tools: `extension-editing/`, `vscode-api-tests/`

### Configuration Files
- TypeScript configs in `src/tsconfig.*.json` for different build targets
- ESLint config in `eslint.config.js`
- Gulp build tasks in `build/gulpfile.js`

## Development Workflow

### Architectural Principles
- **Layered dependencies**: Lower layers cannot depend on higher layers
- **Dependency injection**: Services injected through constructors using `@IServiceName` decorators
- **Contribution model**: Features register through contribution points and registries
- **Cross-platform**: Platform-specific code isolated in separate files/folders

### Code Guidelines
- Use tabs for indentation (not spaces)
- PascalCase for types/enums, camelCase for functions/variables
- Arrow functions preferred over function expressions
- Always use curly braces for conditionals/loops
- Prefer `async/await` over Promise chains
- All user-facing strings must be localized with `nls.localize()`

### Testing Strategy
- Unit tests co-located in `src/vs/*/test/` directories
- Integration tests in `test/integration/`
- Smoke tests in `test/smoke/`
- Browser tests use Playwright, Node tests use Mocha
- Extension tests use `@vscode/test-electron` or `@vscode/test-web`

### Finding Code
- Use semantic search for general concepts
- Grep for exact error messages or function names  
- Follow import statements to understand dependencies
- Check test files for usage patterns and expected behavior
- Contribution points are registered in `*.contribution.ts` files

## AI Coding Assistant Development

### AI Service Architecture
The AI integration follows VS Code's service pattern with dependency injection:

- **IAIService** interface defines core AI operations (chat, code completion, explanation)
- **Multi-provider support**: OpenAI, Anthropic Claude, Google Gemini, Amazon Bedrock, OpenRouter, Ollama, LM Studio
- **Configuration-driven**: Provider, model, API keys configurable via VS Code settings
- **Request/Response patterns**: Consistent interfaces across different AI providers

### Key AI Features Implemented
1. **Chat Interface** (`src/vs/workbench/contrib/ai/browser/aiChatView.ts`)
   - Markdown rendering for AI responses
   - Provider selection UI
   - Message history management
   - Real-time chat with AI models

2. **Code Operations** (`src/vs/workbench/contrib/ai/browser/aiService.ts`)
   - `explainCode()` - Code explanation
   - `generateCode()` - Code generation from descriptions
   - `fixCode()` - Bug fixing assistance
   - `optimizeCode()` - Performance optimization
   - `getCodeCompletion()` - Inline completions

3. **Extension Integration** (`cursor-clone/`)
   - VS Code extension implementing AI features
   - Right-click context menus for code explanation
   - Inline completion provider
   - Chat panel integration

### Development Patterns for AI Features

#### Adding New AI Providers
1. Add provider configuration to `aiService.ts` providers array
2. Implement provider-specific API calls (see `chatOpenAICompatible`, `chatAnthropic`)
3. Handle authentication and endpoint differences
4. Update provider selection UI

#### Integrating AI into Editor Features
1. Use VS Code's contribution points (`onCommand`, `languages.registerInlineCompletionItemProvider`)
2. Follow dependency injection patterns with `@IServiceName` decorators
3. Implement proper error handling and user notifications
4. Maintain context awareness (current file, selection, language)

#### AI Chat Integration
1. Extend `ViewPane` for UI components
2. Use VS Code's theme system for consistent styling
3. Implement accessibility features (ARIA labels, keyboard navigation)
4. Handle markdown rendering for rich AI responses

## Extension Development
Extensions follow standard VS Code extension patterns with `package.json` manifests and TypeScript sources. Each built-in extension contributes to the workbench through the Extension API defined in `src/vscode-dts/vscode.d.ts`.

The AI features can be developed as either:
- **Built-in contributions** in `src/vs/workbench/contrib/ai/`
- **Standalone extensions** in `cursor-clone/` or similar directories
- **Hybrid approach** combining both for development flexibility