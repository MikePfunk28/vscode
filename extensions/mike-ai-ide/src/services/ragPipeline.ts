import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface Document {
    id: string;
    content: string;
    metadata: {
        filePath: string;
        language?: string;
        lastModified: number;
        size: number;
        type: 'file' | 'function' | 'class' | 'interface';
        [key: string]: any;
    };
    embedding?: number[];
}

export class RAGPipeline {
    private documents: Map<string, Document> = new Map();
    private index: Map<string, string[]> = new Map(); // Simple keyword index
    
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}
    
    async initialize(): Promise<void> {
        this.logger.info('Initializing RAG Pipeline...');
        
        // Load previously indexed documents
        const savedDocs = this.context.workspaceState.get<any>('rag-documents', {});
        this.documents = new Map(Object.entries(savedDocs));
        
        // Rebuild simple index
        await this.rebuildIndex();
        
        this.logger.info(`RAG Pipeline initialized with ${this.documents.size} documents`);
    }
    
    async indexFile(filePath: string, content: string): Promise<void> {
        try {
            const stat = fs.statSync(filePath);
            const docId = this.generateDocId(filePath);
            
            // Determine file type and language
            const ext = path.extname(filePath).toLowerCase();
            const language = this.getLanguageFromExtension(ext);
            
            const document: Document = {
                id: docId,
                content: content.length > 10000 ? content.substring(0, 10000) : content, // Limit content size
                metadata: {
                    filePath,
                    language,
                    lastModified: stat.mtime.getTime(),
                    size: stat.size,
                    type: 'file'
                }
            };
            
            this.documents.set(docId, document);
            await this.updateIndex(document);
            
            // Save to workspace state periodically
            if (this.documents.size % 10 === 0) {
                await this.saveDocuments();
            }
            
            this.logger.debug(`Indexed file: ${filePath}`);
        } catch (error) {
            this.logger.error(`Failed to index file ${filePath}`, error as Error);
        }
    }
    
    private generateDocId(filePath: string): string {
        return `doc_${Buffer.from(filePath).toString('base64')}`;
    }
    
    private getLanguageFromExtension(ext: string): string {
        const langMap: { [key: string]: string } = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascriptreact',
            '.tsx': 'typescriptreact',
            '.py': 'python',
            '.java': 'java',
            '.c': 'c',
            '.cpp': 'cpp',
            '.cs': 'csharp',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.html': 'html',
            '.css': 'css',
            '.json': 'json',
            '.md': 'markdown',
            '.sql': 'sql',
            '.sh': 'shell'
        };
        
        return langMap[ext] || 'plaintext';
    }
    
    private async updateIndex(document: Document): Promise<void> {
        // Simple keyword indexing
        const words = this.extractKeywords(document.content);
        
        words.forEach(word => {
            if (!this.index.has(word)) {
                this.index.set(word, []);
            }
            
            const docIds = this.index.get(word)!;
            if (!docIds.includes(document.id)) {
                docIds.push(document.id);
            }
        });
    }
    
    private extractKeywords(content: string): string[] {
        // Simple keyword extraction
        const words = content
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .filter(word => !this.isStopWord(word));
        
        // Remove duplicates and return
        return [...new Set(words)];
    }
    
    private isStopWord(word: string): boolean {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
        ]);
        
        return stopWords.has(word);
    }
    
    async search(query: string, limit: number = 10): Promise<Document[]> {
        const queryWords = this.extractKeywords(query);
        const docScores = new Map<string, number>();
        
        // Score documents based on keyword matches
        queryWords.forEach(word => {
            const docIds = this.index.get(word) || [];
            docIds.forEach(docId => {
                docScores.set(docId, (docScores.get(docId) || 0) + 1);
            });
        });
        
        // Sort by score and get documents
        const sortedDocs = Array.from(docScores.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([docId]) => this.documents.get(docId))
            .filter((doc): doc is Document => doc !== undefined);
        
        this.logger.debug(`RAG search for "${query}" returned ${sortedDocs.length} results`);
        return sortedDocs;
    }
    
    async indexProject(projectPath: string): Promise<void> {
        this.logger.info(`Indexing project: ${projectPath}`);
        
        const filePatterns = [
            '**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx',
            '**/*.py', '**/*.java', '**/*.c', '**/*.cpp',
            '**/*.cs', '**/*.go', '**/*.rs', '**/*.php',
            '**/*.rb', '**/*.swift', '**/*.kt',
            '**/*.html', '**/*.css', '**/*.json',
            '**/*.md', '**/*.txt'
        ];
        
        let indexedCount = 0;
        
        for (const pattern of filePatterns) {
            try {
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(projectPath, pattern),
                    '**/node_modules/**', // Exclude node_modules
                    100 // Limit per pattern
                );
                
                for (const file of files) {
                    try {
                        const content = fs.readFileSync(file.fsPath, 'utf8');
                        await this.indexFile(file.fsPath, content);
                        indexedCount++;
                        
                        // Prevent blocking the UI
                        if (indexedCount % 5 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 1));
                        }
                    } catch (error) {
                        this.logger.warn(`Failed to read file: ${file.fsPath}`);
                    }
                }
            } catch (error) {
                this.logger.warn(`Failed to find files with pattern: ${pattern}`);
            }
        }
        
        await this.saveDocuments();
        this.logger.info(`Project indexing completed. Indexed ${indexedCount} files.`);
    }
    
    async calculateSimilarity(text1: string, text2: string): Promise<number> {
        // Simple cosine similarity based on keywords
        const words1 = new Set(this.extractKeywords(text1));
        const words2 = new Set(this.extractKeywords(text2));
        
        const intersection = new Set([...words1].filter(x => words2.has(x)));
        const union = new Set([...words1, ...words2]);
        
        if (union.size === 0) return 0;
        
        // Jaccard similarity as approximation
        return intersection.size / union.size;
    }
    
    getDocument(id: string): Document | undefined {
        return this.documents.get(id);
    }
    
    async removeDocument(id: string): Promise<boolean> {
        const removed = this.documents.delete(id);
        if (removed) {
            await this.rebuildIndex();
            await this.saveDocuments();
        }
        return removed;
    }
    
    private async rebuildIndex(): Promise<void> {
        this.index.clear();
        
        for (const document of this.documents.values()) {
            await this.updateIndex(document);
        }
    }
    
    private async saveDocuments(): Promise<void> {
        const docsObj = Object.fromEntries(this.documents);
        await this.context.workspaceState.update('rag-documents', docsObj);
    }
    
    async close(): Promise<void> {
        await this.saveDocuments();
        this.logger.info('RAG Pipeline closed');
    }
    
    getMetrics(): any {
        const languageStats = new Map<string, number>();
        const typeStats = new Map<string, number>();
        
        this.documents.forEach(doc => {
            const lang = doc.metadata.language || 'unknown';
            const type = doc.metadata.type || 'unknown';
            
            languageStats.set(lang, (languageStats.get(lang) || 0) + 1);
            typeStats.set(type, (typeStats.get(type) || 0) + 1);
        });
        
        return {
            totalDocuments: this.documents.size,
            totalIndexTerms: this.index.size,
            languageDistribution: Object.fromEntries(languageStats),
            typeDistribution: Object.fromEntries(typeStats),
            averageDocumentSize: this.documents.size > 0 
                ? Array.from(this.documents.values()).reduce((sum, doc) => sum + doc.content.length, 0) / this.documents.size 
                : 0
        };
    }
}