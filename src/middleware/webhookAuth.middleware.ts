import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { NotionConfigModel } from '../models/NotionConfig.model';

/**
 * Middleware to validate Notion webhook HMAC signature
 */
export const webhookAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if this is the initial verification request from Notion
    if (req.body.verification_token) {
      console.log('📨 Initial webhook verification request detected');
      console.log('🔑 Verification token:', req.body.verification_token);
      console.log('⚠️ IMPORTANT: Save this token in WEBHOOK_VERIFICATION_TOKEN environment variable');
      
      // Log to Azure Application Insights if available
      if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
        console.log('📊 Token logged to Application Insights');
      }
      
      // Let the request through without HMAC validation
      // The controller will handle storing the token if needed
      next();
      return;
    }

    // Get the signature from headers
    const signature = req.headers['x-notion-signature'] as string;
    
    if (!signature) {
      res.status(401).json({ 
        error: 'Missing x-notion-signature header',
        code: 'MISSING_SIGNATURE' 
      });
      return;
    }

    // Get the active Notion config with webhook verification token
    const config = await NotionConfigModel.findOne({ isActive: true });
    
    let verificationToken: string | null = null;
    
    // Try to get token from database first
    if (config?.webhookVerificationToken) {
      try {
        verificationToken = config.decryptWebhookToken();
      } catch (error) {
        console.warn('⚠️ Failed to decrypt token from database:', error);
      }
    }
    
    // Fallback to environment variable if database token not available
    if (!verificationToken) {
      verificationToken = process.env.WEBHOOK_VERIFICATION_TOKEN || null;
      if (verificationToken) {
        console.log('📌 Using webhook token from environment variable');
      }
    }
    
    if (!verificationToken) {
      console.error('❌ No webhook verification token configured');
      console.error('   Set WEBHOOK_VERIFICATION_TOKEN env variable with the token from Notion');
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