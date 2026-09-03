# `template/` — templates HTML des e-mails

Ce dossier contient tous les templates HTML utilisés par le système d'envoi
d'e-mails du backend (`src/services/email.service.ts`). Il sépare la
présentation (ici) de la logique métier (dans les `*.service.ts`) et du
moteur de rendu (`src/utils/templateRenderer.ts`).

## Structure

```
template/emails/
├── assets/
│   └── logo.jpeg              copie du logo officiel (moussidalheire-main/src/assets/logo.jpeg)
├── layouts/
│   └── base.html              structure commune : en-tête (logo), zone de contenu, pied de page
├── partials/
│   └── compte-cree-row.html   une ligne du récapitulatif "personnes créées"
└── auth/
    ├── bienvenue.html            contenu : identifiants d'une seule personne
    └── recap-comptes-crees.html  contenu : liste des personnes créées lors d'une même inscription
```

Un `layout` fournit la structure commune (logo, nom de l'application, pied
de page). Un template de `auth/` (ou d'une future catégorie —
`notifications/`, `invitations/`, ...) ne contient que le contenu propre à
cet e-mail ; c'est le service qui l'enveloppe dans le layout.

## Charte graphique

Les couleurs, polices et rayons de bordure reproduisent exactement ceux de
l'application web (`moussidalheire-main/src/index.css`) — jamais de nouvelle
valeur inventée :

| Rôle | Variable CSS de l'app | Hex utilisé dans les e-mails |
| --- | --- | --- |
| Fond de page | `--background` | `#fcfaf8` |
| Carte / contenu | `--card` | `#ffffff` |
| Texte principal | `--foreground` | `#281f1a` |
| Texte secondaire | `--muted-foreground` | `#78695e` |
| Accent principal (bouton) | `--primary` | `#b44e22` |
| Texte sur accent | `--primary-foreground` | `#fcfaf8` |
| Fond secondaire (encadré) | `--secondary` | `#f3eee7` |
| Bordures | `--border` | `#e7e0da` |
| Accent secondaire | `--accent` | `#325846` |
| Police des titres | `--font-display` | `'Manrope', Helvetica, Arial, sans-serif` |
| Police du corps | `--font-sans` | `'Inter', Helvetica, Arial, sans-serif` |

Les e-mails utilisent des tableaux (`<table>`) et du CSS inline (pas de
fichier CSS externe) : c'est la technique la plus robuste pour rester
lisible dans Outlook, Gmail, Apple Mail, etc.

## Comment ajouter un nouveau template

1. Créer le fichier HTML sous la catégorie appropriée (`auth/`,
   `notifications/`, `invitations/`, ...) — ne contient QUE le contenu, pas
   le `<html>`/`<head>`/logo/footer (déjà fournis par `layouts/base.html`).
2. Utiliser `{{cle}}` pour toute donnée pouvant provenir, même
   indirectement, d'un·e utilisateur·rice (prénom, nom, e-mail...) — elle
   est automatiquement échappée HTML.
3. Utiliser `{{{cle}}}` uniquement pour insérer du HTML déjà composé par le
   service lui-même (le résultat d'un autre appel à `rendre()`) — **jamais**
   pour une donnée utilisateur directe : voir la section Sécurité ci-dessous.
4. Dans le service (`src/services/email.service.ts` ou un futur service
   dédié), appeler `rendre("<categorie>/<template>.html", { ... })` avec les
   variables nécessaires, puis envelopper le résultat dans le layout :
   ```ts
   import { rendre } from "@/utils/templateRenderer";

   const contenu = rendre("auth/bienvenue.html", { prenom, identifiant, ... });
   const html = rendre("layouts/base.html", {
     application: "Moussidalheire",
     annee: String(new Date().getFullYear()),
     apercu: "texte court affiché dans la liste des messages",
     logo_cid: "logo-moussidalheire",
     content: contenu,
   });
   ```
5. Transmettre `html` au service d'envoi (`transporteur.sendMail({ ..., html, attachments: [...] })`)
   — toujours accompagné d'un `text` en clair (fallback texte) et de la
   pièce jointe du logo (voir `piecesJointesLogo` dans `email.service.ts`).

## Sécurité

- `{{cle}}` échappe systématiquement `&`, `<`, `>`, `"`, `'` — une personne
  qui inscrirait `<script>` comme prénom ne peut jamais injecter de HTML/JS
  dans l'e-mail envoyé.
- `{{{cle}}}` n'échappe rien : à réserver strictement aux blocs déjà produits
  par `rendre()` (une liste de lignes déjà rendues, par exemple). Ne jamais y
  passer une valeur qui provient, même indirectement, d'un formulaire.
- Aucun secret (mot de passe SMTP, clé API, jeton...) ne doit jamais
  apparaître dans un template — uniquement des variables fournies par le
  service au moment de l'envoi.

## Logo

Le logo est une copie de `moussidalheire-main/src/assets/logo.jpeg` (même
fichier, jamais redessiné). Il est joint à chaque e-mail HTML et référencé
via `cid:` (`<img src="cid:logo-moussidalheire">`) plutôt que par une URL
publique : le frontend (Vite) ne publie ses assets qu'avec un nom de fichier
haché à chaque build, donc aucune URL stable n'existe pour ce logo. Si ce
fichier change côté frontend, recopier la nouvelle version ici.

## Compatibilité e-mail

- Pas de JavaScript, pas de composants React/framework.
- Mise en page par tableaux (`<table>`), pas par flexbox/grid.
- CSS inline sur chaque élément (un `<style>` dans `<head>` reste présent
  pour les clients qui le supportent, en complément — jamais en remplacement).
- `alt` sur les images, contrastes suffisants, texte de secours pour les
  liens importants (l'URL est toujours répétée en clair sous le bouton).
