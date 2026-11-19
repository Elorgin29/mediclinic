# Référence de l'API MediClinic

Documentation exhaustive des routes HTTP de l'API.

- **Base URL** : `http://localhost:4000/api`
- **Format** : JSON (`Content-Type: application/json`), sauf les documents PDF
  qui renvoient `application/pdf`.
- **Authentification** : `Authorization: Bearer <accessToken>` sur toutes les
  routes protégées.
- **150 routes** réparties sur 24 modules.

---

## Table des matières

1. [Conventions générales](#1-conventions-générales)
2. [Authentification](#2-authentification)
3. [Utilisateurs et RBAC](#3-utilisateurs-et-rbac)
4. [Organisation médicale](#4-organisation-médicale)
5. [Patients](#5-patients)
6. [Rendez-vous](#6-rendez-vous)
7. [Consultations](#7-consultations)
8. [Ordonnances](#8-ordonnances)
9. [Pharmacie et stock](#9-pharmacie-et-stock)
10. [Facturation](#10-facturation)
11. [Gardes](#11-gardes)
12. [Téléconsultations](#12-téléconsultations)
13. [Laboratoire](#13-laboratoire)
14. [Pilotage](#14-pilotage)
15. [Transverse](#15-transverse)
16. [Documents PDF](#16-documents-pdf)
17. [Codes d'erreur](#17-codes-derreur)
18. [Tables de référence](#18-tables-de-référence)

---

## 1. Conventions générales

### Formats de réponse

**Ressource unique**

```json
{ "data": { "id": 1, "name": "…" } }
```

**Liste paginée**

```json
{
  "data": [ { "id": 1 }, { "id": 2 } ],
  "meta": { "page": 1, "limit": 20, "total": 53, "totalPages": 3 }
}
```

**Erreur**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Les données transmises sont invalides.",
    "details": [{ "path": "email", "message": "Format d’email invalide" }]
  }
}
```

**Succès sans contenu** : `204 No Content`.

### Codes HTTP utilisés

| Code | Signification |
| --- | --- |
| `200` | Succès |
| `201` | Ressource créée |
| `204` | Succès sans contenu (suppression) |
| `400` | Requête mal formée / validation échouée |
| `401` | Authentification requise ou jeton invalide/expiré |
| `403` | Permission manquante ou compte désactivé |
| `404` | Ressource introuvable |
| `409` | Conflit (doublon, chevauchement, règle métier) |
| `422` | Donnée non traitable (référence inexistante) |
| `429` | Limite de requêtes atteinte |
| `500` | Erreur interne |
| `503` | Base de données indisponible |

### Pagination, tri et recherche

Paramètres communs à toutes les listes :

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `page` | entier ≥ 1 | `1` | Numéro de page |
| `limit` | entier 1–100 | `20` | Taille de page |
| `search` | chaîne ≤ 120 | — | Recherche libre (selon la ressource) |
| `sort` | chaîne | — | Clé de tri (liste blanche par module) |
| `order` | `asc` \| `desc` | `desc` | Sens du tri |

> Le tri est validé contre une **liste blanche** : une clé inconnue retombe sur
> le tri par défaut. Aucune valeur client n'est injectée dans le SQL.

### Limitation de débit

| Portée | Fenêtre | Maximum |
| --- | --- | --- |
| Global (`/api`) | 15 min | 300 requêtes |
| Authentification (`/auth/login`, `/auth/register`) | 15 min | 10 tentatives échouées |

---

## 2. Authentification

Module : `auth` · 6 routes.

### `POST /auth/login`

Authentifie un utilisateur.

**Corps**

```json
{ "email": "superadmin@mediclinic.fr", "password": "Passw0rd!2026" }
```

**Réponse `200`**

```json
{
  "data": {
    "user": {
      "id": 1,
      "email": "superadmin@mediclinic.fr",
      "first_name": "Sophie",
      "last_name": "Bernard",
      "phone": "0340000001",
      "is_active": true,
      "last_login_at": "2026-11-18 10:30:00",
      "roles": ["ADMIN", "SUPER_ADMIN"],
      "permissions": ["appointment:create", "…"],
      "patient_id": null,
      "doctor_id": null
    },
    "tokens": { "accessToken": "eyJ…", "refreshToken": "a1b2…", "expiresIn": 900000 }
  }
}
```

Un cookie `httpOnly` `mediclinic_refresh_token` est également posé.

**Erreurs** : `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `429 AUTH_RATE_LIMITED`.

> Le message d'erreur est **identique** pour un email inconnu et un mot de passe
> erroné, et la comparaison bcrypt est systématique : impossible d'énumérer les comptes.

### `POST /auth/register`

Inscription en ligne d'un patient (compte + dossier médical, en une transaction).

**Corps** : `email`, `password`, `confirmPassword`, `firstName`, `lastName`,
`birthDate`, `gender` ; optionnels : `phone`, `address`, `city`, `postalCode`,
`insuranceNumber`.

**Réponse `201`** : même structure que `/login`.
**Erreurs** : `409 EMAIL_ALREADY_USED`, `400 VALIDATION_ERROR`.

### `POST /auth/refresh`

Renouvelle la session. Le jeton présenté est **révoqué et remplacé** (rotation).

**Corps** (facultatif si le cookie est présent) : `{ "refreshToken": "…" }`

**Réponse `200`** : `{ "data": { user, tokens } }`

**Erreurs** : `401 REFRESH_TOKEN_INVALID`, `401 REFRESH_TOKEN_EXPIRED`,
`401 REFRESH_TOKEN_REUSED` (réutilisation détectée → toutes les sessions sont révoquées).

### `POST /auth/logout`

Révoque le jeton de rafraîchissement. **Réponse** `204`.

### `GET /auth/me`

Profil complet de l'utilisateur connecté. **Réponse `200`** : `{ "data": User }`.

### `POST /auth/change-password`

**Corps** : `{ currentPassword, newPassword, confirmPassword }`

**Réponse `200`** : `{ "data": { "message": "…" } }` — toutes les sessions sont révoquées.

**Erreurs** : `401 INVALID_CURRENT_PASSWORD`, `400 PASSWORD_UNCHANGED`.

---

## 3. Utilisateurs et RBAC

### Utilisateurs (`users`, 8 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/users` | `user:read` | Liste paginée |
| `GET` | `/users/me/profile` | — | Profil de l'utilisateur connecté |
| `GET` | `/users/:id` | `user:read` | Détail |
| `POST` | `/users` | `user:create` | Création |
| `PATCH` | `/users/:id` | `user:update` | Modification |
| `DELETE` | `/users/:id` | `user:delete` | Désactivation logique |
| `POST` | `/users/:id/reset-password` | `user:manage` | Réinitialisation |
| `GET` | `/users/:id/permissions` | `user:read` | Permissions effectives |

**Filtres de liste** : `search`, `role`, `isActive`.

**Corps de création**

```json
{
  "email": "nouveau@mediclinic.fr",
  "password": "Passw0rd!2026",
  "firstName": "Marie",
  "lastName": "Curie",
  "phone": "0340000099",
  "roleCodes": ["DOCTOR"],
  "isActive": true
}
```

**Règles métier**
- `409 EMAIL_ALREADY_USED` si l'email existe déjà.
- `422 UNKNOWN_ROLE` si un `roleCodes` est inconnu.
- Auto-désactivation refusée (`409`).
- Désactivation du dernier `SUPER_ADMIN` actif refusée (`409`).
- La révocation des jetons est automatique lors d'une désactivation ou d'un
  changement de mot de passe.

**Exemple**

```bash
curl -X POST http://localhost:4000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@mediclinic.fr","password":"Passw0rd!2026","firstName":"Test","lastName":"User","roleCodes":["NURSE"]}'
```

### Rôles (`roles`, 7 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/roles` | `role:read` | Tous les rôles avec compteurs |
| `GET` | `/roles/:id` | `role:read` | Rôle + permissions |
| `POST` | `/roles` | `role:create` | Création d'un rôle personnalisé |
| `PATCH` | `/roles/:id` | `role:update` | Modification |
| `DELETE` | `/roles/:id` | `role:delete` | Suppression |
| `PUT` | `/roles/:id/permissions` | `role:manage` | Remplace la matrice |
| `GET` | `/roles/:id/permissions` | `role:read` | Permissions du rôle |

**Corps de création** : `{ code, name, description?, permissionIds[] }`
— le `code` est en MAJUSCULES avec underscores (`INFIRMIER_CHEF`).

**Remplacement de la matrice**

```json
{ "permissionIds": [1, 2, 3, 17, 18] }
```

**Règles**
- `409 ROLE_SYSTEM_PROTECTED` : impossible de supprimer un rôle `is_system`.
- `409 ROLE_IN_USE` : impossible de supprimer un rôle attribué, avec le nombre d'utilisateurs.
- `422 UNKNOWN_PERMISSION_IDS` : identifiants de permission inexistants.

### Permissions (`permissions`, 3 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/permissions` | `role:read` | Les 77 permissions |
| `GET` | `/permissions/grouped` | `role:read` | Regroupées par ressource |
| `GET` | `/permissions/matrix` | `role:read` | Matrice rôle → permissions |

`/permissions/matrix` renvoie `{ roles, permissions, matrix, actionLabels, resourceLabels }`
où `matrix` est un objet `{ [roleId]: permissionId[] }`.

---

## 4. Organisation médicale

### Spécialités (`specialties`, 5 routes)

| Méthode | Chemin | Permission |
| --- | --- | --- |
| `GET` | `/specialties` | `specialty:read` |
| `GET` | `/specialties/:id` | `specialty:read` |
| `POST` | `/specialties` | `specialty:create` |
| `PATCH` | `/specialties/:id` | `specialty:update` |
| `DELETE` | `/specialties/:id` | `specialty:delete` |

`DELETE` refuse (`409`) si des médecins y sont rattachés.

### Départements (`departments`, 5 routes)

| Méthode | Chemin | Permission |
| --- | --- | --- |
| `GET` | `/departments` | `department:read` |
| `GET` | `/departments/:id` | `department:read` |
| `POST` | `/departments` | `department:create` |
| `PATCH` | `/departments/:id` | `department:update` |
| `DELETE` | `/departments/:id` | `department:delete` |

**Corps** : `{ name, description?, headDoctorId? }`

`DELETE` refuse si des médecins, rendez-vous ou gardes y sont rattachés.

### Médecins (`doctors`, 7 routes)

| Méthode | Chemin | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/doctors/public` | **publique** | Annuaire en ligne |
| `GET` | `/doctors` | `doctor:read` | Liste paginée |
| `GET` | `/doctors/:id/availability` | optionnelle | Créneaux libres |
| `GET` | `/doctors/:id` | `doctor:read` | Détail + statistiques |
| `POST` | `/doctors` | `doctor:create` | Création |
| `PATCH` | `/doctors/:id` | `doctor:update` | Modification |
| `DELETE` | `/doctors/:id` | `doctor:delete` | Suppression |

**`GET /doctors/public`** — paramètres `specialtyId`, `search`. Lit la vue
`v_doctor_directory` filtrée sur `is_accepting_patients = TRUE`. Ne renvoie
**aucune donnée sensible** (pas d'email professionnel, pas de numéro d'ordre).

**`GET /doctors/:id/availability?date=AAAA-MM-JJ`**

```json
{
  "data": {
    "date": "2026-12-01",
    "doctorId": 1,
    "slots": [
      { "start": "2026-12-01 08:00:00", "end": "2026-12-01 08:30:00", "available": true },
      { "start": "2026-12-01 08:30:00", "end": "2026-12-01 09:00:00", "available": false }
    ]
  }
}
```

Grille de 30 minutes de 08:00 à 18:00, hors rendez-vous existants et créneaux passés.

**Corps de création** : `{ firstName, lastName, email, phone?, password, specialtyId,
departmentId?, licenseNumber, consultationFee, bio?, isAcceptingPatients }`
→ crée le compte utilisateur **et** le profil, avec le rôle `DOCTOR`.

---

## 5. Patients

Module : `patients` · 10 routes.

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/patients` | `patient:read` | Liste paginée |
| `GET` | `/patients/me` | `patient:read` | Dossier du patient connecté |
| `PATCH` | `/patients/me` | `patient:update` | Modifie son propre profil |
| `GET` | `/patients/:id` | `patient:read` | Détail |
| `GET` | `/patients/:id/history` | `patient:read` | Historique complet |
| `GET` | `/patients/:id/appointments` | `patient:read` | Rendez-vous du patient |
| `POST` | `/patients` | `patient:create` | Création |
| `PATCH` | `/patients/:id` | `patient:update` | Modification |
| `DELETE` | `/patients/:id` | `patient:delete` | Suppression |
| `POST` | `/patients/:id/account` | `user:create` | Crée le compte portail |

**Filtres de liste** : `search` (nom, prénom, email, téléphone, n° d'assurance),
`gender`, `bloodGroup`.

**`GET /patients/:id/history`**

```json
{
  "data": {
    "patient": { … },
    "appointments": [ … ],
    "consultations": [ … ],
    "prescriptions": [ { "id": 12, "items": [ … ] } ],
    "invoices": [ … ],
    "timeline": [
      {
        "entry_type": "CONSULTATION",
        "entry_id": 8,
        "event_date": "2026-10-14 09:25:00",
        "title": "Consultation médicale",
        "description": "Hypertension artérielle essentielle stade 1"
      }
    ]
  }
}
```

`entry_type` ∈ `APPOINTMENT`, `CONSULTATION`, `PRESCRIPTION`, `INVOICE`, `LAB_REQUEST`.

**Isolation** : un compte portant uniquement le rôle `PATIENT` ne peut lire que
son propre dossier → `403 NOT_YOUR_PATIENT` sinon.

---

## 6. Rendez-vous

Module : `appointments` · 10 routes.

| Méthode | Chemin | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/appointments/today` | `appointment:read` | Rendez-vous du jour |
| `GET` | `/appointments/calendar` | `appointment:read` | Plage `from`/`to` |
| `GET` | `/appointments/me` | authentifié | Rendez-vous du patient connecté |
| `POST` | `/appointments/public` | **publique** | Prise de rendez-vous en ligne |
| `GET` | `/appointments` | `appointment:read` | Liste paginée |
| `POST` | `/appointments` | `appointment:create` | Création |
| `GET` | `/appointments/:id` | `appointment:read` | Détail |
| `PATCH` | `/appointments/:id/status` | `appointment:update` | Changement de statut |
| `PATCH` | `/appointments/:id` | `appointment:update` | Modification |
| `DELETE` | `/appointments/:id` | `appointment:delete` | Suppression |

**Filtres** : `from`, `to`, `status`, `type`, `doctorId`, `patientId`, `departmentId`, `search`.

**`POST /appointments/public`**

```json
{
  "doctorId": 3,
  "scheduledAt": "2026-12-02 09:00:00",
  "firstName": "Pierre",
  "lastName": "Lambert",
  "email": "pierre@email.fr",
  "phone": "0341000002",
  "birthDate": "1985-03-20",
  "gender": "MALE",
  "reason": "Douleurs persistantes au genou droit"
}
```

**Réponse `201`** : `{ "data": { "appointment": { … }, "patientCreated": false } }`

Comportement : crée un rendez-vous `PENDING`, notifie les réceptionnistes,
journalise l'audit. Si l'email est inconnu, un dossier patient minimal est créé.

**Vérification de chevauchement** (création et replanification) :

```json
{
  "error": {
    "code": "SLOT_CONFLICT",
    "message": "Ce créneau est déjà réservé par un autre rendez-vous du Dr Haddad."
  }
}
```

**`PATCH /appointments/:id/status`** — corps `{ status, cancelledReason? }`.
Transitions autorisées vers `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`,
`CANCELLED`, `NO_SHOW`. `cancelledReason` **obligatoire** pour `CANCELLED`, et la
téléconsultation liée passe à `CANCELLED`.

**Téléconsultation automatique** : créer un rendez-vous avec `type: "TELEMEDICINE"`
génère une entrée `meetings` au statut `PENDING`.

---

## 7. Consultations

Module : `consultations` · 6 routes.

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/consultations` | `consultation:read` | Liste paginée |
| `POST` | `/consultations` | `consultation:create` | Création |
| `GET` | `/consultations/patient/:patientId` | `consultation:read` | Historique d'un patient |
| `GET` | `/consultations/:id` | `consultation:read` | Détail + ordonnances |
| `PATCH` | `/consultations/:id` | `consultation:update` | Modification |
| `DELETE` | `/consultations/:id` | `consultation:delete` | Suppression |

**Corps de création**

```json
{
  "appointmentId": 141,
  "diagnosis": "Hypertension artérielle essentielle stade 1",
  "notes": "Examen clinique complet. Constantes stables.",
  "followUpAt": "2026-12-20"
}
```

**Règles**
- Rendez-vous inexistant → `404 APPOINTMENT_NOT_FOUND`.
- Consultation déjà existante → `409 CONSULTATION_ALREADY_EXISTS` (contrainte UNIQUE).
- Rendez-vous annulé → `422 APPOINTMENT_CANCELLED`.
- Le rendez-vous passe **automatiquement** à `COMPLETED` (transaction).
- Un médecin ne peut modifier que ses propres consultations → `403 NOT_YOUR_CONSULTATION`.

---

## 8. Ordonnances

Module : `prescriptions` · 7 routes.

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/prescriptions` | `prescription:read` | Liste paginée |
| `GET` | `/prescriptions/patient/:patientId` | `prescription:read` | Ordonnances d'un patient |
| `GET` | `/prescriptions/:id` | `prescription:read` | Détail + lignes |
| `POST` | `/prescriptions` | `prescription:create` | Création |
| `POST` | `/prescriptions/:id/dispense` | `prescription:manage` | **Dispensation** |
| `PATCH` | `/prescriptions/:id` | `prescription:update` | Modification |
| `DELETE` | `/prescriptions/:id` | `prescription:delete` | Suppression |

**Corps de création**

```json
{
  "consultationId": 12,
  "items": [
    {
      "medicationId": 1,
      "dosage": "1 comprimé",
      "frequency": "3 fois par jour",
      "duration": "7 jours",
      "instructions": "À prendre pendant les repas",
      "quantity": 21
    },
    {
      "medicationId": 5,
      "dosage": "2 bouffées",
      "frequency": "3 fois par jour",
      "duration": "1 mois",
      "quantity": 1
    }
  ]
}
```

### `POST /prescriptions/:id/dispense`

Dispense l'ordonnance : passe le statut à `DISPENSED` et crée une **sortie de
stock** par ligne. Les quantités sont cumulées par médicament.

**Réponse `200`** : l'ordonnance mise à jour.

**Erreurs**
- `409 ALREADY_DISPENSED` / `409 PRESCRIPTION_CANCELLED`.
- `409 INSUFFICIENT_STOCK` avec le détail :

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Stock insuffisant pour 2 médicament(s).",
    "details": {
      "missing": [
        { "medicationId": 4, "name": "Oméprazole 20 mg", "requested": 30, "available": 8 },
        { "medicationId": 20, "name": "Artéméther-Luméfantrine", "requested": 2, "available": 0 }
      ]
    }
  }
}
```

> Le stock est vérifié **avant** toute écriture pour produire un message clair ;
> le trigger SQL reste la garantie ultime. Un email de confirmation est envoyé au
> patient si son adresse est connue (sans jamais faire échouer la requête).

---

## 9. Pharmacie et stock

### Médicaments (`medications`, 8 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/medications` | `medication:read` | Liste paginée |
| `GET` | `/medications/categories` | `medication:read` | Catégories distinctes |
| `GET` | `/medications/low-stock` | `medication:read` | Vue des alertes |
| `GET` | `/medications/:id` | `medication:read` | Détail + mouvements récents |
| `POST` | `/medications` | `medication:create` | Création |
| `PATCH` | `/medications/:id` | `medication:update` | Modification |
| `DELETE` | `/medications/:id` | `medication:delete` | Suppression |
| `POST` | `/medications/:id/adjust-stock` | `stock:manage` | **Ajustement de stock** |
| `GET` | `/medications/:id/movements` | `stock:read` | Historique |

**Filtres** : `search`, `category`, `lowStock`, `expiringSoon`, `expired`.

**Corps de création**

```json
{
  "name": "Doliprane 1000 mg",
  "category": "Antalgique",
  "unit": "comprimé",
  "price": 0.08,
  "stockQuantity": 200,
  "alertThreshold": 50,
  "expiryDate": "2028-06-30",
  "supplier": "Pharma Distribution"
}
```

Si `stockQuantity > 0`, un mouvement `IN` « Stock initial » est créé : le stock
reste cohérent avec les triggers.

**`POST /medications/:id/adjust-stock`**

```json
{ "type": "OUT", "quantity": 25, "reason": "Dispensation manuelle au comptoir" }
```

**Réponse `200`** : `{ "data": { "movement": { … }, "medication": { … } } }`

**Règles**
- `PATCH` refuse la modification directe de `stockQuantity` → `409 USE_ADJUST_STOCK`.
- `DELETE` refuse si des ordonnances ou des mouvements référencent le médicament.
- Un `OUT` supérieur au stock → `409 INSUFFICIENT_STOCK`.

### Stock (`stock`, 4 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/stock/movements` | `stock:read` | Journal paginé |
| `GET` | `/stock/movements/:id` | `stock:read` | Un mouvement |
| `GET` | `/stock/alerts` | `stock:read` | Alertes consolidées |
| `GET` | `/stock/summary` | `stock:read` | Indicateurs agrégés |

**`GET /stock/alerts`**

```json
{
  "data": {
    "lowStock": [ { "id": 4, "name": "Oméprazole 20 mg", "stock_quantity": 8, "alert_threshold": 60, "missing_quantity": 52 } ],
    "expiringSoon": [ … ],
    "expired": [ … ]
  }
}
```

**`GET /stock/summary`**

```json
{
  "data": {
    "totalReferences": 20,
    "totalUnits": 4_750,
    "stockValue": 8_932.4,
    "lowStockCount": 5,
    "expiredCount": 1,
    "movementsThisMonth": 12
  }
}
```

---

## 10. Facturation

### Factures (`invoices`, 8 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/invoices` | `invoice:read` | Liste paginée |
| `GET` | `/invoices/stats` | `invoice:read` | Indicateurs financiers |
| `GET` | `/invoices/me` | authentifié | Factures du patient connecté |
| `GET` | `/invoices/:id` | `invoice:read` | Détail + lignes + paiements |
| `POST` | `/invoices` | `invoice:create` | Création |
| `PATCH` | `/invoices/:id` | `invoice:update` | Modification |
| `PATCH` | `/invoices/:id/status` | `invoice:manage` | Annulation |
| `DELETE` | `/invoices/:id` | `invoice:delete` | Suppression |
| `POST` | `/invoices/from-consultation/:consultationId` | `invoice:create` | Génération automatique |

**Filtres** : `status`, `patientId`, `from`, `to`, `overdue`, `search`.

**Corps de création**

```json
{
  "patientId": 5,
  "consultationId": 12,
  "vatRate": 20,
  "dueDate": "2027-01-15",
  "items": [
    { "label": "Consultation Cardiologie — Dr Haddad", "quantity": 1, "unitPrice": 70 },
    { "label": "Électrocardiogramme", "quantity": 1, "unitPrice": 35 }
  ]
}
```

**`GET /invoices/stats`**

```json
{
  "data": {
    "totalInvoiced": 4_820.5,
    "totalPaid": 3_912.0,
    "totalOutstanding": 908.5,
    "overdueCount": 2,
    "byStatus": [
      { "status": "PAID", "count": 15, "amount": 3_450.0 },
      { "status": "ISSUED", "count": 6, "amount": 890.5 }
    ]
  }
}
```

> **Important** — le numéro (`FAC-2026-000123`) est généré côté serveur, et
> `subtotal`, `vat_amount`, `total_amount`, `paid_amount`, `status` sont calculés
> **par les triggers**. L'API ne les écrit jamais : elle relit la facture après
> insertion.

### Paiements (`payments`, 5 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/payments` | `payment:read` | Liste paginée |
| `GET` | `/payments/invoice/:invoiceId` | `payment:read` | Paiements d'une facture |
| `GET` | `/payments/:id` | `payment:read` | Détail |
| `POST` | `/payments` | `payment:create` | Encaissement |
| `DELETE` | `/payments/:id` | `payment:delete` | Suppression |

**Corps d'encaissement**

```json
{
  "invoiceId": 12,
  "amount": 105.0,
  "method": "CARD",
  "reference": "AUT-2026-8841",
  "paidAt": "2026-11-18 14:30:00"
}
```

**Réponse `201`** : `{ "data": { "payment": { … }, "invoice": { … } } }`

**Règles**
- Facture `DRAFT` ou `CANCELLED` → `409 INVOICE_NOT_PAYABLE`.
- Montant supérieur au solde → `422 AMOUNT_EXCEEDS_BALANCE` avec le solde restant.
- `paid_amount` et `status` sont mis à jour **par le trigger**, puis relus.

---

## 11. Gardes

Module : `shifts` · 6 routes.

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/shifts` | `shift:read` | Liste paginée |
| `GET` | `/shifts/calendar` | `shift:read` | Planning groupé par jour |
| `GET` | `/shifts/me` | authentifié | Gardes du médecin connecté |
| `GET` | `/shifts/:id` | `shift:read` | Détail |
| `POST` | `/shifts` | `shift:create` | Création |
| `PATCH` | `/shifts/:id` | `shift:update` | Modification |
| `DELETE` | `/shifts/:id` | `shift:delete` | Suppression |

**`GET /shifts/calendar?from&to`**

```json
{
  "data": {
    "from": "2026-11-01",
    "to": "2026-11-30",
    "days": [
      {
        "date": "2026-11-18",
        "shifts": [
          {
            "id": 3,
            "doctor_id": 3,
            "doctor_name": "Dr Karim Benali",
            "department_name": "Pédiatrie",
            "start_at": "2026-11-18 08:00:00",
            "end_at": "2026-11-18 16:00:00",
            "start_time": "08:00",
            "end_time": "16:00",
            "hours": 8,
            "type": "DAY",
            "status": "CONFIRMED",
            "doctor_color": "#2563eb"
          }
        ]
      }
    ],
    "byDoctor": [
      { "doctorId": 3, "doctorName": "Dr Karim Benali", "color": "#2563eb", "shiftCount": 3, "hours": 24 }
    ]
  }
}
```

`doctor_color` est dérivé de `doctor_id % 10` sur une palette de 10 couleurs,
pour un rendu stable dans le planning.

**Règles** : `endAt > startAt` (`422`), chevauchement avec une autre garde du
même médecin interdit (`409 SHIFT_OVERLAP`).

---

## 12. Téléconsultations

Module : `meetings` · 9 routes.

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/meetings` | `meeting:read` | Liste paginée |
| `GET` | `/meetings/me` | authentifié | Celles du patient connecté |
| `GET` | `/meetings/:id` | `meeting:read` | Détail |
| `POST` | `/meetings/request` | `meeting:create` | Demande |
| `POST` | `/meetings/:id/approve` | `meeting:manage` | **Approbation** |
| `POST` | `/meetings/:id/reject` | `meeting:manage` | Refus |
| `POST` | `/meetings/:id/cancel` | `meeting:update` | Annulation |
| `GET` | `/meetings/:id/join-token` | `meeting:read` | Jeton de connexion |
| `GET` | `/meetings/:id/signature?role=0\|1` | `meeting:read` | Signature Meeting SDK |

**`POST /meetings/request`**

```json
{
  "doctorId": 4,
  "reason": "Suivi de tension artérielle à distance",
  "preferredAt": "2026-12-05 10:00:00",
  "duration": 30
}
```

**`POST /meetings/:id/approve`** — corps optionnel `{ startTime }`. Crée la
réunion Zoom (ou simulée), renseigne les URL et le mot de passe, crée le
rendez-vous lié si nécessaire, notifie le patient.

**`GET /meetings/:id/join-token`**

```json
{
  "data": {
    "meetingNumber": "84500000103",
    "password": "cS9tU3",
    "joinUrl": "https://zoom.us/j/84500000103",
    "role": 0,
    "userName": "Lucie Durand",
    "expiresInMinutes": 120,
    "simulated": true
  }
}
```

**Erreur** : `409 JOIN_WINDOW_CLOSED` hors de la fenêtre (10 min avant → fin prévue).

**`GET /meetings/:id/signature?role=0`** — renvoie le type `MeetingSignature` :

```json
{
  "data": {
    "signature": "eyJhbGciOiJIUzI1NiIs…",
    "meetingNumber": "84500000103",
    "password": "cS9tU3",
    "userName": "Lucie Durand",
    "role": 0,
    "sdkKey": "mediclinic-simulated-sdk-key"
  }
}
```

> La signature est calculée côté serveur avec `ZOOM_SDK_SECRET` : le secret ne
> quitte jamais le back-end. Elle est disponible même hors fenêtre de connexion,
> afin que le SDK puisse être préchargé.

---

## 13. Laboratoire

Module : `lab` · 8 routes.

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/lab/tests` | `lab:read` | Catalogue |
| `POST` | `/lab/tests` | `lab:create` | Ajout au catalogue |
| `PATCH` | `/lab/tests/:id` | `lab:update` | Modification |
| `GET` | `/lab/requests` | `lab:read` | Demandes paginées |
| `GET` | `/lab/requests/patient/:patientId` | `lab:read` | Demandes d'un patient |
| `GET` | `/lab/requests/:id` | `lab:read` | Détail |
| `POST` | `/lab/requests` | `lab:create` | Nouvelle demande |
| `PATCH` | `/lab/requests/:id` | `lab:update` | Statut / résultat |
| `DELETE` | `/lab/requests/:id` | `lab:delete` | Annulation |

**`PATCH /lab/requests/:id`**

```json
{
  "status": "COMPLETED",
  "resultText": "Glycémie à jeun : 0,92 g/L (valeur de référence 0,70–1,10)."
}
```

Passer à `COMPLETED` renseigne automatiquement `completed_at = NOW()`.

---

## 14. Pilotage

### Tableau de bord (`dashboard`, 3 routes)

| Méthode | Chemin | Permission |
| --- | --- | --- |
| `GET` | `/dashboard/stats` | `dashboard:read` |
| `GET` | `/dashboard/charts` | `dashboard:read` |
| `GET` | `/dashboard/activity` | `dashboard:read` |

**`GET /dashboard/stats`** renvoie le type `DashboardPayload` :

```json
{
  "data": {
    "stats": {
      "patientsTotal": 30,
      "doctorsTotal": 8,
      "appointmentsToday": 3,
      "appointmentsWeek": 11,
      "appointmentsMonth": 18,
      "revenueMonth": 2_145.5,
      "revenuePreviousMonth": 1_980.0,
      "revenueChangePercent": 8.36,
      "pendingMeetings": 2,
      "lowStockCount": 5,
      "shiftsInProgress": 1
    },
    "charts": {
      "revenueByMonth": [{ "month": "2026-01", "revenue": 1850.0 }],
      "appointmentsByDepartment": [{ "department": "Cardiologie", "count": 12 }],
      "consultationsByDoctor": [{ "doctor": "Dr Amine Haddad", "count": 9 }],
      "topMedications": [{ "medication": "Paracétamol 500 mg", "dispensed": 180 }],
      "lowStock": [{ "id": 4, "name": "Oméprazole 20 mg", "stock_quantity": 8, "alert_threshold": 60 }],
      "recentActivity": [{ "id": 30, "user_name": "Sophie Bernard", "action": "CREATE", "resource": "patient", "created_at": "2026-11-18 09:12:00" }]
    }
  }
}
```

`revenueByMonth` est **toujours complété à 12 points** (mois sans encaissement à zéro).

### Rapports (`reports`, 6 routes)

| Méthode | Chemin | Permission |
| --- | --- | --- |
| `GET` | `/reports/revenue?from&to` | `report:read` |
| `GET` | `/reports/appointments?from&to&groupBy` | `report:read` |
| `GET` | `/reports/stock?from&to` | `report:read` |
| `GET` | `/reports/activity?from&to` | `report:read` |
| `GET` | `/reports/patients?from&to` | `report:read` |
| `GET` | `/reports/export.csv?type&from&to` | `report:read` |

`groupBy` ∈ `day`, `week`, `month`, `department`, `doctor`, `status`.
`type` (export) ∈ `revenue`, `appointments`, `stock`, `activity`.

**`GET /reports/revenue`**

```json
{
  "data": {
    "from": "2026-11-01",
    "to": "2026-11-18",
    "totalRevenue": 2_145.5,
    "invoiceCount": 9,
    "paymentCount": 12,
    "averageInvoice": 238.39,
    "byMonth": [{ "month": "2026-11", "revenue": 2_145.5 }],
    "byMethod": [{ "method": "CARD", "count": 6, "amount": 1_420.0 }],
    "byStatus": [{ "status": "PAID", "count": 7, "amount": 1_820.0 }],
    "topPatients": [{ "patientId": 4, "patientName": "Mehdi Bouzid", "amount": 420.0 }]
  }
}
```

**Export CSV** — séparateur `;`, BOM UTF-8 (compatibilité Excel), en-tête
`Content-Disposition: attachment; filename="rapport-revenue-2026-11-01-2026-11-18.csv"`.

### Audit (`audit`, 4 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/audit` | `audit:read` | Liste paginée |
| `GET` | `/audit/stats` | `audit:read` | Statistiques |
| `GET` | `/audit/:id` | `audit:read` | Détail |
| `POST` | `/audit` | `audit:read` | Journalisation cliente |

**Filtres** : `user_id`, `resource`, `action`, `from`, `to`, `resource_id`, `search`.

`resource` est validé contre les 21 ressources connues et `action` contre les 11
actions connues : toute valeur hors liste renvoie `400`.

---

## 15. Transverse

### Notifications (`notifications`, 6 routes)

| Méthode | Chemin | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/notifications` | `notification:read` | Notifications de l'utilisateur |
| `GET` | `/notifications/unread-count` | `notification:read` | Compteur |
| `POST` | `/notifications/read-all` | `notification:update` | Tout marquer comme lu |
| `PATCH` | `/notifications/:id/read` | `notification:update` | Marquer comme lue |
| `DELETE` | `/notifications/:id` | `notification:delete` | Supprimer |
| `POST` | `/notifications` | `user:manage` | Envoi administratif |

**Envoi administratif**

```json
{
  "userIds": [4, 5, 6],
  "title": "Réunion d'équipe",
  "message": "Réunion mensuelle jeudi à 18h en salle de staff.",
  "type": "INFO",
  "link": "/admin"
}
```

`userIds` accepte `"all"` pour cibler tous les utilisateurs actifs.

### Paramètres (`settings`, 2 routes)

| Méthode | Chemin | Permission |
| --- | --- | --- |
| `GET` | `/settings` | `settings:read` |
| `PATCH` | `/settings` | `settings:update` |

**Réponse `GET`** — **aucun secret Zoom n'est exposé** :

```json
{
  "data": {
    "name": "Clinique MediClinic",
    "address": "12 avenue de la Santé, 75015 Paris, France",
    "phone": "+33 1 45 67 89 00",
    "email": "contact@mediclinic.fr",
    "currency": "EUR",
    "vat_rate": "20.00",
    "logo_url": null,
    "zoomConfigured": false,
    "zoomMode": "Zoom simulé (mode démonstration)",
    "updated_at": "2026-11-18 08:00:00"
  }
}
```

**Corps de mise à jour** : `{ name?, address?, phone?, email?, currency?, vatRate?,
logoUrl?, zoomAccountId?, zoomClientId?, zoomClientSecret? }`

### Santé (`health`, 1 route)

`GET /health` — **publique**, sans authentification.

```json
{
  "data": {
    "status": "ok",
    "database": "connected",
    "databaseVersion": "8.0.36",
    "zoom": "simulated",
    "environment": "development",
    "timestamp": "2026-11-18T09:30:00.000Z"
  }
}
```

Renvoie `503` si la base est injoignable (`status: "degraded"`).

---

## 16. Documents PDF

Routes montées directement sous `/api` (chemins complets).

| Méthode | Chemin | Permission | Disposition |
| --- | --- | --- | --- |
| `GET` | `/pdf/:type/:id` | selon le type | `inline` |
| `GET` | `/pdf/shifts/planning?from&to` | `shift:read` | `inline` |
| `POST` | `/invoices/:id/pdf` | `invoice:read` | `attachment` |
| `POST` | `/consultations/:id/pdf` | `consultation:read` | `attachment` |

**Types valides** pour `/pdf/:type/:id` :

| `type` | Permission | Document |
| --- | --- | --- |
| `patient` | `patient:read` | Dossier patient complet |
| `prescription` | `prescription:read` | Ordonnance |
| `dispensation` | `prescription:read` | Bon de dispensation |
| `consultation` | `consultation:read` | Compte-rendu |
| `invoice` | `invoice:read` | Facture |

**Noms de fichiers** : `dossier-patient-7.pdf`, `ordonnance-42.pdf`,
`bon-dispensation-42.pdf`, `consultation-15.pdf`, `facture-FAC-2026-000123.pdf`,
`planning-gardes-2026-11.pdf`.

> `/pdf/shifts/planning` est déclaré **avant** `/pdf/:type/:id` : sinon « shifts »
> serait interprété comme un type de document.

**Contrôle d'accès** : un compte portant uniquement le rôle `PATIENT` ne peut
télécharger que ses propres documents → `403 DOCUMENT_NOT_OWNED` sinon. Chaque
accès est journalisé (`action: PDF_ACCESS`).

**Téléchargement côté client** — le jeton est requis, un simple `window.open()` ne
fonctionne pas :

```ts
import { downloadPdf, openPdfInNewTab } from '@/lib/pdf';

await downloadPdf('/pdf/invoice/12');
await openPdfInNewTab('/pdf/patient/7');
```

---

## 17. Codes d'erreur

### Authentification et autorisation

| Code | HTTP | Signification |
| --- | --- | --- |
| `TOKEN_MISSING` | 401 | Aucun jeton fourni |
| `TOKEN_INVALID` | 401 | Jeton malformé ou signature invalide |
| `TOKEN_EXPIRED` | 401 | Jeton expiré (déclenche le rafraîchissement côté client) |
| `INVALID_CREDENTIALS` | 401 | Email ou mot de passe incorrect |
| `ACCOUNT_DISABLED` | 403 | Compte désactivé |
| `PERMISSION_DENIED` | 403 | Permission RBAC manquante |
| `ROLE_REQUIRED` | 403 | Rôle insuffisant |
| `REFRESH_TOKEN_INVALID` | 401 | Jeton de rafraîchissement inconnu |
| `REFRESH_TOKEN_EXPIRED` | 401 | Jeton de rafraîchissement expiré |
| `REFRESH_TOKEN_REUSED` | 401 | Jeton déjà consommé → sessions révoquées |
| `INVALID_CURRENT_PASSWORD` | 401 | Mot de passe actuel erroné |

### Validation

| Code | HTTP | Signification |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Échec Zod, avec `details[]` |
| `INVALID_ID` | 400 | Identifiant non entier positif |
| `INVALID_JSON` | 400 | Corps JSON malformé |
| `NOTHING_TO_UPDATE` | 400 | Aucun champ valide fourni |
| `UNKNOWN_ROLE` | 422 | Code de rôle inexistant |
| `UNKNOWN_PERMISSION_IDS` | 422 | Identifiants de permission inexistants |
| `FOREIGN_KEY_MISSING` | 422 | Référence inexistante |

### Ressources et conflits

| Code | HTTP | Signification |
| --- | --- | --- |
| `NOT_FOUND` | 404 | Ressource générique introuvable |
| `PATIENT_NOT_FOUND` | 404 | Dossier patient inexistant |
| `CONSULTATION_NOT_FOUND` | 404 | Consultation inexistante |
| `INVOICE_NOT_FOUND` | 404 | Facture inexistante |
| `DOCUMENT_NOT_FOUND` | 404 | Document PDF inexistant |
| `DUPLICATE_ENTRY` | 409 | Violation de contrainte UNIQUE |
| `EMAIL_ALREADY_USED` | 409 | Email déjà enregistré |
| `SLOT_CONFLICT` | 409 | Créneau déjà réservé |
| `CONSULTATION_ALREADY_EXISTS` | 409 | Consultation déjà saisie |
| `SHIFT_OVERLAP` | 409 | Chevauchement de gardes |
| `INSUFFICIENT_STOCK` | 409 | Stock insuffisant |
| `ALREADY_DISPENSED` | 409 | Ordonnance déjà dispensée |
| `INVOICE_NOT_PAYABLE` | 409 | Facture non encaissable |
| `ROLE_SYSTEM_PROTECTED` | 409 | Rôle système non supprimable |
| `ROLE_IN_USE` | 409 | Rôle encore attribué |
| `FOREIGN_KEY_CONSTRAINT` | 409 | Ressource référencée ailleurs |
| `BUSINESS_RULE_VIOLATION` | 409 | Trigger SQL (SQLSTATE 45000) |
| `JOIN_WINDOW_CLOSED` | 409 | Hors fenêtre de connexion |
| `DOCUMENT_NOT_OWNED` | 403 | Document appartenant à un autre patient |
| `AMOUNT_EXCEEDS_BALANCE` | 422 | Montant supérieur au solde |
| `APPOINTMENT_CANCELLED` | 422 | Rendez-vous annulé |

### Système

| Code | HTTP | Signification |
| --- | --- | --- |
| `INTERNAL_ERROR` | 500 | Erreur inattendue |
| `DATABASE_UNAVAILABLE` | 503 | MySQL injoignable |
| `RATE_LIMITED` | 429 | Limite globale atteinte |
| `AUTH_RATE_LIMITED` | 429 | Limite d'authentification atteinte |
| `ROUTE_NOT_FOUND` | 404 | Route inexistante |
| `FILE_TOO_LARGE` | 400 | Fichier dépassant la limite |
| `UNSUPPORTED_MEDIA_TYPE` | 400 | Type MIME non autorisé |

---

## 18. Tables de référence

### Rôles

| Code | Libellé FR | Rôle système |
| --- | --- | --- |
| `SUPER_ADMIN` | Super administrateur | oui |
| `ADMIN` | Administrateur | oui |
| `DOCTOR` | Médecin | oui |
| `NURSE` | Infirmier(ère) | oui |
| `PHARMACIST` | Pharmacien(ne) | oui |
| `RECEPTIONIST` | Réceptionniste | oui |
| `ACCOUNTANT` | Comptable | oui |
| `PATIENT` | Patient | oui |

### Statuts de rendez-vous

| Code | Libellé FR |
| --- | --- |
| `PENDING` | En attente |
| `CONFIRMED` | Confirmé |
| `CHECKED_IN` | Arrivé |
| `IN_PROGRESS` | En cours |
| `COMPLETED` | Terminé |
| `CANCELLED` | Annulé |
| `NO_SHOW` | Absent |

### Statuts de facture

| Code | Libellé FR |
| --- | --- |
| `DRAFT` | Brouillon |
| `ISSUED` | Émise |
| `PARTIALLY_PAID` | Partiellement payée |
| `PAID` | Payée |
| `CANCELLED` | Annulée |

### Moyens de paiement

| Code | Libellé FR |
| --- | --- |
| `CASH` | Espèces |
| `CARD` | Carte bancaire |
| `TRANSFER` | Virement |
| `INSURANCE` | Assurance |
| `CHEQUE` | Chèque |

### Types de rendez-vous

| Code | Libellé FR |
| --- | --- |
| `IN_PERSON` | Présentiel |
| `TELEMEDICINE` | Téléconsultation |

### Statuts de téléconsultation

| Code | Libellé FR |
| --- | --- |
| `PENDING` | En attente |
| `APPROVED` | Approuvée |
| `REJECTED` | Refusée |
| `COMPLETED` | Terminée |
| `CANCELLED` | Annulée |

### Types de garde

| Code | Libellé FR |
| --- | --- |
| `DAY` | Jour |
| `NIGHT` | Nuit |
| `ON_CALL` | Astreinte |

### Groupes sanguins

`A+`, `A−`, `B+`, `B−`, `AB+`, `AB−`, `O+`, `O−`

### Genres

| Code | Libellé FR |
| --- | --- |
| `MALE` | Homme |
| `FEMALE` | Femme |
| `OTHER` | Autre |

---

## Annexe — Vérifier l'API en quelques commandes

```bash
# 1. Santé
curl http://localhost:4000/api/health

# 2. Connexion
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@mediclinic.fr","password":"Passw0rd!2026"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data.tokens.accessToken))")

# 3. Tableau de bord
curl -s http://localhost:4000/api/dashboard/stats -H "Authorization: Bearer $TOKEN" | head -c 400

# 4. Liste des patients
curl -s "http://localhost:4000/api/patients?page=1&limit=5" -H "Authorization: Bearer $TOKEN"

# 5. Télécharger une facture
curl -s -X POST "http://localhost:4000/api/invoices/1/pdf" \
  -H "Authorization: Bearer $TOKEN" -o facture-1.pdf

# 6. Vérifier le refus RBAC (avec un jeton de pharmacien)
curl -s http://localhost:4000/api/users -H "Authorization: Bearer $PHARMACIST_TOKEN"
# → {"error":{"code":"PERMISSION_DENIED",…}}
```
