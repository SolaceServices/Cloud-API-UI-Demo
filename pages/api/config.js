import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const configPath = path.join(process.cwd(), '..', 'solace-config.json');

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    try {
      let config;
      if (!fs.existsSync(configPath)) {
        // Initialize if not exists
        config = {
          applicationDomains: [],
          schemas: [],
          events: [],
          applications: []
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return res.status(200).json(config);
      }

      const fileContent = fs.readFileSync(configPath, 'utf8');
      try {
        config = JSON.parse(fileContent);
      } catch (e) {
        // Handle empty or invalid JSON
        console.warn('Config file is empty or invalid. Resetting to default.');
        config = {
          applicationDomains: [],
          schemas: [],
          events: [],
          applications: []
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
      res.status(200).json(config);
    } catch (error) {
      console.error('Error reading config:', error);
      res.status(500).json({ error: 'Failed to read configuration' });
    }
  } else if (req.method === 'POST') {
    try {
      const newConfig = req.body;
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
      res.status(200).json({ message: 'Configuration saved' });
    } catch (error) {
      console.error('Error writing config:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
