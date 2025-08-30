#!/usr/bin/env node

/**
 * Mike-AI-IDE Development Tools Bundler
 *
 * This script ensures that essential development tools and the Mike-AI extension
 * are properly bundled with the IDE during the build process.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Bundling Mike-AI-IDE Development Tools...');

// Paths
const rootDir = path.join(__dirname, '..');
const extensionsDir = path.join(rootDir, 'extensions');
const resourcesDir = path.join(rootDir, 'resources');
const profilesDir = path.join(resourcesDir, 'profiles');

// Ensure our Mike-AI extension is built
const mikeAIExtensionPath = path.join(extensionsDir, 'mike-ai-ide');
if (!fs.existsSync(mikeAIExtensionPath)) {
    console.error('❌ Mike-AI-IDE extension not found at:', mikeAIExtensionPath);
    process.exit(1);
}

console.log('✅ Mike-AI-IDE extension found');

// Ensure profiles directory exists
if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
    console.log('📁 Created profiles directory');
}

// Verify profile exists
const profilePath = path.join(profilesDir, 'mike-ai-developer.json');
if (!fs.existsSync(profilePath)) {
    console.error('❌ Mike-AI Developer profile not found at:', profilePath);
    process.exit(1);
}

console.log('✅ Mike-AI Developer profile found');

// Verify product.json includes profile configuration
const productJsonPath = path.join(rootDir, 'product.json');
const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));

if (!productJson.builtInProfiles) {
    console.error('❌ No builtInProfiles section found in product.json');
    process.exit(1);
}

console.log('✅ Built-in profiles configured');

// Create a manifest of bundled tools
const manifest = {
    name: 'Mike-AI-IDE Development Tools Bundle',
    version: '1.0.0',
    generated: new Date().toISOString(),
    components: {
        aiExtension: {
            name: 'mike-ai-ide',
            path: './extensions/mike-ai-ide',
            status: fs.existsSync(mikeAIExtensionPath) ? 'bundled' : 'missing'
        },
        developerProfile: {
            name: 'mike-ai-developer',
            path: './resources/profiles/mike-ai-developer.json',
            status: fs.existsSync(profilePath) ? 'bundled' : 'missing'
        },
        productConfiguration: {
            name: 'product.json',
            path: './product.json',
            builtInProfiles: productJson.builtInProfiles?.length || 0,
            status: 'configured'
        }
    },
    features: [
        'Chat Participant API (@mikeide commands)',
        'Darwin Godel Machine (self-learning AI)',
        'Apple Context Windows (intelligent context management)',
        'RAG Pipeline (knowledge base integration)',
        'Local LLM support (Ollama, llama.cpp)',
        'Multi-model AI integration',
        'Essential development extensions pre-configured',
        'Optimized settings for AI-powered development'
    ]
};

// Write manifest
const manifestPath = path.join(resourcesDir, 'dev-tools-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('📋 Generated tools manifest at:', manifestPath);

// Validate Mike-AI extension package.json
const extensionPackagePath = path.join(mikeAIExtensionPath, 'package.json');
if (fs.existsSync(extensionPackagePath)) {
    const extensionPackage = JSON.parse(fs.readFileSync(extensionPackagePath, 'utf8'));

    if (!extensionPackage.contributes?.chatParticipants) {
        console.error('❌ Mike-AI extension missing chatParticipants configuration');
        process.exit(1);
    }

    console.log('✅ Mike-AI extension Chat Participant configured');
    console.log(`   - Participant ID: ${extensionPackage.contributes.chatParticipants[0]?.id}`);
    console.log(`   - Commands: ${extensionPackage.contributes.chatParticipants[0]?.commands?.length || 0}`);
}

// Check if extension is compiled
const extensionOutPath = path.join(mikeAIExtensionPath, 'out');
if (!fs.existsSync(extensionOutPath)) {
    console.warn('⚠️  Mike-AI extension not compiled. Run npm run compile in extension directory.');
} else {
    console.log('✅ Mike-AI extension compiled');
}

console.log('\n🎉 Mike-AI-IDE Development Tools Bundle Complete!');
console.log('\nBundled components:');
Object.entries(manifest.components).forEach(([key, component]) => {
    console.log(`  - ${component.name}: ${component.status}`);
});

console.log('\n🚀 Ready for Phase 6: MCP Integration');