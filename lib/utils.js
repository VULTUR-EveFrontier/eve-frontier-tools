#!/usr/bin/env node

/**
 * EVE Frontier Tools - Shared Utilities
 * 
 * Common functionality used across all scripts to eliminate duplication
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, '..');

// Configuration files
export const CONFIG_FILE = path.join(projectRoot, '.eve-frontier-path');
export const PYTHON_CONFIG_FILE = path.join(projectRoot, '.python312-path');

// ANSI color codes for terminal output
export const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    white: '\x1b[37m'
};

/**
 * Enhanced logging with colors and prefixes
 */
export function log(message, color = 'reset', prefix = '') {
    const prefixStr = prefix ? `${prefix} ` : '';
    console.log(`${colors[color]}${prefixStr}${message}${colors.reset}`);
}

/**
 * Log with different levels
 */
export const logger = {
    info: (msg, prefix = 'ℹ️') => log(msg, 'cyan', prefix),
    success: (msg, prefix = '✅') => log(msg, 'green', prefix),
    warning: (msg, prefix = '⚠️') => log(msg, 'yellow', prefix),
    error: (msg, prefix = '❌') => log(msg, 'red', prefix),
    debug: (msg, prefix = '🐛') => log(msg, 'magenta', prefix),
    progress: (msg, prefix = '🔄') => log(msg, 'blue', prefix)
};

/**
 * Load configuration from file
 */
export function loadConfiguration() {
    if (!fs.existsSync(CONFIG_FILE)) {
        logger.error('Configuration not found. Run "npm run setup" first.');
        process.exit(1);
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        return config;
    } catch (error) {
        logger.error(`Could not read configuration: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Save configuration to file
 */
export function saveConfiguration(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        logger.error(`Could not save configuration: ${error.message}`);
        return false;
    }
}

/**
 * Ensure directory structure exists
 */
export function ensureDirectories(directories = []) {
    const defaultDirs = [
        'data/raw',
        'data/json', 
        'data/extracted',
        'data/sqlite',
        'data/static',
        'data/pickle',
        'data/fsdbinary/src'
    ];
    
    const allDirs = [...defaultDirs, ...directories];
    
    for (const dir of allDirs) {
        const fullPath = path.join(projectRoot, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    }
}

/**
 * SQLite conversion utilities
 */
export const sqlite = {
    async convertToJson(sqliteFilePath, jsonFilePath, tableName) {
        try {
            const sqlite3 = await import('sqlite3');
            const fs = await import('fs/promises');
            
            return new Promise((resolve, reject) => {
                const db = new sqlite3.default.Database(sqliteFilePath, sqlite3.default.OPEN_READONLY, (err) => {
                    if (err) {
                        logger.error(`Could not open SQLite database: ${err.message}`);
                        reject(err);
                        return;
                    }
                });
                
                const query = `SELECT * FROM ${tableName}`;
                
                db.all(query, [], async (err, rows) => {
                    if (err) {
                        logger.error(`SQLite query failed: ${err.message}`);
                        db.close();
                        reject(err);
                        return;
                    }
                    
                    try {
                        // Convert to JSON and write to file
                        const jsonString = JSON.stringify(rows, null, 2);
                        await fs.writeFile(jsonFilePath, jsonString, 'utf8');
                        
                        logger.debug(`✓ Converted SQLite table '${tableName}' to JSON: ${jsonFilePath}`);
                        
                        db.close((closeErr) => {
                            if (closeErr) {
                                logger.warning(`Warning closing database: ${closeErr.message}`);
                            }
                            resolve(true);
                        });
                        
                    } catch (writeError) {
                        logger.error(`Failed to write JSON file: ${writeError.message}`);
                        db.close();
                        reject(writeError);
                    }
                });
            });
            
        } catch (error) {
            logger.error(`SQLite conversion error: ${error.message}`);
            return false;
        }
    }
};

/**
 * Pickle conversion utilities
 */
export const pickle = {
    async convertToJson(pickleFilePath, jsonFilePath) {
        try {
            const { Parser } = await import('pickleparser');
            const fs = await import('fs/promises');
            
            // Read the pickle file as a buffer
            const pickleData = await fs.readFile(pickleFilePath);
            
            // Parse the pickle data
            const parser = new Parser();
            const data = parser.parse(pickleData);
            
            // Handle different pickle formats (similar to Python version)
            let jsonData;
            if (Array.isArray(data) && data.length >= 2) {
                // Localization format: [version, strings_dict]
                if (typeof data[1] === 'object' && data[1] !== null) {
                    jsonData = data[1]; // Extract the strings dictionary
                } else {
                    jsonData = data;
                }
            } else {
                jsonData = data;
            }
            
            // Convert to JSON and write to file
            const jsonString = JSON.stringify(jsonData, null, 2);
            await fs.writeFile(jsonFilePath, jsonString, 'utf8');
            
            logger.debug(`✓ Converted ${pickleFilePath} to JSON`);
            return true;
            
        } catch (error) {
            logger.error(`Error converting ${pickleFilePath} to JSON: ${error.message}`);
            return false;
        }
    }
};

/**
 * Safe JSON file operations
 */
export const json = {
    load(filePath, required = true) {
        try {
            logger.debug(`Loading ${path.basename(filePath)}...`);
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (required) {
                logger.error(`Could not load ${filePath}: ${error.message}`);
                process.exit(1);
            }
            return null;
        }
    },
    
    save(filePath, data, description) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            const fileSize = (fs.statSync(filePath).size / 1024).toFixed(1);
            const fileName = path.basename(filePath);
            const desc = description ? `: ${description}` : '';
            logger.success(`Generated ${fileName} (${fileSize}KB)${desc}`);
            return true;
        } catch (error) {
            logger.error(`Could not save ${filePath}: ${error.message}`);
            return false;
        }
    }
};

/**
 * File existence and validation utilities
 */
export const files = {
    exists(filePath) {
        return fs.existsSync(filePath);
    },
    
    requireExists(filePath, errorMessage) {
        if (!fs.existsSync(filePath)) {
            logger.error(errorMessage || `Required file not found: ${filePath}`);
            process.exit(1);
        }
    },
    
    async isValidSQLite(filePath) {
        try {
            const fd = await fs.promises.open(filePath, 'r');
            const buffer = Buffer.alloc(16);
            await fd.read(buffer, 0, 16, 0);
            await fd.close();
            
            const sqliteHeader = 'SQLite format 3\0';
            return buffer.toString('ascii', 0, 16) === sqliteHeader;
        } catch (error) {
            return false;
        }
    },
    
    async createSymlink(sourcePath, targetPath) {
        try {
            if (fs.existsSync(targetPath)) {
                await fs.promises.unlink(targetPath);
            }
            
            await fs.promises.symlink(sourcePath, targetPath);
            return true;
        } catch (error) {
            logger.error(`Symlink failed: ${path.basename(targetPath)} - ${error.message}`);
            return false;
        }
    }
};

/**
 * Process execution utilities
 */
export const processes = {
    async runPython(scriptPath, cwd = projectRoot) {
        if (!fs.existsSync(PYTHON_CONFIG_FILE)) {
            logger.error('Python 3.12 not configured. Run: npm run setup');
            process.exit(1);
        }
        
        const python312Path = fs.readFileSync(PYTHON_CONFIG_FILE, 'utf8').trim();
        logger.info(`Using Python 3.12: ${python312Path}`);
        logger.info(`Running script: ${scriptPath}`);
        
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(python312Path, [scriptPath], {
                cwd,
                stdio: 'inherit'
            });
            
            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Python script failed with exit code ${code}`));
                }
            });
            
            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to start Python: ${error.message}`));
            });
        });
    },
    
    async runNode(scriptPath, cwd = projectRoot) {
        logger.info(`Running Node script: ${scriptPath}`);
        
        return new Promise((resolve, reject) => {
            const nodeProcess = spawn('node', [scriptPath], {
                cwd,
                stdio: 'inherit'
            });
            
            nodeProcess.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Node script failed with exit code ${code}`));
                }
            });
            
            nodeProcess.on('error', (error) => {
                reject(new Error(`Failed to start Node: ${error.message}`));
            });
        });
    }
};

