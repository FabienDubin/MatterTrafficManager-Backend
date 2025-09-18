import { Request, Response, NextFunction } from 'express';
import { Client } from '@notionhq/client';
import NotionConfigModel, { IFieldMapping, IDatabaseMapping } from '../models/NotionConfig.model';
import NotionDiscoveryService from '../services/NotionDiscoveryService';
import mongoose from 'mongoose';

/**
 * Auto-detect Notion database schema and properties
 */
export const autoDetectMapping = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { databaseName } = req.body;
    
    if (!databaseName) {
      res.status(400).json({
        success: false,
        error: 'Database name is required'
      });
      return;
    }
    
    const validDatabases = ['teams', 'users', 'clients', 'projects', 'traffic'];
    if (!validDatabases.includes(databaseName)) {
      res.status(400).json({
        success: false,
        error: `Invalid database name. Must be one of: ${validDatabases.join(', ')}`
      });
      return;
    }
    
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment }).select('+notionToken');
    
    if (!config) {
      res.status(400).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // Decrypt token or use environment variable as fallback
    let decryptedToken: string;
    try {
      if (config.notionToken) {
        decryptedToken = (config as any).decryptToken(config.notionToken);
      } else if (process.env.NOTION_TOKEN) {
        decryptedToken = process.env.NOTION_TOKEN;
      } else {
        res.status(400).json({
          success: false,
          error: 'Notion token not configured'
        });
        return;
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to decrypt Notion token'
      });
      return;
    }
    
    const notion = new Client({
      auth: decryptedToken
    });
    
    const databaseId = config.databases[databaseName as keyof typeof config.databases].id;
    
    try {
      // Retrieve database schema
      const database = await notion.databases.retrieve({
        database_id: databaseId
      });
      
      // Extract properties
      const properties = database.properties;
      const detectedFields: IFieldMapping[] = [];
      
      // Map Notion properties to application fields
      const fieldMappings: Record<string, { app: string; required: boolean }> = {
        // Traffic mappings
        'Nom de tâche': { app: 'taskName', required: true },
        'Période de travail': { app: 'workPeriod', required: true },
        'État': { app: 'status', required: true },
        'Utilisateurs': { app: 'users', required: true },
        'Projets': { app: 'project', required: true },
        'Ajouter au Calendrier': { app: 'addToCalendar', required: false },
        'Ajouter au rétroplanning client': { app: 'addToRetroplanning', required: false },
        'Google Event ID': { app: 'googleEventId', required: false },
        'Commentaire': { app: 'comment', required: false },
        
        // Users mappings
        'Nom': { app: 'name', required: true },
        'Email': { app: 'email', required: true },
        'Role': { app: 'role', required: true },
        'Actif': { app: 'isActive', required: false },
        'Téléphone': { app: 'phoneNumber', required: false },
        'Avatar': { app: 'avatar', required: false },
        'Date de création': { app: 'createdAt', required: false },
        
        // Projects mappings
        'Nom du projet': { app: 'projectName', required: true },
        'Client': { app: 'client', required: true },
        'Équipes': { app: 'teams', required: true },
        'Date de début': { app: 'startDate', required: false },
        'Date de fin': { app: 'endDate', required: false },
        'Statut': { app: 'status', required: true },
        
        // Clients mappings
        'Nom du client': { app: 'clientName', required: true },
        'Contact principal': { app: 'mainContact', required: false },
        'Email de contact': { app: 'contactEmail', required: false },
        'Téléphone client': { app: 'clientPhone', required: false },
        'Adresse': { app: 'address', required: false },
        'Site web': { app: 'website', required: false },
        
        // Teams mappings
        'Nom de l\'équipe': { app: 'teamName', required: true },
        'Membres': { app: 'members', required: true },
        'Chef d\'équipe': { app: 'teamLead', required: false },
        'Description': { app: 'description', required: false }
      };
      
      // Process each property
      for (const [propName, propConfig] of Object.entries(properties)) {
        const mapping = fieldMappings[propName];
        
        if (mapping) {
          detectedFields.push({
            applicationField: mapping.app,
            notionProperty: propName,
            notionType: (propConfig as any).type,
            isRequired: mapping.required,
            transformFunction: undefined as any
          });
        } else {
          // Unknown field - still map it but not required
          const sanitizedName = propName.toLowerCase().replace(/\s+/g, '_');
          detectedFields.push({
            applicationField: sanitizedName,
            notionProperty: propName,
            notionType: (propConfig as any).type,
            isRequired: false,
            transformFunction: undefined as any
          });
        }
      }
      
      // Update or create mapping in config
      const existingMappingIndex = config.mappings.findIndex(m => m.databaseName === databaseName);
      
      const newMapping: IDatabaseMapping = {
        databaseName,
        fields: detectedFields,
        lastMappingDate: new Date(),
        mappedFieldsCount: detectedFields.length
      };
      
      if (existingMappingIndex >= 0) {
        config.mappings[existingMappingIndex] = newMapping;
      } else {
        config.mappings.push(newMapping);
      }
      
      config.lastAutoDetectDate = new Date();
      await config.save();
      
      // Log detection info
      console.log(`Auto-detected ${detectedFields.length} fields for ${databaseName}`);
      
      res.status(200).json({
        success: true,
        message: `Successfully detected ${detectedFields.length} fields for ${databaseName}`,
        data: {
          databaseName,
          databaseId,
          detectedFields,
          totalProperties: Object.keys(properties).length,
          mappedCount: detectedFields.filter(f => fieldMappings[f.notionProperty]).length,
          unknownCount: detectedFields.filter(f => !fieldMappings[f.notionProperty]).length
        }
      });
    } catch (error: any) {
      console.error(`Error auto-detecting mapping for ${databaseName}:`, error);
      res.status(400).json({
        success: false,
        error: `Failed to auto-detect mapping for ${databaseName}`,
        details: error.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error in autoDetectMapping:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while detecting mapping'
    });
  }
};

