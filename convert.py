#!/usr/bin/env python3
"""
paper-translate スキルの出力（paper.md + paper.ja.md + glossary.md）を
ビューア用JSONに変換する。外部ライブラリ不要。

使い方:
    python convert.py "path/to/Attention Is All You Need/"
    python convert.py "path/to/output-folder/" -o custom.json
"""

import argparse
import json
import re
import sys
from pathlib import Path


# === 英語の略語パターン（文末判定で誤分割を防ぐ） ===
ABBREVIATIONS = {
    "e.g.", "i.e.", "et al.", "etc.", "Fig.", "Figs.",
    "Eq.", "Eqs.", "Sec.", "Ref.", "Refs.", "Tab.",
    "vs.", "Dr.", "Mr.", "Mrs.", "Prof.", "Jr.", "Sr.",
    "approx.", "dept.", "vol.", "no.", "pp.", "ed.",
    "cf.", "ibid.", "resp.", "incl.", "est.",
}


def parse_md_sections(text: str) -> list[dict]:
    """Markdownをセクション（見出し＋本文）に分割"""
    lines = text.split("\n")
    sections = []
    current_heading = ""
    current_level = 0
    current_lines: list[str] = []

    for line in lines:
        m = re.match(r"^(#{1,4})\s+(.*)", line)
        if m:
            # 前のセクションを保存
            body = "\n".join(current_lines).strip()
            if body or current_heading:
                sections.append({
                    "heading": current_heading,
                    "level": current_level,
                    "text": body,
                })
            current_level = len(m.group(1))
            current_heading = m.group(2).strip()
            current_lines = []
        else:
            current_lines.append(line)

    body = "\n".join(current_lines).strip()
    if body or current_heading:
        sections.append({
            "heading": current_heading,
            "level": current_level,
            "text": body,
        })

    return sections


def is_image_line(line: str) -> bool:
    """Markdown画像行かどうか"""
    return bool(re.match(r"^\s*!\[", line.strip()))


def is_list_item(line: str) -> bool:
    """リストアイテムかどうか"""
    return bool(re.match(r"^\s*[-*+]\s|^\s*\d+\.\s", line.strip()))


def is_table_line(line: str) -> bool:
    """テーブル行かどうか"""
    stripped = line.strip()
    return stripped.startswith("|") and stripped.endswith("|")


def clean_paragraph(text: str) -> str:
    """段落テキストからMarkdown装飾を残しつつ不要な改行を整理"""
    lines = text.split("\n")
    result = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if is_image_line(stripped):
            continue
        if is_table_line(stripped):
            continue
        result.append(stripped)
    return " ".join(result)


def split_paragraphs(text: str) -> list[str]:
    """セクション本文を段落に分割（画像・テーブル行を除外）"""
    # 空行で段落を分割
    raw_paragraphs = re.split(r"\n\s*\n", text)
    paragraphs = []

    for para in raw_paragraphs:
        para = para.strip()
        if not para:
            continue
        # 画像のみ / テーブルのみの段落はスキップ
        lines = para.split("\n")
        content_lines = [
            l for l in lines
            if l.strip() and not is_image_line(l) and not is_table_line(l)
        ]
        if not content_lines:
            continue
        cleaned = clean_paragraph(para)
        if cleaned:
            paragraphs.append(cleaned)

    return paragraphs


def split_sentences_en(text: str) -> list[str]:
    """英語テキストを文に分割"""
    if not text.strip():
        return []

    # 略語を保護
    protected = text
    for ab in ABBREVIATIONS:
        safe = ab.replace(".", "<DOT>")
        protected = protected.replace(ab, safe)

    # 文末のピリオド・感嘆符・疑問符 + 空白 + 大文字で分割
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'\(\[])", protected)

    sentences = []
    for p in parts:
        restored = p.replace("<DOT>", ".").strip()
        if restored:
            sentences.append(restored)

    return sentences


def split_sentences_ja(text: str) -> list[str]:
    """日本語テキストを文に分割"""
    if not text.strip():
        return []

    # 。．で分割
    parts = re.split(r"(?<=[。．])\s*", text)
    sentences = [p.strip() for p in parts if p.strip()]
    return sentences


def align_sentences(
    en_sents: list[str], ja_sents: list[str]
) -> list[tuple[str, str]]:
    """英日の文をアライメント"""
    if not en_sents and not ja_sents:
        return []
    if not en_sents:
        return [("", s) for s in ja_sents]
    if not ja_sents:
        return [(s, "") for s in en_sents]

    # 文数が一致 → 1:1対応
    if len(en_sents) == len(ja_sents):
        return list(zip(en_sents, ja_sents))

    # 差が小さい（±2以内）→ 短い方に合わせ、余りは末尾にマージ
    if abs(len(en_sents) - len(ja_sents)) <= 2:
        pairs = []
        min_len = min(len(en_sents), len(ja_sents))
        for i in range(min_len):
            pairs.append((en_sents[i], ja_sents[i]))

        # 余りの英文
        for i in range(min_len, len(en_sents)):
            pairs.append((en_sents[i], ""))

        # 余りの日本語は最後のペアにマージ
        if len(ja_sents) > min_len and pairs:
            extra_ja = " ".join(ja_sents[min_len:])
            last_en, last_ja = pairs[-1]
            pairs[-1] = (last_en, last_ja + " " + extra_ja if last_ja else extra_ja)

        return pairs

    # 差が大きい → 段落まるごと1ペアにフォールバック
    en_full = " ".join(en_sents)
    ja_full = " ".join(ja_sents)
    return [(en_full, ja_full)]


