/**
 * FSDBinary Processor - Convert FSDBinary files to JSON
 * 
 * Handles running the Python FSDBinary loader to convert game data files
 */

import fs from 'fs';
import path from 'path';
import { 
    logger, 
    projectRoot, 
    processes, 
    files 
} from '../utils.js';

/**
 * Run FSDBinary to JSON conversion using our Python script
 */
export async function runFSDBinaryConversion() {
    try {
        logger.info('\n🔄 Converting FSDBinary files to JSON...');
        
        const pythonScript = path.join(projectRoot, 'scripts/execute_loaders.py');
        
        // Verify the Python script exists
        files.requireExists(pythonScript, 'execute_loaders.py not found');
        
        // Run the Python conversion
        await processes.runPython(pythonScript);
        
        logger.success('FSDBinary conversion completed successfully');
        
        // Verify key output files were created
        const expectedFiles = [
            'data/json/types.json',
            'data/json/blueprints.json'
        ];
        
        const results = {};
        for (const filePath of expectedFiles) {
            const fullPath = path.join(projectRoot, filePath);
            if (files.exists(fullPath)) {
                const stats = fs.statSync(fullPath);
                results[path.basename(filePath)] = {
                    size: `${(stats.size / 1024).toFixed(1)}KB`,
                    created: stats.birthtime.toISOString()
                };
                logger.success(`✓ Generated ${path.basename(filePath)} (${results[path.basename(filePath)].size})`);
            } else {
                logger.warning(`⚠️  Expected file not found: ${filePath}`);
            }
        }
        
        return results;
        
    } catch (error) {
        logger.error(`FSDBinary conversion failed: ${error.message}`);
        throw error;
    }
} 