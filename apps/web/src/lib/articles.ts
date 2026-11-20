/**
 * Contenu éditorial du blog santé.
 *
 * Données statiques : le site public est un site vitrine, ces articles ne
 * dépendent pas de la base de données. Ils illustrent la rubrique « Actualités
 * santé » et peuvent être remplacés par un CMS sans toucher aux composants.
 */

export interface Article {
  slug: string;
  title: string;
  category: string;
  date: string;
  readTime: number;
  author: string;
  excerpt: string;
  /** Paragraphes de l'article. */
  content: string[];
  /** Points clés affichés en encadré. */
  keyPoints: string[];
}

export const ARTICLES: Article[] = [
  {
    slug: 'preparer-sa-consultation',
    title: 'Comment bien préparer sa consultation médicale',
    category: 'Conseils',
    date: '2026-11-12',
    readTime: 4,
    author: 'Dr Claire Martin',
    excerpt:
      'Une consultation efficace se prépare. Liste des symptômes, traitements en cours, questions à poser : nos conseils pour profiter pleinement du temps avec votre médecin.',
    content: [
      'Le temps d’une consultation est limité. Pour que votre médecin puisse poser le bon diagnostic, il est utile de préparer en amont les informations essentielles : depuis quand les symptômes sont apparus, leur évolution, les facteurs qui les aggravent ou les soulagent.',
      'Apportez la liste de vos traitements en cours, y compris les médicaments sans ordonnance et les compléments alimentaires. Les interactions médicamenteuses sont une cause fréquente d’effets indésirables évitables.',
      'Enfin, notez vos questions. Beaucoup de patients oublient la moitié de ce qu’ils souhaitaient demander une fois dans le cabinet. Un simple mémo sur votre téléphone suffit.',
    ],
    keyPoints: [
      'Notez la chronologie et l’intensité des symptômes.',
      'Listez tous vos traitements, même ceux sans ordonnance.',
      'Préparez deux ou trois questions prioritaires.',
      'Apportez vos examens et comptes-rendus récents.',
    ],
  },
  {
    slug: 'teleconsultation-mode-emploi',
    title: 'Téléconsultation : mode d’emploi et bonnes pratiques',
    category: 'Numérique',
    date: '2026-10-28',
    readTime: 5,
    author: 'Équipe MediClinic',
    excerpt:
      'La visioconférence médicale est pratique, mais elle nécessite un minimum de préparation. Voici comment rendre votre téléconsultation aussi utile qu’une consultation en présentiel.',
    content: [
      'La téléconsultation convient particulièrement au suivi des maladies chroniques, au renouvellement d’ordonnances, à l’interprétation de résultats et aux symptômes simples. Elle ne remplace pas l’examen clinique lorsque celui-ci est indispensable.',
      'Installez-vous dans un endroit calme, correctement éclairé, et vérifiez votre connexion quelques minutes avant l’heure. Munissez-vous de votre carte Vitale, de vos ordonnances et de votre tensiomètre ou thermomètre si vous en avez un.',
      'Pendant l’échange, décrivez précisément vos symptômes et n’hésitez pas à montrer une zone douloureuse à la caméra. À la fin, vérifiez que vous avez bien compris la posologie et les signes d’alerte qui doivent vous conduire aux urgences.',
    ],
    keyPoints: [
      'Testez votre matériel avant le rendez-vous.',
      'Préparez vos documents et vos constantes.',
      'Choisissez un lieu calme et lumineux.',
      'Demandez un compte-rendu écrit si nécessaire.',
    ],
  },
  {
    slug: 'prevention-cardiovasculaire',
    title: 'Prévention cardiovasculaire : les gestes qui comptent',
    category: 'Prévention',
    date: '2026-10-09',
    readTime: 6,
    author: 'Dr Antoine Lefèvre',
    excerpt:
      'Activité physique, alimentation, sommeil, tension artérielle : les leviers concrets pour prendre soin de votre cœur au quotidien, à tout âge.',
    content: [
      'Les maladies cardiovasculaires restent la première cause de mortalité en France. Pourtant, une part importante des facteurs de risque est modifiable : tabac, sédentarité, surpoids, hypertension, diabète et cholestérol.',
      'Trente minutes d’activité physique modérée cinq fois par semaine suffisent à réduire significativement le risque. La marche rapide, le vélo ou la natation sont d’excellents choix, à adapter à votre condition physique.',
      'Sur le plan alimentaire, privilégiez les légumes, les fruits, les céréales complètes et les huiles végétales, en limitant les produits ultra-transformés, le sel et l’alcool. Un suivi régulier de la tension artérielle permet de détecter une hypertension souvent silencieuse.',
    ],
    keyPoints: [
      'Bouger au moins 30 minutes par jour.',
      'Faire contrôler sa tension au moins une fois par an.',
      'Réduire sel, alcool et tabac.',
      'Consulter en cas de douleur thoracique ou d’essoufflement inhabituel.',
    ],
  },
  {
    slug: 'sommeil-et-sante',
    title: 'Sommeil et santé : reconstruire des nuits réparatrices',
    category: 'Bien-être',
    date: '2026-09-22',
    readTime: 5,
    author: 'Dr Sophie Bernard',
    excerpt:
      'Le manque de sommeil affecte l’humeur, l’immunité et le risque cardiométabolique. Quelques routines simples permettent souvent d’améliorer la qualité des nuits.',
    content: [
      'Un adulte a besoin en moyenne de sept à neuf heures de sommeil par nuit. La régularité des horaires de coucher et de lever est souvent plus importante que la durée totale.',
      'Évitez les écrans lumineux dans l’heure qui précède le coucher, ainsi que la caféine après 14h. Une chambre fraîche, sombre et silencieuse favorise l’endormissement.',
      'Si les difficultés persistent plus de trois semaines, ou si elles s’accompagnent d’une somnolence diurne importante, parlez-en à votre médecin. Les troubles du sommeil, comme l’apnée, nécessitent une prise en charge spécifique.',
    ],
    keyPoints: [
      'Se coucher et se lever à heures régulières.',
      'Limiter les écrans le soir.',
      'Éviter la caféine en fin de journée.',
      'Consulter si les troubles durent plus de trois semaines.',
    ],
  },
  {
    slug: 'vaccination-adulte',
    title: 'Vaccination de l’adulte : êtes-vous à jour ?',
    category: 'Prévention',
    date: '2026-09-03',
    readTime: 4,
    author: 'Dr Claire Martin',
    excerpt:
      'Diphtérie, tétanos, coqueluche, grippe, zona… Les rappels vaccinaux concernent aussi les adultes. Faites le point avec votre médecin traitant.',
    content: [
      'Les recommandations vaccinales évoluent avec l’âge et les situations individuelles : grossesse, maladie chronique, profession exposée ou voyage. Un carnet de vaccination à jour permet d’éviter les rappels inutiles.',
      'Le rappel diphtérie-tétanos-coqueluche est recommandé tous les vingt ans à l’âge adulte. La vaccination contre la grippe est conseillée chaque automne pour les personnes de plus de 65 ans et celles présentant des facteurs de risque.',
      'La clinique propose des séances de vaccination sans rendez-vous certains après-midis. Consultez le secrétariat pour connaître les créneaux disponibles.',
    ],
    keyPoints: [
      'Vérifier son carnet de vaccination.',
      'Rappel DTP tous les 20 ans.',
      'Vaccination grippe chaque automne pour les personnes à risque.',
      'Signaler grossesse et maladies chroniques.',
    ],
  },
  {
    slug: 'dossier-medical-numerique',
    title: 'Votre dossier médical numérique, mode d’emploi',
    category: 'Numérique',
    date: '2026-08-19',
    readTime: 3,
    author: 'Équipe MediClinic',
    excerpt:
      'Ordonnances, résultats d’analyses et comptes-rendus centralisés : découvrez comment utiliser votre espace patient et protéger vos identifiants.',
    content: [
      'Votre espace patient regroupe l’ensemble des documents produits lors de votre prise en charge : ordonnances, résultats de laboratoire, comptes-rendus de consultation et factures.',
      'L’accès est protégé par une authentification forte. Ne partagez jamais votre mot de passe et déconnectez-vous systématiquement sur un ordinateur partagé. En cas de doute, réinitialisez immédiatement votre mot de passe.',
      'Vous pouvez télécharger vos documents au format PDF pour les transmettre à un autre professionnel de santé. Le dossier reste accessible pendant toute la durée légale de conservation.',
    ],
    keyPoints: [
      'Un seul espace pour tous vos documents de santé.',
      'Connexion sécurisée et journalisée.',
      'Téléchargement PDF disponible.',
      'Ne jamais partager ses identifiants.',
    ],
  },
];

export function findArticle(slug: string | undefined): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}
