/**
 * Type Names Processor - Extract type ID to name mappings
 * 
 * Processes the complete types.json file generated from FSDBinary
 * and creates clean mappings for use in other tools
 */

import path from 'path';
import { 
    logger, 
    projectRoot, 
    json,
    files,
    StatsCollector 
} from '../utils.js';

/**
 * Run type name extraction
 */
export async function runTypeNameExtraction() {
    try {
        logger.info('\n🏷️  Extracting type names...');
        
        const typesFile = path.join(projectRoot, 'data/json/types.json');
        const outputDir = path.join(projectRoot, 'data/extracted');
        
        // Verify input file exists
        files.requireExists(typesFile, 'types.json not found. Run FSDBinary conversion first.');
        
        // Load types data
        const types = json.load(typesFile);
        
        logger.info(`Loaded ${Object.keys(types).length} type definitions`);
        
        // Statistics tracking
        const stats = new StatsCollector();
        
        // Extract basic type ID to name mapping
        const typeNames = {};
        const typesByGroup = {};
        const publishedTypes = {};
        
        for (const [typeId, typeData] of Object.entries(types)) {
            const id = parseInt(typeId);
            const name = typeData.typeNameID;
            const groupId = typeData.groupID;
            const published = typeData.published;
            
            stats.increment('totalTypes');
            
            // Add to basic mapping
            if (name && name !== '') {
                typeNames[id] = name;
                stats.increment('namedTypes');
            }
            
            // Group by groupID
            if (!typesByGroup[groupId]) {
                typesByGroup[groupId] = [];
            }
            typesByGroup[groupId].push({
                typeID: id,
                name: name || `Type ${id}`,
                basePrice: typeData.basePrice || 0,
                volume: typeData.volume || 0,
                published: published
            });
            
            // Published items only
            if (published === 1 && name && name !== '') {
                publishedTypes[id] = name;
                stats.increment('publishedTypes');
            }
        }
        
        stats.set('totalGroups', Object.keys(typesByGroup).length);
        
        // Write outputs
        const outputs = [
            {
                file: 'type_names_all.json',
                data: typeNames,
                description: `All type ID to name mappings (${stats.get('namedTypes')} entries)`
            },
            {
                file: 'type_names_published.json', 
                data: publishedTypes,
                description: `Published type ID to name mappings (${stats.get('publishedTypes')} entries)`
            },
            {
                file: 'types_by_group.json',
                data: typesByGroup,
                description: `Types organized by group ID (${stats.get('totalGroups')} groups)`
            }
        ];
        
        for (const output of outputs) {
            const outputPath = path.join(outputDir, output.file);
            json.save(outputPath, output.data, output.description);
        }
        
        // Generate summary statistics
        const summary = stats.summary();
        
        const summaryPath = path.join(outputDir, 'type_extraction_summary.json');
        json.save(summaryPath, summary, 'Type extraction summary and statistics');
        
        stats.logSummary('Type Name Extraction Summary');
        
        return summary;
        
    } catch (error) {
        logger.error(`Type name extraction failed: ${error.message}`);
        throw error;
    }
} 