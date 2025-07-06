/**
 * File Indexing Processor - Parse game index and create symlinks
 * 
 * Processes the index_stillness.txt file to discover all game data files
 * and creates organized symlinks for different file types
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { 
    logger, 
    projectRoot, 
    loadConfiguration, 
    ensureDirectories,
    files,
    pickle,
    StatsCollector 
} from '../utils.js';

/**
 * Process pickle files to JSON
 */
async function processPickleFile(filename, sourcePath, stats) {
    const symlinkPath = path.join(projectRoot, 'data/pickle', `${filename}.pickle`);
    const jsonPath = path.join(projectRoot, 'data/json', `${filename}.json`);
    
    // Create symlink to original pickle file
    const symlinkSuccess = await files.createSymlink(sourcePath, symlinkPath);
    if (!symlinkSuccess) return;
    
    try {
        // Convert pickle to JSON using Node.js pickleparser
        const conversionSuccess = await pickle.convertToJson(symlinkPath, jsonPath);
        
        if (conversionSuccess) {
            stats.increment('pickleConverted');
            logger.debug(`✓ Converted ${filename}.pickle to JSON`);
        } else {
            stats.increment('pickleErrors');
        }
        
    } catch (error) {
        logger.error(`Pickle conversion failed: ${filename} - ${error.message}`);
        stats.increment('pickleErrors');
    }
}

/**
 * Process static files (potentially SQLite)
 */
async function processStaticFile(filename, sourcePath, stats) {
    const symlinkPath = path.join(projectRoot, 'data/static', `${filename}.static`);
    
    // Create symlink to original static file
    const symlinkSuccess = await files.createSymlink(sourcePath, symlinkPath);
    if (!symlinkSuccess) return;
    
    // Check if it's a valid SQLite file
    const isValid = await files.isValidSQLite(sourcePath);
    
    if (isValid) {
        const sqlitePath = path.join(projectRoot, 'data/sqlite', `${filename}.sqlite`);
        const sqliteSuccess = await files.createSymlink(sourcePath, sqlitePath);
        
        if (sqliteSuccess) {
            logger.debug(`📊 SQLite: ${filename}.sqlite`);
            stats.increment('sqliteLinked');
        }
    }
    
    stats.increment('staticLinked');
}

/**
 * Process fsdbinary files
 */
async function processFSDBinaryFile(filename, sourcePath, stats) {
    const symlinkPath = path.join(projectRoot, 'data/fsdbinary', `${filename}.fsdbinary`);
    
    const symlinkSuccess = await files.createSymlink(sourcePath, symlinkPath);
    if (symlinkSuccess) {
        stats.increment('fsdbinaryLinked');
        logger.debug(`📦 FSDBinary: ${filename}.fsdbinary`);
    }
}

/**
 * Process schema files
 */
async function processSchemaFile(filename, sourcePath, stats) {
    const symlinkPath = path.join(projectRoot, 'data/raw', 'schema', `${filename}.schema`);
    
    // Ensure schema subdirectory exists
    const schemaDir = path.dirname(symlinkPath);
    if (!fs.existsSync(schemaDir)) {
        fs.mkdirSync(schemaDir, { recursive: true });
    }
    
    const symlinkSuccess = await files.createSymlink(sourcePath, symlinkPath);
    if (symlinkSuccess) {
        stats.increment('schemaLinked');
    }
}

/**
 * Process other file types
 */
async function processOtherFile(filename, filetype, sourcePath, respath, stats) {
    // Clean up the path to avoid Windows drive letter issues
    const cleanPath = respath.replace(/[:\\]/g, '_').replace(/^_+/, '');
    const rawDir = path.join(projectRoot, 'data/raw', cleanPath);
    
    if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir, { recursive: true });
    }
    
    const symlinkPath = path.join(rawDir, `${filename}.${filetype}`);
    const symlinkSuccess = await files.createSymlink(sourcePath, symlinkPath);
    
    if (symlinkSuccess) {
        stats.increment('otherLinked');
    }
}

/**
 * Process a single index file
 */
