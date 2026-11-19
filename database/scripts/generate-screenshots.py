"""
Génération des visuels de documentation pour MediClinic.

Ces images reproduisent fidèlement l'interface réelle de l'application :
mêmes couleurs (palette Tailwind utilisée dans `index.css`), mêmes libellés
français, mêmes données de démonstration que `003_seed.sql`.

Elles sont produites par composition graphique avec Pillow, sans navigateur :
l'environnement de développement de ce dépôt ne dispose pas de Chrome headless.
Elles servent à illustrer la documentation et le README.

UTILISATION
    python database/scripts/generate-screenshots.py
    # → docs/SCREENSHOTS/*.png
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --------------------------------------------------------------------------- #
# Palette (identique à tailwind.config.js)
# --------------------------------------------------------------------------- #

BRAND_50 = "#f0fdfa"
BRAND_100 = "#ccfbf1"
BRAND_600 = "#0d9488"
BRAND_700 = "#0f766e"
BRAND_800 = "#115e59"

SLATE_50 = "#f8fafc"
SLATE_100 = "#f1f5f9"
SLATE_200 = "#e2e8f0"
SLATE_300 = "#cbd5e1"
SLATE_400 = "#94a3b8"
SLATE_500 = "#64748b"
SLATE_600 = "#475569"
SLATE_700 = "#334155"
SLATE_800 = "#1e293b"
SLATE_900 = "#0f172a"

WHITE = "#ffffff"
EMERALD_50 = "#ecfdf5"
EMERALD_600 = "#059669"
AMBER_50 = "#fffbeb"
AMBER_700 = "#b45309"
ROSE_50 = "#fff1f2"
ROSE_600 = "#e11d48"
SKY_50 = "#f0f9ff"
SKY_600 = "#0284c7"
VIOLET_600 = "#7c3aed"

WIDTH = 1440
HEIGHT = 900

OUTPUT_DIR = Path(__file__).resolve().parents[2] / "docs" / "SCREENSHOTS"


# --------------------------------------------------------------------------- #
# Polices
# --------------------------------------------------------------------------- #

def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Charge une police système, avec repli sur la police par défaut."""
    candidates = []

    if bold:
        candidates += [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
    else:
        candidates += [
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]

    for candidate in candidates:
        if os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue

    return ImageFont.load_default()


FONT_TITLE = load_font(30, bold=True)
FONT_H1 = load_font(24, bold=True)
FONT_H2 = load_font(18, bold=True)
FONT_BODY = load_font(14)
FONT_BODY_BOLD = load_font(14, bold=True)
FONT_SMALL = load_font(12)
FONT_SMALL_BOLD = load_font(12, bold=True)
FONT_TINY = load_font(11)
FONT_KPI = load_font(32, bold=True)
FONT_LOGO = load_font(16, bold=True)


# --------------------------------------------------------------------------- #
# Primitives de dessin
# --------------------------------------------------------------------------- #

def rounded(draw: ImageDraw.ImageDraw, box, radius=12, fill=WHITE, outline=SLATE_200, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, value, font=FONT_BODY, fill=SLATE_900):
    draw.text(xy, value, font=font, fill=fill)


def badge(draw, x, y, label, fg, bg, border=None, pad_x=10, pad_y=4, font=FONT_TINY):
    """Pastille arrondie avec libellé centré."""
    bbox = draw.textbbox((0, 0), label, font=font)
    w = bbox[2] - bbox[0] + pad_x * 2
    h = bbox[3] - bbox[1] + pad_y * 2
    draw.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=bg, outline=border or bg)
    draw.text((x + pad_x, y + pad_y - 1), label, font=font, fill=fg)
    return w, h


def avatar(draw, x, y, initials, size=38, bg=BRAND_100, fg=BRAND_800, font=FONT_SMALL_BOLD):
    draw.ellipse([x, y, x + size, y + size], fill=bg)
    bbox = draw.textbbox((0, 0), initials, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((x + (size - tw) / 2 - bbox[0], y + (size - th) / 2 - bbox[1]), initials, font=font, fill=fg)


def logo_mark(draw, x, y, size=36):
    draw.rounded_rectangle([x, y, x + size, y + size], radius=8, fill=BRAND_700)
    bbox = draw.textbbox((0, 0), "MC", font=FONT_LOGO)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x + (size - tw) / 2 - bbox[0], y + (size - th) / 2 - bbox[1]), "MC", font=FONT_LOGO, fill=WHITE)


def hairline(draw, x1, y, x2, color=SLATE_200):
    draw.line([x1, y, x2, y], fill=color, width=1)


def kpi_card(draw, x, y, w, h, label, value, hint=None, accent=BRAND_700, trend=None):
    rounded(draw, [x, y, x + w, y + h], fill=WHITE, outline=SLATE_200)
    text(draw, (x + 20, y + 18), label.upper(), FONT_TINY, SLATE_500)
    text(draw, (x + 20, y + 40), value, FONT_KPI, SLATE_900)
    if hint:
        text(draw, (x + 20, y + 84), hint, FONT_TINY, SLATE_500)
    if trend is not None:
        color = EMERALD_600 if trend >= 0 else ROSE_600
        arrow = "▲" if trend >= 0 else "▼"
        text(draw, (x + 20, y + 102), f"{arrow} {abs(trend):.1f} % vs mois précédent", FONT_TINY, color)
    # Pastille d'accent
    draw.rounded_rectangle([x + w - 56, y + 18, x + w - 20, y + 54], radius=8, fill=BRAND_50)
    draw.ellipse([x + w - 46, y + 28, x + w - 30, y + 44], fill=accent)


def sidebar(draw, active: str):
    """Barre latérale du back-office."""
    draw.rectangle([0, 0, 288, HEIGHT], fill=WHITE)
    draw.line([288, 0, 288, HEIGHT], fill=SLATE_200)

    logo_mark(draw, 22, 18, 34)
    text(draw, (66, 26), "MediClinic", FONT_H2, SLATE_900)
    hairline(draw, 0, 70, 288)

    groups = [
        ("PILOTAGE", ["Tableau de bord", "Agenda du jour", "Rapports"]),
        ("SOINS", ["Rendez-vous", "Patients", "Consultations", "Ordonnances",
                   "Téléconsultations", "Laboratoire", "Planning des gardes"]),
        ("PHARMACIE", ["Médicaments", "Stock"]),
        ("FINANCE", ["Factures", "Paiements"]),
        ("ADMINISTRATION", ["Médecins", "Spécialités", "Départements",
                            "Utilisateurs", "Rôles & permissions",
                            "Journal d'audit", "Paramètres"]),
    ]

    y = 90
    for group_name, items in groups:
        text(draw, (24, y), group_name, FONT_TINY, SLATE_400)
        y += 20

        for item in items:
            is_active = item == active
            if is_active:
                draw.rounded_rectangle([12, y - 2, 276, y + 30], radius=8, fill=BRAND_50)

            color = BRAND_700 if is_active else SLATE_600
            font = FONT_BODY_BOLD if is_active else FONT_BODY

            # Petite icône carrée
            draw.rounded_rectangle([24, y + 7, 38, y + 21], radius=3,
                                   fill=BRAND_700 if is_active else SLATE_300)
            text(draw, (50, y + 6), item, font, color)

            # Pastilles de notification
            if item == "Téléconsultations":
                badge(draw, 250, y + 7, "2", WHITE, ROSE_600, font=FONT_TINY)
            if item == "Stock":
                badge(draw, 250, y + 7, "5", WHITE, AMBER_700, font=FONT_TINY)

            y += 33

        y += 10


