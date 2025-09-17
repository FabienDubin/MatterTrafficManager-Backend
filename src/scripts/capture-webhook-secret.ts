#!/usr/bin/env ts-node
/**
 * Script temporaire pour capturer le webhook secret de Notion
 * 
 * Usage:
 * 1. Lance ce script : npm run capture-webhook
 * 2. Configure ton webhook dans Notion avec l'URL ngrok
 * 3. Le script va capturer et afficher le secret
 * 4. Copie le secret et mets-le dans .env ou l'admin
 */

import express from 'express';
import { createServer } from 'http';

const app = express();
const PORT = 5005; // Même port que le backend principal

// Middleware pour parser le JSON et le texte
app.use(express.json());
app.use(express.text());

// Logger toutes les requêtes
app.use((req, _res, next) => {
  console.log('\n' + '='.repeat(60));
  console.log('📨 REQUÊTE REÇUE:', new Date().toISOString());
  console.log('='.repeat(60));
  
  console.log('\n📍 URL:', req.method, req.url);
  console.log('\n📋 HEADERS:');
  Object.entries(req.headers).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
    
    // Cherche le secret dans différents headers possibles
    if (key.toLowerCase().includes('secret') || 
        key.toLowerCase().includes('webhook') ||
        key.toLowerCase().includes('signature') ||
        key.toLowerCase().includes('verification')) {
      console.log(`  ⭐️ POSSIBLE SECRET TROUVÉ: ${key} = ${value}`);
    }
  });
  
  console.log('\n📦 BODY:');
  if (req.body) {
    console.log(JSON.stringify(req.body, null, 2));
    
    // Cherche le secret dans le body
    if (typeof req.body === 'object') {
      Object.entries(req.body).forEach(([key, value]) => {
        if (key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('verification')) {
          console.log(`  ⭐️ POSSIBLE SECRET DANS BODY: ${key} = ${value}`);
        }
      });
    }
  }
  
  console.log('\n' + '='.repeat(60));
  next();
});

// Route webhook - accepte toutes les méthodes
app.post('/api/v1/webhooks/notion', (_req, res) => {
  console.log('\n✅ WEBHOOK ENDPOINT HIT (POST)!');
  
  // Renvoie une réponse 200 pour que Notion valide
  res.status(200).json({
    success: true,
    message: 'Webhook received successfully',
    timestamp: new Date().toISOString()
  });
  
  console.log('✅ Réponse 200 envoyée à Notion');
});

app.get('/api/v1/webhooks/notion', (_req, res) => {
  console.log('\n✅ WEBHOOK ENDPOINT HIT (GET)!');
  
  // Renvoie une réponse 200 pour que Notion valide
  res.status(200).json({
    success: true,
    message: 'Webhook received successfully',
    timestamp: new Date().toISOString()
  });
  
  console.log('✅ Réponse 200 envoyée à Notion');
});

// Route catch-all pour débugger - utilise use au lieu de all
app.use((req, res) => {
  console.log(`\n⚠️ Route non matchée: ${req.method} ${req.url}`);
  res.status(200).json({ 
    received: true,
    path: req.url,
    method: req.method 
  });
});

const server = createServer(app);

server.listen(PORT, () => {
  console.log('\n' + '🚀'.repeat(20));
  console.log(`🎯 CAPTURE WEBHOOK SERVER DÉMARRÉ`);
  console.log(`📍 Port local: ${PORT}`);
  console.log(`🔗 URL locale: http://localhost:${PORT}/api/v1/webhooks/notion`);
  console.log('\n📝 Configure ton URL ngrok dans Notion:');
  console.log('    https://ton-url.ngrok-free.app/api/v1/webhooks/notion');
  console.log('\n⚠️  IMPORTANT: Arrête d\'abord le serveur principal (npm run dev)');
  console.log('    pour libérer le port 5005 avant de lancer ce script!');
  console.log('🚀'.repeat(20) + '\n');
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
  console.log('\n\n👋 Arrêt du serveur de capture...');
  server.close(() => {
    process.exit(0);
  });
});