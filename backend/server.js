const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  dotenv.config({ path: filePath, override: false });
  return true;
}

const backendEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '../.env');
const loadedBackendEnv = loadEnvFile(backendEnvPath);
const loadedRootEnv = loadedBackendEnv ? false : loadEnvFile(rootEnvPath);

if (!loadedBackendEnv && !loadedRootEnv) {
  console.warn('[Config] No .env file found. Using process environment variables.');
}

const { appConfig } = require('./src/config/app');
const { testDatabaseConnection } = require('./src/config/database');
const apiRoutes = require('./src/routes');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorMiddleware');

const app = express();
const indexHtmlPath = path.join(appConfig.frontendDistPath, 'index.html');
const frontendBuildExists = fs.existsSync(indexHtmlPath);

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

if (appConfig.frontendOrigin) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', appConfig.frontendOrigin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    return next();
  });
}

app.use(`${appConfig.basePath}/api`, apiRoutes);

if (frontendBuildExists) {
  app.use(
    appConfig.basePath,
    express.static(appConfig.frontendDistPath, {
      index: false,
      maxAge: '1d'
    })
  );

  app.get([appConfig.basePath, `${appConfig.basePath}/*`], (req, res, next) => {
    if (req.path.startsWith(`${appConfig.basePath}/api`)) {
      return next();
    }

    return res.sendFile(indexHtmlPath);
  });
} else {
  app.get([appConfig.basePath, `${appConfig.basePath}/*`], (req, res) => {
    res.status(503).json({
      message:
        'Frontend build not found. Run "npm run build" inside the frontend folder and restart the backend.',
      basePath: appConfig.basePath
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  try {
    await testDatabaseConnection();
    console.log('[DB] MySQL connection established.');
  } catch (error) {
    console.warn('[DB] MySQL connection failed on startup:', error.message);
  }

  app.listen(appConfig.port, () => {
    console.log(`[Server] Running on http://localhost:${appConfig.port}${appConfig.basePath}`);
  });
}

bootstrap();