/**
 * Get current mapping configuration
 */
export const getMapping = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { databaseName } = req.query;
    const environment = process.env.NODE_ENV || 'development';
    
    const config = await NotionConfigModel.findOne({ environment });
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // If specific database requested
    if (databaseName) {
      const mapping = config.mappings.find(m => m.databaseName === databaseName);
      
      if (!mapping) {
        res.status(404).json({
          success: false,
          error: `Mapping not found for database: ${databaseName}`
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        data: mapping
      });
    } else {
      // Return all mappings
      const mappingSummary = {
        traffic: config.mappings.find(m => m.databaseName === 'traffic'),
        users: config.mappings.find(m => m.databaseName === 'users'),
        projects: config.mappings.find(m => m.databaseName === 'projects'),
        clients: config.mappings.find(m => m.databaseName === 'clients'),
        teams: config.mappings.find(m => m.databaseName === 'teams')
      };
      
      res.status(200).json({
        success: true,
        data: {
          mappings: mappingSummary,
          totalMapped: config.mappings.length,
          lastAutoDetectDate: config.lastAutoDetectDate,
          autoDetectEnabled: config.autoDetectEnabled
        }
      });
    }
  } catch (error) {
    console.error('Error getting mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve mapping configuration'
    });
  }
};

/**
 * Save custom mapping configuration
 */
export const saveMapping = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { databaseName, fields } = req.body;
    const userId = (req as any).user?._id || new mongoose.Types.ObjectId();
    const ipAddress = req.ip;
    
    if (!databaseName || !fields) {
      res.status(400).json({
        success: false,
        error: 'Database name and fields are required'
      });
      return;
    }
    
    const validDatabases = ['teams', 'users', 'clients', 'projects', 'traffic'];
    if (!validDatabases.includes(databaseName)) {
      res.status(400).json({
        success: false,
        error: `Invalid database name. Must be one of: ${validDatabases.join(', ')}`
      });
      return;
    }
    
    // Validate fields structure
    if (!Array.isArray(fields)) {
      res.status(400).json({
        success: false,
        error: 'Fields must be an array'
      });
      return;
    }
    
    for (const field of fields) {
      if (!field.applicationField || !field.notionProperty || !field.notionType) {
        res.status(400).json({
          success: false,
          error: 'Each field must have applicationField, notionProperty, and notionType'
        });
        return;
      }
    }
    
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment });
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // Find or create mapping
    const existingMappingIndex = config.mappings.findIndex(m => m.databaseName === databaseName);
    
    const newMapping: IDatabaseMapping = {
      databaseName,
      fields,
      lastMappingDate: new Date(),
      mappedFieldsCount: fields.length
    };
    
    // Track changes for audit
    const changes: Record<string, any> = {
      databaseName,
      action: existingMappingIndex >= 0 ? 'UPDATE_MAPPING' : 'CREATE_MAPPING',
      fieldsCount: fields.length
    };
    
    if (existingMappingIndex >= 0) {
      changes.previousFieldsCount = config.mappings[existingMappingIndex]?.fields.length || 0;
      config.mappings[existingMappingIndex] = newMapping;
    } else {
      config.mappings.push(newMapping);
    }
    
    config.updatedBy = userId;
    (config as any).addAuditEntry(userId, 'SAVE_MAPPING', changes, ipAddress);
    
    await config.save();
    
    res.status(200).json({
      success: true,
      message: `Mapping saved successfully for ${databaseName}`,
      data: {
        databaseName,
        fieldsCount: fields.length,
        lastMappingDate: newMapping.lastMappingDate
      }
    });
  } catch (error) {
    console.error('Error saving mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save mapping configuration'
    });
  }
};

