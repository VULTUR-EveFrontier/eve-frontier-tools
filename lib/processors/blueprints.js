/**
 * Blueprint Processor - Build Clean Bill of Materials
 * 
 * Processes blueprint data and type names to create clean
 * bill-of-materials mappings for EVE Frontier manufacturing
 */

import path from 'path';
import { 
    logger, 
    projectRoot, 
    json,
    files,
    sqlite,
    StatsCollector 
} from '../utils.js';

/**
 * Run blueprint analysis and BOM generation
 */
export async function runBlueprintAnalysis() {
    try {
        logger.info('\n🏭 Processing blueprint data...');
        
        const blueprintsJsonFile = path.join(projectRoot, 'data/json/blueprints.json');
        const blueprintsSqliteFile = path.join(projectRoot, 'data/sqlite/blueprints.sqlite');
        const typeNamesFile = path.join(projectRoot, 'data/extracted/type_names_all.json');
        const outputDir = path.join(projectRoot, 'data/extracted');
        
        // Check if we need to convert SQLite to JSON first
        if (!files.exists(blueprintsJsonFile) && files.exists(blueprintsSqliteFile)) {
            logger.info('blueprints.json not found, converting from blueprints.sqlite...');
            
            // Extract cache table (main blueprint data)
            const cacheJsonFile = path.join(projectRoot, 'data/json/blueprints_cache.json');
            await sqlite.convertToJson(blueprintsSqliteFile, cacheJsonFile, 'cache');
            
            // Load cache data and convert to blueprints format
            logger.info('Processing blueprint cache data...');
            const cacheData = json.load(cacheJsonFile);
            
            // Convert cache data to blueprints format
            // Cache table structure: key = blueprint type ID, value = JSON blueprint data
            const blueprintsData = {};
            let processedCount = 0;
            let errorCount = 0;
            
            for (const item of cacheData) {
                if (item.key && item.value) {
                    try {
                        // Parse the JSON-encoded blueprint data
                        const blueprintData = JSON.parse(item.value);
                        blueprintsData[item.key] = blueprintData;
                        processedCount++;
                    } catch (parseError) {
                        logger.warning(`Could not parse blueprint data for key ${item.key}: ${parseError.message}`);
                        errorCount++;
                    }
                }
            }
            
            logger.info(`Processed ${processedCount} blueprints (${errorCount} errors)`);
            
            // Save the converted data as blueprints.json
            json.save(blueprintsJsonFile, blueprintsData, `Blueprint data converted from SQLite cache table (${processedCount} blueprints)`);
        }
        
        // Verify input files exist
        files.requireExists(blueprintsJsonFile, 'blueprints.json not found and blueprints.sqlite not available. Run FSDBinary conversion first.');
        files.requireExists(typeNamesFile, 'type_names_all.json not found. Run type extraction first.');
        
        // Load data
        logger.info('Loading blueprints data...');
        const blueprints = json.load(blueprintsJsonFile);
        
        logger.info('Loading type names...');
        const typeNames = json.load(typeNamesFile);
        
        // Statistics tracking
        const stats = new StatsCollector();
        
        // Process blueprints
        const materialToBlueprints = {};
        const blueprintToMaterials = {};
        const allMaterialIds = new Set();
        const allBlueprintIds = new Set();
        
        for (const [blueprintId, blueprint] of Object.entries(blueprints)) {
            allBlueprintIds.add(parseInt(blueprintId));
            stats.increment('totalBlueprints');
            
            if (blueprint.activities && blueprint.activities.manufacturing) {
                stats.increment('manufacturingBlueprints');
                const materials = blueprint.activities.manufacturing.materials || [];
                const products = blueprint.activities.manufacturing.products || [];
                
                // Store blueprint to materials mapping
                blueprintToMaterials[blueprintId] = {
                    blueprintName: typeNames[blueprintId] || `Blueprint ${blueprintId}`,
                    materials: materials.map(mat => ({
                        typeID: mat.typeID,
                        name: typeNames[mat.typeID] || `Type ${mat.typeID}`,
                        quantity: mat.quantity
                    })),
                    products: products.map(prod => ({
                        typeID: prod.typeID,
                        name: typeNames[prod.typeID] || `Type ${prod.typeID}`,
                        quantity: prod.quantity
                    }))
                };
                
                // Build reverse mapping (materials to blueprints)
                for (const material of materials) {
                    const materialId = material.typeID;
                    allMaterialIds.add(materialId);
                    
                    if (!materialToBlueprints[materialId]) {
                        materialToBlueprints[materialId] = {
                            materialName: typeNames[materialId] || `Type ${materialId}`,
                            usedInBlueprints: []
                        };
                    }
                    
                    materialToBlueprints[materialId].usedInBlueprints.push({
                        blueprintID: parseInt(blueprintId),
                        blueprintName: typeNames[blueprintId] || `Blueprint ${blueprintId}`,
                        quantityRequired: material.quantity
                    });
                }
            }
        }
        
        stats.set('uniqueMaterials', allMaterialIds.size);
        stats.set('uniqueBlueprints', allBlueprintIds.size);
        
        // Write outputs
        const outputs = [
            {
                file: 'clean_materials_to_blueprints.json',
                data: materialToBlueprints,
                description: `Materials to blueprints mapping (${allMaterialIds.size} materials)`
            },
            {
                file: 'clean_blueprints_to_materials.json',
                data: blueprintToMaterials,
                description: `Blueprints to materials mapping (${stats.get('manufacturingBlueprints')} blueprints)`
            },
            {
                file: 'bom_summary.json',
                data: {
                    summary: stats.summary(),
                    allMaterialIds: Array.from(allMaterialIds).sort((a, b) => a - b),
                    allBlueprintIds: Array.from(allBlueprintIds).sort((a, b) => a - b)
                },
                description: 'Bill of materials summary and quick reference'
            }
        ];
        
        for (const output of outputs) {
            const outputPath = path.join(outputDir, output.file);
            json.save(outputPath, output.data, output.description);
        }
        
        stats.logSummary('Blueprint Analysis Summary');
        
        return stats.summary();
        
    } catch (error) {
        logger.error(`Blueprint analysis failed: ${error.message}`);
        throw error;
    }
} 