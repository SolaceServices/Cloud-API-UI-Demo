# SolCD

**Solace Continuous Delivery** - A premium, AI-enhanced interface for declaratively managing your Solace Event Portal configuration.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
cd ui
npm install
```

### Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## ✨ Features

- **Declarative Management**: All configuration is saved to `solace-config.json` in the project root.
- **Visual Designer**: Create Domains, Schemas, Events, and Applications with a modern UI.
- **JSON Editor**: Direct access to the underlying configuration file.
- **One-Click Deployment**: Deploy your configuration to Solace Cloud directly from the UI.
- **Real-time Logs**: Watch the deployment progress in the built-in console.

## 🛠️ Tech Stack

- **Framework**: Next.js
- **Styling**: CSS Modules (Premium Dark Theme)
- **Icons**: Lucide React
- **API**: Next.js API Routes (Node.js)

## 📝 Configuration

Before deploying, go to the **Settings** page and enter your:
- Solace Cloud API Token
- Organization ID
- Target Environment
