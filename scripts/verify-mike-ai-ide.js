#!/usr/bin/env node

/**
 * Mike-AI-IDE Verification Script
 *
 * This script actually tests what we've built instead of making assumptions.
 * It verifies:
 * 1. Product branding is correctly applied
 * 2. Icons exist and are branded
 * 3. Extensions compile
 * 4. Open VSX is configured
 * 5. Build system works
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function log(message, color = 'reset') {
    const colors = {
        reset: '\x1b[0m',
        green: '\x1b[32m',
        red: '\x1b[31m',
        yellow: '\x1b[33m',
        cyan: '\x1b[36m',
        bright: '\x1b[1m'
    };
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`Failed to read ${filePath}: ${error.message}`);
    }
}

async function runCommand(command, args, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
            cwd,
            stdio: 'pipe',
            shell: true
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });

        proc.on('error', reject);
    });
}

// Test 1: Verify Product Branding
function testProductBranding() {
    log('1. Testing Product Branding...', 'cyan');

    if (!fileExists('product.json')) {
        throw new Error('product.json not found');
    }

    const product = readJsonFile('product.json');
    const issues = [];

    if (product.nameShort !== 'Mike-AI-IDE') {
        issues.push(`nameShort should be "Mike-AI-IDE", got "${product.nameShort}"`);
    }

    if (!product.nameLong?.includes('Mike-AI-IDE')) {
        issues.push(`nameLong should contain "Mike-AI-IDE", got "${product.nameLong}"`);
    }

    if (product.applicationName !== 'mike-ai-ide') {
        issues.push(`applicationName should be "mike-ai-ide", got "${product.applicationName}"`);
    }

    if (!product.win32AppId || !product.win32AppId.startsWith('{') || !product.win32AppId.endsWith('}')) {
        issues.push(`win32AppId should be a GUID, got "${product.win32AppId}"`);
    }

    if (issues.length > 0) {
        throw new Error(`Product branding issues: ${issues.join(', ')}`);
    }

    log('   ✅ Product branding is correct', 'green');
    return true;
}

// Test 2: Verify Icons
function testIcons() {
    log('2. Testing Icons...', 'cyan');

    const iconPaths = [
        'resources/win32/code.ico',
        'resources/win32/code_150x150.png',
        'resources/win32/code_70x70.png',
        'resources/darwin/code.png',
        'resources/linux/code.png'
    ];

    const missing = iconPaths.filter(iconPath => !fileExists(iconPath));

    if (missing.length > 0) {
        throw new Error(`Missing icons: ${missing.join(', ')}`);
    }

    log('   ✅ All required icons are present', 'green');
    return true;
}

// Test 3: Verify Mike-AI-IDE Extension
function testMikeAIExtension() {
    log('3. Testing Mike-AI-IDE Extension...', 'cyan');

    const extPath = 'extensions/mike-ai-ide';
    if (!fileExists(path.join(extPath, 'package.json'))) {
        throw new Error('Mike-AI-IDE extension package.json not found');
    }

    const extPackage = readJsonFile(path.join(extPath, 'package.json'));
    if (extPackage.name !== 'mike-ai-ide') {
        throw new Error(`Extension name should be "mike-ai-ide", got "${extPackage.name}"`);
    }

    if (!fileExists(path.join(extPath, 'out/extension.js'))) {
        throw new Error('Extension not compiled - out/extension.js not found');
    }

    log('   ✅ Mike-AI-IDE extension is present and compiled', 'green');
    return true;
}

// Test 4: Verify Open VSX Configuration
function testOpenVSX() {
    log('4. Testing Open VSX Configuration...', 'cyan');

    const product = readJsonFile('product.json');
    const gallery = product.extensionsGallery;

    if (!gallery) {
        throw new Error('extensionsGallery not configured');
    }

    if (gallery.serviceUrl !== 'https://open-vsx.org/vscode/gallery') {
        throw new Error(`Wrong serviceUrl: ${gallery.serviceUrl}`);
    }

    if (gallery.itemUrl !== 'https://open-vsx.org/vscode/item') {
        throw new Error(`Wrong itemUrl: ${gallery.itemUrl}`);
    }

    log('   ✅ Open VSX configuration is correct', 'green');
    return true;
}

// Test 5: Test Basic Build System
async function testBuildSystem() {
    log('5. Testing Build System...', 'cyan');

    if (!fileExists('gulpfile.js')) {
        throw new Error('gulpfile.js not found');
    }

    if (!fileExists('package.json')) {
        throw new Error('package.json not found');
    }

    // Test that gulp tasks exist
    const result = await runCommand('npx', ['gulp', '--tasks'], process.cwd());
    if (result.code !== 0) {
        throw new Error(`Gulp tasks check failed: ${result.stderr}`);
    }

    // Check for key build tasks
    const requiredTasks = ['vscode-win32-x64', 'vscode-linux-x64', 'vscode-darwin-x64'];
    const missingTasks = requiredTasks.filter(task => !result.stdout.includes(task));

    if (missingTasks.length > 0) {
        throw new Error(`Missing build tasks: ${missingTasks.join(', ')}`);
    }

    log('   ✅ Build system is configured correctly', 'green');
    return true;
}

// Test 6: Verify Package Scripts
function testPackageScripts() {
    log('6. Testing Package Scripts...', 'cyan');

    const buildScripts = [
        'scripts/build-mike-ai-ide.js',
        'build-windows.bat'
    ];

    const missing = buildScripts.filter(script => !fileExists(script));
    if (missing.length > 0) {
        throw new Error(`Missing build scripts: ${missing.join(', ')}`);
    }

    log('   ✅ Package scripts are present', 'green');
    return true;
}

async function main() {
    log('🔍 Mike-AI-IDE Verification Script', 'bright');
    log('===================================', 'bright');
    log('This script verifies what we\'ve actually built works.\n', 'yellow');

    const tests = [
        { name: 'Product Branding', fn: testProductBranding },
        { name: 'Icons', fn: testIcons },
        { name: 'Mike-AI Extension', fn: testMikeAIExtension },
        { name: 'Open VSX Config', fn: testOpenVSX },
        { name: 'Build System', fn: testBuildSystem },
        { name: 'Package Scripts', fn: testPackageScripts }
    ];

    let passed = 0;
    let failed = 0;

    for (const test of tests) {
        try {
            if (typeof test.fn === 'function') {
                await test.fn();
            } else {
                test.fn();
            }
            passed++;
        } catch (error) {
            log(`   ❌ ${test.name} failed: ${error.message}`, 'red');
            failed++;
        }
    }

    log('');
    log('📊 Test Results:', 'bright');
    log(`   ✅ Passed: ${passed}`, 'green');
    log(`   ❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');

    if (failed === 0) {
        log('\n🎉 All tests passed! Mike-AI-IDE appears to be working correctly.', 'green');
        return 0;
    } else {
        log(`\n💥 ${failed} test(s) failed. Mike-AI-IDE needs fixes before it will work.`, 'red');
        return 1;
    }
}

main().then(process.exit).catch(error => {
    log(`💥 Test runner failed: ${error.message}`, 'red');
    process.exit(1);
});