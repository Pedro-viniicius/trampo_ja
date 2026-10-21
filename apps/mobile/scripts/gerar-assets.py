#!/usr/bin/env python3
"""Gera os assets do app (ícone, ícone adaptativo, splash e logo) a partir do logo.svg.

A origem é raster (JPEG embutido no SVG); ao receber o vetor, trocar a origem
e rodar de novo. Só reduz, nunca amplia.

Uso: python3 -I apps/mobile/scripts/gerar-assets.py <logo.svg> <pasta de saída>
"""
import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image

MARCADOR = "data:image/jpeg;base64,"
BRANCO = (255, 255, 255)


def extrair_imagem(caminho_svg: Path) -> Image.Image:
    texto = caminho_svg.read_text(encoding="utf-8")
    inicio = texto.find(MARCADOR)
    if inicio < 0:
        sys.exit(f"Erro: não encontrei '{MARCADOR}' em {caminho_svg}.")
    inicio += len(MARCADOR)
    resto = texto[inicio:]
    fim = re.search(r"[\"')]", resto)
    dados = re.sub(r"\s+", "", resto[: fim.start()] if fim else resto)
    imagem = Image.open(io.BytesIO(base64.b64decode(dados)))
    return imagem.convert("RGB")


def quadrada(imagem: Image.Image) -> Image.Image:
    largura, altura = imagem.size
    if largura == altura:
        return imagem
    lado = max(largura, altura)
    print(f"Aviso: origem {largura}x{altura} não é quadrada; centralizando sobre branco.")
    base = Image.new("RGB", (lado, lado), BRANCO)
    base.paste(imagem, ((lado - largura) // 2, (lado - altura) // 2))
    return base


def reduzir(imagem: Image.Image, alvo: int, nome: str) -> Image.Image:
    if imagem.width < alvo:
        print(f"Aviso: origem ({imagem.width}px) menor que {alvo}px em {nome}; mantendo o tamanho, sem ampliar.")
        return imagem
    return imagem.resize((alvo, alvo), Image.LANCZOS)


def sobre_branco(imagem: Image.Image, lado: int) -> Image.Image:
    base = Image.new("RGB", (lado, lado), BRANCO)
    base.paste(imagem, ((lado - imagem.width) // 2, (lado - imagem.height) // 2))
    return base


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Uso: gerar-assets.py <logo.svg> <pasta de saída>")
    origem, saida = Path(sys.argv[1]), Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)
    logo = quadrada(extrair_imagem(origem))

    cheia = reduzir(logo, 1024, "icon.png")
    cheia.save(saida / "icon.png", "PNG")
    cheia.save(saida / "splash-icon.png", "PNG")

    # Zona segura do Android: a logo ocupa 66% do quadro.
    miolo = reduzir(logo, round(1024 * 0.66), "adaptive-icon.png")
    sobre_branco(miolo, cheia.width).save(saida / "adaptive-icon.png", "PNG")

    reduzir(logo, 512, "logo.png").save(saida / "logo.png", "PNG")
    print(f"Assets gerados em {saida}.")


if __name__ == "__main__":
    main()
