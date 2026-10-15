#!/usr/bin/env python3
"""Gera atlas transparentes do Capitão América e os idle limpos do Seiya.
Fonte dos sprites de Cap: sprite original 568x704 (War of the Gems) fornecido pelo usuário.
Todas as células produzidas têm 128x128 e pivot (64,112).
"""
from __future__ import annotations
from pathlib import Path
from collections import deque
from PIL import Image
import sys

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'public'/'assets'
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'tools'/'captain_source.png'
assert SOURCE.is_file(), f'Fonte ausente: {SOURCE}'
BG=(186,254,202)
PIVOT=(64,112)
CELL=128

def components_alpha(im:Image.Image):
    a=im.getchannel('A')
    w,h=im.size; pix=a.load()
    seen=bytearray(w*h); out=[]
    for y in range(h):
      for x in range(w):
        idx=y*w+x
        if seen[idx] or pix[x,y]<30: continue
        seen[idx]=1;stack=[(x,y)];part=[]
        while stack:
          xx,yy=stack.pop();part.append((xx,yy))
          for nx,ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1),
                         (xx-1,yy-1),(xx+1,yy+1),(xx-1,yy+1),(xx+1,yy-1)):
            if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx] and pix[nx,ny]>=30:
              seen[ny*w+nx]=1;stack.append((nx,ny))
        out.append(part)
    return sorted(out,key=len,reverse=True)

def clean_idle(dir,num):
    # A folha antiga de perfil esquerdo (atlas_03) tem um terceiro pe
    # conectado ao resto do corpo. Cortar por coordenadas apaga pe real.
    # A postura completa da direita (atlas_01) espelhada fornece a vista
    # esquerda com DOIS pes inteiros, sem pintar nem apagar anatomia.
    if dir == 'left':
      source=Image.open(PUBLIC/'atlas_01.png').convert('RGBA')
      frame=source.crop((0,0,CELL,CELL)).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    else:
      source=Image.open(PUBLIC/f'atlas_{num:02}.png').convert('RGBA')
      frame=source.crop((0,0,CELL,CELL))
    # Descarta ilhas desconectadas que vieram da célula vizinha;
    # conserva somente o corpo principal do Seiya.
    comps=components_alpha(frame)
    assert comps and len(comps[0])>100, f'atlas idle {dir} vazio'
    main=set(comps[0])
    px=frame.load()
    for y in range(CELL):
      for x in range(CELL):
        if (x,y) not in main: px[x,y]=(0,0,0,0)
    out=PUBLIC/'seiya_clean_idle';out.mkdir(parents=True,exist_ok=True)
    frame.save(out/f'{dir}.png',optimize=True)
    print(f'SEIYA idle {dir}: pixels={len(main)} fragmentos removidos={len(comps)-1}')

def split_row(im:Image.Image,y0:int,y1:int):
    src=im.convert('RGBA')
    w,_=src.size
    p=src.load()
    cols=[]
    for x in range(w):
        cols.append(any(p[x,y][:3]!=BG for y in range(y0,y1+1)))
    spans=[];start=None
    for x,on in enumerate(cols+[False]):
      if on and start is None:start=x
      if not on and start is not None:
        if x-start>=4:spans.append((start,x))
        start=None
    frames=[]
    for x0,x1 in spans:
      f=src.crop((x0,y0,x1,y1+1))
      pix=f.load()
      for yy in range(f.height):
        for xx in range(f.width):
          if pix[xx,yy][:3]==BG:pix[xx,yy]=(0,0,0,0)
      bbox=f.getbbox()
      if bbox:frames.append(f.crop(bbox))
    return frames

