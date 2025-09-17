import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { NotionConfigModel } from '../models/NotionConfig.model';

/**
 * Middleware to validate Notion webhook HMAC signature
 * In capture mode, bypasses validation to capture the initial webhook
 */
export const webhookAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get the active Notion config
    const config = await NotionConfigModel.findOne({ isActive: true });
    
    if (!config) {
      console.error('❌ No active configuration found');
      res.status(500).json({ 
        error: 'No active configuration',
        code: 'NO_CONFIG' 
      });
      return;
    }

    // Check if we're in capture mode
    if (config.webhookCaptureMode?.enabled) {
      console.log('🎯 Webhook capture mode active - bypassing validation');
      
      // Check if capture mode has expired (5 minutes timeout)
      const captureStartTime = config.webhookCaptureMode.enabledAt;
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      if (captureStartTime && captureStartTime < fiveMinutesAgo) {
        // Disable expired capture mode
        config.webhookCaptureMode.enabled = false;
        await config.save();
        
        console.log('⏰ Capture mode expired - disabling');
      } else {
        // Capture mode is active, bypass validation
        next();
        return;
      }
    }

    // Normal mode - validate HMAC signature
    const signature = req.headers['x-notion-signature'] as string;
    
    if (!signature) {
      res.status(401).json({ 
        error: 'Missing x-notion-signature header',
        code: 'MISSING_SIGNATURE' 
      });
      return;
    }

    if (!config.webhookVerificationToken) {
      console.error('❌ Webhook verification token not configured');
      res.status(500).json({ 
        error: 'Webhook not configured',
        code: 'WEBHOOK_NOT_CONFIGURED' 
      });
      return;
    }

    // Decrypt the verification token
    const verificationToken = config.decryptWebhookToken();
    
    if (!verificationToken) {
      console.error('❌ Failed to decrypt webhook verification token');
      res.status(500).json({ 
        error: 'Invalid webhook configuration',
        code: 'INVALID_WEBHOOK_CONFIG' 
      });
      return;
    }

    // Get raw body for HMAC calculation
    const rawBody = JSON.stringify(req.body);
    
    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', verificationToken)
      .update(rawBody)
      .digest('hex');
    
    // Compare signatures (timing-safe comparison)
    const providedSignature = signature.replace('sha256=', '');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    )) {
      console.error('❌ Invalid webhook signature');
      res.status(401).json({ 
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE' 
      });
      return;
    }

    // Signature is valid, proceed to controller
    next();
  } catch (error) {
    console.error('❌ Webhook auth error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR' 
    });
  }
};

/**
 * Middleware for capture mode (no HMAC validation)
 * Used only during initial webhook setup
 */
export const captureAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if capture mode is enabled
    const config = await NotionConfigModel.findOne({ isActive: true });
    
    if (!config || !config.webhookCaptureMode?.enabled) {
      res.status(404).json({ 
        error: 'Capture mode not enabled',
        code: 'CAPTURE_MODE_DISABLED' 
      });
      return;
    }

    // Check if capture mode has expired (5 minutes timeout)
    const captureStartTime = config.webhookCaptureMode.enabledAt;
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    if (captureStartTime < fiveMinutesAgo) {
      // Disable expired capture mode
      config.webhookCaptureMode.enabled = false;
      await config.save();
      
      res.status(410).json({ 
        error: 'Capture mode expired',
        code: 'CAPTURE_MODE_EXPIRED' 
      });
      return;
    }

    // Capture mode is active, proceed
    next();
  } catch (error) {
    console.error('❌ Capture auth error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR' 
    });
  }
};