/**
 * Preview mapped data
 */
export const previewMapping = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { databaseName, limit = 5 } = req.body;
    
    if (!databaseName) {
      res.status(400).json({
        success: false,
        error: 'Database name is required'
      });
      return;
    }
    
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment }).select('+notionToken');
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    const mapping = config.mappings.find(m => m.databaseName === databaseName);
    
    if (!mapping || mapping.fields.length === 0) {
      res.status(404).json({
        success: false,
        error: `No mapping found for database: ${databaseName}`
      });
      return;
    }
    
    // Decrypt token
    let decryptedToken: string;
    try {
      if (config.notionToken) {
        decryptedToken = (config as any).decryptToken(config.notionToken);
      } else if (process.env.NOTION_TOKEN) {
        decryptedToken = process.env.NOTION_TOKEN;
      } else {
        res.status(400).json({
          success: false,
          error: 'Notion token not configured'
        });
        return;
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to decrypt Notion token'
      });
      return;
    }
    
    const notion = new Client({
      auth: decryptedToken
    });
    
    const databaseId = config.databases[databaseName as keyof typeof config.databases].id;
    
    try {
      // Fetch sample data
      const response = await notion.databases.query({
        database_id: databaseId,
        page_size: Math.min(limit, 10)
      });
      
      // Map data according to configuration
      const mappedData = response.results.map((page: any) => {
        const mapped: Record<string, any> = {
          _notionId: page.id
        };
        
        for (const field of mapping.fields) {
          const notionValue = page.properties[field.notionProperty];
          
          if (!notionValue) {
            mapped[field.applicationField] = null;
            continue;
          }
          
          // Transform based on Notion type
          switch (field.notionType) {
            case 'title':
              mapped[field.applicationField] = notionValue.title?.[0]?.plain_text || '';
              break;
            
            case 'rich_text':
              mapped[field.applicationField] = notionValue.rich_text?.[0]?.plain_text || '';
              break;
            
            case 'number':
              mapped[field.applicationField] = notionValue.number || 0;
              break;
            
            case 'checkbox':
              mapped[field.applicationField] = notionValue.checkbox || false;
              break;
            
            case 'select':
              mapped[field.applicationField] = notionValue.select?.name || '';
              break;
            
            case 'multi_select':
              mapped[field.applicationField] = notionValue.multi_select?.map((s: any) => s.name) || [];
              break;
            
            case 'date':
              mapped[field.applicationField] = notionValue.date?.start || null;
              break;
            
            case 'email':
              mapped[field.applicationField] = notionValue.email || '';
              break;
            
            case 'phone_number':
              mapped[field.applicationField] = notionValue.phone_number || '';
              break;
            
            case 'url':
              mapped[field.applicationField] = notionValue.url || '';
              break;
            
            case 'relation':
              mapped[field.applicationField] = notionValue.relation?.map((r: any) => r.id) || [];
              break;
            
            case 'people':
              mapped[field.applicationField] = notionValue.people?.map((p: any) => ({
                id: p.id,
                name: p.name,
                email: p.person?.email
              })) || [];
              break;
            
            default:
              mapped[field.applicationField] = notionValue;
          }
        }
        
        return mapped;
      });
      
      res.status(200).json({
        success: true,
        message: `Preview generated for ${databaseName}`,
        data: {
          databaseName,
          sampleCount: mappedData.length,
          mappedFields: mapping.fields.length,
          preview: mappedData
        }
      });
    } catch (error: any) {
      console.error(`Error generating preview for ${databaseName}:`, error);
      res.status(400).json({
        success: false,
        error: `Failed to generate preview for ${databaseName}`,
        details: error.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error in previewMapping:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while generating preview'
    });
  }
};