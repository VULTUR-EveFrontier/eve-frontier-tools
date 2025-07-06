# EVE Frontier Tools

A toolkit for extracting and processing EVE Frontier game data from ResFiles.
Uses Python to extract & parse FSDBinary formats, and dumps most data files to JSON for easy consumption.
Performs specific JSON for common use cases like types, blueprints, etc.

## Setup

1. **Requirements**: Node.js 18+, Python 3.12.x
2. **Install dependencies**: `npm install`
3. **Initialize environment**: `npm run setup`

## Usage

```bash
# Complete pipeline (setup → extract → process)
npm run pipeline

# Extract data only (skip setup if already configured)
npm run extract

# Individual steps
npm run pipeline -- --steps setup,index,fsdbinary,types,blueprints,stellar

# Reset project
npm run cleanup
```

## Expected Output

```
data/
├── extracted/
│   ├── type_names_all.json           # Type ID → name mappings
│   ├── blueprints_bom.json           # Bill of materials analysis
│   ├── stellar_labels.json           # System/constellation/region names
│   ├── stellar_systems.json          # Complete system data with coordinates
│   ├── stellar_constellations.json   # Constellation hierarchy
│   ├── stellar_regions.json          # Region data
│   └── stellar_cartography.json      # Combined stellar dataset
├── json/
│   ├── blueprints.json               # Converted blueprint data
│   ├── starmapcache.json             # Stellar map data
│   └── *.json                        # Other FSDBinary conversions
├── fsdbinary/                        # Symlinked game files
└── sqlite/
    └── blueprints.sqlite             # Processed blueprint database
```

### Key Files

- **type_names_all.json**: Complete type ID to name mapping
- **blueprints_bom.json**: Bill of materials with costs, inputs/outputs, and manufacturing chains
- **stellar_cartography.json**: Complete stellar map with systems, constellations, regions, coordinates, and names
- **blueprints.sqlite**: Searchable blueprint database

## Steps

1. **setup** - Configure paths and create directories
2. **index** - Parse index files and create symlinks
3. **fsdbinary** - Convert binary files to JSON using Python
4. **types** - Extract type names and mappings
5. **blueprints** - Process blueprints and generate BOM analysis
6. **stellar** - Extract stellar cartography data (systems, constellations, regions)
7. **cleanup** - Reset to clean state
