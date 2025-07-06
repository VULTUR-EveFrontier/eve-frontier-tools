/**
 * Setup Processor - Initial Environment Setup
 * 
 * Handles configuration, validation, and symlink creation
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { 
    logger, 
    projectRoot, 
    PYTHON_CONFIG_FILE, 
    saveConfiguration, 
    validate,
    files 
} from '../utils.js';

const BIN64_SUBPATH = path.join('stillness', 'bin64');
const INDEX_FILE = 'index_stillness.txt';

async function prompt(question) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().replace(/['"]/g, ''));
        });
    });
}

async function promptForPath() {
    logger.info('\n🎮 EVE Frontier Tools Setup');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('\nThis script will set up symlinks to your EVE Frontier game data.');
    logger.info('\nPlease provide the path to your EVE Frontier installation directory.');
    logger.warning('Example: C:\\CCP\\EVE Frontier');
    
    return await prompt('\nEVE Frontier installation path: ');
}

async function findPython312() {
    const commonPaths = [
        'C:\\Python312\\python.exe',
        'C:\\Users\\robot\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
        'python3.12',
        'python312',
        'python'
    ];
    
    logger.info('\n🐍 Searching for Python 3.12...');
    
    for (const pythonPath of commonPaths) {
        if (await validatePython312(pythonPath)) {
            return pythonPath;
        }
    }
    
    return null;
}

async function validatePython312(pythonPath) {
    try {
        const { spawn } = await import('child_process');
        
        return new Promise((resolve) => {
            const python = spawn(pythonPath, ['--version'], { 
                stdio: ['pipe', 'pipe', 'pipe'] 
            });
            
            let output = '';
            python.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            python.stderr.on('data', (data) => {
                output += data.toString();
            });
            
            python.on('close', (code) => {
                if (code === 0 && output.includes('Python 3.12')) {
                    logger.success(`Found Python 3.12: ${pythonPath}`);
                    resolve(true);
                } else {
                    resolve(false);
                }
            });
            
            python.on('error', () => {
                resolve(false);
            });
        });
    } catch (error) {
        return false;
    }
}

async function configurePython312() {
    logger.info('\n🐍 Configuring Python 3.12...');
    
    // Try to find Python 3.12 automatically
    let pythonPath = await findPython312();
    
    if (!pythonPath) {
        logger.warning('Python 3.12 not found automatically.');
        logger.info('Please provide the path to your Python 3.12 executable.');
        logger.warning('Example: C:\\Python312\\python.exe');
        
        pythonPath = await prompt('\nPython 3.12 path: ');
        
        if (!(await validatePython312(pythonPath))) {
            logger.error('Invalid Python 3.12 path or version.');
            return false;
        }
    }
    
    // Save Python configuration
    try {
        fs.writeFileSync(PYTHON_CONFIG_FILE, pythonPath);
        logger.success('Python 3.12 configuration saved.');
        return true;
    } catch (error) {
        logger.error(`Could not save Python configuration: ${error.message}`);
        return false;
    }
}

async function createSymlinks(basePath) {
    logger.info('\n🔗 Creating symlinks...');
    
    const bin64Path = path.join(basePath, BIN64_SUBPATH);
    const bin64Dir = path.join(projectRoot, 'bin64');
    const dataRawDir = path.join(projectRoot, 'data/raw');
    
    // Ensure directories exist
    await fs.promises.mkdir(path.dirname(bin64Dir), { recursive: true });
    await fs.promises.mkdir(dataRawDir, { recursive: true });
    
    let successCount = 0;
    let errorCount = 0;
    
    // Symlink entire bin64 directory to bin64/
    try {
        if (fs.existsSync(bin64Dir)) {
            await fs.promises.rm(bin64Dir, { recursive: true, force: true });
        }
        
        await fs.promises.symlink(bin64Path, bin64Dir);
        logger.success(`Symlinked entire bin64 directory to bin64/`);
        successCount++;
    } catch (error) {
        logger.error(`Failed to symlink bin64 directory: ${error.message}`);
        errorCount++;
    }
    
    // Create symlinks to index files
    const indexFiles = [
        {
            name: INDEX_FILE,
            source: path.join(basePath, INDEX_FILE),
            target: path.join(dataRawDir, INDEX_FILE)
        },
        {
            name: 'resfileindex.txt',
            source: path.join(basePath, 'stillness', 'resfileindex.txt'),
            target: path.join(dataRawDir, 'resfileindex.txt')
        }
    ];
    
    for (const indexFile of indexFiles) {
        try {
            if (fs.existsSync(indexFile.target)) {
                await fs.promises.unlink(indexFile.target);
            }
            
            if (fs.existsSync(indexFile.source)) {
                await fs.promises.symlink(indexFile.source, indexFile.target);
                logger.success(`Symlinked ${indexFile.name}`);
                successCount++;
            } else {
                logger.warning(`Index file not found: ${indexFile.name} (${indexFile.source})`);
            }
        } catch (error) {
            logger.error(`Failed to symlink ${indexFile.name}: ${error.message}`);
            errorCount++;
        }
    }
    
    // Create symlink to ResFiles directory
    const resFilesSource = path.join(basePath, 'ResFiles');
    const resFilesTarget = path.join(dataRawDir, 'ResFiles');
    
    try {
        if (fs.existsSync(resFilesTarget)) {
            await fs.promises.unlink(resFilesTarget);
        }
        
        await fs.promises.symlink(resFilesSource, resFilesTarget);
        logger.success(`Symlinked ResFiles directory`);
        successCount++;
    } catch (error) {
        logger.error(`Failed to symlink ResFiles: ${error.message}`);
        errorCount++;
    }
    
    logger.info(`\n📊 Symlink Summary:`);
    logger.info(`   Successful: ${successCount}`, 'green');
    logger.info(`   Errors: ${errorCount}`, errorCount > 0 ? 'red' : 'green');
    
    return errorCount === 0;
}

/**
 * Run the complete setup process
 */
export async function runSetup() {
    try {
        // Get EVE Frontier installation path
        const eveFrontierPath = await promptForPath();
        
        if (!eveFrontierPath) {
            logger.error('No installation path provided.');
            return false;
        }
        
        // Validate installation
        if (!validate.installation(eveFrontierPath)) {
            return false;
        }
        
        // Configure Python 3.12
        if (!(await configurePython312())) {
            return false;
        }
        
        // Create symlinks
        if (!(await createSymlinks(eveFrontierPath))) {
            logger.warning('Some symlinks failed to create. Check permissions and paths.');
        }
        
        // Save configuration
        const config = {
            eveFrontierPath,
            setupCompleted: true,
            setupDate: new Date().toISOString()
        };
        
        if (!saveConfiguration(config)) {
            return false;
        }
        
        logger.success('\n🎉 Setup completed successfully!');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info('\nYou can now run the data extraction pipeline:');
        logger.info('  npm run pipeline', 'cyan');
        
        return true;
        
    } catch (error) {
        logger.error(`Setup failed: ${error.message}`);
        return false;
    }
} 