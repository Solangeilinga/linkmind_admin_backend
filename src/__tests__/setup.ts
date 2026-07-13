/**
 * Configuration globale des tests — injectée avant chaque suite (setupFiles).
 * Fournit les variables d'environnement minimales sans démarrer MongoDB.
 */

process.env.NODE_ENV  = "test";
process.env.JWT_SECRET = "test-secret-basyam-admin-min32chars!!";
process.env.MONGODB_URI = "mongodb://localhost:27017/basyam-admin-test";
process.env.FRONTEND_URL = "http://localhost:3001";