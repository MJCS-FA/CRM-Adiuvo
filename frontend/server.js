import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3008;
const BASE_PATH = '/visitas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(BASE_PATH, express.static(path.join(__dirname, 'dist')));

app.get(new RegExp(`^${BASE_PATH}(/.*)?$`), (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`WEB corriendo en http://127.0.0.1:${PORT}${BASE_PATH}`);
});
