#!/usr/bin/env node
import { 
    logger, 
    loadConfiguration, 
    ensureDirectories,
    StatsCollector,
    files 
} from './lib/utils.js';

import { runSetup } from './lib/processors/setup.js';
import { runFileIndexing } from './lib/processors/file-indexing.js';
import { runFSDBinaryConversion } from './lib/processors/fsdbinary.js';
import { runTypeNameExtraction } from './lib/processors/type-names.js';
import { runBlueprintAnalysis } from './lib/processors/blueprints.js';
import { processStellarCartography } from './lib/processors/stellar-cartography.js';
import { runCleanup } from './lib/processors/cleanup.js';

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        steps: ['all'],
        skipSetup: false,
        verbose: false,
        force: false,
        deep: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--steps':
                options.steps = args[++i]?.split(',') || ['all'];
                break;
            case '--skip-setup':
                options.skipSetup = true;
                break;
            case '--verbose':
                options.verbose = true;
                break;
            case '--force':
                options.force = true;
                break;
            case '--deep':
                options.deep = true;
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
                break;
        }
    }
    
    return options;
}

/**
 * Show help information
 */
function showHelp() {
    logger.info('\n🚀 EVE Frontier Tools - Data Processing Pipeline');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('\nUsage: npm run pipeline [options]');
    logger.info('\nOptions:');
    logger.info('  --steps <steps>     Comma-separated list of steps to run');
    logger.info('                      Options: setup, index, fsdbinary, types, blueprints, stellar, cleanup, all');
    logger.info('                      Default: all (setup runs automatically only if config missing)');
    logger.info('  --skip-setup        Skip setup validation (assumes already configured)');
    logger.info('  --force             Force cleanup without confirmation (required for cleanup step)');
    logger.info('  --deep              Deep cleanup including node_modules');
    logger.info('  --verbose           Enable verbose logging');
    logger.info('  --help, -h          Show this help message');
    logger.info('\nExamples:');
    logger.info('  npm run pipeline                        # Run complete pipeline (auto-setup if needed)');
    logger.info('  npm run pipeline -- --steps setup       # Force setup reconfiguration');
    logger.info('  npm run pipeline -- --steps cleanup --force  # Reset to clean state');
    logger.info('  npm run pipeline -- --steps cleanup --force --deep  # Deep cleanup including node_modules');
    logger.info('  npm run pipeline -- --steps types,blueprints  # Run specific steps only');
    logger.info('  npm run pipeline -- --skip-setup        # Skip setup validation');
}

/**
 * Validate pipeline prerequisites
 */
function validatePrerequisites(options) {
    if (options.skipSetup) {
        logger.info('Skipping setup validation...');
        return true;
    }
    
    // Check if configuration exists
    if (!files.exists('.eve-frontier-path')) {
        logger.error('Setup not completed. Run with --steps setup first.');
        return false;
    }
    
    try {
        loadConfiguration();
        logger.success('Configuration validated');
        return true;
    } catch (error) {
        logger.error(`Configuration invalid: ${error.message}`);
        return false;
    }
}

/**
 * Run the complete pipeline
 */
