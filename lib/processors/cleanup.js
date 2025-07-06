/**
 * Cleanup Processor - Reset project to clean state
 * 
 * Removes all generated files, symlinks, and configuration to start fresh
 */

import fs from 'fs';
import path from 'path';
import { 
    logger, 
    projectRoot, 
    CONFIG_FILE,
    PYTHON_CONFIG_FILE 
} from '../utils.js';

/**
 * Remove directory recursively with error handling
 */
async function removeDirectory(dirPath, dirName) {
    try {
        if (fs.existsSync(dirPath)) {
            await fs.promises.rm(dirPath, { recursive: true, force: true });
            logger.success(`Removed ${dirName}`);
            return true;
        } else {
            logger.debug(`${dirName} does not exist, skipping`);
            return true;
        }
    } catch (error) {
        logger.error(`Failed to remove ${dirName}: ${error.message}`);
        return false;
    }
}

/**
 * Remove file with error handling
 */
async function removeFile(filePath, fileName) {
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            logger.success(`Removed ${fileName}`);
            return true;
        } else {
            logger.debug(`${fileName} does not exist, skipping`);
            return true;
        }
    } catch (error) {
        logger.error(`Failed to remove ${fileName}: ${error.message}`);
        return false;
    }
}

/**
 * Run the cleanup process
 */
export async function runCleanup(options = {}) {
    try {
        logger.info('\n🧹 Cleaning up EVE Frontier Tools...');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        if (!options.force) {
            logger.warning('This will remove ALL generated data and configuration files.');
            logger.warning('You will need to run setup again after cleanup.');
            
            // In a real interactive environment, you'd prompt here
            // For now, we'll assume --force is needed for non-interactive cleanup
            logger.info('Use --force flag to proceed with cleanup');
            return false;
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        // Remove data directories
        const dataDirs = [
            { path: path.join(projectRoot, 'data'), name: 'data directory' },
            { path: path.join(projectRoot, 'bin64'), name: 'bin64 symlink directory' },
            { path: path.join(projectRoot, 'pyd'), name: 'pyd directory (legacy)' }  // Remove legacy pyd if it exists
        ];
        
        logger.info('🗂️  Removing data directories...');
        for (const dir of dataDirs) {
            const success = await removeDirectory(dir.path, dir.name);
            if (success) successCount++; else errorCount++;
        }
        
        // Remove configuration files
        const configFiles = [
            { path: CONFIG_FILE, name: 'EVE Frontier configuration' },
            { path: PYTHON_CONFIG_FILE, name: 'Python configuration' }
        ];
        
        logger.info('\n⚙️  Removing configuration files...');
        for (const file of configFiles) {
            const success = await removeFile(file.path, file.name);
            if (success) successCount++; else errorCount++;
        }
        
        // Remove generated pipeline results
        const generatedFiles = [
            { path: path.join(projectRoot, 'pipeline_results.json'), name: 'pipeline results' },
            { path: path.join(projectRoot, 'node_modules'), name: 'node_modules (if you want a complete reset)' }
        ];
        
        if (options.deep) {
            logger.info('\n🔧 Deep cleanup - removing additional files...');
            for (const file of generatedFiles) {
                let success;
                try {
                    if (fs.existsSync(file.path)) {
                        const stats = fs.lstatSync(file.path);
                        success = stats.isDirectory() ? 
                            await removeDirectory(file.path, file.name) : 
                            await removeFile(file.path, file.name);
                    } else {
                        logger.debug(`${file.name} does not exist, skipping`);
                        success = true;
                    }
                } catch (error) {
                    logger.error(`Failed to process ${file.name}: ${error.message}`);
                    success = false;
                }
                if (success) successCount++; else errorCount++;
            }
        }
        
        // Summary
        logger.info('\n📊 Cleanup Summary:');
        logger.info(`   Successful removals: ${successCount}`, 'green');
        logger.info(`   Errors: ${errorCount}`, errorCount > 0 ? 'red' : 'green');
        
        if (errorCount === 0) {
            logger.success('\n🎉 Cleanup completed successfully!');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            logger.info('\nProject reset to clean state.');
            logger.info('Run "npm run setup" to reconfigure the environment.');
            return true;
        } else {
            logger.warning('\n⚠️  Cleanup completed with some errors.');
            logger.info('Some files may require manual removal due to permissions or locks.');
            return false;
        }
        
    } catch (error) {
        logger.error(`Cleanup failed: ${error.message}`);
        return false;
    }
} 