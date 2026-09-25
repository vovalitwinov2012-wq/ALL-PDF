"""Фирменные картинки ALL PDF с типографикой (требуется Pillow).
Запуск: python scripts/gen-brand.py
Файлы НЕ коммитятся (brand/ в .gitignore).
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ARIAL = r"C:\Windows\Fonts\arialbd.ttf"
INDIGO = (99, 102, 241)
VIOLET = (168, 85, 247)
FUCHSIA = (217, 70, 239)
INK = (30, 27, 75)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def v_grad(w, h, stops):
    """Диагональный градиент через маленький холст + resize (быстро и гладко)."""
    if len(stops) == 2:
        stops = [stops[0], stops[1], stops[1]]
    small = Image.new("RGB", (256, 256))
    px = small.load()
    for y in range(256):
        for x in range(256):
            t = (x + y) / 510
            if t < 0.5:
                c = lerp(stops[0], stops[1], t * 2)
            else:
                c = lerp(stops[1], stops[2], (t - 0.5) * 2)
            px[x, y] = c
    return small.resize((w, h), Image.BILINEAR)


def glow(base, cx, cy, r, alpha=48):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(r // 3))
    base.alpha_composite(layer)


def tracked_text(draw, xy, text, font, fill, tracking=0):
    """Текст с межбуквенным интервалом, возвращает ширину."""
    x, y = xy
    widths = []
    for ch in text:
        bbox = draw.textbbox((0, 0), ch, font=font)
        w = bbox[2] - bbox[0]
        widths.append(w)
    total = sum(widths) + tracking * (len(text) - 1)
    x -= total // 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking
    return total


def gradient_text(size, text, font, stops):
    """Текст с градиентной заливкой: белая маска + градиент."""
    tmp = Image.new("L", (10, 10))
    d = ImageDraw.Draw(tmp)
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0] + 20, bbox[3] - bbox[1] + 20
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.text((10 - bbox[0], 10 - bbox[1]), text, font=font, fill=255)
    grad = v_grad(w, h, stops).convert("RGBA")
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(grad, (0, 0), mask)
    return out


def card(base, x0, y0, x1, y1, radius):
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.rounded_rectangle([x0, y0 + 14, x1, y1 + 14], radius, fill=(20, 10, 60, 110))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(shadow)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([x0, y0, x1, y1], radius, fill=(255, 255, 255, 255))
    # лёгкий глянец сверху
    gloss = Image.new("RGBA", base.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(gloss)
    g.rounded_rectangle([x0, y0, x1, y0 + (y1 - y0) // 3], radius, fill=(255, 255, 255, 26))
    g.rectangle([x0, y0 + (y1 - y0) // 3 - radius, x1, y0 + (y1 - y0) // 3], fill=(255, 255, 255, 26))
    base.alpha_composite(gloss)


def mini_doc(base, cx, cy, w, h, angle, alpha=235):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], int(w * 0.16), fill=(255, 255, 255, alpha))
    d = ImageDraw.Draw(layer)
    bw = int(w * 0.55)
    for i, yy in enumerate([cy - h // 5, cy, cy + h // 5]):
        ww = bw if i < 2 else int(bw * 0.6)
        d.rectangle([cx - ww // 2, yy - 3, cx + ww // 2, yy + 3], fill=INDIGO + (alpha,))
    layer = layer.rotate(angle, resample=Image.BICUBIC, center=(cx, cy))
    base.alpha_composite(layer)


def halo(base, cx, cy, r, alpha=70):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(r // 2))
    base.alpha_composite(layer)


def compose(w, h, card_w, card_h, all_size, pdf_size, tag_size, tag_text):
    base = v_grad(w, h, [INDIGO, VIOLET, FUCHSIA]).convert("RGBA")
    glow(base, int(w * 0.12), int(h * 0.1), int(min(w, h) * 0.35), 40)
    glow(base, int(w * 0.9), int(h * 0.92), int(min(w, h) * 0.4), 36)
    cx, cy = w // 2, h // 2
    halo(base, cx, cy, int(max(card_w, card_h) * 0.75))
    # парящие мини-карточки по бокам (внутри circle-safe зоны)
    m = min(w, h)
    mini_doc(base, int(cx - card_w * 0.58), int(cy - card_h * 0.28), int(m * 0.13), int(m * 0.17), -12)
    mini_doc(base, int(cx + card_w * 0.58), int(cy + card_h * 0.3), int(m * 0.11), int(m * 0.15), 10)
    x0, y0 = cx - card_w // 2, cy - card_h // 2
    card(base, x0, y0, x0 + card_w, y0 + card_h, int(card_w * 0.14))

    d = ImageDraw.Draw(base)
    f_all = ImageFont.truetype(ARIAL, all_size)
    f_pdf = ImageFont.truetype(ARIAL, pdf_size)

    # ALL — с трекингом, приглушённый индиго
    ab = d.textbbox((0, 0), "ALL", font=f_all)
    ah = ab[3] - ab[1]
    ay = y0 + int(card_h * 0.1)
    tracked_text(d, (cx, ay), "ALL", f_all, INK + (255,), tracking=int(all_size * 0.35))

    # PDF — крупный градиентный
    pdf_img = gradient_text(10, "PDF", f_pdf, [INDIGO, VIOLET])
    px = cx - pdf_img.width // 2
    py = ay + ah + int(card_h * 0.04)
    base.alpha_composite(pdf_img, (px, py))

    # акцентная черта под PDF
    bw = int(card_w * 0.4)
    by = py + pdf_img.height + int(card_h * 0.04)
    d2 = ImageDraw.Draw(base)
    d2.rounded_rectangle([cx - bw // 2, by, cx + bw // 2, by + max(6, card_h // 40)], 999, fill=VIOLET + (255,))

    # слоган — с автоподбором размера под ширину карточки
    if tag_text:
        tsize = tag_size
        while tsize > 10:
            f_tag = ImageFont.truetype(ARIAL, tsize)
            tw = sum(d2.textbbox((0, 0), ch, font=f_tag)[2] for ch in tag_text) + int(tsize * 0.22) * (len(tag_text) - 1)
            if tw <= card_w * 0.86:
                break
            tsize -= 1
        tracked_text(d2, (cx, by + max(6, card_h // 40) + int(card_h * 0.05)), tag_text, f_tag, (90, 90, 140, 255), tracking=int(tsize * 0.22))
    return base.convert("RGB")


import os
os.makedirs("brand", exist_ok=True)
# Канал: квадрат, всё важное в центре (Telegram обрежет в круг)
compose(640, 640, 400, 450, 48, 168, 24, "19 ИНСТРУМЕНТОВ • БЕСПЛАТНО").save("brand/telegram-channel-640x640.png")
# Баннер приложения 640x360
compose(640, 360, 330, 290, 30, 116, 19, "19 ИНСТРУМЕНТОВ • БЕСПЛАТНО").save("brand/app-banner-640x360.png")
print("brand done")