async function runPipeline() {
    const options = parseArgs();
    const globalStats = new StatsCollector();
    
    logger.info('\n🚀 EVE Frontier Data Processing Pipeline');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`📋 Steps to run: ${options.steps.join(', ')}`);
    logger.info(`🔧 Skip setup: ${options.skipSetup}`);
    logger.info(`🔊 Verbose: ${options.verbose}`);
    
    try {
        // Ensure directory structure exists
        ensureDirectories();
        
        // Determine which steps to run
        let steps;
        if (options.steps.includes('all')) {
            // Check if setup is needed
            const needsSetup = !files.exists('.eve-frontier-path') || !files.exists('.python312-path');
            
            if (needsSetup) {
                steps = ['setup', 'index', 'fsdbinary', 'types', 'blueprints', 'stellar'];
                logger.info('Configuration missing - setup will be included automatically');
            } else {
                steps = ['index', 'fsdbinary', 'types', 'blueprints', 'stellar'];
                logger.info('Configuration found - skipping setup step');
            }
        } else {
            steps = options.steps;
        }
        
        // Validate prerequisites (unless skipping or running setup)
        if (!steps.includes('setup') && !validatePrerequisites(options)) {
            process.exit(1);
        }
        
        const results = {};
        
        // Step 1: Setup
        if (steps.includes('setup')) {
            logger.info('\n📦 Step 1: Environment Setup');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            const setupSuccess = await runSetup();
            if (!setupSuccess) {
                logger.error('Setup failed. Cannot continue.');
                process.exit(1);
            }
            results.setup = { completed: true };
            globalStats.increment('stepsCompleted');
        }
        
        // Step 2: File Indexing
        if (steps.includes('index')) {
            logger.info('\n📖 Step 2: File Indexing and Symlink Creation');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            results.indexing = await runFileIndexing();
            globalStats.increment('stepsCompleted');
        }
        
        // Step 3: FSDBinary Conversion
        if (steps.includes('fsdbinary')) {
            logger.info('\n🐍 Step 3: FSDBinary to JSON Conversion');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            results.fsdbinary = await runFSDBinaryConversion();
            globalStats.increment('stepsCompleted');
        }
        
        // Step 4: Type Name Extraction
        if (steps.includes('types')) {
            logger.info('\n🏷️  Step 4: Type Name Extraction');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            results.types = await runTypeNameExtraction();
            globalStats.increment('stepsCompleted');
        }
        
        // Step 5: Blueprint Analysis
        if (steps.includes('blueprints')) {
            logger.info('\n🏭 Step 5: Blueprint Analysis and BOM Generation');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            results.blueprints = await runBlueprintAnalysis();
            globalStats.increment('stepsCompleted');
        }
        
        // Step 6: Stellar Cartography
        if (steps.includes('stellar')) {
            logger.info('\n🌌 Step 6: Stellar Cartography Data Processing');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            results.stellar = await processStellarCartography(process.cwd(), {});
            globalStats.increment('stepsCompleted');
        }
        
        // Cleanup Step: Reset to clean state
        if (steps.includes('cleanup')) {
            logger.info('\n🧹 Cleanup: Reset to Clean State');
            logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            const cleanupSuccess = await runCleanup({
                force: options.force,
                deep: options.deep
            });
            
            if (cleanupSuccess) {
                results.cleanup = { completed: true };
                globalStats.increment('stepsCompleted');
                
                // Cleanup is typically the last step, so exit after completion
                logger.info('\n🎉 Cleanup completed successfully!');
                logger.info('Run "npm run setup" to reconfigure when ready.');
                return;
            } else {
                logger.error('Cleanup failed or was cancelled.');
                process.exit(1);
            }
        }
        
        // Final summary
        logger.info('\n🎉 Pipeline Completed Successfully!');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        globalStats.set('totalSteps', steps.length);
        const summary = globalStats.summary();
        
        logger.info('\n📊 Pipeline Summary:');
        logger.info(`   Steps completed: ${summary.stepsCompleted}/${summary.totalSteps}`, 'green');
        logger.info(`   Total processing time: ${summary.processingTime}`, 'bright');
        
        // Only show data structure info if data processing steps were run
        const dataProcessingSteps = ['index', 'fsdbinary', 'types', 'blueprints'];
        const hasDataProcessing = steps.some(step => dataProcessingSteps.includes(step));
        
        if (hasDataProcessing) {
            logger.info('\n📁 Generated Data Structure:');
            logger.info('   data/raw/          - Symlinked source files', 'cyan');
            logger.info('   data/fsdbinary/    - Symlinked FSDBinary files', 'cyan');
            logger.info('   data/json/         - FSDBinary → JSON conversions', 'cyan');
            logger.info('   data/pickle/       - Symlinked pickle files', 'cyan');
            logger.info('   data/sqlite/       - Symlinked SQLite databases', 'cyan');
            logger.info('   data/static/       - Symlinked static files', 'cyan');
            logger.info('   data/extracted/    - Processed and cleaned data', 'cyan');
            
            logger.info('\n🔍 Key Generated Files:');
            logger.info('   data/json/types.json                      - Complete type database', 'green');
            logger.info('   data/extracted/type_names_published.json  - Type ID → name mappings', 'green');
            logger.info('   data/extracted/clean_blueprints_to_materials.json - Blueprint BOM', 'green');
            
            // Save pipeline results only if we have data to save
            const pipelineResults = {
                summary,
                results,
                completedAt: new Date().toISOString(),
                steps: steps
            };
            
            await import('fs').then(fs => {
                fs.writeFileSync(
                    './data/extracted/pipeline_results.json',
                    JSON.stringify(pipelineResults, null, 2)
                );
            });
            
            logger.success('\nPipeline results saved to data/extracted/pipeline_results.json');
        } else {
            // For setup-only or other non-data steps, show appropriate next steps
            if (steps.includes('setup') && steps.length === 1) {
                logger.info('\n🚀 Setup completed! Next steps:');
                logger.info('   npm run pipeline              # Run complete data extraction', 'cyan');
                logger.info('   npm run extract               # Run data processing only', 'cyan');
            }
        }
        
    } catch (error) {
        logger.error(`\n💥 Pipeline failed: ${error.message}`);
        
        if (options.verbose) {
            console.error(error.stack);
        }
        
        process.exit(1);
    }
}

runPipeline().catch(error => {
    logger.error(`\n💥 Fatal error: ${error.message}`);
    process.exit(1);
}); 