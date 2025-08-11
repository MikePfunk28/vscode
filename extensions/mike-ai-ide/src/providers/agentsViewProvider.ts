import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AgentCoordinator, Agent } from '../services/agentCoordinator';

export class AgentsViewProvider implements vscode.TreeDataProvider<Agent> {
    private _onDidChangeTreeData = new vscode.EventEmitter<Agent | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private agentCoordinator: AgentCoordinator
    ) {}
    
    getTreeItem(element: Agent): vscode.TreeItem {
        const item = new vscode.TreeItem(
            `${element.name} (${element.type})`,
            vscode.TreeItemCollapsibleState.None
        );
        
        item.description = element.status;
        item.tooltip = element.task || 'No active task';
        
        // Set icon based on status
        switch (element.status) {
            case 'working':
                item.iconPath = new vscode.ThemeIcon('loading~spin');
                break;
            case 'completed':
                item.iconPath = new vscode.ThemeIcon('check');
                break;
            case 'error':
                item.iconPath = new vscode.ThemeIcon('error');
                break;
            default:
                item.iconPath = new vscode.ThemeIcon('circle-outline');
        }
        
        return item;
    }
    
    getChildren(element?: Agent): Thenable<Agent[]> {
        if (!element) {
            return Promise.resolve(this.agentCoordinator.getAgents());
        }
        return Promise.resolve([]);
    }
    
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}