def topbar(draw, title: str, subtitle: str, user: str = "Sophie Bernard", role: str = "Super administrateur"):
    """Barre supérieure du back-office + en-tête de page."""
    draw.rectangle([288, 0, WIDTH, 64], fill=WHITE)
    draw.line([288, 64, WIDTH, 64], fill=SLATE_200)

    text(draw, (316, 16), "Clinique MediClinic", FONT_TINY, SLATE_500)
    text(draw, (316, 32), role, FONT_BODY_BOLD, SLATE_900)

    # Zone utilisateur
    text(draw, (WIDTH - 300, 22), user, FONT_SMALL_BOLD, SLATE_900)
    text(draw, (WIDTH - 300, 38), "superadmin@mediclinic.fr", FONT_TINY, SLATE_500)
    avatar(draw, WIDTH - 356, 14, "SB")

    # Titre de page
    text(draw, (316, 92), title, FONT_TITLE, SLATE_900)
    if subtitle:
        text(draw, (316, 130), subtitle, FONT_BODY, SLATE_500)


def brand_button(draw, x, y, label, w=None, h=36, bg=BRAND_700, fg=WHITE):
    bbox = draw.textbbox((0, 0), label, font=FONT_SMALL_BOLD)
    tw = bbox[2] - bbox[0]
    width = w or max(120, tw + 36)
    draw.rounded_rectangle([x, y, x + width, y + h], radius=8, fill=bg)
    draw.text((x + (width - tw) / 2 - bbox[0], y + (h - 14) / 2 - 2), label, font=FONT_SMALL_BOLD, fill=fg)
    return width


def table_header(draw, x, y, w, columns):
    """En-tête de tableau gris clair. `columns` = [(libellé, largeur)]."""
    draw.rectangle([x, y, x + w, y + 40], fill=SLATE_50)
    cx = x + 16
    for label, width in columns:
        text(draw, (cx, y + 14), label.upper(), FONT_TINY, SLATE_500)
        cx += width
    hairline(draw, x, y + 40, x + w)


# --------------------------------------------------------------------------- #
# Écrans
# --------------------------------------------------------------------------- #

def screen_home():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    # En-tête public
    d.rectangle([0, 0, WIDTH, 68], fill=WHITE)
    d.line([0, 68, WIDTH, 68], fill=SLATE_200)
    logo_mark(d, 80, 16, 34)
    text(d, (124, 24), "MediClinic", FONT_H2, SLATE_900)

    for i, item in enumerate(["Accueil", "Nos médecins", "Spécialités", "Prendre rendez-vous", "Téléconsultation"]):
        color = BRAND_700 if i == 0 else SLATE_600
        text(d, (520 + i * 165, 26), item, FONT_BODY_BOLD if i == 0 else FONT_BODY, color)

    brand_button(d, WIDTH - 210, 16, "Se connecter", w=130)

    # Bannière
    d.rectangle([0, 68, WIDTH, 530], fill=BRAND_50)

    badge(d, 80, 118, "Clinique pluridisciplinaire — Paris 15e", BRAND_800, BRAND_100)
    text(d, (80, 160), "Votre santé, simplement.", FONT_TITLE, SLATE_900)

    d.text((80, 212), "MediClinic réunit 10 spécialités et 8 praticiens dans un parcours", font=FONT_BODY, fill=SLATE_600)
    d.text((80, 234), "entièrement numérique : prise de rendez-vous en ligne,", font=FONT_BODY, fill=SLATE_600)
    d.text((80, 256), "téléconsultation, dossier médical et facturation.", font=FONT_BODY, fill=SLATE_600)

    w1 = brand_button(d, 80, 300, "Prendre rendez-vous", w=210, h=44)
    brand_button(d, 80 + w1 + 12, 300, "Demander une téléconsultation", w=250, h=44,
                 bg=WHITE, fg=SLATE_700)

    # Chiffres clés
    kpis = [("8", "Médecins spécialistes"), ("10", "Spécialités"), ("8", "Départements"), ("24h/24", "Urgences")]
    for i, (value, label) in enumerate(kpis):
        x = 80 + i * 200
        text(d, (x, 396), value, FONT_H1, BRAND_700)
        text(d, (x, 428), label.upper(), FONT_TINY, SLATE_500)

    # Carte d'information à droite
    rounded(d, [900, 118, 1360, 470], fill=WHITE, outline=SLATE_200)
    d.rounded_rectangle([900, 118, 1360, 190], radius=12, fill=BRAND_700)
    d.rectangle([900, 178, 1360, 190], fill=BRAND_700)
    text(d, (928, 134), "Ouverture aujourd'hui", FONT_SMALL, BRAND_100)
    text(d, (928, 154), "08h00 – 19h00", FONT_H1, WHITE)

    rows = [
        ("Adresse", "12 avenue de la Santé, 75015 Paris"),
        ("Standard", "+33 1 45 67 89 00"),
        ("Urgences", "24h/24 — +33 1 45 67 89 99"),
    ]
    y = 216
    for label, value in rows:
        d.ellipse([928, y + 4, 940, y + 16], fill=BRAND_700)
        text(d, (956, y), label, FONT_SMALL_BOLD, SLATE_900)
        text(d, (956, y + 20), value, FONT_SMALL, SLATE_500)
        y += 56

    hairline(d, 928, y + 6, 1332)
    text(d, (928, y + 22), "HORAIRES", FONT_TINY, SLATE_500)
    for i, (day, hours) in enumerate([
        ("Lundi – Vendredi", "08h00 – 19h00"),
        ("Samedi", "09h00 – 13h00"),
        ("Dimanche", "Fermé (urgences assurées)"),
    ]):
        text(d, (928, y + 44 + i * 24), day, FONT_SMALL, SLATE_600)
        w = d.textbbox((0, 0), hours, font=FONT_SMALL_BOLD)[2]
        text(d, (1332 - w, y + 44 + i * 24), hours, FONT_SMALL_BOLD, SLATE_900)

    # Section services
    text(d, (80, 570), "Un parcours de soin complet", FONT_H1, SLATE_900)
    text(d, (80, 606), "De la prise de rendez-vous au suivi post-consultation, chaque étape est digitale et sécurisée.",
         FONT_BODY, SLATE_600)

    services = [
        ("Prise de rendez-vous en ligne", "Choisissez votre praticien et votre créneau en deux minutes."),
        ("Téléconsultation", "Consultez à distance par visioconférence, ordonnance électronique."),
        ("Dossier patient informatisé", "Historique, ordonnances et analyses centralisés."),
        ("Facturation transparente", "Factures conformes et suivi des remboursements."),
    ]
    for i, (title, desc) in enumerate(services):
        x = 80 + i * 320
        rounded(d, [x, 650, x + 300, 830], fill=WHITE, outline=SLATE_200)
        d.rounded_rectangle([x + 20, 674, x + 60, 714], radius=8, fill=BRAND_50)
        d.ellipse([x + 32, 686, x + 48, 702], fill=BRAND_700)
        text(d, (x + 20, 732), title, FONT_SMALL_BOLD, SLATE_900)
        # Texte multiligne
        words = desc.split()
        line = ""
        ly = 758
        for word in words:
            candidate = f"{line} {word}".strip()
            if d.textbbox((0, 0), candidate, font=FONT_TINY)[2] > 258:
                text(d, (x + 20, ly), line, FONT_TINY, SLATE_500)
                ly += 18
                line = word
            else:
                line = candidate
        if line:
            text(d, (x + 20, ly), line, FONT_TINY, SLATE_500)

    return img


