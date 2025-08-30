#!/usr/bin/env node

/**
 * Mike-AI-IDE Multi-Platform Build Script
 *
 * This script handles building Mike-AI-IDE for all supported platforms:
 * - Windows (x64, arm64) with installers
 * - macOS (x64, arm64) with DMG packages
 * - Linux (x64, arm64, armhf) with DEB, RPM, and Snap packages
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : 'current';
const arch = args.includes('--arch') ? args[args.indexOf('--arch') + 1] : 'x64';
const skipMinify = args.includes('--skip-minify');
const verbose = args.includes('--verbose');

// Color output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function getCurrentPlatform() {
    const platform = os.platform();
    switch (platform) {
        case 'win32': return 'win32';
        case 'darwin': return 'darwin';
        case 'linux': return 'linux';
        default: return 'linux';
    }
}

function getCurrentArch() {
    const arch = os.arch();
    switch (arch) {
        case 'x64': return 'x64';
        case 'arm64': return 'arm64';
        case 'arm': return 'armhf';
        default: return 'x64';
    }
}

async function runGulpTask(taskName) {
    return new Promise((resolve, reject) => {
        log(`🔨 Running: gulp ${taskName}`, 'cyan');

        const gulp = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx',
            ['gulp', taskName],
            {
                stdio: verbose ? 'inherit' : 'pipe',
                cwd: process.cwd()
            }
        );

        let output = '';
        if (!verbose) {
            gulp.stdout?.on('data', (data) => {
                output += data.toString();
            });
            gulp.stderr?.on('data', (data) => {
                output += data.toString();
            });
        }

        gulp.on('close', (code) => {
            if (code === 0) {
                log(`✅ Completed: gulp ${taskName}`, 'green');
                resolve(output);
            } else {
                log(`❌ Failed: gulp ${taskName} (exit code ${code})`, 'red');
                if (!verbose && output) {
                    console.log(output);
                }
                reject(new Error(`Gulp task ${taskName} failed with exit code ${code}`));
            }
        });

        gulp.on('error', (error) => {
            log(`❌ Error: gulp ${taskName} - ${error.message}`, 'red');
            reject(error);
        });
    });
}

async function buildPlatform(targetPlatform, targetArch) {
    const suffix = skipMinify ? '' : '-min';
    const buildTarget = `vscode-${targetPlatform}-${targetArch}${suffix}`;

    log(`🚀 Building Mike-AI-IDE for ${targetPlatform}-${targetArch}`, 'bright');

    try {
        // First compile if needed
        if (!fs.existsSync('out-build')) {
            log('📦 Compiling source code...', 'yellow');
            await runGulpTask('compile-build-without-mangling');
        }

        // Run the platform-specific build
        await runGulpTask(buildTarget);

        // Platform-specific packaging
        if (targetPlatform === 'win32') {
            log('📦 Creating Windows installers...', 'yellow');
            try {
                await runGulpTask(`vscode-${targetPlatform}-${targetArch}-system-setup`);
                await runGulpTask(`vscode-${targetPlatform}-${targetArch}-user-setup`);
            } catch (error) {
                log(`⚠️  Warning: Could not create Windows installers: ${error.message}`, 'yellow');
            }
        } else if (targetPlatform === 'linux') {
            log('📦 Creating Linux packages...', 'yellow');
            try {
                await runGulpTask(`vscode-${targetPlatform}-${targetArch}-prepare-deb`);
                await runGulpTask(`vscode-${targetPlatform}-${targetArch}-build-deb`);

                await runGulpTask(`vscode-${targetPlatform}-${targetArch}-prepare-rpm`);
                await runGulpTask(`vscode-${targetPlatform}-${targetArch}-build-rpm`);

                if (targetArch === 'x64') {
                    await runGulpTask(`vscode-${targetPlatform}-${targetArch}-prepare-snap`);
                    await runGulpTask(`vscode-${targetPlatform}-${targetArch}-build-snap`);
                }
            } catch (error) {
                log(`⚠️  Warning: Some Linux packages could not be created: ${error.message}`, 'yellow');
            }
        }

        log(`✅ Successfully built Mike-AI-IDE for ${targetPlatform}-${targetArch}`, 'green');

    } catch (error) {
        log(`❌ Failed to build Mike-AI-IDE for ${targetPlatform}-${targetArch}: ${error.message}`, 'red');
        throw error;
    }
}

async function main() {
    log('🎨 Mike-AI-IDE Multi-Platform Builder', 'magenta');
    log('=====================================', 'magenta');

    // Verify we're in the right directory
    if (!fs.existsSync('package.json') || !fs.existsSync('product.json')) {
        log('❌ Error: Must be run from VS Code root directory', 'red');
        process.exit(1);
    }

    // Verify Mike-AI-IDE branding
    const productJson = JSON.parse(fs.readFileSync('product.json', 'utf8'));
    if (productJson.nameShort !== 'Mike-AI-IDE') {
        log('❌ Error: product.json does not contain Mike-AI-IDE branding', 'red');
        process.exit(1);
    }

    log(`✅ Building Mike-AI-IDE v${productJson.version || '1.0.0'}`, 'green');

    const startTime = Date.now();

    try {
        if (platform === 'all') {
            log('🌍 Building for all platforms...', 'bright');

            // Windows builds
            await buildPlatform('win32', 'x64');
            await buildPlatform('win32', 'arm64');

            // macOS builds
            await buildPlatform('darwin', 'x64');
            await buildPlatform('darwin', 'arm64');

            // Linux builds
            await buildPlatform('linux', 'x64');
            await buildPlatform('linux', 'arm64');
            await buildPlatform('linux', 'armhf');

        } else if (platform === 'current') {
            const currentPlatform = getCurrentPlatform();
            const currentArch = getCurrentArch();
            log(`🖥️  Building for current platform: ${currentPlatform}-${currentArch}`, 'bright');
            await buildPlatform(currentPlatform, arch === 'current' ? currentArch : arch);

        } else {
            log(`🎯 Building for specific platform: ${platform}-${arch}`, 'bright');
            await buildPlatform(platform, arch);
        }

        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        log(`🎉 Build completed successfully in ${duration} minutes!`, 'green');

        // Show output locations
        log('\n📁 Build outputs:', 'bright');
        const outDirs = [
            '../VSCode-win32-x64',
            '../VSCode-win32-arm64',
            '../VSCode-darwin-x64',
            '../VSCode-darwin-arm64',
            '../VSCode-linux-x64',
            '../VSCode-linux-arm64',
            '../VSCode-linux-armhf'
        ];

        outDirs.forEach(dir => {
            if (fs.existsSync(dir)) {
                log(`  ✅ ${dir}`, 'green');
            }
        });

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        log(`❌ Build failed after ${duration} minutes: ${error.message}`, 'red');
        process.exit(1);
    }
}

// Usage information
if (args.includes('--help') || args.includes('-h')) {
    log('Mike-AI-IDE Multi-Platform Builder', 'magenta');
    log('==================================', 'magenta');
    log('');
    log('Usage: node build-mike-ai-ide.js [options]', 'bright');
    log('');
    log('Options:', 'bright');
    log('  --platform <target>    Platform to build for: win32, darwin, linux, current, all');
    log('  --arch <arch>          Architecture: x64, arm64, armhf, current');
    log('  --skip-minify          Skip minification for faster builds');
    log('  --verbose              Show detailed build output');
    log('  --help, -h             Show this help message');
    log('');
    log('Examples:', 'bright');
    log('  node build-mike-ai-ide.js                          # Build for current platform');
    log('  node build-mike-ai-ide.js --platform all           # Build for all platforms');
    log('  node build-mike-ai-ide.js --platform win32 --arch x64  # Build for Windows x64');
    log('  node build-mike-ai-ide.js --skip-minify --verbose  # Fast build with verbose output');
    process.exit(0);
}

main().catch(error => {
    log(`💥 Unexpected error: ${error.message}`, 'red');
    process.exit(1);
});