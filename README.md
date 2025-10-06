# 🚀 Matter Traffic Manager - Backend API

> API backend pour Matter Traffic Manager - Gestionnaire de trafic intelligent synchronisé avec Notion

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.1+-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.0-green.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## ✨ Fonctionnalités

- 🔐 **Authentification JWT** avec access & refresh tokens
- 📊 **Synchronisation Notion** bidirectionnelle avec webhooks temps réel
- ⚡ **Cache intelligent** MongoDB avec invalidation automatique
- 🔄 **Gestion des conflits** de planification avec résolution automatique
- 📈 **Métriques & monitoring** en temps réel
- 🎯 **Rate limiting** adaptatif Notion (3 req/sec)
- 🛡️ **Sécurité renforcée** avec Helmet, CORS et validation Zod
- 📚 **Documentation OpenAPI/Swagger** automatique
- 🧪 **Tests complets** avec Jest et Supertest

## 📋 Table des matières

- [Stack Technologique](#-stack-technologique)
- [Prérequis](#-prérequis)
- [Installation Rapide](#-installation-rapide)
- [Configuration](#-configuration)
- [Scripts Disponibles](#-scripts-disponibles)
- [Structure du Projet](#-structure-du-projet)
- [API Endpoints](#-api-endpoints)
- [Base de Données](#-base-de-données)
- [Webhooks Notion](#-webhooks-notion)
- [Déploiement](#-déploiement)
- [Tests](#-tests)
- [Sécurité](#-sécurité)
- [Performance](#-performance)
- [Contribution](#-contribution)

## 🛠️ Stack Technologique

| Technologie | Version | Description |
|------------|---------|-------------|
| **Node.js** | 20+ | Runtime JavaScript |
| **TypeScript** | 5.7+ | Typage statique |
| **Express** | 5.1+ | Framework web |
| **MongoDB** | 8.0 | Base de données NoSQL |
| **Mongoose** | 8.8+ | ODM MongoDB |
| **Jest** | 29+ | Framework de tests |
| **Zod** | 3.23+ | Validation de schémas |
| **Winston** | 3.15+ | Logging structuré |

## 📦 Prérequis

- **Node.js** 20 ou supérieur
- **npm** ou **yarn**
- **MongoDB** 8.0+ (local ou Docker)
- **Docker** & **Docker Compose** (optionnel mais recommandé)
- **Token API Notion** avec accès aux bases de données

## 🚀 Installation Rapide

### Option 1: Installation Locale (5 minutes)

```bash
# 1. Cloner et installer
cd matter-traffic-backend
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env avec vos tokens Notion et MongoDB URI

# 3. Initialiser la base de données
npm run db:init

# 4. Créer l'utilisateur admin par défaut
npm run seed:admin

# 5. Démarrer le serveur
npm run dev
```

✅ L'API démarre sur **http://localhost:5005**

### Option 2: Avec Docker (Recommandé)

```bash
# Depuis la racine du projet MatterTrafficManager
docker-compose up backend -d
```

✅ MongoDB + Backend démarrent automatiquement

## ⚙️ Configuration

### Variables d'Environnement Essentielles

Copier `.env.example` vers `.env` et configurer:

```bash
# 🌍 Environnement
NODE_ENV=development
PORT=5005

# 🗄️ MongoDB
MONGODB_URI=mongodb://admin:password@localhost:27018/matter-traffic?authSource=admin

# 🎨 Frontend CORS
FRONTEND_URL=http://localhost:5173

# 🔗 Notion API
NOTION_TOKEN=secret_votre_token_notion_ici
NOTION_DB_TRAFFIC=268a12bfa99281809af5f6a9d2fccbe3
NOTION_DB_USERS=268a12bfa99281bf9101ebacbae3e39a
NOTION_DB_TEAMS=268a12bfa99281f886bbd9ffc36be65f
NOTION_DB_PROJECTS=268a12bfa9928105a95fde79cea0f6ff
NOTION_DB_CLIENTS=268a12bfa99281fb8566e7917a7f8b8e7

# 🔑 JWT Configuration
JWT_SECRET=votre_secret_ultra_securise_256_bits_minimum
JWT_ACCESS_EXPIRY=8h
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

# 📝 Logging
LOG_LEVEL=debug
```

### Configuration des Webhooks Notion

Pour activer la synchronisation temps réel avec Notion:

```bash
# 1. Capturer le webhook token (développement local)
npm run webhook:capture:local

# 2. Ou sur Azure (staging/production)
npm run webhook:capture

# 3. Configurer l'URL du webhook dans Notion:
# https://votre-domaine.com/api/v1/webhook/notion
```

## 📜 Scripts Disponibles

### Développement

```bash
npm run dev              # Démarrer en mode développement (hot reload)
npm run build            # Build de production
npm start                # Démarrer en mode production
```

### Tests

```bash
npm test                 # Lancer tous les tests
npm run test:watch       # Tests en mode watch
npm run test:coverage    # Rapport de couverture
```

### Base de Données

```bash
npm run db:init          # Initialiser les collections et index
npm run db:seed          # Peupler avec des données de test
npm run seed:admin       # Créer l'utilisateur admin par défaut
```

### Notion & Synchronisation

```bash
npm run test:notion-data        # Tester la connexion Notion
npm run test:batch-resolver     # Tester le batch resolver
npm run test:multi-teams        # Tester les équipes multiples
npm run test:calendar-endpoint  # Tester l'endpoint calendrier
npm run webhook:capture         # Capturer le token webhook
```

### Scripts Utilitaires

```bash
npm run import:colors    # Importer les couleurs clients
npm run import:configs   # Initialiser toutes les configurations
npm run lint             # Vérifier le code
npm run lint:fix         # Corriger automatiquement
npm run format           # Formater avec Prettier
```

### Docker

```bash
npm run docker:rebuild:backend   # Rebuild et redémarrer le backend
npm run docker:rebuild:frontend  # Rebuild et redémarrer le frontend
npm run docker:rebuild:all       # Rebuild complet
```

## 🗂️ Structure du Projet

```
matter-traffic-backend/
│
├── src/
│   ├── config/              # Configuration (DB, Swagger, Logger)
│   ├── controllers/         # Contrôleurs Express
│   │   ├── auth.controller.ts
│   │   ├── tasks/           # Contrôleurs tâches
│   │   ├── clients/         # Contrôleurs clients
│   │   ├── members/         # Contrôleurs membres
│   │   ├── projects/        # Contrôleurs projets
│   │   └── teams/           # Contrôleurs équipes
│   ├── jobs/                # Cron jobs et tâches planifiées
│   │   └── cache-refresh.job.ts
│   ├── middleware/          # Middleware Express
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── preload.middleware.ts
│   │   ├── rate-limit.middleware.ts
│   │   └── tracking.middleware.ts
│   ├── models/              # Modèles Mongoose
│   │   ├── User.model.ts
│   │   ├── Task.model.ts
│   │   ├── Config.model.ts
│   │   └── TaskSchedulingConflict.model.ts
│   ├── repositories/        # Couche d'accès aux données
│   ├── routes/              # Routes API organisées par domaine
│   │   ├── auth/            # Routes authentification
│   │   ├── tasks/           # Routes tâches
│   │   ├── entities/        # Routes entités (clients, membres...)
│   │   ├── admin/           # Routes administration
│   │   ├── notion/          # Routes Notion sync
│   │   └── system/          # Routes système (health, webhooks)
│   ├── services/            # Logique métier
│   │   ├── auth.service.ts
│   │   ├── notion.service.ts
│   │   ├── conflict.service.ts
│   │   ├── batch-resolver.service.ts
│   │   ├── cache-metrics.service.ts
│   │   ├── preload.service.ts
│   │   └── sync-queue.service.ts
│   ├── scripts/             # Scripts utilitaires
│   │   ├── init-db.ts
│   │   ├── seed-admin.ts
│   │   ├── test-notion-data.ts
│   │   └── azure-webhook-capture.ts
│   ├── types/               # Définitions TypeScript
│   ├── utils/               # Fonctions utilitaires
│   ├── validators/          # Schémas de validation Zod
│   └── server.ts            # Point d'entrée
│
├── tests/
│   ├── unit/                # Tests unitaires
│   ├── integration/         # Tests d'intégration
│   └── fixtures/            # Données de test
│
├── docs/
│   ├── api/                 # Documentation API
│   └── deployment/          # Guides de déploiement
│
├── .env.example             # Template de configuration
├── docker-compose.yml       # Configuration Docker
├── tsconfig.json            # Configuration TypeScript
└── package.json
```

## 🔌 API Endpoints

### 🏥 Santé & Info

```http
GET  /                        # Info API et version
GET  /api/v1/health          # Santé de l'API et services
GET  /api-docs               # Documentation Swagger (dev uniquement)
```

### 🔐 Authentification

```http
POST   /api/v1/auth/login      # Login avec email/password
POST   /api/v1/auth/refresh    # Renouveler access token
POST   /api/v1/auth/logout     # Déconnexion
GET    /api/v1/auth/me         # Info utilisateur connecté
POST   /api/v1/auth/users      # Créer utilisateur (admin uniquement)
```

### 📋 Tâches (Tasks)

```http
GET    /api/v1/tasks                    # Liste des tâches
GET    /api/v1/tasks/calendar           # Tâches pour le calendrier
POST   /api/v1/tasks                    # Créer une tâche
PUT    /api/v1/tasks/:id                # Modifier une tâche
DELETE /api/v1/tasks/:id                # Supprimer une tâche
POST   /api/v1/tasks/batch              # Opérations batch
GET    /api/v1/tasks/stats              # Statistiques des tâches
GET    /api/v1/tasks/conflicts          # Conflits de planification
```

### 👥 Entités (Clients, Membres, Projets, Équipes)

```http
GET    /api/v1/clients          # Liste des clients
GET    /api/v1/members          # Liste des membres
GET    /api/v1/projects         # Liste des projets
GET    /api/v1/teams            # Liste des équipes
```

### 🔧 Administration

```http
GET    /api/v1/admin/cache/stats        # Statistiques du cache
DELETE /api/v1/admin/cache/clear        # Vider le cache
GET    /api/v1/admin/metrics            # Métriques système
POST   /api/v1/admin/sync/force         # Forcer la synchronisation
GET    /api/v1/admin/conflicts          # Gestion des conflits
```

### 🔗 Notion

```http
GET    /api/v1/notion/config            # Configuration Notion
GET    /api/v1/notion/mapping           # Mapping des bases
GET    /api/v1/notion/discovery         # Découverte des schémas
POST   /api/v1/webhook/notion           # Webhook Notion (temps réel)
```

## 🗄️ Base de Données

### Collections Principales

#### Collections Cache (synchronisées depuis Notion)

- **`tasks`** : Tâches avec cache dénormalisé pour affichage rapide
- **`projects`** : Projets avec statut, client, équipes
- **`clients`** : Clients avec infos de contact et couleurs
- **`teams`** : Équipes avec manager et membres
- **`members`** : Membres Notion (différent des users auth)

#### Collections Système

- **`users`** : Comptes authentification (email, password hashé, rôle)
- **`refreshtokens`** : Tokens de refresh (TTL 7 jours)
- **`configs`** : Configuration système (TTL cache, mapping Notion)
- **`taskschedulingconflicts`** : Historique des conflits pour audit
- **`syncqueue`** : File d'attente synchronisation vers Notion

### Index Optimisés

```javascript
// Tasks
{ notionId: 1 }              // unique
{ projectId: 1, status: 1 }  // compound
{ periodeDeTravail: 1 }      // dates
{ utilisateursIds: 1 }       // multi-membres

// Projects
{ notionId: 1 }              // unique
{ statutDuProjet: 1 }        // filtrage
{ clientId: 1 }              // relation

// Users
{ email: 1 }                 // unique
{ memberId: 1 }              // liaison Notion

// Refresh Tokens
{ token: 1 }                 // unique
{ userId: 1, family: 1 }     // rotation
{ expiresAt: 1 }             // TTL index
```

## 🔔 Webhooks Notion

### Configuration

Le système utilise les webhooks Notion (API v2025-09-03) pour la synchronisation temps réel:

- **Traffic & Projects** : Webhooks prioritaires (< 3 sec)
- **Teams/Users/Clients** : Polling régulier (1-2x/jour)

### Événements Supportés

```typescript
// Tâches (Traffic)
'page.created'           // Nouvelle tâche
'page.updated'           // Modification tâche

// Projets
'data_source.content_updated'  // Changement structure
```

### Sécurité

- Validation **HMAC SHA-256** de toutes les requêtes
- Vérification du timestamp (max 5 min)
- Rate limiting spécifique webhooks

### Fallback & Robustesse

- Polling de fallback si webhook manqué
- Circuit breaker (3 échecs → pause 5min)
- Retry avec backoff exponentiel
- Queue de traitement asynchrone

## 🚢 Déploiement

### Développement Local

```bash
# Méthode 1: Directe
npm run dev

# Méthode 2: Docker
docker-compose up backend
```

### Staging/Production

```bash
# Build
npm run build

# Variables d'environnement
export NODE_ENV=production
export MONGODB_URI="mongodb+srv://..."
export JWT_SECRET="votre_secret_production"

# Démarrer
npm start
```

### Azure App Service

Le projet inclut la configuration pour Azure:

1. **Push sur GitHub** → Déploiement automatique
2. **Variables d'env** configurées dans Azure Portal
3. **MongoDB Atlas** pour la base de données
4. **Azure Key Vault** pour les secrets

## 🧪 Tests

### Lancer les Tests

```bash
# Tous les tests
npm test

# Tests avec surveillance
npm run test:watch

# Rapport de couverture
npm run test:coverage

# Tests d'intégration uniquement
npm test -- --testPathPattern=integration
```

### Structure des Tests

- **Unitaires** : Services, utils, validators
- **Intégration** : Routes API, base de données
- **Fixtures** : Données de test réutilisables

### Exemple de Test

```typescript
describe('Auth Controller', () => {
  it('should login user with valid credentials', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@test.fr', password: 'dev123' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('accessToken');
  });
});
```

## 🛡️ Sécurité

### Authentification & Autorisation

- **JWT** avec access token (8h) et refresh token (7j)
- **Token rotation** pour les refresh tokens
- **Bcrypt** (12 rounds) pour les mots de passe
- **Middleware auth** sur routes protégées

### Rate Limiting

```typescript
// Global: 100 req/15min par IP
// Login: 5 tentatives/15min
// Notion: 3 req/sec (adaptatif)
```

### Validation des Entrées

- **Zod schemas** sur toutes les requêtes
- **Sanitization** des données
- **Type safety** TypeScript strict

### Headers de Sécurité

- **Helmet.js** activé
- **CORS** configuré strictement
- **CSP** (Content Security Policy)
- **HSTS** en production

## ⚡ Performance

### Optimisations Implémentées

- **Cache intelligent** MongoDB avec TTL adaptatif
- **Batch resolver** pour résolution groupée
- **Preload middleware** pour anticipation des requêtes
- **Index MongoDB** optimisés
- **Compression gzip** activée
- **Lazy loading** des relations

### Métriques Cibles

- ⏱️ **Temps de réponse** : < 200ms (95e percentile)
- 📊 **Rate limit Notion** : < 2.4 req/sec (80% du max)
- 💾 **Cache hit rate** : > 80% après warm-up
- 🎯 **Disponibilité** : 99% (9h-19h)

### Monitoring

```bash
# Métriques temps réel
GET /api/v1/admin/metrics

# Stats cache
GET /api/v1/admin/cache/stats

# Health check
GET /api/v1/health
```

## 🤝 Contribution

### Workflow Git

```bash
# 1. Créer une branche
git checkout -b feature/nom-feature

# 2. Développer avec commits descriptifs
git commit -m "feat: ajout endpoint tâches batch"

# 3. Tests passants
npm test

# 4. Linting correct
npm run lint

# 5. Pull Request vers develop
git push origin feature/nom-feature
```

### Standards de Code

- **Commits** : Convention Conventional Commits
- **Branches** : `feature/`, `fix/`, `refactor/`
- **Code review** : Obligatoire avant merge
- **Tests** : Couverture minimale 80%

### Pre-commit Hooks

Husky configuré pour vérifier automatiquement:
- ✅ Linting (ESLint)
- ✅ Formatage (Prettier)
- ✅ Type checking (TypeScript)

## 🔍 Debugging & Troubleshooting

### Logs de Développement

```bash
# Logs complets
NODE_ENV=development LOG_LEVEL=debug npm run dev

# Logs MongoDB uniquement
DEBUG=mongoose:* npm run dev
```

### Tests Santé

```bash
# API opérationnelle ?
curl http://localhost:5005/api/v1/health

# Info version
curl http://localhost:5005/

# Test login
curl -X POST http://localhost:5005/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mattertraffic.fr","password":"dev123"}'
```

### Problèmes Courants

| Problème | Solution |
|----------|----------|
| MongoDB connection failed | Vérifier `MONGODB_URI` et que MongoDB tourne |
| Notion API errors | Vérifier `NOTION_TOKEN` et permissions bases |
| CORS errors | Ajouter l'origin dans `FRONTEND_URL` |
| JWT invalid | Vérifier `JWT_SECRET` cohérent entre requêtes |
| Rate limit Notion | Attendre 1 minute ou ajuster cache |

## 📚 Documentation Supplémentaire

- 📖 [API Reference](./docs/api/) - Documentation complète des endpoints
- 🏗️ [Architecture](./docs/architecture.md) - Décisions techniques
- 🚀 [Deployment Guide](./docs/deployment/) - Guide de déploiement
- 📝 [Changelog](./CHANGELOG.md) - Historique des versions

## 📄 Licence

MIT © FabLab - Voir [LICENSE](LICENSE) pour plus de détails

---

<div align="center">

**[⬆ Retour en haut](#-matter-traffic-manager---backend-api)**

Made with ❤️ by the FabLab team

</div>
