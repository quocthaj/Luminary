const fs = require('fs');
const path = require('path');

const sourceFile = path.resolve(__dirname, '../../be/lambda/types.ts');
const destDir = path.resolve(__dirname, '../types');
const destFile = path.resolve(destDir, 'jobs.ts');

console.log('🔄 Syncing types from backend to frontend...');

try {
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ Source file not found: ${sourceFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`📁 Created destination directory: ${destDir}`);
  }

  fs.copyFileSync(sourceFile, destFile);
  console.log(`✅ Types synced successfully to ${destFile}`);
} catch (err) {
  console.error('❌ Failed to sync types:', err);
  process.exit(1);
}
