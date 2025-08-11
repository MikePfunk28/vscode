import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AppleContextWindow, ContextWindow } from '../services/appleContextWindow';

export class ContextViewProvider implements vscode.TreeDataProvider<ContextWindow> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ContextWindow | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private appleContextWindow: AppleContextWindow
    ) {}
    
    getTreeItem(element: ContextWindow): vscode.TreeItem {
        const item = new vscode.TreeItem(
            `${element.type}: ${element.content.substring(0, 30)}...`,
            vscode.TreeItemCollapsibleState.None
        );
        
        item.tooltip = element.content;
        item.description = `Score: ${(element.metadata.relevanceScore || 0).toFixed(2)}`;
        
        // Set icon based on type
        switch (element.type) {
            case 'file':
                item.iconPath = new vscode.ThemeIcon('file');
                break;
            case 'code':
                item.iconPath = new vscode.ThemeIcon('code');
                break;
            case 'conversation':
                item.iconPath = new vscode.ThemeIcon('comment');
                break;
            case 'documentation':
                item.iconPath = new vscode.ThemeIcon('book');
                break;
        }
        
        return item;
    }
    
    getChildren(element?: ContextWindow): Thenable<ContextWindow[]> {
        if (!element) {
            return Promise.resolve(this.appleContextWindow.getContextWindows());
        }
        return Promise.resolve([]);
    }
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}