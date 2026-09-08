# DPP v1 & v2 Development Setup

This repository contains both DPP v1 and v2 implementations on separate Git branches.

## Quick Start

### v2 Development (Recommended for new work)

```bash
# Ensure you're on v2 branch
git checkout dpp-v2

# Set environment variables
export JWT_SECRET="4fcb7477204ff12c5846d9efef9e18f41d946126801faf09aaad86e7ac2b0144"
export DB_VERSION=v2
export DB_PATH=data/dpp-v2.db

# Install dependencies (if needed)
npm install

# Start v2 server
npm start

# Access at http://localhost:3000
```

### v1 Maintenance (Existing functionality)

```bash
# Switch to v1 branch
git checkout main

# Set environment variables
export JWT_SECRET="your-secret"
# DB_VERSION not needed (defaults to v1)

# Install dependencies (if needed)
npm install

# Start v1 server
npm start

# Access at http://localhost:3000
```

## Database Separation

**v1 (main branch):**
- Database: `database.db`
- Tables: admin, batches, serials, serial_data, batch_data, events, etc.

**v2 (dpp-v2 branch):**
- Database: `data/dpp-v2.db`
- Tables: styles, batches, gtins, sgtins, field_definitions, dpp_values, field_change_log, lifecycle_events
- Completely separate schema reflecting new domain model

## Important Rules

⚠️ **Database Isolation:**
- v2 NEVER modifies `database.db` (v1's database)
- v1 never created files in `data/` directory
- v2 operates exclusively on `data/dpp-v2.db`
- Both databases can coexist

⚠️ **Git Safety:**
- Changes to v2 happen on `dpp-v2` branch only
- Never merge v2 into main without explicit approval
- Both branches must remain independently runnable

## Switching Between Versions

1. Stop the running server: `Ctrl+C` or `pkill node`
2. Switch branch: `git checkout main` (v1) or `git checkout dpp-v2` (v2)
3. Set appropriate environment variables
4. Run `npm start`

## Database Files to Ignore

`.gitignore` already protects:
- `database.db*` (v1 - do not modify)
- `data/dpp-v2.db*` (v2 - new development)

## Environment Configuration

### .env (v2 development)

```
JWT_SECRET=4fcb7477204ff12c5846d9efef9e18f41d946126801faf09aaad86e7ac2b0144
PORT=3000
DB_PATH=data/dpp-v2.db
DB_VERSION=v2
NODE_ENV=development
```

### On main branch

- `DB_VERSION` should not be set (defaults to v1)
- Uses original `database.db`

## Troubleshooting

**"Cannot find module 'db/init-v2.js'"**
- Verify you're on `dpp-v2` branch: `git branch`
- Run `npm install` to ensure dependencies are installed

**v1 database modified when running v2**
- This should not happen. Verify `DB_VERSION=v2` is set
- Check server startup message shows "DPP V2"

**Port 3000 in use**
- Kill existing process: `pkill node` or change PORT in .env

---

**Last Updated:** 2026-09-08  
**v1 Status:** Maintenance  
**v2 Status:** Active Development (Phase 1)
