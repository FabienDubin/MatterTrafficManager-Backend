# Matter Traffic Manager - Backend

API backend pour Matter Traffic Manager - Gestionnaire de trafic intelligent basé sur Notion.

## 🚀 Stack Technologique

- **Runtime**: Node.js 20+
- **Framework**: Express 5.1+
- **Langage**: TypeScript 5.7+
- **Base de données**: MongoDB 8.0
- **ODM**: Mongoose 8.8+
- **Tests**: Jest 29+
- **Qualité**: ESLint + Prettier + Husky

## 📋 Prérequis

- Node.js 20 ou supérieur
- npm ou yarn
- MongoDB (via Docker ou installation locale)
- Docker et Docker Compose (optionnel mais recommandé)

## 🔧 Installation

### Méthode 1: Installation locale

```bash
# Cloner le projet
cd matter-traffic-backend

# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.example .env

# Configurer les variables d'environnement dans .env
# MONGODB_URI, JWT_SECRET, NOTION_TOKEN, etc.

# Démarrer en mode développement
npm run dev
```

### Méthode 2: Avec Docker (recommandé)

```bash
# Depuis la racine du projet MatterTrafficManager
docker-compose up backend
```

## 🌍 Variables d'environnement

Copier `.env.example` vers `.env` et configurer:

```bash
# Serveur
NODE_ENV=development
PORT=5005

# MongoDB
MONGODB_URI=mongodb://admin:password@localhost:27018/matter-traffic?authSource=admin

# Frontend CORS
FRONTEND_URL=http://localhost:5173

# Notion API
NOTION_TOKEN=your_notion_token
NOTION_DB_TRAFFIC=your_traffic_database_id
NOTION_DB_USERS=your_users_database_id
NOTION_DB_TEAMS=your_teams_database_id
NOTION_DB_PROJECTS=your_projects_database_id
NOTION_DB_CLIENTS=your_clients_database_id

# JWT Authentication
JWT_SECRET=your_super_secret_key_min_256_bits
JWT_ACCESS_EXPIRY=8h
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12
```

## 📜 Scripts disponibles

```bash
# Développement avec hot reload
npm run dev

# Build de production
npm run build

# Démarrer en production
npm start

# Tests
npm test                # Tests unitaires
npm run test:watch     # Tests en mode watch
npm run test:coverage  # Coverage des tests

# Qualité de code
npm run lint           # Linter ESLint
npm run lint:fix       # Fix automatique
npm run format         # Formatage Prettier

# Seeds de base de données
npm run seed:admin     # Créer l'utilisateur admin par défaut
```

## 🗂️ Structure du projet

```
src/
├── config/          # Configuration (DB, env)
├── controllers/     # Contrôleurs Express
├── middleware/      # Middleware Express
├── models/          # Modèles Mongoose
├── repositories/    # Couche d'accès aux données
├── routes/          # Routes API
├── services/        # Logique métier
├── utils/           # Utilitaires
├── validators/      # Schémas de validation
└── server.ts        # Point d'entrée

tests/
├── unit/           # Tests unitaires
├── integration/    # Tests d'intégration
└── fixtures/       # Données de test

docs/
├── api/            # Documentation API
└── deployment/     # Guides de déploiement
```

## 🔌 Endpoints principaux

### 🏥 Santé et Info

```
GET    /                        # Info API et version
GET    /api/v1/health          # Santé de l'API et services
```

### 🔐 Authentification (JWT)

```
POST   /api/v1/auth/login      # Login avec email/password
POST   /api/v1/auth/refresh    # Renouveler access token
POST   /api/v1/auth/logout     # Déconnexion
GET    /api/v1/auth/me         # Info utilisateur connecté
POST   /api/v1/auth/users      # Créer utilisateur (admin)
```

### 📋 Tâches (à venir)

```
GET    /api/v1/tasks           # Liste des tâches
POST   /api/v1/tasks           # Créer une tâche
PUT    /api/v1/tasks/:id       # Modifier une tâche
DELETE /api/v1/tasks/:id       # Supprimer une tâche
```

### 📚 Documentation

```
GET    /api-docs               # Swagger UI (dev only)
GET    /api/v1/docs/openapi.json # OpenAPI Spec
```

## 🧪 Tests

```bash
# Lancer tous les tests
npm test

# Tests avec surveillance
npm run test:watch

# Rapport de couverture
npm run test:coverage

# Tests d'intégration uniquement
npm test -- --testPathPattern=integration
```

## 📊 Base de données

### Collections principales:

- `users`: Utilisateurs de l'application (auth)
- `refreshtokens`: Tokens de refresh (TTL 7 jours)
- `tasks`: Tâches synchronisées avec Notion (à venir)
- `projects`: Projets et espaces de travail (à venir)
- `members`: Membres synchronisés depuis Notion (à venir)

### Index optimisés:

- `users`: email (unique), memberId
- `refreshtokens`: token (unique), userId, family, expiresAt (TTL)
- `tasks`: projectId, status, createdAt, dueDate (à venir)
- `projects`: name, status, createdAt (à venir)

## 🚢 Déploiement

### Environnement de développement

```bash
docker-compose up backend
```

### Build de production

```bash
npm run build
npm start
```

## 🤝 Contribution

1. Créer une branche feature: `git checkout -b feature/nom-feature`
2. Commits avec messages descriptifs
3. Tests passants: `npm test`
4. Linting correct: `npm run lint`
5. Pull Request vers `develop`

## 🔍 Debugging

### Logs de développement

```bash
# Logs complets
NODE_ENV=development LOG_LEVEL=debug npm run dev

# Logs MongoDB uniquement
DEBUG=mongoose:* npm run dev
```

### Tests de santé

```bash
# Vérifier que l'API répond
curl http://localhost:5005/api/v1/health

# Info API et version
curl http://localhost:5005/
```

### Tests d'authentification

```bash
# Login (utilisateur admin par défaut)
curl -X POST http://localhost:5005/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mattertraffic.fr","password":"dev123"}'

# Tester un endpoint protégé
curl -X GET http://localhost:5005/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## ⚡ Performance & Sécurité

### Sécurité

- **Authentification JWT** avec access token (8h) et refresh token (7j)
- **Hashing bcrypt** avec 12 rounds pour les mots de passe
- **Rate limiting**:
  - Global: 100 req/15min par IP
  - Login: 5 tentatives/15min
- **Helmet.js** pour les headers de sécurité
- **CORS** configuré pour le frontend
- **Validation Zod** sur toutes les entrées

### Performance

- Compression gzip activée
- Index MongoDB optimisés
- Cache TTL natif MongoDB
- Token rotation pour les refresh tokens

## 🛠️ Outils de développement

- **Nodemon**: Hot reload automatique
- **ts-node**: Exécution TypeScript directe
- **Jest**: Framework de test
- **Supertest**: Tests d'API
- **ESLint**: Linting TypeScript
- **Prettier**: Formatage de code
- **Husky**: Git hooks

## 📝 Licence

MIT - Voir fichier LICENSE
