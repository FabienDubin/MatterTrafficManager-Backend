import { Client } from '@notionhq/client';
import NotionConfigModel, { INotionConfig, IRelationshipValidation } from '../models/NotionConfig.model';

interface DatabaseSchema {
  id: string;
  name: string;
  properties: Record<string, any>;
}

interface RelationValidationResult {
  from: string;
  to: string;
  field: string;
  isValid: boolean;
  totalReferences: number;
  validReferences: number;
  orphanedReferences: string[];
  message: string;
}

/**
 * Service for automatic discovery and validation of Notion databases
 */
export class NotionDiscoveryService {
  private notion: Client;
  private config: INotionConfig;
  
  constructor(token: string, config: INotionConfig) {
    this.notion = new Client({ auth: token });
    this.config = config;
  }
  
  /**
   * Discover all properties for a specific database
   */
  async discoverDatabaseProperties(databaseName: string): Promise<DatabaseSchema> {
    const dbKey = databaseName as keyof typeof this.config.databases;
    const databaseId = this.config.databases[dbKey].id;
    
    try {
      const database = await this.notion.databases.retrieve({
        database_id: databaseId
      });
      
      console.log(`📋 Discovering properties for ${databaseName} (${databaseId})`);
      console.log(`Found ${Object.keys(database.properties).length} properties:`);
      
      for (const [propName, propConfig] of Object.entries(database.properties)) {
        const type = (propConfig as any).type;
        console.log(`  - ${propName}: ${type}`);
      }
      
      return {
        id: databaseId,
        name: databaseName,
        properties: database.properties
      };
    } catch (error: any) {
      console.error(`❌ Error discovering ${databaseName}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Discover all databases schema
   */
  async discoverAllDatabases(): Promise<Record<string, DatabaseSchema>> {
    const schemas: Record<string, DatabaseSchema> = {};
    const databases = ['teams', 'users', 'clients', 'projects', 'traffic'];
    
    for (const dbName of databases) {
      try {
        schemas[dbName] = await this.discoverDatabaseProperties(dbName);
      } catch (error) {
        console.error(`Failed to discover ${dbName}`, error);
        schemas[dbName] = {
          id: this.config.databases[dbName as keyof typeof this.config.databases].id,
          name: dbName,
          properties: {}
        };
      }
    }
    
    return schemas;
  }
  
  /**
   * Validate relationship between two databases
   */
  async validateRelationship(
    fromDb: string,
    toDb: string,
    field: string
  ): Promise<RelationValidationResult> {
    const fromDbKey = fromDb as keyof typeof this.config.databases;
    const toDbKey = toDb as keyof typeof this.config.databases;
    
    const fromDatabaseId = this.config.databases[fromDbKey].id;
    const toDatabaseId = this.config.databases[toDbKey].id;
    
    console.log(`\n🔍 Validating relationship: ${fromDb}.${field} → ${toDb}`);
    
    try {
      // Get sample data from source database
      const sourceData = await this.notion.databases.query({
        database_id: fromDatabaseId,
        page_size: 100
      });
      
      // Get all IDs from target database
      const targetData = await this.notion.databases.query({
        database_id: toDatabaseId,
        page_size: 100
      });
      
      const targetIds = new Set(targetData.results.map(page => page.id));
      
      // Check references
      let totalReferences = 0;
      let validReferences = 0;
      const orphanedReferences: string[] = [];
      
      for (const page of sourceData.results) {
        const properties = (page as any).properties;
        const relationField = properties[field];
        
        if (relationField && relationField.type === 'relation') {
          const relatedIds = relationField.relation || [];
          
          for (const related of relatedIds) {
            totalReferences++;
            
            if (targetIds.has(related.id)) {
              validReferences++;
            } else {
              orphanedReferences.push(related.id);
            }
          }
        }
      }
      
      const isValid = orphanedReferences.length === 0;
      const message = isValid 
        ? `✅ All ${totalReferences} references are valid`
        : `⚠️ Found ${orphanedReferences.length} orphaned references out of ${totalReferences}`;
      
      console.log(message);
      
      return {
        from: fromDb,
        to: toDb,
        field,
        isValid,
        totalReferences,
        validReferences,
        orphanedReferences,
        message
      };
    } catch (error: any) {
      console.error(`❌ Error validating relationship:`, error.message);
      
      return {
        from: fromDb,
        to: toDb,
        field,
        isValid: false,
        totalReferences: 0,
        validReferences: 0,
        orphanedReferences: [],
        message: `Error: ${error.message}`
      };
    }
  }
  
  /**
   * Validate all relationships between databases
   */
  async validateRelationships(): Promise<{
    results: RelationValidationResult[];
    summary: {
      total: number;
      valid: number;
      invalid: number;
      orphanedCount: number;
    };
  }> {
    console.log('\n🔗 Starting relationship validation...\n');
    
    const relationships = [
      { from: 'traffic', to: 'projects', field: 'Projets' },
      { from: 'projects', to: 'clients', field: 'Client' },
      { from: 'projects', to: 'teams', field: 'Équipes' },
      { from: 'teams', to: 'users', field: 'Membres' }
    ];
    
    const results: RelationValidationResult[] = [];
    let totalOrphaned = 0;
    
    for (const rel of relationships) {
      const result = await this.validateRelationship(rel.from, rel.to, rel.field);
      results.push(result);
      totalOrphaned += result.orphanedReferences.length;
    }
    
    const validCount = results.filter(r => r.isValid).length;
    const invalidCount = results.filter(r => !r.isValid).length;
    
    // Update config with validation results
    const validationRecords: IRelationshipValidation[] = results.map(r => ({
      from: r.from,
      to: r.to,
      field: r.field,
      isValid: r.isValid,
      orphanedCount: r.orphanedReferences.length,
      lastValidationDate: new Date(),
      validationMessage: r.message
    }));
    
    this.config.relationships = validationRecords;
    await this.config.save();
    
    console.log('\n📊 Validation Summary:');
    console.log(`Total relationships: ${results.length}`);
    console.log(`Valid: ${validCount}`);
    console.log(`Invalid: ${invalidCount}`);
    console.log(`Total orphaned references: ${totalOrphaned}`);
    
    return {
      results,
      summary: {
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
        orphanedCount: totalOrphaned
      }
    };
  }
  
  /**
   * Generate documentation for discovered schemas
   */
  generateDocumentation(schemas: Record<string, DatabaseSchema>): string {
    let doc = '# Notion Database Schema Documentation\n\n';
    doc += `Generated on: ${new Date().toISOString()}\n\n`;
    
    for (const [dbName, schema] of Object.entries(schemas)) {
      doc += `## ${dbName.charAt(0).toUpperCase() + dbName.slice(1)} Database\n`;
      doc += `- **ID**: ${schema.id}\n`;
      doc += `- **Properties**: ${Object.keys(schema.properties).length}\n\n`;
      
      doc += '### Fields:\n';
      for (const [propName, propConfig] of Object.entries(schema.properties)) {
        const type = (propConfig as any).type;
        const isRequired = (propConfig as any).required || false;
        doc += `- **${propName}** (${type})${isRequired ? ' *required*' : ''}\n`;
        
        // Add details for specific types
        if (type === 'select' || type === 'multi_select') {
          const options = (propConfig as any)[type]?.options || [];
          if (options.length > 0) {
            doc += `  - Options: ${options.map((o: any) => o.name).join(', ')}\n`;
          }
        } else if (type === 'relation') {
          const dbId = (propConfig as any).relation?.database_id;
          if (dbId) {
            doc += `  - Related to: ${dbId}\n`;
          }
        }
      }
      
      doc += '\n';
    }
    
    return doc;
  }
  
  /**
   * Full discovery and validation workflow
   */
  async runFullDiscovery(): Promise<{
    schemas: Record<string, DatabaseSchema>;
    validation: any;
    documentation: string;
  }> {
    console.log('🚀 Starting full Notion discovery process...\n');
    
    // Step 1: Discover all databases
    console.log('Step 1: Discovering database schemas...');
    const schemas = await this.discoverAllDatabases();
    
    // Step 2: Validate relationships
    console.log('\nStep 2: Validating relationships...');
    const validation = await this.validateRelationships();
    
    // Step 3: Generate documentation
    console.log('\nStep 3: Generating documentation...');
    const documentation = this.generateDocumentation(schemas);
    
    // Log documentation to console
    console.log('\n' + '='.repeat(50));
    console.log(documentation);
    console.log('='.repeat(50) + '\n');
    
    console.log('✅ Discovery process completed!');
    
    return {
      schemas,
      validation,
      documentation
    };
  }
}

export default NotionDiscoveryService;