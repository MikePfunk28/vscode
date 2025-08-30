#!/usr/bin/env node

/**
 * Mike-AI-IDE Open VSX Integration Test
 *
 * This script tests that Mike-AI-IDE can properly connect to and fetch
 * extensions from the Open VSX marketplace.
 */

const https = require('https');
const fs = require('fs');

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

function testOpenVSXAPI() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            "filters": [{
                "criteria": [{
                    "filterType": 8,
                    "value": "Microsoft.vscode-eslint"
                }]
            }],
            "flags": 914
        });

        const options = {
            hostname: 'open-vsx.org',
            port: 443,
            path: '/vscode/gallery/extensionquery',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    if (response.results && response.results[0] && response.results[0].extensions) {
                        resolve({
                            success: true,
                            extensionCount: response.results[0].extensions.length,
                            sampleExtensions: response.results[0].extensions.slice(0, 3).map(ext => ext.displayName)
                        });
                    } else {
                        reject(new Error('Invalid response format from Open VSX'));
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse Open VSX response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Failed to connect to Open VSX: ${error.message}`));
        });

        req.write(data);
        req.end();
    });
}

function verifyProductConfiguration() {
    try {
        if (!fs.existsSync('product.json')) {
            throw new Error('product.json not found');
        }

        const productJson = JSON.parse(fs.readFileSync('product.json', 'utf8'));

        if (!productJson.extensionsGallery) {
            throw new Error('extensionsGallery not configured in product.json');
        }

        const gallery = productJson.extensionsGallery;
        if (gallery.serviceUrl !== 'https://open-vsx.org/vscode/gallery') {
            throw new Error('Open VSX serviceUrl not correctly configured');
        }

        if (gallery.itemUrl !== 'https://open-vsx.org/vscode/item') {
            throw new Error('Open VSX itemUrl not correctly configured');
        }

        return {
            success: true,
            config: gallery
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function main() {
    log('🔍 Mike-AI-IDE Open VSX Integration Test', 'bright');
    log('==========================================', 'bright');
    log('');

    // Test 1: Verify product.json configuration
    log('1. Testing product.json configuration...', 'cyan');
    const configTest = verifyProductConfiguration();
    if (configTest.success) {
        log('   ✅ Product configuration is correct', 'green');
        log(`   ✅ Service URL: ${configTest.config.serviceUrl}`, 'green');
        log(`   ✅ Item URL: ${configTest.config.itemUrl}`, 'green');
        if (configTest.config.controlUrl) {
            log(`   ✅ Control URL: ${configTest.config.controlUrl}`, 'green');
        }
        if (configTest.config.recommendationsUrl) {
            log(`   ✅ Recommendations URL: ${configTest.config.recommendationsUrl}`, 'green');
        }
    } else {
        log(`   ❌ Configuration error: ${configTest.error}`, 'red');
        process.exit(1);
    }

    log('');

    // Test 2: Test Open VSX API connectivity
    log('2. Testing Open VSX API connectivity...', 'cyan');
    try {
        const apiTest = await testOpenVSXAPI();
        if (apiTest.success) {
            log('   ✅ Successfully connected to Open VSX API', 'green');
            log(`   ✅ Found ${apiTest.extensionCount} extensions`, 'green');
            log('   ✅ Sample extensions:', 'green');
            apiTest.sampleExtensions.forEach(name => {
                log(`      - ${name}`, 'green');
            });
        }
    } catch (error) {
        log(`   ❌ API connectivity error: ${error.message}`, 'red');
        process.exit(1);
    }

    log('');

    // Test 3: Check Mike-AI-IDE branding
    log('3. Verifying Mike-AI-IDE branding...', 'cyan');
    const productJson = JSON.parse(fs.readFileSync('product.json', 'utf8'));
    if (productJson.nameShort === 'Mike-AI-IDE') {
        log(`   ✅ Product name: ${productJson.nameShort}`, 'green');
        log(`   ✅ Full name: ${productJson.nameLong}`, 'green');
        log(`   ✅ Application name: ${productJson.applicationName}`, 'green');
    } else {
        log('   ❌ Mike-AI-IDE branding not found', 'red');
        process.exit(1);
    }

    log('');
    log('🎉 All Open VSX integration tests passed!', 'green');
    log('🚀 Mike-AI-IDE is ready to use Open VSX marketplace', 'green');
}

main().catch(error => {
    log(`💥 Test failed: ${error.message}`, 'red');
    process.exit(1);
});