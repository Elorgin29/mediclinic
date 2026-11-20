# Variables d’environnement — MediClinic API

Environnement **Local** (`bruno/environments/Local.bru`) + variables runtime posées par les scripts.

| Variable | Valeur par défaut | Origine | Rôle |
| --- | --- | --- | --- |
| `baseUrl` | `http://localhost:4000` | Collection / Local | URL de base de l’API. Préfixe ajouté dans chaque requête : `/api`. |
| `email` | `superadmin@mediclinic.fr` | Local | Email utilisé par la requête Auth / Login. |
| `password` | `Passw0rd!2026` | Local | Mot de passe utilisé par Auth / Login (et par les autres comptes de démonstration). |
| `accessToken` | `(vide au départ)` | Runtime — script | JWT d’accès (TTL 15 min). Posé par Auth / Login et Auth / Refresh, utilisé en `Authorization: Bearer {{accessToken}}`. |
| `refreshToken` | `(vide au départ)` | Runtime — script | Jeton opaque de rafraîchissement (TTL 7 j). Posé par Auth / Login et renouvelé par Auth / Refresh. |
| `userEmail` | `(vide au départ)` | Runtime — script | Email du dernier utilisateur authentifié, mémorisé par le script de login. |
| `userId` | `1` | Local | ID d’utilisateur pour les routes `/users/:id` (1 = superadmin). |
| `roleId` | `1` | Local | ID de rôle pour les routes `/roles/:id` (1 = SUPER_ADMIN). |
| `permissionId` | `1` | Local | ID de permission de référence. |
| `specialtyId` | `1` | Local | ID de spécialité (1 = Cardiologie). |
| `departmentId` | `1` | Local | ID de département (1 = Cardiologie). |
| `doctorId` | `1` | Local | ID de médecin (1 = Dr Amine Haddad). |
| `patientId` | `1` | Local | ID de dossier patient (1 = Lucie Durand). |
| `appointmentId` | `101` | Local | ID de rendez-vous de démonstration. |
| `consultationId` | `1` | Local | ID de consultation de démonstration. |
| `prescriptionId` | `1` | Local | ID d’ordonnance de démonstration. |
| `meetingId` | `1` | Local | ID de téléconsultation de démonstration. |
| `labTestId` | `1` | Local | ID d’analyse de démonstration. |
| `labRequestId` | `1` | Local | ID de demande d’analyse de démonstration. |
| `medicationId` | `1` | Local | ID de médicament (1 = Paracétamol 500 mg). |
| `movementId` | `1` | Local | ID de mouvement de stock de démonstration. |
| `invoiceId` | `1` | Local | ID de facture de démonstration. |
| `paymentId` | `1` | Local | ID d’encaissement de démonstration. |
| `shiftId` | `1` | Local | ID de garde de démonstration. |
| `notificationId` | `1` | Local | ID de notification de démonstration. |
| `auditId` | `1` | Local | ID d’entrée du journal d’audit. |
| `docType` | `patient` | Local | Type de document pour `GET /api/pdf/:type/:id` : patient, prescription, dispensation, consultation ou invoice. |
| `docId` | `1` | Local | ID du document générique PDF. |
| `fromDate` | `2026-11-01` | Local | Date de début utilisée par les rapports et plannings. |
| `toDate` | `2026-12-31` | Local | Date de fin utilisée par les rapports et plannings. |
| `futureDate` | `2026-12-15` | Local | Date future générique pour les tests de création. |

> Les variables `accessToken`, `refreshToken` et `userEmail` sont créées dynamiquement par les scripts post-response de `Auth/Login` et `Auth/Refresh`.
