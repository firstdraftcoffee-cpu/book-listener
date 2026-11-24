#!/usr/bin/env python3
"""Generates synthetic test manuscripts (the real manuscript never leaves Ger's device, so tests use made-up prose)."""
import random, zipfile, os, sys, textwrap
from reportlab.lib.pagesizes import A5
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, PageBreak, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.pdfbase.pdfmetrics import registerFontFamily

OUT = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures')
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(1916)

NAMES = ['Siobhán Ní Bhriain', 'Colm Ó Dubhghaill', 'Aoife Gallagher', 'Tadhg Murphy', 'Niamh Brennan', 'Dr. Séamus Ó Súilleabháin',
         'Mrs. Gráinne Walsh', 'Fr. Pádraig Healy', 'Ciarán Doyle', 'Róisín Kavanagh', 'Mr. Oisín Byrne']
PLACES = ['Dún Laoghaire', 'Ennistymon', 'Cobh', 'Dingle', 'Kinsale', 'Youghal', 'Portlaoise', 'Malahide', 'Grafton Street', 'Temple Bar', 'Kilkenny', 'Skellig Michael']
YEARS = ['1916', '1798', '1845', '1922', '1963', '1887', '2008', '1759', '1649']
MONEY = ['£2.50', '€3.50', '£120', '€4', '5s 6d', '£1,200']
OPEN = ['In {y}, {n} arrived in {p} with little more than a sack of green beans and a letter of introduction.',
        'On 24 November {y}, {n} wrote that the roasting in {p} had "never been darker, nor more honest".',
        'By the {c}th century, the trade in {p} was worth {m} a year, or so the ledgers claimed.',
        '"We shall not see its like again," said {n}, pouring a cup at 4:45 pm.',
        '{n} walked from {p} to the quay, counting the coffee houses on the way — nine, by the end.',
        'It cost {m}, which in {y} was a considerable sum, and {n} paid it without complaint.',
        'Nobody in {p} remembered who had first brought the roaster over, though {n} insisted it was an uncle.',
        'The 1920s changed everything, and by {y} the old customers were gone; only {n} still remembered them.']
MID = ['The beans were sorted by hand, one sack after another, until the light failed.',
       'Few records survive, and those that do contradict one another in small and maddening ways.',
       'It was, everyone agreed, a quiet sort of revolution, conducted over cups and saucers.',
       'The cups were small. The talk was not.',
       'Prices rose and fell with the weather in Brazil, which nobody in the shop had ever seen.',
       'She kept the accounts in a green notebook, and later in a drawer, and eventually in the memory of her grandchildren.',
       'They argued about the grind, the water, the roast, and, most of all, about who should pay.',
       'Dublin, as ever, had opinions.']

def sentence():
    r = rnd.random()
    if r < .45:
        return rnd.choice(OPEN).format(y=rnd.choice(YEARS), n=rnd.choice(NAMES), p=rnd.choice(PLACES), m=rnd.choice(MONEY), c=rnd.choice([18, 19, 20, 21]))
    return rnd.choice(MID)

def paragraph(minS=3, maxS=7):
    return ' '.join(sentence() for _ in range(rnd.randint(minS, maxS)))

def chapter_titles(n):
    base = ['The First Cup', 'Smoke Over the Liffey', 'A Letter from Cork', 'The Roasters of Kerry', 'War and Water', 'Tea Wins the Day',
            'The Quiet Years', 'Instant Gratification', 'Espresso Arrives', 'A Dublin Education', 'Beans on the Atlantic', 'The Long Way Home']
    return [f'Chapter {i+1}: {base[i % len(base)]}' for i in range(n)]

def make_text(words, chapters):
    parts = ['A History of Coffee in Ireland (test manuscript)', '', 'Contents', 'Dedication', '']
    per = words // chapters
    for t in chapter_titles(chapters):
        parts += ['', t, '']
        w = 0
        while w < per:
            p = paragraph()
            parts.append(p); parts.append('')
            w += len(p.split())
    parts += ['', 'Bibliography', '', 'Murphy, T. (1999). Beans of the Atlantic. Cork: Atrium Press.', 'Walsh, G. (2004). The Quiet Years. Dublin: Liffey Books.', '', 'Index', '', 'Cobh, 12, 45', 'Dingle, 33, 98', '']
    return '\n'.join(parts)

def write(name, data, mode='w'):
    p = os.path.join(OUT, name)
    with open(p, mode, **({} if 'b' in mode else {'encoding': 'utf-8'})) as f:
        f.write(data)
    return p