def parse_glossary(glossary_path: Path) -> list[dict]:
    """glossary.md のテーブルをパース"""
    if not glossary_path.exists():
        return []

    text = glossary_path.read_text(encoding="utf-8")
    glossary = []

    for line in text.split("\n"):
        m = re.match(r"\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|", line)
        if not m:
            continue
        en = m.group(1).strip()
        ja = m.group(2).strip()
        note = m.group(3).strip()
        # ヘッダ・区切り行をスキップ
        if en.lower() in ("english", "---", "") or en.startswith("-"):
            continue
        if set(en) <= {"-", " "}:
            continue
        glossary.append({"en": en, "ja": ja, "note": note})

    return glossary


def detect_title_ja(folder: Path) -> str:
    """paper.summary.ja.md からタイトル日本語訳を抽出（あれば）"""
    summary = folder / "paper.summary.ja.md"
    if not summary.exists():
        return ""

    text = summary.read_text(encoding="utf-8")
    # "## 一言まとめ" の内容を返すか、タイトル行を探す
    for line in text.split("\n"):
        m = re.match(r"^#\s+(.+?)(?:\s*—\s*要約)?$", line)
        if m:
            return m.group(1).strip()
    return ""


def convert(folder_path: Path, output_path: Path | None = None):
    """paper-translate出力フォルダをビューア用JSONに変換"""
    paper_md = folder_path / "paper.md"
    paper_ja_md = folder_path / "paper.ja.md"
    glossary_md = folder_path / "glossary.md"

    if not paper_md.exists():
        print(f"エラー: {paper_md} が見つかりません", file=sys.stderr)
        sys.exit(1)
    if not paper_ja_md.exists():
        print(f"エラー: {paper_ja_md} が見つかりません", file=sys.stderr)
        sys.exit(1)

    print(f"読み込み: {folder_path.name}")

    en_text = paper_md.read_text(encoding="utf-8")
    ja_text = paper_ja_md.read_text(encoding="utf-8")

    en_sections = parse_md_sections(en_text)
    ja_sections = parse_md_sections(ja_text)

    print(f"  英語: {len(en_sections)} セクション")
    print(f"  日本語: {len(ja_sections)} セクション")

    # タイトル取得（最初の見出し）
    title = en_sections[0]["heading"] if en_sections else folder_path.name
    title_ja = detect_title_ja(folder_path)

    # 用語集
    glossary = parse_glossary(glossary_md)
    if glossary:
        print(f"  用語集: {len(glossary)} 語")

    # 日本語セクションを見出しでインデックス化
    ja_by_heading: dict[str, dict] = {}
    for s in ja_sections:
        ja_by_heading[s["heading"]] = s

    # セクションごとにアライメント
    result_sections = []
    sentence_counter = 1
    skipped_sections = 0

    for en_sec in en_sections:
        heading = en_sec["heading"]
        ja_sec = ja_by_heading.get(heading)

        en_paras = split_paragraphs(en_sec["text"])
        ja_paras = split_paragraphs(ja_sec["text"]) if ja_sec else []

        if not en_paras:
            skipped_sections += 1
            continue

        all_sentences = []
        max_paras = max(len(en_paras), len(ja_paras))

        for pi in range(max_paras):
            en_para = en_paras[pi] if pi < len(en_paras) else ""
            ja_para = ja_paras[pi] if pi < len(ja_paras) else ""

            en_sents = split_sentences_en(en_para)
            ja_sents = split_sentences_ja(ja_para)

            pairs = align_sentences(en_sents, ja_sents)

            for en_sent, ja_sent in pairs:
                if not en_sent:
                    continue
                all_sentences.append({
                    "id": f"s{sentence_counter}",
                    "original": en_sent,
                    "translation": ja_sent or "（対応する訳なし）",
                })
                sentence_counter += 1

        if all_sentences:
            result_sections.append({
                "heading": heading,
                "heading_ja": "",
                "sentences": all_sentences,
            })

    # 出力JSON
    result = {
        "metadata": {
            "title": title,
            "title_ja": title_ja,
            "source_folder": str(folder_path),
        },
        "glossary": glossary,
        "sections": result_sections,
    }

    if output_path is None:
        output_path = folder_path / "translation.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total = sentence_counter - 1
    print(f"\n変換完了: {total} 文 / {len(result_sections)} セクション")
    if skipped_sections:
        print(f"  ({skipped_sections} セクションは本文なしでスキップ)")
    print(f"保存先: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="paper-translate出力をビューア用JSONに変換"
    )
    parser.add_argument("folder", help="paper-translate出力フォルダのパス")
    parser.add_argument(
        "-o", "--output", help="出力JSONファイルパス（デフォルト: フォルダ内のtranslation.json）"
    )
    args = parser.parse_args()

    folder_path = Path(args.folder)
    if not folder_path.is_dir():
        print(f"エラー: {folder_path} はディレクトリではありません", file=sys.stderr)
        sys.exit(1)

    output_path = Path(args.output) if args.output else None
    convert(folder_path, output_path)


if __name__ == "__main__":
    main()