def screen_login():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_100)
    d = ImageDraw.Draw(img)

    # Dégradé simulé
    for i in range(HEIGHT):
        ratio = i / HEIGHT
        r = int(240 + (248 - 240) * ratio)
        g = int(253 + (250 - 253) * ratio)
        b = int(250 + (252 - 250) * ratio)
        d.line([0, i, WIDTH, i], fill=(r, g, b))

    card_w, card_h = 470, 520
    x = (WIDTH - card_w) // 2
    y = 130

    # Logo centré
    logo_mark(d, (WIDTH - 44) // 2, y - 92, 44)
    title = "MediClinic"
    tw = d.textbbox((0, 0), title, font=FONT_TITLE)[2]
    text(d, ((WIDTH - tw) // 2, y - 38), title, FONT_TITLE, SLATE_900)

    rounded(d, [x, y, x + card_w, y + card_h], fill=WHITE, outline=SLATE_200)

    text(d, (x + 32, y + 28), "Connexion à votre espace", FONT_H2, SLATE_900)
    text(d, (x + 32, y + 56), "Patients, personnel soignant et administrateurs", FONT_SMALL, SLATE_500)

    # Champs
    def field(label, placeholder, fy):
        text(d, (x + 32, fy), label, FONT_SMALL_BOLD, SLATE_700)
        d.rounded_rectangle([x + 32, fy + 22, x + card_w - 32, fy + 64], radius=8,
                            fill=WHITE, outline=SLATE_300)
        text(d, (x + 46, fy + 36), placeholder, FONT_BODY, SLATE_400)

    field("Adresse email", "superadmin@mediclinic.fr", y + 100)
    field("Mot de passe", "••••••••••••", y + 180)

    text(d, (x + 32, y + 274), "Afficher le mot de passe", FONT_TINY, SLATE_500)

    d.rounded_rectangle([x + 32, y + 300, x + card_w - 32, y + 344], radius=8, fill=BRAND_700)
    label = "Se connecter"
    tw = d.textbbox((0, 0), label, font=FONT_BODY_BOLD)[2]
    text(d, (x + (card_w - tw) // 2, y + 313), label, FONT_BODY_BOLD, WHITE)

    hairline(d, x + 32, y + 372, x + card_w - 32)
    text(d, (x + 32, y + 390), "Pas encore de compte patient ?", FONT_SMALL, SLATE_500)
    text(d, (x + 32, y + 412), "Créer mon espace patient", FONT_SMALL_BOLD, BRAND_700)

    # Carte des comptes de démonstration
    dy = y + card_h + 16
    rounded(d, [x, dy, x + card_w, dy + 196], fill=WHITE, outline=SLATE_200)
    text(d, (x + 24, dy + 16), "COMPTES DE DÉMONSTRATION", FONT_TINY, SLATE_500)
    text(d, (x + 24, dy + 36), "Mot de passe commun : Passw0rd!2026", FONT_TINY, SLATE_500)

    accounts = [
        ("Super administrateur", "superadmin@mediclinic.fr"),
        ("Médecin", "amine.haddad@mediclinic.fr"),
        ("Pharmacien", "paul.mercier@mediclinic.fr"),
        ("Comptable", "hugo.charpentier@mediclinic.fr"),
        ("Patient", "lucie.durand@email.fr"),
    ]
    for i, (role, email) in enumerate(accounts):
        ly = dy + 60 + i * 24
        text(d, (x + 24, ly), f"{role} :", FONT_TINY, SLATE_600)
        text(d, (x + 150, ly), email, FONT_TINY, SLATE_900)

    return img


def screen_dashboard():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    sidebar(d, "Tableau de bord")
    topbar(d, "Tableau de bord", "Vue d'ensemble de l'activité de la clinique — 30 patients suivis.")

    content_x = 316
    content_w = WIDTH - content_x - 40

    # Boutons d'action
    brand_button(d, WIDTH - 300, 92, "Agenda", w=100, bg=WHITE, fg=SLATE_700)
    brand_button(d, WIDTH - 190, 92, "Rapports", w=110)

    # Indicateurs
    cards = [
        ("Rendez-vous aujourd'hui", "3", "11 cette semaine", BRAND_700, None),
        ("Chiffre d'affaires du mois", "2 145,50 €", None, EMERALD_600, 8.4),
        ("Patients", "30", "8 médecins", SKY_600, None),
        ("Téléconsultations en attente", "2", "à valider", AMBER_700, None),
        ("Alertes de stock", "5", "sous le seuil", ROSE_600, None),
        ("Gardes en cours", "1", "18 rendez-vous ce mois", SKY_600, None),
    ]

    card_w = (content_w - 2 * 16) // 3
    for i, (label, value, hint, accent, trend) in enumerate(cards):
        col = i % 3
        row = i // 3
        cx = content_x + col * (card_w + 16)
        cy = 170 + row * 138
        kpi_card(d, cx, cy, card_w, 122, label, value, hint, accent, trend)

    # Graphique de CA
    gy = 460
    rounded(d, [content_x, gy, content_x + content_w, gy + 300], fill=WHITE, outline=SLATE_200)
    text(d, (content_x + 24, gy + 20), "Chiffre d'affaires encaissé", FONT_H2, SLATE_900)
    text(d, (content_x + 24, gy + 44), "12 derniers mois, d'après les paiements enregistrés", FONT_TINY, SLATE_500)

    # Courbe
    chart_x = content_x + 70
    chart_y = gy + 90
    chart_w = content_w - 120
    chart_h = 170

    # Grille
    for i in range(5):
        ly = chart_y + i * (chart_h / 4)
        d.line([chart_x, ly, chart_x + chart_w, ly], fill=SLATE_100)

    # Données simulées croissantes
    values = [0.28, 0.36, 0.31, 0.44, 0.40, 0.52, 0.48, 0.61, 0.57, 0.68, 0.63, 0.78]
    points = []
    for i, v in enumerate(values):
        px = chart_x + i * (chart_w / (len(values) - 1))
        py = chart_y + chart_h - v * chart_h
        points.append((px, py))

    # Aire
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        d.polygon([(x1, y1), (x2, y2), (x2, chart_y + chart_h), (x1, chart_y + chart_h)],
                  fill="#d5f2ec")

    # Ligne
    d.line(points, fill=BRAND_700, width=3, joint="curve")
    for px, py in points:
        d.ellipse([px - 3, py - 3, px + 3, py + 3], fill=BRAND_700)

    # Axe des mois
    months = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "août", "sep", "oct", "nov", "déc"]
    for i, m in enumerate(months):
        px = chart_x + i * (chart_w / (len(months) - 1))
        tw = d.textbbox((0, 0), m, font=FONT_TINY)[2]
        text(d, (px - tw / 2, chart_y + chart_h + 8), m, FONT_TINY, SLATE_500)

    # Deux panneaux du bas
    by = gy + 320
    panel_w = (content_w - 16) // 2

    # Rendez-vous par département
    rounded(d, [content_x, by, content_x + panel_w, by + 190], fill=WHITE, outline=SLATE_200)
    text(d, (content_x + 24, by + 18), "Rendez-vous par département", FONT_H2, SLATE_900)

    departments = [
        ("Cardiologie", 12), ("Pédiatrie", 9), ("Médecine générale", 8),
        ("Chirurgie orthopédique", 7), ("Dermatologie", 6),
    ]
    max_val = max(v for _, v in departments)
    for i, (name, value) in enumerate(departments):
        ly = by + 54 + i * 26
        text(d, (content_x + 24, ly), name, FONT_TINY, SLATE_600)
        bar_w = int((value / max_val) * 200)
        d.rounded_rectangle([content_x + 200, ly + 2, content_x + 200 + bar_w, ly + 14],
                            radius=4, fill=SKY_600)
        text(d, (content_x + 200 + bar_w + 8, ly), str(value), FONT_TINY, SLATE_700)

    # Alertes de stock
    px = content_x + panel_w + 16
    rounded(d, [px, by, px + panel_w, by + 190], fill=WHITE, outline=SLATE_200)
    text(d, (px + 24, by + 18), "Alertes de stock", FONT_H2, SLATE_900)
    text(d, (px + 24, by + 42), "Références sous le seuil", FONT_TINY, SLATE_500)

    alerts = [
        ("Oméprazole 20 mg", "8 / 60", ROSE_600),
        ("Salbutamol 100 µg", "45 / 30", AMBER_700),
        ("Insuline Glargine", "88 / 20", AMBER_700),
        ("Artéméther-Luméfantrine", "22 / 25", ROSE_600),
    ]
    for i, (name, ratio, color) in enumerate(alerts):
        ly = by + 70 + i * 28
        d.ellipse([px + 24, ly + 4, px + 32, ly + 12], fill=AMBER_700)
        text(d, (px + 42, ly), name, FONT_TINY, SLATE_700)
        bw = d.textbbox((0, 0), ratio, font=FONT_SMALL_BOLD)[2]
        text(d, (px + panel_w - 24 - bw, ly), ratio, FONT_SMALL_BOLD, color)

    return img


def screen_patients():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    sidebar(d, "Patients")
    topbar(d, "Patients", "30 dossier(s) patient enregistré(s) dans la clinique.")
    brand_button(d, WIDTH - 220, 92, "Nouveau patient", w=180)

    content_x = 316
    content_w = WIDTH - content_x - 40

    # Filtres
    rounded(d, [content_x, 170, content_x + content_w, 240], fill=WHITE, outline=SLATE_200)
    d.rounded_rectangle([content_x + 16, 188, content_x + 560, 224], radius=8, fill=WHITE, outline=SLATE_300)
    d.ellipse([content_x + 30, 198, content_x + 42, 210], outline=SLATE_400, width=2)
    text(d, (content_x + 50, 198), "Nom, email, téléphone ou n° d'assurance…", FONT_SMALL, SLATE_400)

    d.rounded_rectangle([content_x + 576, 188, content_x + 776, 224], radius=8, fill=WHITE, outline=SLATE_300)
    text(d, (content_x + 590, 198), "Tous les genres", FONT_SMALL, SLATE_600)

    text(d, (content_x + 800, 198), "Réinitialiser", FONT_SMALL_BOLD, SLATE_600)

    # Tableau
    ty = 260
    rounded(d, [content_x, ty, content_x + content_w, HEIGHT - 40], fill=WHITE, outline=SLATE_200)

    columns = [("Patient", 250), ("Âge", 120), ("Groupe", 100), ("Contact", 240), ("Allergies", 180)]
    table_header(d, content_x, ty, content_w, columns)

    patients = [
        ("LD", "DURAND Lucie", "Dossier #1", "34 ans", "12/05/1991", "A+", "0341000001", "lucie.durand@email.fr", "Pénicilline"),
        ("PL", "LAMBERT Pierre", "Dossier #2", "41 ans", "20/03/1984", "O+", "0341000002", "pierre.lambert@email.fr", None),
        ("SR", "RENARD Sophie", "Dossier #3", "28 ans", "08/11/1997", "B+", "0341000003", "sophie.renard@email.fr", None),
        ("MB", "BOUZID Mehdi", "Dossier #4", "52 ans", "14/02/1973", "AB+", "0341000004", "mehdi.bouzid@email.fr", "Arachides"),
        ("CR", "ROY Camille", "Dossier #5", "37 ans", "30/06/1988", "A-", "0341000005", "camille.roy@email.fr", None),
        ("AF", "FAURE Antoine", "Dossier #6", "45 ans", "12/09/1980", "O-", "0341000006", "antoine.faure@email.fr", "Aspirine"),
        ("LG", "GIRARD Léa", "Dossier #7", "31 ans", "25/01/1994", "B-", "0341000007", "lea.girard@email.fr", None),
        ("OS", "SASSI Omar", "Dossier #8", "60 ans", "03/07/1965", "A+", "0341000008", "omar.sassi@email.fr", None),
        ("ML", "LEROY Manon", "Dossier #9", "26 ans", "19/12/1999", "O+", "0341000009", "manon.leroy@email.fr", "Pénicilline"),
        ("DS", "SIMON David", "Dossier #10", "48 ans", "07/04/1977", "AB-", "0341000010", "david.simon@email.fr", None),
    ]

    for i, (initials, name, dossier, age, birth, blood, phone, email, allergy) in enumerate(patients):
        ry = ty + 40 + i * 56
        if i % 2 == 1:
            d.rectangle([content_x + 1, ry, content_x + content_w - 1, ry + 56], fill="#fcfdfe")

        avatar(d, content_x + 16, ry + 10, initials)
        text(d, (content_x + 66, ry + 12), name, FONT_SMALL_BOLD, SLATE_900)
        text(d, (content_x + 66, ry + 30), dossier, FONT_TINY, SLATE_500)

        text(d, (content_x + 266, ry + 12), age, FONT_SMALL, SLATE_900)
        text(d, (content_x + 266, ry + 30), birth, FONT_TINY, SLATE_500)

        text(d, (content_x + 386, ry + 18), blood, FONT_SMALL_BOLD, SLATE_700)

        text(d, (content_x + 486, ry + 12), phone, FONT_TINY, SLATE_700)
        text(d, (content_x + 486, ry + 30), email, FONT_TINY, SLATE_500)

        if allergy:
            badge(d, content_x + 726, ry + 18, allergy, ROSE_600, ROSE_50, font=FONT_TINY)
        else:
            text(d, (content_x + 726, ry + 18), "Aucune connue", FONT_TINY, SLATE_400)

        hairline(d, content_x + 16, ry + 56, content_x + content_w - 16)

    # Pagination
    py = HEIGHT - 74
    text(d, (content_x + 16, py), "1–10 sur 30 résultat(s)", FONT_TINY, SLATE_500)
    for i in range(3):
        bx = content_x + content_w - 200 + i * 34
        fill = BRAND_700 if i == 0 else WHITE
        fg = WHITE if i == 0 else SLATE_600
        d.rounded_rectangle([bx, py - 6, bx + 28, py + 22], radius=6, fill=fill, outline=SLATE_300)
        text(d, (bx + 11, py), str(i + 1), FONT_TINY, fg)

    return img


def screen_roles():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    sidebar(d, "Rôles & permissions")
    topbar(d, "Rôles & permissions",
           "Matrice de contrôle d'accès : chaque case accorde une action précise sur une ressource.")
    brand_button(d, WIDTH - 180, 92, "Enregistrer", w=140)

    content_x = 316
    content_w = WIDTH - content_x - 40

    # Liste des rôles
    list_w = 260
    rounded(d, [content_x, 170, content_x + list_w, HEIGHT - 40], fill=WHITE, outline=SLATE_200)

    roles = [
        ("Super administrateur", 77, True),
        ("Administrateur", 73, True),
        ("Médecin", 23, True),
        ("Infirmier(ère)", 20, True),
        ("Pharmacien(ne)", 16, True),
        ("Réceptionniste", 20, True),
        ("Comptable", 17, True),
        ("Patient", 13, True),
    ]

    for i, (name, count, is_system) in enumerate(roles):
        ry = 182 + i * 40
        is_active = name == "Infirmier(ère)"
        if is_active:
            d.rounded_rectangle([content_x + 4, ry, content_x + list_w - 4, ry + 34], radius=8, fill=BRAND_50)

        # Cadenas pour les rôles système
        if is_system:
            d.rounded_rectangle([content_x + 16, ry + 11, content_x + 26, ry + 21], radius=2,
                                outline=SLATE_400)
            d.arc([content_x + 17, ry + 6, content_x + 25, ry + 16], 180, 360, fill=SLATE_400, width=2)

        text(d, (content_x + 36, ry + 8), name, FONT_BODY_BOLD if is_active else FONT_SMALL,
             BRAND_800 if is_active else SLATE_700)

        badge(d, content_x + list_w - 44, ry + 8, str(count), SLATE_600, SLATE_100)

    # Matrice
    mx = content_x + list_w + 16
    mw = content_w - list_w - 16
    rounded(d, [mx, 170, mx + mw, HEIGHT - 40], fill=WHITE, outline=SLATE_200)

    # En-tête de la matrice
    text(d, (mx + 24, 186), "Infirmier(ère)", FONT_H2, SLATE_900)
    text(d, (mx + 24, 210), "20 permission(s) accordée(s) · code NURSE", FONT_TINY, SLATE_500)
    badge(d, mx + mw - 150, 186, "Rôle système", SLATE_600, SLATE_100)
    hairline(d, mx, 236, mx + mw)

    # En-tête de colonnes
    actions = ["Créer", "Consulter", "Modifier", "Supprimer", "Gérer", "Tout"]
    col_x = mx + 300
    col_w = (mw - 320) // 6
    for i, action in enumerate(actions):
        text(d, (col_x + i * col_w + 8, 252), action, FONT_TINY, SLATE_500)

    hairline(d, mx, 274, mx + mw)

    # Lignes de ressources
    resources = [
        ("Patients", [True, True, True, False, False]),
        ("Médecins", [False, True, False, False, False]),
        ("Spécialités", [False, True, False, False, False]),
        ("Départements", [False, True, False, False, False]),
        ("Rendez-vous", [True, True, True, False, False]),
        ("Consultations", [False, True, False, False, False]),
        ("Ordonnances", [False, True, False, False, False]),
        ("Médicaments", [False, True, False, False, False]),
        ("Stock", [False, True, False, False, False]),
        ("Factures", [False, False, False, False, False]),
        ("Paiements", [False, False, False, False, False]),
        ("Gardes", [False, True, False, False, False]),
        ("Téléconsultations", [False, True, False, False, False]),
        ("Laboratoire", [True, True, True, False, False]),
        ("Journal d'audit", [False, False, False, False, False]),
    ]

    for i, (resource, checks) in enumerate(resources):
        ry = 284 + i * 34
        if i % 2 == 1:
            d.rectangle([mx + 1, ry, mx + mw - 1, ry + 34], fill="#fcfdfe")

        text(d, (mx + 24, ry + 10), resource, FONT_SMALL, SLATE_700)

        for j, checked in enumerate(checks):
            cx = col_x + j * col_w + col_w // 2
            cy = ry + 17
            if checked:
                d.rounded_rectangle([cx - 8, cy - 8, cx + 8, cy + 8], radius=3, fill=BRAND_700)
                d.line([(cx - 4, cy), (cx - 1, cy + 4), (cx + 5, cy - 4)], fill=WHITE, width=2)
            else:
                d.rounded_rectangle([cx - 8, cy - 8, cx + 8, cy + 8], radius=3,
                                    fill=WHITE, outline=SLATE_300)

        # Case « tout »
        cx = col_x + 5 * col_w + col_w // 2
        cy = ry + 17
        d.rounded_rectangle([cx - 8, cy - 8, cx + 8, cy + 8], radius=3, fill=WHITE, outline=SLATE_300)

        hairline(d, mx + 16, ry + 34, mx + mw - 16, SLATE_100)

    return img


def screen_invoice_pdf():
    """Aperçu d'une facture PDF générée."""
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_100)
    d = ImageDraw.Draw(img)

    # Fond « bureau »
    d.rectangle([0, 0, WIDTH, HEIGHT], fill=SLATE_200)

    # Page A4 simulée
    page_w, page_h = 700, 860
    px = (WIDTH - page_w) // 2
    py = 20
    d.rectangle([px, py, px + page_w, py + page_h], fill=WHITE)

    margin = 48
    inner = page_w - margin * 2
    cx = px + margin
    cy = py + margin

    # En-tête : logo + identité
    d.rounded_rectangle([cx, cy, cx + 40, cy + 40], radius=8, fill=BRAND_700)
    tw = d.textbbox((0, 0), "MC", font=FONT_LOGO)[2]
    text(d, (cx + (40 - tw) / 2, cy + 12), "MC", FONT_LOGO, WHITE)

    text(d, (cx + 52, cy - 2), "Clinique MediClinic", FONT_H2, SLATE_900)
    text(d, (cx + 52, cy + 18), "12 avenue de la Santé, 75015 Paris, France", FONT_TINY, SLATE_500)
    text(d, (cx + 52, cy + 32), "Tél. +33 1 45 67 89 00 — contact@mediclinic.fr", FONT_TINY, SLATE_500)

    # Titre du document à droite
    label = "FACTURE FAC-2026-000123"
    tw = d.textbbox((0, 0), label, font=FONT_SMALL_BOLD)[2]
    text(d, (cx + inner - tw, cy + 44), label, FONT_SMALL_BOLD, BRAND_700)

    cy += 66
    d.line([cx, cy, cx + inner, cy], fill=BRAND_700, width=2)
    cy += 24

    # Bloc d'informations
    text(d, (cx, cy), "FACTURATION", FONT_TINY, BRAND_700)
    cy += 18
    d.line([cx, cy, cx + inner, cy], fill=SLATE_200)
    cy += 10

    infos = [
        ("Numéro de facture", "FAC-2026-000123"),
        ("Date d'émission", "14/10/2026"),
        ("Date d'échéance", "13/11/2026"),
        ("Statut", "PAID"),
    ]
    for label, value in infos:
        text(d, (cx, cy), label, FONT_TINY, SLATE_500)
        text(d, (cx + 160, cy), value, FONT_SMALL, SLATE_900)
        cy += 16

    cy += 14
    text(d, (cx, cy), "PATIENT", FONT_TINY, BRAND_700)
    cy += 18
    d.line([cx, cy, cx + inner, cy], fill=SLATE_200)
    cy += 10

    for label, value in [
        ("Nom et prénom", "DURAND Lucie"),
        ("Adresse", "42 rue des Lilas, 75015 Paris"),
        ("Email", "lucie.durand@email.fr"),
    ]:
        text(d, (cx, cy), label, FONT_TINY, SLATE_500)
        text(d, (cx + 160, cy), value, FONT_SMALL, SLATE_900)
        cy += 16

    cy += 14
    text(d, (cx, cy), "DÉTAIL DES PRESTATIONS", FONT_TINY, BRAND_700)
    cy += 18

    # Tableau
    d.rectangle([cx, cy, cx + inner, cy + 22], fill=SLATE_50)
    text(d, (cx + 8, cy + 5), "LIBELLÉ", FONT_TINY, SLATE_900)
    text(d, (cx + 380, cy + 5), "QTÉ", FONT_TINY, SLATE_900)
    text(d, (cx + 440, cy + 5), "PRIX UNITAIRE", FONT_TINY, SLATE_900)
    text(d, (cx + 570, cy + 5), "TOTAL HT", FONT_TINY, SLATE_900)
    cy += 22
    d.line([cx, cy, cx + inner, cy], fill=SLATE_200)

    lines = [
        ("Consultation Cardiologie — Dr Haddad", "1", "70,00 €", "70,00 €"),
        ("Électrocardiogramme de repos", "1", "35,00 €", "35,00 €"),
    ]
    for label, qty, unit, total in lines:
        cy += 6
        text(d, (cx + 8, cy), label, FONT_SMALL, SLATE_900)
        text(d, (cx + 388, cy), qty, FONT_SMALL, SLATE_900)
        text(d, (cx + 440, cy), unit, FONT_SMALL, SLATE_900)
        text(d, (cx + 570, cy), total, FONT_SMALL, SLATE_900)
        cy += 16
        d.line([cx, cy, cx + inner, cy], fill=SLATE_200)

    # Totaux
    cy += 20
    totals_x = cx + 380
    for label, value, strong in [
        ("Total HT", "105,00 €", False),
        ("TVA (20,00 %)", "21,00 €", False),
        ("Total TTC", "126,00 €", True),
        ("Montant payé", "126,00 €", False),
        ("Solde dû", "0,00 €", True),
    ]:
        font = FONT_SMALL_BOLD if strong else FONT_SMALL
        color = SLATE_900 if strong else SLATE_500
        text(d, (totals_x, cy), label, font, color)
        tw = d.textbbox((0, 0), value, font=font)[2]
        text(d, (cx + inner - tw, cy), value, font, color)
        cy += 18

    # Pied de page
    fy = py + page_h - 52
    d.line([cx, fy, cx + inner, fy], fill=SLATE_200)
    text(d, (cx, fy + 8), "Page 1 / 1", FONT_TINY, SLATE_500)
    mid = "Édité le 18/11/2026 12:30"
    mw = d.textbbox((0, 0), mid, font=FONT_TINY)[2]
    text(d, (cx + (inner - mw) / 2, fy + 8), mid, FONT_TINY, SLATE_500)
    right = "Document confidentiel — usage médical"
    rw = d.textbbox((0, 0), right, font=FONT_TINY)[2]
    text(d, (cx + inner - rw, fy + 8), right, FONT_TINY, SLATE_500)

    return img


def screen_patient_dashboard():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    # En-tête espace patient
    d.rectangle([0, 0, WIDTH, 68], fill=WHITE)
    d.line([0, 68, WIDTH, 68], fill=SLATE_200)
    logo_mark(d, 80, 16, 34)
    text(d, (124, 24), "MediClinic — Mon espace", FONT_H2, SLATE_900)

    avatar(d, WIDTH - 90, 15, "LD")
    text(d, (WIDTH - 200, 26), "Lucie", FONT_SMALL_BOLD, SLATE_700)

    # Onglets
    tabs = ["Mon tableau de bord", "Mes rendez-vous", "Mon dossier médical",
            "Mes ordonnances", "Mes factures", "Mes téléconsultations", "Mon profil"]
    d.rectangle([0, 68, WIDTH, 112], fill=WHITE)
    d.line([0, 112, WIDTH, 112], fill=SLATE_200)
    for i, tab in enumerate(tabs):
        x = 80 + i * 178
        active = i == 0
        color = BRAND_700 if active else SLATE_500
        text(d, (x, 86), tab, FONT_SMALL_BOLD if active else FONT_SMALL, color)
        if active:
            d.line([x, 110, x + d.textbbox((0, 0), tab, font=FONT_SMALL_BOLD)[2], 110],
                   fill=BRAND_600, width=2)

    content_x = 80
    content_w = WIDTH - 160

    text(d, (content_x, 140), "Bonjour Lucie", FONT_TITLE, SLATE_900)
    text(d, (content_x, 178), "Dossier n° 1 — Lucie Durand", FONT_SMALL, SLATE_500)
    brand_button(d, WIDTH - 280, 146, "Prendre rendez-vous", w=200)

    # Indicateurs
    kpis = [
        ("Rendez-vous à venir", "2"),
        ("Ordonnances", "5"),
        ("Factures à régler", "1"),
        ("Téléconsultations", "1"),
    ]
    card_w = (content_w - 3 * 16) // 4
    for i, (label, value) in enumerate(kpis):
        cx = content_x + i * (card_w + 16)
        kpi_card(d, cx, 214, card_w, 108, label, value)

    # Prochain rendez-vous
    rounded(d, [content_x, 344, content_x + content_w, 448], fill=WHITE, outline=SLATE_200)
    text(d, (content_x + 24, 362), "Prochain rendez-vous", FONT_H2, SLATE_900)
    text(d, (content_x + 24, 392), "01/12/2026 10:30", FONT_H1, SLATE_900)
    text(d, (content_x + 24, 422), "Dr Amine Haddad · Cardiologie", FONT_SMALL, SLATE_600)
    badge(d, content_x + content_w - 130, 392, "Confirmé", SKY_600, SKY_50)

    # Deux colonnes
    col_w = (content_w - 16) // 2
    by = 468

    # Ordonnances
    rounded(d, [content_x, by, content_x + col_w, by + 240], fill=WHITE, outline=SLATE_200)
    text(d, (content_x + 24, by + 20), "Ordonnances récentes", FONT_H2, SLATE_900)

    prescriptions = [
        ("Ordonnance #12", "Dr Amine Haddad · 14/10/2026", "Dispensée", EMERALD_600, EMERALD_50),
        ("Ordonnance #9", "Dr Élodie Marchand · 02/10/2026", "Émise", SKY_600, SKY_50),
        ("Ordonnance #5", "Dr Thomas Girard · 18/09/2026", "Dispensée", EMERALD_600, EMERALD_50),
        ("Ordonnance #2", "Dr Karim Benali · 05/09/2026", "Émise", SKY_600, SKY_50),
    ]
    for i, (title, sub, status, fg, bg) in enumerate(prescriptions):
        ry = by + 56 + i * 46
        text(d, (content_x + 24, ry), title, FONT_SMALL_BOLD, SLATE_900)
        text(d, (content_x + 24, ry + 18), sub, FONT_TINY, SLATE_500)
        badge(d, content_x + col_w - 110, ry + 6, status, fg, bg)
        hairline(d, content_x + 24, ry + 38, content_x + col_w - 24, SLATE_100)

    # Factures
    fx = content_x + col_w + 16
    rounded(d, [fx, by, fx + col_w, by + 240], fill=WHITE, outline=SLATE_200)
    text(d, (fx + 24, by + 20), "Factures", FONT_H2, SLATE_900)

    invoices = [
        ("FAC-2026-00012", "Échéance 13/11/2026", "126,00 €", "Payée", EMERALD_600, EMERALD_50),
        ("FAC-2026-00009", "Échéance 01/11/2026", "95,00 €", "Partiellement payée", AMBER_700, AMBER_50),
        ("FAC-2026-00005", "Échéance 18/10/2026", "70,00 €", "Payée", EMERALD_600, EMERALD_50),
        ("FAC-2026-00002", "Échéance 05/10/2026", "45,00 €", "Payée", EMERALD_600, EMERALD_50),
    ]
    for i, (num, due, amount, status, fg, bg) in enumerate(invoices):
        ry = by + 56 + i * 46
        text(d, (fx + 24, ry), num, FONT_SMALL_BOLD, SLATE_900)
        text(d, (fx + 24, ry + 18), due, FONT_TINY, SLATE_500)
        tw = d.textbbox((0, 0), amount, font=FONT_SMALL_BOLD)[2]
        text(d, (fx + col_w - 24 - tw, ry), amount, FONT_SMALL_BOLD, SLATE_900)
        bw = d.textbbox((0, 0), status, font=FONT_TINY)[2]
        badge(d, fx + col_w - 24 - bw - 20, ry + 20, status, fg, bg)
        hairline(d, fx + 24, ry + 38, fx + col_w - 24, SLATE_100)

    return img


def screen_shifts():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    sidebar(d, "Planning des gardes")
    topbar(d, "Planning des gardes",
           "Organisation des gardes de jour, de nuit et des astreintes par département.")
    brand_button(d, WIDTH - 340, 92, "Planning PDF", w=150, bg=WHITE, fg=SLATE_700)
    brand_button(d, WIDTH - 180, 92, "Nouvelle garde", w=140)

    content_x = 316
    content_w = WIDTH - content_x - 40

    # Navigation mensuelle
    rounded(d, [content_x, 170, content_x + content_w, 216], fill=WHITE, outline=SLATE_200)
    text(d, (content_x + 20, 185), "‹", FONT_H2, SLATE_600)
    title = "novembre 2026"
    tw = d.textbbox((0, 0), title, font=FONT_BODY_BOLD)[2]
    text(d, (content_x + 50, 186), title, FONT_BODY_BOLD, SLATE_900)
    text(d, (content_x + 170, 185), "›", FONT_H2, SLATE_600)
    text(d, (content_x + 200, 188), "Aujourd'hui", FONT_SMALL, SLATE_600)
    text(d, (content_x + content_w - 240, 188), "15 garde(s) sur la période", FONT_TINY, SLATE_500)

    # Calendrier
    cal_y = 232
    rounded(d, [content_x, cal_y, content_x + content_w, HEIGHT - 40], fill=WHITE, outline=SLATE_200)

    # En-tête des jours
    days = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]
    cell_w = content_w // 7
    d.rectangle([content_x + 1, cal_y + 1, content_x + content_w - 1, cal_y + 36], fill=SLATE_50)
    for i, day in enumerate(days):
        tw = d.textbbox((0, 0), day, font=FONT_TINY)[2]
        text(d, (content_x + i * cell_w + (cell_w - tw) / 2, cal_y + 12), day, FONT_TINY, SLATE_500)

    d.line([content_x, cal_y + 36, content_x + content_w, cal_y + 36], fill=SLATE_200)

    # Grille : novembre 2026 commence un dimanche → 6 cases vides
    # (0 = lundi dans notre grille)
    first_offset = 5  # samedi 1er novembre 2026
    days_in_month = 30
    cell_h = 72

    # Couleurs par médecin
    doctor_colors = [
        ("Haddad", "#0f766e"), ("Marchand", "#2563eb"), ("Benali", "#7c3aed"),
        ("Roussel", "#db2777"), ("Girard", "#ea580c"), ("Idrissi", "#ca8a04"),
        ("Petit", "#0891b2"), ("Lambert", "#4d7c0f"),
    ]

    shifts_by_day = {
        1: [("08:00 Haddad", 0)], 2: [("18:00 Girard", 4)], 3: [("08:00 Benali", 2)],
        4: [("08:00 Roussel", 3), ("18:00 Petit", 6)], 5: [("08:00 Girard", 4)],
        6: [("08:00 Marchand", 1)], 7: [("08:00 Idrissi", 5)],
        9: [("18:00 Benali", 2)], 10: [("08:00 Lambert", 7)],
        11: [("08:00 Haddad", 0)], 12: [("08:00 Roussel", 3)],
        13: [("18:00 Girard", 4)], 16: [("08:00 Benali", 2)],
        17: [("08:00 Marchand", 1)], 18: [("08:00 Benali", 2), ("16:00 Girard", 4)],
        19: [("08:00 Haddad", 0)], 20: [("18:00 Roussel", 3)],
        23: [("08:00 Petit", 6)], 24: [("08:00 Idrissi", 5)],
        25: [("08:00 Lambert", 7)], 26: [("18:00 Benali", 2)],
        27: [("08:00 Haddad", 0)],
    }

    for index in range(35):
        col = index % 7
        row = index // 7
        cx = content_x + col * cell_w
        cy = cal_y + 36 + row * cell_h

        if row > 0:
            d.line([cx, cy, cx + cell_w, cy], fill=SLATE_100)
        if col > 0:
            d.line([cx, cy, cx, cy + cell_h], fill=SLATE_100)

        day_number = index - first_offset + 1
        if day_number < 1 or day_number > days_in_month:
            continue

        is_today = day_number == 18
        if is_today:
            d.ellipse([cx + 8, cy + 6, cx + 26, cy + 24], fill=BRAND_700)
            text(d, (cx + 13, cy + 9), str(day_number), FONT_TINY, WHITE)
        else:
            text(d, (cx + 8, cy + 6), str(day_number), FONT_TINY, SLATE_600)

        for j, (label, color_index) in enumerate(shifts_by_day.get(day_number, [])):
            sy = cy + 30 + j * 18
            d.rounded_rectangle([cx + 4, sy, cx + cell_w - 4, sy + 15], radius=3,
                                fill=doctor_colors[color_index][1])
            text(d, (cx + 9, sy + 2), label, FONT_TINY, WHITE)

    return img


def screen_audit():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    sidebar(d, "Journal d'audit")
    topbar(d, "Journal d'audit",
           "Traçabilité de toutes les actions sensibles : qui a fait quoi, quand, et depuis quelle adresse.")

    content_x = 316
    content_w = WIDTH - content_x - 40

    # Indicateurs
    kpis = [("Entrées totales", "30"), ("Connexions suivies", "10"), ("Suppressions", "3")]
    card_w = (content_w - 2 * 16) // 3
    for i, (label, value) in enumerate(kpis):
        cx = content_x + i * (card_w + 16)
        kpi_card(d, cx, 170, card_w, 100, label, value)

    # Filtres
    fy = 288
    rounded(d, [content_x, fy, content_x + content_w, fy + 70], fill=WHITE, outline=SLATE_200)
    filters = [
        ("Nom d'utilisateur…", 220), ("Toutes les ressources", 190),
        ("Toutes les actions", 180), ("jj/mm/aaaa", 150), ("jj/mm/aaaa", 150),
    ]
    fx = content_x + 16
    for placeholder, width in filters:
        d.rounded_rectangle([fx, fy + 20, fx + width - 12, fy + 52], radius=8,
                            fill=WHITE, outline=SLATE_300)
        text(d, (fx + 12, fy + 29), placeholder, FONT_TINY, SLATE_400)
        fx += width

    # Tableau
    ty = 376
    rounded(d, [content_x, ty, content_x + content_w, HEIGHT - 40], fill=WHITE, outline=SLATE_200)

    columns = [("Horodatage", 170), ("Utilisateur", 250), ("Action", 190), ("Ressource", 160), ("Détails", 80)]
    table_header(d, content_x, ty, content_w, columns)

    entries = [
        ("18/11 09:12:04", "Sophie Bernard", "192.168.1.24", "Création", EMERALD_600, EMERALD_50, "patient", "#7", True),
        ("18/11 09:08:31", "Emma Gautier", "10.0.0.15", "Création", EMERALD_600, EMERALD_50, "appointment", "#141", False),
        ("18/11 08:55:12", "Sophie Bernard", "192.168.1.24", "Connexion réussie", BRAND_700, BRAND_50, "auth", "#1", False),
        ("18/11 08:54:58", "Paul Mercier", "127.0.0.1", "Dispensation", AMBER_700, AMBER_50, "prescription", "#12", True),
        ("18/11 08:42:20", "Hugo Charpentier", "10.0.0.15", "Modification", SKY_600, SKY_50, "invoice", "#12", False),
        ("18/11 08:30:07", "Inconnu", "203.0.113.42", "Échec de connexion", ROSE_600, ROSE_50, "auth", "—", False),
        ("17/11 17:21:44", "Amine Haddad", "192.168.1.31", "Création", EMERALD_600, EMERALD_50, "consultation", "#40", False),
        ("17/11 16:08:19", "Sophie Bernard", "192.168.1.24", "Approbation", EMERALD_600, EMERALD_50, "meeting", "#3", False),
        ("17/11 15:44:02", "Paul Mercier", "127.0.0.1", "Ajustement de stock", AMBER_700, AMBER_50, "stock", "#38", False),
        ("17/11 14:12:38", "Lucie Durand", "10.0.0.22", "Accès PDF", SLATE_600, SLATE_100, "invoice", "#9", False),
        ("17/11 11:30:55", "Nadia Belkacem", "10.0.0.16", "Modification", SKY_600, SKY_50, "payment", "#5", False),
        ("17/11 09:02:11", "Sophie Bernard", "192.168.1.24", "Suppression", ROSE_600, ROSE_50, "appointment", "#203", False),
    ]

    for i, (ts, user, ip, action, afg, abg, resource, rid, expandable) in enumerate(entries):
        ry = ty + 40 + i * 42

        text(d, (content_x + 16, ry + 13), ts, FONT_TINY, SLATE_600)

        text(d, (content_x + 186, ry + 6), user, FONT_SMALL, SLATE_900)
        text(d, (content_x + 186, ry + 23), ip, FONT_TINY, SLATE_400)

        badge(d, content_x + 436, ry + 12, action, afg, abg)

        text(d, (content_x + 626, ry + 6), resource, FONT_SMALL, SLATE_700)
        text(d, (content_x + 626, ry + 23), rid, FONT_TINY, SLATE_400)

        if expandable:
            text(d, (content_x + content_w - 40, ry + 12), "›", FONT_H2, SLATE_400)

        hairline(d, content_x + 16, ry + 42, content_x + content_w - 16, SLATE_100)

    return img


def screen_booking():
    img = Image.new("RGB", (WIDTH, HEIGHT), SLATE_50)
    d = ImageDraw.Draw(img)

    # En-tête public
    d.rectangle([0, 0, WIDTH, 68], fill=WHITE)
    d.line([0, 68, WIDTH, 68], fill=SLATE_200)
    logo_mark(d, 80, 16, 34)
    text(d, (124, 24), "MediClinic", FONT_H2, SLATE_900)
    text(d, (WIDTH - 160, 26), "Se connecter", FONT_BODY_BOLD, BRAND_700)

    content_x = 80
    content_w = WIDTH - 160

    text(d, (content_x, 100), "Prendre rendez-vous", FONT_TITLE, SLATE_900)
    text(d, (content_x, 140), "Trois étapes : choisissez votre praticien, votre créneau, puis renseignez vos coordonnées.",
         FONT_BODY, SLATE_600)

    # Étapes
    steps = [("1", "Praticien", True), ("2", "Créneau", True), ("3", "Coordonnées", False)]
    for i, (num, label, done) in enumerate(steps):
        sx = content_x + i * 220
        fill = BRAND_700 if done else SLATE_200
        fg = WHITE if done else SLATE_500
        d.ellipse([sx, 176, sx + 28, 204], fill=fill)
        tw = d.textbbox((0, 0), num, font=FONT_TINY)[2]
        text(d, (sx + (28 - tw) / 2, 184), num, FONT_TINY, fg)
        text(d, (sx + 40, 184), label, FONT_SMALL_BOLD if done else FONT_SMALL,
             SLATE_900 if done else SLATE_400)
        if i < 2:
            d.line([sx + 28, 190, sx + 210, 190], fill=SLATE_200)

    # Carte principale
    card_y = 226
    main_w = 820
    rounded(d, [content_x, card_y, content_x + main_w, HEIGHT - 60], fill=WHITE, outline=SLATE_200)
    text(d, (content_x + 28, card_y + 24), "Choisissez votre créneau", FONT_H2, SLATE_900)

    # Date
    text(d, (content_x + 28, card_y + 66), "Date souhaitée", FONT_SMALL_BOLD, SLATE_700)
    d.rounded_rectangle([content_x + 28, card_y + 88, content_x + 300, card_y + 128], radius=8,
                        fill=WHITE, outline=SLATE_300)
    text(d, (content_x + 42, card_y + 100), "21/11/2026", FONT_BODY, SLATE_900)

    brand_button(d, content_x + 320, card_y + 88, "‹ Veille", w=120, bg=WHITE, fg=SLATE_700)
    brand_button(d, content_x + 452, card_y + 88, "Lendemain ›", w=140, bg=WHITE, fg=SLATE_700)

    # Créneaux
    text(d, (content_x + 28, card_y + 152), "14 créneau(x) disponible(s) le 21/11/2026",
         FONT_TINY, SLATE_500)

    slots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
             "11:00", "11:30", "14:00", "14:30", "15:00", "15:30",
             "16:00", "16:30"]
    selected = "10:30"

    for i, slot in enumerate(slots):
        col = i % 5
        row = i // 5
        sx = content_x + 28 + col * 152
        sy = card_y + 178 + row * 52
        is_selected = slot == selected
        fill = BRAND_700 if is_selected else WHITE
        fg = WHITE if is_selected else SLATE_700
        outline = BRAND_700 if is_selected else SLATE_200
        d.rounded_rectangle([sx, sy, sx + 140, sy + 40], radius=8, fill=fill, outline=outline)
        tw = d.textbbox((0, 0), slot, font=FONT_BODY_BOLD)[2]
        text(d, (sx + (140 - tw) / 2, sy + 11), slot, FONT_BODY_BOLD, fg)

    # Motif
    text(d, (content_x + 28, card_y + 358), "Motif de consultation (facultatif)", FONT_SMALL_BOLD, SLATE_700)
    d.rounded_rectangle([content_x + 28, card_y + 380, content_x + main_w - 28, card_y + 452],
                        radius=8, fill=WHITE, outline=SLATE_300)
    text(d, (content_x + 42, card_y + 394), "Décrivez brièvement la raison de votre visite…",
         FONT_BODY, SLATE_400)

    # Navigation
    d.line([content_x + 28, card_y + 478, content_x + main_w - 28, card_y + 478], fill=SLATE_200)
    brand_button(d, content_x + 28, card_y + 496, "‹ Précédent", w=140, bg=WHITE, fg=SLATE_700)
    brand_button(d, content_x + main_w - 168, card_y + 496, "Continuer ›", w=140)

    # Récapitulatif
    rx = content_x + main_w + 24
    rw = content_w - main_w - 24
    rounded(d, [rx, card_y, rx + rw, card_y + 320], fill=WHITE, outline=SLATE_200)
    text(d, (rx + 24, card_y + 22), "Récapitulatif", FONT_H2, SLATE_900)

    items = [
        ("Praticien", "Dr Amine Haddad", "Cardiologie"),
        ("Date", "21/11/2026", None),
        ("Heure", "10:30", None),
        ("Type", "Présentiel", None),
    ]
    iy = card_y + 60
    for label, value, sub in items:
        d.ellipse([rx + 24, iy + 3, rx + 32, iy + 11], fill=SLATE_300)
        text(d, (rx + 44, iy - 4), label, FONT_TINY, SLATE_500)
        text(d, (rx + 44, iy + 12), value, FONT_SMALL_BOLD, SLATE_900)
        if sub:
            text(d, (rx + 44, iy + 28), sub, FONT_TINY, SLATE_500)
        iy += 56 if sub else 44

    d.line([rx + 24, card_y + 268, rx + rw - 24, card_y + 268], fill=SLATE_200)
    text(d, (rx + 24, card_y + 280), "Tarif consultation", FONT_SMALL, SLATE_500)
    tw = d.textbbox((0, 0), "70,00 €", font=FONT_BODY_BOLD)[2]
    text(d, (rx + rw - 24 - tw, card_y + 278), "70,00 €", FONT_BODY_BOLD, SLATE_900)
    text(d, (rx + 24, card_y + 300), "Remboursable par la Sécurité sociale.", FONT_TINY, SLATE_400)

    return img


# --------------------------------------------------------------------------- #
# Exécution
# --------------------------------------------------------------------------- #

SCREENS = [
    ("01-accueil.png", screen_home,
     "Page d'accueil publique : bannière, chiffres clés, services et spécialités"),
    ("02-connexion.png", screen_login,
     "Connexion : formulaire et rappel des comptes de démonstration"),
    ("03-prise-rdv.png", screen_booking,
     "Assistant de prise de rendez-vous : sélection du créneau et récapitulatif"),
    ("04-dashboard-admin.png", screen_dashboard,
     "Tableau de bord : 6 indicateurs, courbe de CA, répartition et alertes"),
    ("05-patients.png", screen_patients,
     "Liste des patients avec recherche, filtres et pagination"),
    ("06-roles-permissions.png", screen_roles,
     "Matrice RBAC : 21 ressources × 5 actions, rôle Infirmier(ère) sélectionné"),
    ("07-facture-pdf.png", screen_invoice_pdf,
     "Aperçu de la facture PDF : en-tête, lignes, totaux et pied de page numéroté"),
    ("08-espace-patient.png", screen_patient_dashboard,
     "Espace patient : prochain rendez-vous, ordonnances et factures"),
    ("09-planning-gardes.png", screen_shifts,
     "Planning mensuel des gardes, coloré par médecin"),
    ("10-journal-audit.png", screen_audit,
     "Journal d'audit : horodatage, utilisateur, IP, action et ressource"),
]


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Génération de {len(SCREENS)} visuels dans {OUTPUT_DIR}\n")

    for filename, generator, description in SCREENS:
        image = generator()
        target = OUTPUT_DIR / filename
        image.save(target, "PNG", optimize=True)
        size_kb = target.stat().st_size / 1024
        print(f"  OK  {filename:<30} {size_kb:>6.1f} Ko — {description}")

    print(f"\n{len(SCREENS)} visuels générés.")


if __name__ == "__main__":
    main()