def pack(name,source_frames,scale):
    result=Image.new('RGBA',(CELL*len(source_frames),CELL),(0,0,0,0))
    for index,f in enumerate(source_frames):
      # Largura e altura diferentes no sheet original: recorta individualmente
      # e preserva um envelope vazio de 10px em cada lado.
      # Escala uniforme partindo da altura do Seiya. Limite de 108 px
      # na celula protege cabelo, punhos e botas sem variar pivô.
      mul=min(scale,108/max(1,f.height),108/max(1,f.width))
      if abs(mul-1)>0.001:
        f=f.resize((max(1,round(f.width*mul)),max(1,round(f.height*mul))),Image.Resampling.NEAREST)
      anchor=(CELL-f.width)//2, PIVOT[1]-f.height
      assert anchor[0]>=6 and anchor[1]>=4,(name,index,anchor,f.size)
      # O deslocamento de cada frame e obrigatorio. Sem index*CELL,
      # todos os quadros se sobrepoem no primeiro slot do atlas.
      result.alpha_composite(f,(index*CELL+anchor[0],anchor[1]))
    for index in range(len(source_frames)):
      cell=result.crop((index*CELL,0,(index+1)*CELL,CELL))
      pixels=sum(1 for alpha in cell.getchannel('A').getdata() if alpha>30)
      assert pixels>150, (name,index,'quadro vazio ou incompleto',pixels)
    dst=PUBLIC/'enemy';dst.mkdir(parents=True,exist_ok=True)
    target=dst/f'{name}.png'
    result.save(target,optimize=True)
    print(f'CAPTAIN {name}: {result.width}x{result.height}, frames={len(source_frames)}, size={target.stat().st_size}')

def main():
    for direction,num in {'down':0,'left':3,'right':1,'up':2}.items():
      clean_idle(direction,num)
    im=Image.open(SOURCE).convert('RGBA')
    assert im.size==(568,704),f'Imagem de Capitão América inesperada: {im.size}'
    # Faixas da imagem fornecida, separadas pelas linhas de fundo verde.
    rows={0:split_row(im,9,95),1:split_row(im,107,191),
          2:split_row(im,204,279),3:split_row(im,294,391)}
    assert [len(rows[i]) for i in [0,1,2,3]]==[10,8,7,8], \
      'Sprites desviaram do layout do original: '+str([len(rows[i]) for i in rows])
    # Escala proporcional ao personagem jogavel: Capitao apenas 8% maior.
    # Normaliza a altura do corpo de pe, e preserva o MESMO multiplicador
    # em todos os quadros (exceto limite de seguranca da celula).
    seiya=Image.open(PUBLIC/'seiya_clean_idle'/'down.png').convert('RGBA')
    seiya_box=seiya.getbbox()
    assert seiya_box is not None
    seiya_height=seiya_box[3]-seiya_box[1]
    captain_height=rows[0][0].height
    scale=min(2.5,max(1.0,(seiya_height*1.08)/max(1,captain_height)))
    print(f'ESCALA Capitao: Seiya={seiya_height}px Capitao-original={captain_height}px multiplicador={scale:.3f}')
    pack('captain_idle',[rows[0][0]],scale)
    # IMPORTANTE: o original [0][4] e [0][5] olha para a ESQUERDA.
    # Todos os quadros exportados devem ter uma UNICA orientacao base:
    # rosto/pes voltados para a DIREITA. O Phaser usa flipX apenas quando
    # o deslocamento real ou o alvo esta a esquerda. A inversao incorreta
    # da folha causava moonwalk apesar de faceLeft correto no codigo.
    right_walk = [
        rows[0][4].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        rows[0][5].transpose(Image.Transpose.FLIP_LEFT_RIGHT),
    ]
    pack('captain_run',[right_walk[i%2] for i in range(8)],scale)

    # Golpes laterais com a mesma orientacao base da corrida. O chute
    # original da linha 2 aponta para a esquerda; espelhar para a direita.
    # SEM escudo: nenhum sprite/acessorio separado e gerado.
    side_guard,side_step=right_walk
    side_strike=rows[2][3].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    pack('captain_attack',[
        side_guard,side_step,side_strike,side_strike,
        side_strike,side_step,side_guard,side_guard,
    ],scale)
    print('Capitao sem escudo: corrida e ataques voltados para a direita (orientacao base).')

if __name__=='__main__':main()
