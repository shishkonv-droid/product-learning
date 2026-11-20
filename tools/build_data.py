#!/usr/bin/env python3
"""Converts the course doc (XML export + week1 markdown) into data.js for the PWA.

Usage: python3 tools/build_data.py tools/src/main.xml tools/src/weeks > data.js
Each tools/src/weeks/week-NN.md holds the full lessons of one week ("## Урок N · ..." sections).
"""
import glob
import html
import os
import json
import re
import sys
import xml.etree.ElementTree as ET

MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
}


def inline(el):
    """Render inline children of a paragraph to HTML."""
    out = []
    for c in el:
        if c.tag == "text":
            out.append(render_text(c))
        elif c.tag == "link":
            href = c.get("href") or c.get("url") or ""
            inner = "".join(render_text(t) if t.tag == "text" else html.escape("".join(t.itertext())) for t in c) or html.escape("".join(c.itertext()))
            out.append(f'<a href="{html.escape(href)}" target="_blank" rel="noopener">{inner}</a>')
        elif c.tag == "date":
            out.append(html.escape(c.get("value", "")))
        elif c.tag == "mention":
            out.append(html.escape(c.get("name", "")))
        else:
            out.append(html.escape("".join(c.itertext())))
    return "".join(out)


def render_text(t):
    parts = []
    if t.text:
        parts.append(html.escape(t.text))
    for c in t:
        s = html.escape("".join(c.itertext()))
        if c.tag == "link":
            s = f'<a href="{html.escape(c.get("href", ""))}" target="_blank" rel="noopener">{render_text(c)}</a>'
        elif c.tag == "bold":
            s = f"<strong>{render_text(c)}</strong>"
        elif c.tag == "italic":
            s = f"<em>{s}</em>"
        parts.append(s)
        if c.tail:
            parts.append(html.escape(c.tail))
    return "".join(parts)


def block(el, check_prefix=None):
    if el.tag == "paragraph":
        h = el.get("heading")
        body = inline(el)
        if h:
            lvl = int(h) + 1
            return f"<h{lvl}>{body}</h{lvl}>"
        return f"<p>{body}</p>" if body.strip() else ""
    if el.tag == "list":
        kind = el.get("kind")
        items = []
        for i, li in enumerate(el):
            inner = "".join(block(c) for c in li)
            if kind == "check" and check_prefix:
                inner = re.sub(r"^<p>|</p>$", "", inner)
                items.append(f'<li class="check"><label><input type="checkbox" data-check="{check_prefix}{i}"><span>{inner}</span></label></li>')
            else:
                items.append(f"<li>{inner}</li>")
        tag = "ol" if kind == "ordered" else "ul"
        cls = ' class="checklist"' if kind == "check" else ""
        return f"<{tag}{cls}>{''.join(items)}</{tag}>"
    if el.tag == "table":
        rows = []
        for r in el:
            cells = []
            for c in r:
                t = "th" if c.get("header") == "true" else "td"
                inner = "".join(re.sub(r"^<p>(.*)</p>$", r"\1", block(p)) for p in c)
                cells.append(f"<{t}>{inner}</{t}>")
            rows.append("<tr>" + "".join(cells) + "</tr>")
        return '<div class="table-wrap"><table>' + "".join(rows) + "</table></div>"
    if el.tag == "blockquote":
        return "<blockquote>" + "".join(block(c) for c in el) + "</blockquote>"
    return ""


def cell_text(c):
    return " ".join("".join(p.itertext()).strip() for p in c)


def parse_start(dates):
    """'30 ноября – 4 декабря' -> (30, 11); '23–27 ноября' -> (23, 11)."""
    m = re.match(r"(\d+)\s*([а-я]+)?", dates)
    day = int(m.group(1))
    month_word = m.group(2) if m.group(2) in MONTHS else re.findall(r"[а-я]+", dates)[0]
    month = MONTHS[month_word]
    year = 2026 if month >= 9 else 2027
    return f"{year:04d}-{month:02d}-{day:02d}"


