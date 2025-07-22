#!/bin/bash

echo "🔧 Fixing VS Code fork build issues..."

# 1. Clean everything
echo "Cleaning old builds..."
rm -rf out/ node_modules/ extensions/node_modules/
npm cache clean --force

# 2. Fix package.json dependencies
echo "Fixing dependencies..."
npm install --legacy-peer-deps --no-audit --progress=false

# 3. Try minimal compile
echo "Attempting minimal compile..."
npm run compile-build

# 4. If that fails, try just core
echo "Building core only..."
npx gulp compile-core

echo "✅ Build fix attempt complete"