async function processIndexFile(indexPath, resFilesPath, stats, indexName) {
    logger.info(`📖 Processing ${indexName}...`);
    
    // Create readline interface for the index file
    const readStream = fs.createReadStream(indexPath);
    const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity
    });
    
    // Regex to parse index entries: logicalPath,physicalPath
    const regex = /^(.*?)([^\/]+)\.([^,]+),([^,]+)(.*)$/;
    
    let processedInThisFile = 0;
    
    // Process each line of the index
    for await (const line of rl) {
        const match = line.match(regex);
        if (!match) continue;
        
        const [_, respath, filename, filetype, sourceRelativePath] = match;
        const sourceFilePath = path.join(resFilesPath, sourceRelativePath);
        
        processedInThisFile++;
        stats.increment('totalProcessed');
        
        // Progress indicator
        if (stats.get('totalProcessed') % 1000 === 0) {
            logger.progress(`Processed ${stats.get('totalProcessed')} files...`);
        }
        
        // Skip if source file doesn't exist
        if (!fs.existsSync(sourceFilePath)) {
            continue;
        }
        
                    try {
                switch (filetype) {
                    case 'pickle':
                        await processPickleFile(filename, sourceFilePath, stats);
                        break;
                    case 'static':
                        await processStaticFile(filename, sourceFilePath, stats);
                        break;
                    case 'fsdbinary':
                        await processFSDBinaryFile(filename, sourceFilePath, stats);
                        break;
                    case 'schema':
                        await processSchemaFile(filename, sourceFilePath, stats);
                        break;
                    default:
                        await processOtherFile(filename, filetype, sourceFilePath, respath.replace('res:', ''), stats);
                        break;
                }
            } catch (error) {
                logger.warning(`Error processing ${filename}.${filetype}: ${error.message}`);
            }
    }
    
    logger.success(`${indexName}: processed ${processedInThisFile} entries`);
    return processedInThisFile;
}

/**
 * Run the file indexing process
 */
export async function runFileIndexing() {
    try {
        const config = loadConfiguration();
        const eveFrontierPath = config.eveFrontierPath;
        
        // Define both index files to process
        const indexFiles = [
            {
                name: 'index_stillness.txt',
                path: path.join(projectRoot, 'data/raw/index_stillness.txt'),
                sourcePath: path.join(eveFrontierPath, 'index_stillness.txt')
            },
            {
                name: 'resfileindex.txt',
                path: path.join(projectRoot, 'data/raw/resfileindex.txt'),
                sourcePath: path.join(eveFrontierPath, 'stillness', 'resfileindex.txt')
            }
        ];
        
        const resFilesPath = path.join(projectRoot, 'data/raw/ResFiles');
        
        logger.info('\n📖 Processing file indexes...');
        logger.info(`📁 ResFiles: ${resFilesPath}`);
        
        // Verify ResFiles exists
        files.requireExists(resFilesPath, 'ResFiles directory not found. Run setup first.');
        
        // Check which index files are available
        const availableIndexes = [];
        for (const indexFile of indexFiles) {
            if (files.exists(indexFile.path) || files.exists(indexFile.sourcePath)) {
                availableIndexes.push(indexFile);
                logger.info(`📂 Found ${indexFile.name}`);
                
                // Create symlink if source exists but target doesn't
                if (!files.exists(indexFile.path) && files.exists(indexFile.sourcePath)) {
                    await files.createSymlink(indexFile.sourcePath, indexFile.path);
                }
            } else {
                logger.warning(`⚠️  Index file not found: ${indexFile.name}`);
            }
        }
        
        if (availableIndexes.length === 0) {
            throw new Error('No index files found. Run setup first.');
        }
        
        // Ensure directory structure
        ensureDirectories(['data/raw/schema']);
        
        // Statistics tracking
        const stats = new StatsCollector();
        
        // Process all available index files
        let totalIndexEntries = 0;
        for (const indexFile of availableIndexes) {
            const entriesProcessed = await processIndexFile(
                indexFile.path, 
                resFilesPath, 
                stats, 
                indexFile.name
            );
            totalIndexEntries += entriesProcessed;
        }
        
        stats.set('totalIndexFiles', availableIndexes.length);
        stats.set('totalIndexEntries', totalIndexEntries);
        
        logger.success(`\nProcessed ${availableIndexes.length} index files with ${totalIndexEntries} total entries`);
        stats.logSummary('File Processing Summary');
        
        return stats.summary();
        
    } catch (error) {
        logger.error(`File indexing failed: ${error.message}`);
        throw error;
    }
} 