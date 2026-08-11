#!/usr/bin/env python3
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from typing import Dict, List, Optional, Tuple


STOPWORDS = {
    "a",
    "ao",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "sem",
    "the",
}

PRIORITY_KEYWORDS = [
    "desodorante",
    "antitranspirante",
    "aerosol",
    "hidratacao",
    "hidratante",
    "suave",
    "rexona",
    "nivea",
    "dove",
    "rolon",
    "spray",
    "ml",
    "g",
    "kg",
    "l",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image-path", required=True)
    parser.add_argument("--hint")
    parser.add_argument("--tesseract-path")
    parser.add_argument("--ocr-languages", default="por+eng")
    args = parser.parse_args()

    result = {
        "searchTerm": None,
        "productName": None,
        "brand": None,
        "size": None,
        "barcode": None,
        "source": None,
        "diagnostic": None,
    }

    if not os.path.isfile(args.image_path):
        result["diagnostic"] = "Arquivo da imagem nao foi encontrado pelo script Python."
        print(json.dumps(result, ensure_ascii=False))
        return 0

    tesseract_path = resolve_tesseract_path(args.tesseract_path)
    if not tesseract_path:
        result["diagnostic"] = (
            "Python foi acionado, mas o executavel do Tesseract OCR nao foi encontrado. "
            "Instale o Tesseract ou informe o caminho na configuracao do backend."
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0

    ocr_text, diagnostic = run_tesseract(tesseract_path, args.image_path, args.ocr_languages)
    if not ocr_text:
        result["diagnostic"] = diagnostic or "O OCR nao encontrou texto suficiente na embalagem."
        print(json.dumps(result, ensure_ascii=False))
        return 0

    recognized = build_recognition(ocr_text, args.hint or "")
    result.update(recognized)
    result["source"] = "python-tesseract"
    result["diagnostic"] = diagnostic or "Reconhecimento por imagem executado com OCR Python + Tesseract."
    print(json.dumps(result, ensure_ascii=False))
    return 0


def resolve_tesseract_path(configured_path: Optional[str]) -> Optional[str]:
    if configured_path and os.path.isfile(configured_path):
        return configured_path

    env_path = os.environ.get("TESSERACT_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    which_path = shutil.which("tesseract")
    if which_path:
        return which_path

    common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Tesseract-OCR\tesseract.exe"),
    ]
    for item in common_paths:
        if os.path.isfile(item):
            return item

    return None


def run_tesseract(tesseract_path: str, image_path: str, languages: str) -> Tuple[str, Optional[str]]:
    texts: List[str] = []
    diagnostics: List[str] = []
    for psm in ("6", "11"):
        command = [
            tesseract_path,
            image_path,
            "stdout",
            "-l",
            languages,
            "--psm",
            psm,
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=False,
                timeout=18,
                encoding="utf-8",
                errors="ignore",
            )
        except Exception as exc:  # noqa: BLE001
            diagnostics.append(f"Falha ao executar Tesseract: {exc}")
            continue

        if completed.returncode != 0:
            stderr = collapse_whitespace(completed.stderr or "")
            diagnostics.append(f"Tesseract retornou codigo {completed.returncode}: {stderr}")
            continue

        stdout = collapse_whitespace(completed.stdout or "")
        if stdout:
            texts.append(stdout)

    unique_text = " ".join(distinct_preserve_order(texts))
    return unique_text, diagnostics[0] if diagnostics and not unique_text else None


def build_recognition(ocr_text: str, hint: str) -> Dict[str, Optional[str]]:
    normalized_hint = normalize_search_term(hint)
    normalized_ocr = normalize_ocr_text(ocr_text)
    size = find_size(normalized_ocr)
    barcode = find_barcode(ocr_text)
    brand = find_brand(normalized_ocr, normalized_hint)
    product_name = find_product_name(normalized_ocr, brand, size)
    search_term = build_search_term(brand, product_name, size, normalized_hint)

    return {
        "searchTerm": search_term,
        "productName": product_name,
        "brand": brand,
        "size": size,
        "barcode": barcode,
    }


def normalize_ocr_text(value: str) -> str:
    text = value.lower()
    replacements = {
        "á": "a",
        "à": "a",
        "ã": "a",
        "â": "a",
        "é": "e",
        "ê": "e",
        "í": "i",
        "ó": "o",
        "ô": "o",
        "õ": "o",
        "ú": "u",
        "ç": "c",
    }
    for original, replacement in replacements.items():
        text = text.replace(original, replacement)
    text = re.sub(r"[^a-z0-9%/+\- ]+", " ", text)
    return collapse_whitespace(text)


def normalize_search_term(value: Optional[str]) -> str:
    return collapse_whitespace((value or "").strip())


def collapse_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def find_size(ocr_text: str) -> Optional[str]:
    match = re.search(r"\b(\d{2,4}\s?(?:ml|g|kg|l))\b", ocr_text, re.IGNORECASE)
    return match.group(1).upper().replace(" ", "") if match else None


def find_barcode(raw_text: str) -> Optional[str]:
    digits = re.findall(r"\b\d{8,14}\b", raw_text)
    return digits[0] if digits else None


def find_brand(ocr_text: str, hint: str) -> Optional[str]:
    tokens = tokenize(ocr_text)
    ranked = []
    for token in tokens:
        if len(token) < 4 or token in STOPWORDS or token.isdigit():
            continue
        score = 0
        if token in PRIORITY_KEYWORDS:
            score += 4
        if hint and token in normalize_ocr_text(hint):
            score += 5
        if token.isalpha():
            score += 2
        ranked.append((score, token))

    if not ranked:
        return first_relevant_token(hint)

    ranked.sort(key=lambda item: (-item[0], len(item[1]), item[1]))
    return ranked[0][1].upper()


def find_product_name(ocr_text: str, brand: Optional[str], size: Optional[str]) -> Optional[str]:
    tokens = tokenize(ocr_text)
    selected = []
    for token in tokens:
        if len(token) < 3 and token not in {"ml", "g", "l", "kg"}:
            continue
        if token in STOPWORDS:
            continue
        if brand and token == brand.lower():
            continue
        if re.fullmatch(r"\d+", token):
            continue
        selected.append(token)

    if size:
        selected.append(size.lower())

    ordered = distinct_preserve_order(selected)
    if not ordered:
        return None

    important = [token for token in ordered if token in PRIORITY_KEYWORDS]
    generic = [token for token in ordered if token not in important]
    combined = distinct_preserve_order((important + generic)[:7])
    return " ".join(combined).upper()


def build_search_term(brand: Optional[str], product_name: Optional[str], size: Optional[str], hint: str) -> Optional[str]:
    parts = [brand, product_name, size, hint.upper() if hint else None]
    tokens: List[str] = []
    for part in parts:
        if not part:
            continue
        for token in collapse_whitespace(part).split(" "):
            normalized = token.strip().upper()
            if len(normalized) < 2:
                continue
            if normalized not in tokens:
                tokens.append(normalized)

    if not tokens:
        return None

    return " ".join(tokens[:10])


def tokenize(ocr_text: str) -> List[str]:
    return [token for token in ocr_text.split(" ") if token]


def first_relevant_token(value: str) -> Optional[str]:
    tokens = [token for token in normalize_ocr_text(value).split(" ") if len(token) >= 3]
    return tokens[0].upper() if tokens else None


def distinct_preserve_order(values: List[str]) -> List[str]:
    result: List[str] = []
    seen = set()
    for item in values:
        normalized = item.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


if __name__ == "__main__":
    sys.exit(main())
