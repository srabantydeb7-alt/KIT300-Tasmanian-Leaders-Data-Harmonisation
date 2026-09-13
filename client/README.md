# Harmonisation client

React 19 and Vite power the harmonisation workspace: Overview, Datasets, Mapping, Response Standardisation, Validation, Export, and Configuration screens. Workflow progress and next-action guidance come from the server so every screen applies the same readiness rules.

```bash
npm start
npm test
npm run test:coverage
npm run build
```

The development server listens on `http://127.0.0.1:5173`. Set `VITE_API_URL` in `.env.local` only when the API is not available at its default `http://localhost:5050` address.
