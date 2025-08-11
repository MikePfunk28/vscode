import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    
    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Mike AI IDE');
        context.subscriptions.push(this.outputChannel);
    }
    
    info(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] INFO: ${message}`;
        this.outputChannel.appendLine(logMessage);
        console.log(logMessage);
    }
    
    error(message: string, error?: Error): void {
        const timestamp = new Date().toISOString();
        const errorMessage = error ? `${message}: ${error.message}` : message;
        const logMessage = `[${timestamp}] ERROR: ${errorMessage}`;
        this.outputChannel.appendLine(logMessage);
        console.error(logMessage, error);
    }
    
    warn(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] WARN: ${message}`;
        this.outputChannel.appendLine(logMessage);
        console.warn(logMessage);
    }
    
    debug(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] DEBUG: ${message}`;
        this.outputChannel.appendLine(logMessage);
        console.debug(logMessage);
    }
    
    show(): void {
        this.outputChannel.show();
    }
}