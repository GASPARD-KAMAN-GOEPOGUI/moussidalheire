# Moussidalheire

Plateforme de gestion du village Moussidalheire : arbre généalogique, familles, personnes et actualités.

## Structure du projet

```
moussidalheire/
├── backend/    API Express + Prisma (MariaDB)
└── frontend/   Application React + Vite
```

## Prérequis

- Node.js >= 20
- MariaDB / MySQL

## Backend

```bash
cd backend
npm install
cp .env.example .env   # renseigner les variables (DB, JWT, ...)
npm run dev
```

Scripts utiles : `npm run test`, `npm run lint`, `npm run typecheck`, `npm run prisma:studio`.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # ajuster VITE_API_URL si besoin
npm run dev
```

Scripts utiles : `npm run test`, `npm run lint`, `npm run build`.

## Licence

Projet privé — tous droits réservés.