def make_pdf(path, words, chapters, outline):
    from reportlab.lib.units import mm
    styles = {
        'body': ParagraphStyle('body', fontName='Times-Roman', fontSize=10.5, leading=14, alignment=TA_JUSTIFY, firstLineIndent=14, hyphenationLang='en_GB', embeddedHyphenation=1, uriWasteReduce=0.3),
        'h1': ParagraphStyle('h1', fontName='Times-Bold', fontSize=20, leading=26, spaceAfter=14, spaceBefore=40),
    }
    notes = {}
    def deco(c, d):
        c.saveState()
        c.setFont('Times-Italic', 8)
        c.drawString(15*mm, A5[1]-10*mm, 'A History of Coffee in Ireland' if c.getPageNumber() % 2 else 'Ger O’Donohoe')
        c.setFont('Times-Roman', 9)
        c.drawCentredString(A5[0]/2, 9*mm, str(c.getPageNumber()))
        if c.getPageNumber() % 7 == 3:
            c.setFont('Times-Roman', 7)
            c.drawString(15*mm, 19*mm, f'{c.getPageNumber()//7+1} See Murphy, Beans of the Atlantic, p. 45.')
        c.restoreState()
    doc = BaseDocTemplate(path, pagesize=A5, leftMargin=15*mm, rightMargin=15*mm, topMargin=18*mm, bottomMargin=24*mm, title='A History of Coffee in Ireland', author='Ger O’Donohoe')
    doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(15*mm, 24*mm, A5[0]-30*mm, A5[1]-42*mm, id='f')], onPage=deco)])
    story = []
    per = words // chapters
    for i, t in enumerate(chapter_titles(chapters)):
        story.append(PageBreak() if i else Spacer(1, 1))
        h = Paragraph(t, styles['h1'])
        if outline:
            h._bookmarkName = f'ch{i}'
        story.append(h)
        w = 0
        while w < per:
            p = paragraph(); w += len(p.split())
            story.append(Paragraph(p, styles['body']))
    class D(BaseDocTemplate): pass
    # outline entries
    if outline:
        orig = doc.afterFlowable
        def after(fl):
            if hasattr(fl, '_bookmarkName'):
                doc.canv.bookmarkPage(fl._bookmarkName)
                doc.canv.addOutlineEntry(fl.getPlainText(), fl._bookmarkName, 0, 0)
        doc.afterFlowable = after
    doc.build(story)

def make_docx(path, words, chapters):
    import docx
    d = docx.Document()
    d.core_properties.title = 'A History of Coffee in Ireland'
    d.core_properties.author = 'Ger O’Donohoe'
    per = words // chapters
    for t in chapter_titles(chapters):
        d.add_heading(t, level=1)
        w = 0
        while w < per:
            p = paragraph(); w += len(p.split()); d.add_paragraph(p)
    d.add_heading('Bibliography', level=1)
    d.add_paragraph('Murphy, T. (1999). Beans of the Atlantic. Cork: Atrium Press.')
    d.save(path)

def make_epub(path, words, chapters):
    per = words // chapters
    z = zipfile.ZipFile(path, 'w')
    z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></container>')
    items, spine, nav = [], [], []
    for i, t in enumerate(chapter_titles(chapters)):
        body = ''.join(f'<p>{paragraph()}<sup>{rnd.randint(1,9)}</sup></p>' for _ in range(max(1, per // 80)))
        z.writestr(f'OEBPS/c{i}.xhtml', f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>{t}</title></head><body><h1>{t}</h1>{body}<aside epub:type="footnote"><p>1 A footnote that should not be narrated by default.</p></aside></body></html>')
        items.append(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>'); spine.append(f'<itemref idref="c{i}"/>')
        nav.append(f'<li><a href="c{i}.xhtml">{t}</a></li>')
    z.writestr('OEBPS/nav.xhtml', f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol>{"".join(nav)}</ol></nav></body></html>')
    z.writestr('OEBPS/content.opf', f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A History of Coffee in Ireland</dc:title><dc:creator>Ger O’Donohoe</dc:creator><dc:identifier id="id">x</dc:identifier></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>{"".join(items)}</manifest><spine>{"".join(spine)}</spine></package>')
    z.close()

if __name__ == '__main__':
    write('short.txt', 'A Short Test\n\n' + paragraph(2, 3) + '\n\n' + paragraph(2, 3) + '\n')
    write('short.md', '# A Short Markdown Test\n\nThis has **bold** and *italic* and a [link](http://example.com).\n\n## Second part\n\n> A quotation in a block.\n\nPlain again, in 1916.\n')
    write('book-100k.txt', make_text(100_000, 20))
    make_pdf(os.path.join(OUT, 'pdf-20pages.pdf'), 4500, 4, True)
    make_pdf(os.path.join(OUT, "pdf-300pages.pdf"), 118_000, 17, False)
    make_docx(os.path.join(OUT, 'book.docx'), 12_000, 6)
    make_epub(os.path.join(OUT, 'book.epub'), 12_000, 6)
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)))