/**
 * Progress tracking utilities
 */
export class ProgressTracker {
    constructor(name, total = 0) {
        this.name = name;
        this.total = total;
        this.current = 0;
        this.startTime = Date.now();
    }
    
    increment(amount = 1) {
        this.current += amount;
        if (this.current % 1000 === 0 && this.total > 0) {
            const percent = ((this.current / this.total) * 100).toFixed(1);
            logger.progress(`${this.name}: ${this.current}/${this.total} (${percent}%)`);
        }
    }
    
    finish() {
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        logger.success(`${this.name}: Completed ${this.current} items in ${duration}s`);
    }
}

/**
 * Statistics tracking utilities
 */
export class StatsCollector {
    constructor() {
        this.stats = {};
        this.startTime = Date.now();
    }
    
    increment(key, amount = 1) {
        this.stats[key] = (this.stats[key] || 0) + amount;
    }
    
    set(key, value) {
        this.stats[key] = value;
    }
    
    get(key) {
        return this.stats[key] || 0;
    }
    
    summary() {
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        return {
            ...this.stats,
            processingTime: `${duration}s`,
            generatedAt: new Date().toISOString()
        };
    }
    
    logSummary(title = 'Processing Summary') {
        logger.info(`\n📊 ${title}:`);
        Object.entries(this.stats).forEach(([key, value]) => {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').toLowerCase();
            logger.info(`   ${formattedKey}: ${value}`, 'bright');
        });
        const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
        logger.info(`   processing time: ${duration}s`, 'bright');
    }
}

/**
 * Data validation utilities
 */
export const validate = {
    installation(basePath) {
        const checks = [
            {
                path: path.join(basePath, 'stillness', 'bin64', 'exefile.exe'),
                description: 'EVE Frontier executable'
            },
            {
                path: path.join(basePath, 'index_stillness.txt'),
                description: 'File index'
            },
            {
                path: path.join(basePath, 'ResFiles'),
                description: 'ResFiles directory'
            }
        ];
        
        logger.info('Validating installation...');
        
        const results = checks.map(check => {
            const exists = fs.existsSync(check.path);
            const status = exists ? '✓' : '✗';
            const color = exists ? 'green' : 'red';
            logger.info(`  ${status} ${check.description}: ${check.path}`, color);
            return { ...check, exists };
        });
        
        const allValid = results.every(r => r.exists);
        
        if (allValid) {
            logger.success('Installation validated successfully!');
        } else {
            logger.error('Installation validation failed!');
            logger.warning('Please check that you\'ve provided the correct EVE Frontier installation path.');
        }
        
        return allValid;
    }
}; 