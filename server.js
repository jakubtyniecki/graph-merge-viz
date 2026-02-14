import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.static(join(__dirname, 'dist')));
app.get('/{*path}', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

app.listen(PORT, HOST, () => {
  console.log(`Graph Merge Visualizer running at http://${HOST}:${PORT}`);
});
