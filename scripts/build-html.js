#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Build-time URL replacement for social media meta tags
function processHtmlForProduction() {
  const inputPath = path.resolve(__dirname, '..', 'client', 'index.html');
  const outputPath = path.resolve(__dirname, '..', 'dist', 'public', 'index.html');
  
  // Read the original HTML
  const html = fs.readFileSync(inputPath, 'utf-8');
  
  // Replace relative URLs with absolute production URLs
  const productionUrl = 'https://wiki-bio-quiz.replit.app';
  const processedHtml = html.replace(
    /content="\/social-preview\.png"/g,
    `content="${productionUrl}/social-preview.png"`
  );
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write the processed HTML
  fs.writeFileSync(outputPath, processedHtml);
  
  console.log('✅ HTML processed with absolute URLs for production');
  console.log(`📁 Output: ${outputPath}`);
}

// Run the processing
processHtmlForProduction();