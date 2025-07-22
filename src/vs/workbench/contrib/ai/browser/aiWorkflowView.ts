/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./aiWorkflowView';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewsService } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IAIService } from 'vs/workbench/contrib/ai/common/aiService';
import { Disposable } from 'vs/base/common/lifecycle';
import { $, addDisposableListener, EventType } from 'vs/base/browser/dom';
import { Button } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { localize } from 'vs/nls';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { SelectBox, ISelectOptionItem } from 'vs/base/browser/ui/selectBox/selectBox';
import { attachSelectBoxStyler } from 'vs/platform/theme/common/styler';

export const AI_WORKFLOW_VIEW_ID = 'workbench.panel.ai.workflow';

interface IWorkflowDefinition {
	id: string;
	name: string;
	description: string;
	type: 'single-agent' | 'multi-agent' | 'rag' | 'batch' | 'supervisor' | 'map-reduce';
	nodes: IWorkflowNode[];
	connections: IWorkflowConnection[];
}

interface IWorkflowNode {
	id: string;
	type: 'llm' | 'tool' | 'human' | 'parallel' | 'batch' | 'supervisor';
	name: string;
	config: any;
	position: { x: number; y: number };
}

interface IWorkflowConnection {
	from: string;
	to: string;
	condition?: string;
}

export class AIWorkflowView extends ViewPane {
	private container!: HTMLElement;
	private workflowContainer!: HTMLElement;
	private controlsContainer!: HTMLElement;
	private templateSelect!: SelectBox;
	private createButton!: Button;
	private runButton!: Button;
	private saveButton!: Button;
	
	private currentWorkflow: IWorkflowDefinition | null = null;
	private workflows: IWorkflowDefinition[] = [];

	private readonly workflowTemplates: IWorkflowDefinition[] = [
		{
			id: 'simple-chat',
			name: 'Simple Chat',
			description: 'Basic AI chat workflow',
			type: 'single-agent',
			nodes: [
				{
					id: 'llm1',
					type: 'llm',
					name: 'AI Assistant',
					config: { provider: 'openai', model: 'gpt-4' },
					position: { x: 100, y: 100 }
				}
			],
			connections: []
		},
		{
			id: 'multi-agent',
			name: 'Multi-Agent Collaboration',
			description: 'Multiple AI agents working together',
			type: 'multi-agent',
			nodes: [
				{
					id: 'supervisor',
					type: 'supervisor',
					name: 'Supervisor Agent',
					config: { provider: 'openai', model: 'gpt-4' },
					position: { x: 200, y: 50 }
				},
				{
					id: 'coder',
					type: 'llm',
					name: 'Coder Agent',
					config: { provider: 'anthropic', model: 'claude-3-opus', role: 'coder' },
					position: { x: 100, y: 150 }
				},
				{
					id: 'reviewer',
					type: 'llm',
					name: 'Code Reviewer',
					config: { provider: 'openai', model: 'gpt-4', role: 'reviewer' },
					position: { x: 300, y: 150 }
				}
			],
			connections: [
				{ from: 'supervisor', to: 'coder' },
				{ from: 'coder', to: 'reviewer' },
				{ from: 'reviewer', to: 'supervisor' }
			]
		},
		{
			id: 'rag-system',
			name: 'RAG System',
			description: 'Retrieval-Augmented Generation workflow',
			type: 'rag',
			nodes: [
				{
					id: 'embedding',
					type: 'tool',
					name: 'Document Embedder',
					config: { tool: 'embeddings', provider: 'openai' },
					position: { x: 50, y: 100 }
				},
				{
					id: 'retrieval',
					type: 'tool',
					name: 'Vector Search',
					config: { tool: 'vector-search', index: 'documents' },
					position: { x: 200, y: 100 }
				},
				{
					id: 'generation',
					type: 'llm',
					name: 'Answer Generator',
					config: { provider: 'anthropic', model: 'claude-3-sonnet' },
					position: { x: 350, y: 100 }
				}
			],
			connections: [
				{ from: 'embedding', to: 'retrieval' },
				{ from: 'retrieval', to: 'generation' }
			]
		},
		{
			id: 'code-review',
			name: 'Code Review Workflow',
			description: 'Automated code review with multiple agents',
			type: 'map-reduce',
			nodes: [
				{
					id: 'splitter',
					type: 'tool',
					name: 'Code Splitter',
					config: { tool: 'code-splitter' },
					position: { x: 50, y: 100 }
				},
				{
					id: 'parallel-review',
					type: 'parallel',
					name: 'Parallel Review',
					config: { count: 3 },
					position: { x: 200, y: 100 }
				},
				{
					id: 'aggregator',
					type: 'llm',
					name: 'Review Aggregator',
					config: { provider: 'openai', model: 'gpt-4' },
					position: { x: 350, y: 100 }
				}
			],
			connections: [
				{ from: 'splitter', to: 'parallel-review' },
				{ from: 'parallel-review', to: 'aggregator' }
			]
		}
	];