def md_inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)


def md_to_html(md):
    out, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("### "):
            out.append(f"<h4>{md_inline(ln[4:])}</h4>")
        elif ln.startswith("> "):
            out.append(f"<blockquote><p>{md_inline(ln[2:])}</p></blockquote>")
        elif ln.startswith("| "):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                if not re.match(r"^\|\s*-", lines[i]):
                    rows.append([c.strip() for c in lines[i].strip("|").split("|")])
                i += 1
            t = "<tr>" + "".join(f"<th>{md_inline(c)}</th>" for c in rows[0]) + "</tr>"
            t += "".join("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
            out.append(f'<div class="table-wrap"><table>{t}</table></div>')
            continue
        elif re.match(r"^(- |1\. )", ln):
            tag = "ul" if ln.startswith("- ") else "ol"
            items = []
            while i < len(lines) and re.match(r"^(- |1\. )", lines[i]):
                items.append("<li>" + md_inline(re.sub(r"^(- |1\. )", "", lines[i])) + "</li>")
                i += 1
            out.append(f"<{tag}>{''.join(items)}</{tag}>")
            continue
        else:
            out.append(f"<p>{md_inline(ln)}</p>")
        i += 1
    return "".join(out)


def main(xml_path, weeks_dir):
    root = ET.fromstring(open(xml_path, encoding="utf-8").read())
    els = list(root)
    weeks, sections, notes = [], [], []
    cur_section = None
    block_no = 0
    i = 0
    while i < len(els):
        el = els[i]
        h = el.get("heading") if el.tag == "paragraph" else None
        text = "".join(el.itertext()).strip()
        if h == "1":
            i += 2  # title + byline
            continue
        if h == "3" and text.startswith("Неделя"):
            m = re.match(r"Неделя (\d+) · (.+?) · (.+)", text)
            n, dates, title = int(m.group(1)), m.group(2), m.group(3)
            table = els[i + 1]
            lessons = []
            for r in list(table)[1:]:
                cs = list(r)
                lessons.append({"n": int(cell_text(cs[0])), "theme": cell_text(cs[1]), "practice": cell_text(cs[2])})
            weeks.append({"n": n, "dates": dates, "title": title, "start": parse_start(dates), "block": block_no, "lessons": lessons})
            i += 2
            continue
        if h == "2":
            if text.startswith("Блок"):
                block_no += 1
                desc = "".join(els[i + 1].itertext()).strip()
                sections.append({"type": "block", "n": block_no, "title": text, "desc": desc})
                cur_section = None
                i += 2
                continue
            cur_section = {"type": "page", "title": text, "html": ""}
            sections.append(cur_section)
            i += 1
            continue
        if cur_section is None and el.tag == "paragraph" and weeks:
            notes.append({"afterWeek": weeks[-1]["n"], "text": text})
            i += 1
            continue
        if cur_section is not None:
            prefix = "grade-" if "грейда" in cur_section["title"] else None
            cur_section["html"] += block(el, prefix)
        i += 1

    md = "\n".join(open(f, encoding="utf-8").read() for f in sorted(glob.glob(os.path.join(weeks_dir, "week-*.md"))))
    full = {}
    for part in re.split(r"^## ", md, flags=re.M)[1:]:
        head, body = part.split("\n", 1)
        n = int(re.match(r"Урок (\d+)", head).group(1))
        full[n] = {"title": head.strip(), "html": md_to_html(body)}

    data = {
        "title": "Продакт-менеджер: программа обучения на 6 месяцев",
        "blocks": [s for s in sections if s["type"] == "block"],
        "pages": [s for s in sections if s["type"] == "page"],
        "weeks": weeks,
        "notes": notes,
        "fullLessons": full,
    }
    sys.stdout.write("window.COURSE = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    main(*sys.argv[1:3])
