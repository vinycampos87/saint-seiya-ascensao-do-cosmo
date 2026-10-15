# Spritesheet de Capitão América — integração automatizada

O código Phaser já está preparado para substituir o inimigo antigo pelo Capitão América do spritesheet original anexado ao chat.

## Um arquivo necessário
Envie para esta pasta o PNG original da folha do Capitão América (**568×704 px**). O nome original `SNES - Marvel Super Heroes_ War of the Gems - Playable Characters - Captain America.png` é aceito automaticamente, sem renomear.

Upload: https://github.com/vinycampos87/saint-seiya-ascensao-do-cosmo/upload/main/phaser/tools

O GitHub Actions executará `process_sprites.py` para extrair os quadros transparentes de 128×128, usar o pivô fixo (64,112), criar as animações de corrida, soco e ataque com escudo, além de gerar os quatro idles limpos do Seiya. Se todos os testes da cena Phaser passarem, o fluxo publica a nova compilação no GitHub Pages.

O arquivo **não** pode ser substituído por miniaturas, capturas da tela ou JPEG. O pipeline verifica o tamanho da imagem antes de alterar a publicação.

**Créditos:** sprites originais de *Marvel Super Heroes: War of the Gems* (Capcom/Marvel), extração da folha atribuída a Yawackhary/The Spriters Resource. Projeto de fã para testes não comerciais.