	constructor(
		options: any,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewsService viewsService: IViewsService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAIService private readonly aiService: IAIService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super(options, instantiationService, viewDescriptorService, keybindingService, contextMenuService, configurationService, contextKeyService, viewsService, openerService, themeService, telemetryService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this.container = container;
		this.container.classList.add('ai-workflow-view');

		this.createHeader();
		this.createWorkflowCanvas();
		this.loadWorkflows();
	}

	private createHeader(): void {
		const headerContainer = $('.workflow-header');
		this.container.appendChild(headerContainer);

		// Workflow template selector
		const selectContainer = $('.select-container');
		headerContainer.appendChild(selectContainer);

		const label = $('label');
		label.textContent = localize('selectTemplate', 'Template:');
		selectContainer.appendChild(label);

		const templateOptions: ISelectOptionItem[] = this.workflowTemplates.map(template => ({
			text: template.name,
			description: template.description
		}));

		this.templateSelect = new SelectBox(templateOptions, 0, this.contextViewService, undefined, {
			useCustomDrawn: true,
			ariaLabel: localize('workflowTemplate', 'Workflow Template')
		});

		selectContainer.appendChild(this.templateSelect.domNode);
		this._register(attachSelectBoxStyler(this.templateSelect, this.themeService));

		// Control buttons
		const buttonsContainer = $('.buttons-container');
		headerContainer.appendChild(buttonsContainer);

		this.createButton = new Button(buttonsContainer, { title: localize('createWorkflow', 'Create Workflow') });
		this.createButton.label = localize('create', 'Create');
		this._register(attachButtonStyler(this.createButton, this.themeService));
		this._register(this.createButton.onDidClick(() => this.createWorkflow()));

		this.runButton = new Button(buttonsContainer, { title: localize('runWorkflow', 'Run Workflow') });
		this.runButton.label = localize('run', 'Run');
		this._register(attachButtonStyler(this.runButton, this.themeService));
		this._register(this.runButton.onDidClick(() => this.runWorkflow()));

		this.saveButton = new Button(buttonsContainer, { title: localize('saveWorkflow', 'Save Workflow') });
		this.saveButton.label = localize('save', 'Save');
		this._register(attachButtonStyler(this.saveButton, this.themeService));
		this._register(this.saveButton.onDidClick(() => this.saveWorkflow()));
	}

	private createWorkflowCanvas(): void {
		this.workflowContainer = $('.workflow-canvas');
		this.workflowContainer.style.height = '400px';
		this.workflowContainer.style.border = '1px solid var(--vscode-panel-border)';
		this.workflowContainer.style.backgroundColor = 'var(--vscode-editor-background)';
		this.workflowContainer.style.position = 'relative';
		this.workflowContainer.style.overflow = 'auto';
		this.container.appendChild(this.workflowContainer);
	}

	private createWorkflow(): void {
		const selectedIndex = this.templateSelect.selected;
		const template = this.workflowTemplates[selectedIndex];
		
		if (template) {
			this.currentWorkflow = {
				...template,
				id: `workflow-${Date.now()}`,
				name: `${template.name} - ${new Date().toLocaleDateString()}`
			};
			
			this.renderWorkflow();
			this.notificationService.info(localize('workflowCreated', 'Workflow created: {0}', this.currentWorkflow.name));
		}
	}

	private renderWorkflow(): void {
		if (!this.currentWorkflow) return;

		// Clear canvas
		this.workflowContainer.innerHTML = '';

		// Render nodes
		this.currentWorkflow.nodes.forEach(node => {
			const nodeElement = $('.workflow-node');
			nodeElement.style.position = 'absolute';
			nodeElement.style.left = `${node.position.x}px`;
			nodeElement.style.top = `${node.position.y}px`;
			nodeElement.style.width = '120px';
			nodeElement.style.height = '80px';
			nodeElement.style.border = '2px solid var(--vscode-button-background)';
			nodeElement.style.backgroundColor = 'var(--vscode-button-hoverBackground)';
			nodeElement.style.borderRadius = '8px';
			nodeElement.style.display = 'flex';
			nodeElement.style.flexDirection = 'column';
			nodeElement.style.alignItems = 'center';
			nodeElement.style.justifyContent = 'center';
			nodeElement.style.cursor = 'pointer';
			nodeElement.style.userSelect = 'none';

			const nodeTitle = $('.node-title');
			nodeTitle.textContent = node.name;
			nodeTitle.style.fontWeight = 'bold';
			nodeTitle.style.fontSize = '12px';
			nodeTitle.style.color = 'var(--vscode-button-foreground)';
			nodeElement.appendChild(nodeTitle);

			const nodeType = $('.node-type');
			nodeType.textContent = node.type.toUpperCase();
			nodeType.style.fontSize = '10px';
			nodeType.style.color = 'var(--vscode-descriptionForeground)';
			nodeElement.appendChild(nodeType);

			this.workflowContainer.appendChild(nodeElement);
		});

		// Render connections (simplified - just draw lines)
		this.currentWorkflow.connections.forEach(connection => {
			const fromNode = this.currentWorkflow!.nodes.find(n => n.id === connection.from);
			const toNode = this.currentWorkflow!.nodes.find(n => n.id === connection.to);
			
			if (fromNode && toNode) {
				const line = document.createElement('div');
				line.style.position = 'absolute';
				line.style.backgroundColor = 'var(--vscode-button-background)';
				line.style.height = '2px';
				
				const startX = fromNode.position.x + 60; // center of node
				const startY = fromNode.position.y + 40;
				const endX = toNode.position.x + 60;
				const endY = toNode.position.y + 40;
				
				const width = Math.abs(endX - startX);
				const left = Math.min(startX, endX);
				
				line.style.left = `${left}px`;
				line.style.top = `${startY}px`;
				line.style.width = `${width}px`;
				
				this.workflowContainer.appendChild(line);
			}
		});
	}

	private async runWorkflow(): Promise<void> {
		if (!this.currentWorkflow) {
			this.notificationService.warn(localize('noWorkflow', 'No workflow selected'));
			return;
		}

		try {
			this.notificationService.info(localize('runningWorkflow', 'Running workflow: {0}', this.currentWorkflow.name));
			
			// Execute workflow based on type
			const result = await this.executeWorkflow(this.currentWorkflow);
			
			this.notificationService.info(localize('workflowComplete', 'Workflow completed successfully'));
			console.log('Workflow result:', result);
		} catch (error) {
			this.notificationService.error(localize('workflowError', 'Workflow execution failed: {0}', String(error)));
		}
	}

	private async executeWorkflow(workflow: IWorkflowDefinition): Promise<any> {
		switch (workflow.type) {
			case 'single-agent':
				return await this.executeSingleAgent(workflow);
			case 'multi-agent':
				return await this.executeMultiAgent(workflow);
			case 'rag':
				return await this.executeRAGWorkflow(workflow);
			case 'map-reduce':
				return await this.executeMapReduce(workflow);
			default:
				throw new Error(`Unsupported workflow type: ${workflow.type}`);
		}
	}

	private async executeSingleAgent(workflow: IWorkflowDefinition): Promise<string> {
		const llmNode = workflow.nodes.find(n => n.type === 'llm');
		if (!llmNode) throw new Error('No LLM node found');
		
		return await this.aiService.chat('Hello, please introduce yourself as an AI assistant.');
	}

	private async executeMultiAgent(workflow: IWorkflowDefinition): Promise<any> {
		// Simplified multi-agent execution
		const results = {};
		for (const node of workflow.nodes) {
			if (node.type === 'llm') {
				const prompt = `You are ${node.name}. Please introduce your role and capabilities.`;
				results[node.id] = await this.aiService.chat(prompt);
			}
		}
		return results;
	}

	private async executeRAGWorkflow(workflow: IWorkflowDefinition): Promise<string> {
		// Simplified RAG execution
		const question = 'What are the key concepts in software engineering?';
		return await this.aiService.chat(`Using your knowledge base, answer this question: ${question}`);
	}

	private async executeMapReduce(workflow: IWorkflowDefinition): Promise<any> {
		// Simplified map-reduce execution
		const items = ['Code quality', 'Performance', 'Security', 'Maintainability'];
		const results = await Promise.all(
			items.map(item => this.aiService.chat(`Analyze this aspect of software development: ${item}`))
		);
		
		// Reduce step
		const summary = await this.aiService.chat(`Summarize these analyses into a comprehensive report: ${results.join('\n\n')}`);
		return { items: results, summary };
	}

	private saveWorkflow(): void {
		if (!this.currentWorkflow) {
			this.notificationService.warn(localize('noWorkflow', 'No workflow to save'));
			return;
		}

		this.workflows.push({...this.currentWorkflow});
		this.notificationService.info(localize('workflowSaved', 'Workflow saved: {0}', this.currentWorkflow.name));
	}

	private loadWorkflows(): void {
		// Load saved workflows from configuration or storage
		// For now, just initialize with templates
		this.workflows = [...this.workflowTemplates];
	}
}