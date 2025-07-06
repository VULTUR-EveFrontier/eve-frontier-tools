import fs from 'fs';
import path from 'path';
import { logger, ensureDirectories } from '../utils.js';

/**
 * Stellar Cartography Processor
 * 
 * Extracts and processes stellar object data from EVE Frontier:
 * 1. Loads starmapcache.json for raw stellar data
 * 2. Loads localization files to extract proper names
 * 3. Creates processed datasets for systems, constellations, and regions
 * 4. Outputs structured JSON files for easy consumption
 */

function loadJsonFile(filePath, required = true) {
    try {
        if (!fs.existsSync(filePath)) {
            if (required) {
                throw new Error(`Required file not found: ${filePath}`);
            }
            logger.warning(`Optional file not found: ${filePath}`);
            return null;
        }

        logger.info(`Loading ${path.basename(filePath)}...`);
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error loading ${filePath}: ${error.message}`);
        if (required) {
            throw error;
        }
        return null;
    }
}

function extractStellarLabels(starMapCache, mainLocalization, enUsLocalization) {
    logger.info('Extracting stellar object IDs from starmapcache...');
    
    // Extract all unique IDs from starmapcache
    const allSystemIds = new Set();
    const allConstellationIds = new Set();
    const allRegionIds = new Set();
    
    // Extract region IDs and their content
    if (starMapCache.regions) {
        Object.keys(starMapCache.regions).forEach(id => {
            allRegionIds.add(parseInt(id));
        });
        
        Object.values(starMapCache.regions).forEach(region => {
            if (region.solarSystemIDs) {
                region.solarSystemIDs.forEach(id => allSystemIds.add(id));
            }
            if (region.constellationIDs) {
                region.constellationIDs.forEach(id => allConstellationIds.add(id));
            }
        });
    }
    
    // Extract constellation IDs and their content
    if (starMapCache.constellations) {
        Object.keys(starMapCache.constellations).forEach(id => {
            allConstellationIds.add(parseInt(id));
        });
        
        Object.values(starMapCache.constellations).forEach(constellation => {
            if (constellation.solarSystemIDs) {
                constellation.solarSystemIDs.forEach(id => allSystemIds.add(id));
            }
        });
    }
    
    // Check if there's a direct solarSystems object
    if (starMapCache.solarSystems) {
        Object.keys(starMapCache.solarSystems).forEach(id => allSystemIds.add(parseInt(id)));
    }
    
    logger.info(`Found ${allSystemIds.size} unique solar system IDs`);
    logger.info(`Found ${allConstellationIds.size} unique constellation IDs`);
    logger.info(`Found ${allRegionIds.size} unique region IDs`);
    
    logger.info('Building message ID mappings...');
    
    // Build mappings from IDs to message IDs
    const systemIdToMessageId = new Map();
    const constellationIdToMessageId = new Map();
    const regionIdToMessageId = new Map();
    
    // Parse the labels from main localization
    if (mainLocalization && mainLocalization.labels) {
        Object.entries(mainLocalization.labels).forEach(([messageId, entry]) => {
            if (entry.FullPath === 'Map/SolarSystems' && entry.label) {
                const match = entry.label.match(/solar_system_(\d+)/);
                if (match) {
                    const systemId = parseInt(match[1]);
                    if (allSystemIds.has(systemId)) {
                        systemIdToMessageId.set(systemId, parseInt(messageId));
                    }
                }
            } else if (entry.FullPath === 'Map/Constellations' && entry.label) {
                const match = entry.label.match(/constellation_(\d+)/);
                if (match) {
                    const constellationId = parseInt(match[1]);
                    if (allConstellationIds.has(constellationId)) {
                        constellationIdToMessageId.set(constellationId, parseInt(messageId));
                    }
                }
            } else if (entry.FullPath === 'Map/Regions' && entry.label) {
                const match = entry.label.match(/region_(\d+)/);
                if (match) {
                    const regionId = parseInt(match[1]);
                    if (allRegionIds.has(regionId)) {
                        regionIdToMessageId.set(regionId, parseInt(messageId));
                    }
                }
            }
        });
    }
    
    logger.info(`Found ${systemIdToMessageId.size} solar system message ID mappings`);
    logger.info(`Found ${constellationIdToMessageId.size} constellation message ID mappings`);
    logger.info(`Found ${regionIdToMessageId.size} region message ID mappings`);
    
    logger.info('Extracting names from English localization...');
    
    // Build final mappings from IDs to names
    const systemLabels = new Map();
    const constellationLabels = new Map();
    const regionLabels = new Map();
    
    if (enUsLocalization && typeof enUsLocalization === 'object') {
        // English localization data is a direct object with message IDs as keys
        const localizationData = enUsLocalization;
        
        // Extract system names
        systemIdToMessageId.forEach((messageId, systemId) => {
            if (localizationData[messageId]) {
                const localizationEntry = localizationData[messageId];
                if (Array.isArray(localizationEntry) && localizationEntry.length > 0) {
                    const systemName = localizationEntry[0];
                    if (systemName && systemName !== null) {
                        systemLabels.set(systemId, systemName);
                    }
                }
            }
        });
        
        // Extract constellation names
        constellationIdToMessageId.forEach((messageId, constellationId) => {
            if (localizationData[messageId]) {
                const localizationEntry = localizationData[messageId];
                if (Array.isArray(localizationEntry) && localizationEntry.length > 0) {
                    const constellationName = localizationEntry[0];
                    if (constellationName && constellationName !== null) {
                        constellationLabels.set(constellationId, constellationName);
                    }
                }
            }
        });
        
        // Extract region names
        regionIdToMessageId.forEach((messageId, regionId) => {
            if (localizationData[messageId]) {
                const localizationEntry = localizationData[messageId];
                if (Array.isArray(localizationEntry) && localizationEntry.length > 0) {
                    const regionName = localizationEntry[0];
                    if (regionName && regionName !== null) {
                        regionLabels.set(regionId, regionName);
                    }
                }
            }
        });
    }
    
    logger.info(`Successfully extracted ${systemLabels.size} system labels`);
    logger.info(`Successfully extracted ${constellationLabels.size} constellation labels`);
    logger.info(`Successfully extracted ${regionLabels.size} region labels`);
    
    return { systemLabels, constellationLabels, regionLabels };
}

function buildStellarData(starMapCache, systemLabels, constellationLabels, regionLabels) {
    logger.info('Building comprehensive stellar dataset...');
    
    const regions = {};
    const constellations = {};
    const systems = {};
    
    // Process regions
    if (starMapCache.regions) {
        Object.entries(starMapCache.regions).forEach(([idStr, regionData]) => {
            const regionId = parseInt(idStr);
            const name = regionLabels.get(regionId) || `Region_${regionId}`;
            
            regions[regionId] = {
                id: regionId,
                name: name,
                solarSystemIds: regionData.solarSystemIDs || [],
                constellationIds: regionData.constellationIDs || [],
                metadata: {
                    description: regionData.description || null,
                    factionId: regionData.factionID || null
                }
            };
        });
    }
    
    // Process constellations
    if (starMapCache.constellations) {
        Object.entries(starMapCache.constellations).forEach(([idStr, constellationData]) => {
            const constellationId = parseInt(idStr);
            const name = constellationLabels.get(constellationId) || `Constellation_${constellationId}`;
            
            constellations[constellationId] = {
                id: constellationId,
                name: name,
                regionId: constellationData.regionID || null,
                solarSystemIds: constellationData.solarSystemIDs || [],
                metadata: {
                    factionId: constellationData.factionID || null,
                    sovereignty: constellationData.sovereignty || null
                }
            };
        });
    }
    
    // Process solar systems
    if (starMapCache.solarSystems) {
        Object.entries(starMapCache.solarSystems).forEach(([idStr, systemData]) => {
            const systemId = parseInt(idStr);
            const name = systemLabels.get(systemId) || `System_${systemId}`;
            
            systems[systemId] = {
                id: systemId,
                name: name,
                center: systemData.center || [0, 0, 0],
                regionId: systemData.regionID || null,
                constellationId: systemData.constellationID || null,
                security: {
                    class: systemData.securityClass || null,
                    status: systemData.security || null
                },
                celestials: {
                    starId: systemData.star ? systemData.star.id : null,
                    planetIds: systemData.planetItemIDs || [],
                    planetCountByType: systemData.planetCountByType || {}
                },
                navigation: {
                    neighbours: systemData.neighbours || [],
                    stargates: systemData.stargates || []
                },
                metadata: {
                    factionId: systemData.factionID || null,
                    sovereignty: systemData.sovereignty || null,
                    disallowedAnchorCategories: systemData.disallowedAnchorCategories || [],
                    disallowedAnchorGroups: systemData.disallowedAnchorGroups || []
                }
            };
        });
    }
    
    return { regions, constellations, systems };
}

export async function processStellarCartography(projectRoot, config) {
    logger.info('Starting stellar cartography processing...');
    
    try {
        const jsonDir = path.join(projectRoot, 'data/json');
        const extractedDir = path.join(projectRoot, 'data/extracted');
        
        ensureDirectories();
        
        // Load required data files
        const starMapCache = loadJsonFile(path.join(jsonDir, 'starmapcache.json'));
        const mainLocalization = loadJsonFile(path.join(jsonDir, 'localization_fsd_main.json'), false);
        const enUsLocalization = loadJsonFile(path.join(jsonDir, 'localization_fsd_en-us.json'), false);
        
        if (!starMapCache) {
            throw new Error('starmapcache.json is required for stellar cartography processing');
        }
        
        // Extract stellar labels
        const { systemLabels, constellationLabels, regionLabels } = extractStellarLabels(
            starMapCache, mainLocalization, enUsLocalization
        );
        
        // Build comprehensive stellar dataset
        const { regions, constellations, systems } = buildStellarData(
            starMapCache, systemLabels, constellationLabels, regionLabels
        );
        
        // Output individual label files (for backward compatibility)
        const systemLabelsObj = {};
        systemLabels.forEach((name, id) => {
            systemLabelsObj[id] = name;
        });
        
        const constellationLabelsObj = {};
        constellationLabels.forEach((name, id) => {
            constellationLabelsObj[id] = name;
        });
        
        const regionLabelsObj = {};
        regionLabels.forEach((name, id) => {
            regionLabelsObj[id] = name;
        });
        
        // Write label files
        const systemLabelsFile = path.join(extractedDir, 'system_labels.json');
        const constellationLabelsFile = path.join(extractedDir, 'constellation_labels.json');
        const regionLabelsFile = path.join(extractedDir, 'region_labels.json');
        
        fs.writeFileSync(systemLabelsFile, JSON.stringify(systemLabelsObj, null, 2));
        fs.writeFileSync(constellationLabelsFile, JSON.stringify(constellationLabelsObj, null, 2));
        fs.writeFileSync(regionLabelsFile, JSON.stringify(regionLabelsObj, null, 2));
        
        // Write combined labels file
        const stellarLabelsFile = path.join(extractedDir, 'stellar_labels.json');
        const combinedLabels = {
            systems: systemLabelsObj,
            constellations: constellationLabelsObj,
            regions: regionLabelsObj
        };
        fs.writeFileSync(stellarLabelsFile, JSON.stringify(combinedLabels, null, 2));
        
        // Write comprehensive stellar data files
        const regionsFile = path.join(extractedDir, 'stellar_regions.json');
        const constellationsFile = path.join(extractedDir, 'stellar_constellations.json');
        const systemsFile = path.join(extractedDir, 'stellar_systems.json');
        
        fs.writeFileSync(regionsFile, JSON.stringify(regions, null, 2));
        fs.writeFileSync(constellationsFile, JSON.stringify(constellations, null, 2));
        fs.writeFileSync(systemsFile, JSON.stringify(systems, null, 2));
        
        // Write combined stellar cartography file
        const stellarCartographyFile = path.join(extractedDir, 'stellar_cartography.json');
        const stellarCartography = {
            metadata: {
                generated: new Date().toISOString(),
                source: 'EVE Frontier starmapcache.json and localization files',
                counts: {
                    regions: Object.keys(regions).length,
                    constellations: Object.keys(constellations).length,
                    systems: Object.keys(systems).length
                }
            },
            regions,
            constellations,
            systems
        };
        fs.writeFileSync(stellarCartographyFile, JSON.stringify(stellarCartography, null, 2));
        
        logger.success('Stellar cartography processing completed successfully');
        logger.info(`Generated files:`);
        logger.info(`  - ${path.basename(systemLabelsFile)} (${Object.keys(systemLabelsObj).length} systems)`);
        logger.info(`  - ${path.basename(constellationLabelsFile)} (${Object.keys(constellationLabelsObj).length} constellations)`);
        logger.info(`  - ${path.basename(regionLabelsFile)} (${Object.keys(regionLabelsObj).length} regions)`);
        logger.info(`  - ${path.basename(stellarLabelsFile)} (combined labels)`);
        logger.info(`  - ${path.basename(regionsFile)} (comprehensive region data)`);
        logger.info(`  - ${path.basename(constellationsFile)} (comprehensive constellation data)`);
        logger.info(`  - ${path.basename(systemsFile)} (comprehensive system data)`);
        logger.info(`  - ${path.basename(stellarCartographyFile)} (complete stellar cartography dataset)`);
        
        return {
            systemsCount: Object.keys(systems).length,
            constellationsCount: Object.keys(constellations).length,
            regionsCount: Object.keys(regions).length,
            labeledSystems: systemLabels.size,
            labeledConstellations: constellationLabels.size,
            labeledRegions: regionLabels.size
        };
        
    } catch (error) {
        logger.error(`Stellar cartography processing failed: ${error.message}`);
        throw error;
    }
} 